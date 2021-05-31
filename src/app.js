import React, { Link }                                  from "react-mvx"
import * as ReactDOM                                    from "react-dom"
import { Record, define, type }                         from "type-r"
import * as dayjs                                       from "dayjs"
import * as ExcelJS                                     from "exceljs"
import * as duration                                    from "dayjs/plugin/duration"
import * as utc                                         from "dayjs/plugin/utc"
import * as customParseFormat                           from "dayjs/plugin/customParseFormat"
import { StatDonut }                                   from "./parts/DonutChart"
import { FileSystem, FileModel, FilesList }             from "./parts/Files"
import {
    onServerIpChange, getServerIp, ESPfetch,
    myHumanizer,downloadFile,
    transformPackedToStamp, transformStampToPacked,
    Loader
}                                                       from "./parts/Utils"
import { Container, Row, Col, Form, Button, Tabs, Tab } from "./Bootstrap"
import * as ReactHighcharts                             from "react-highcharts"
import cx         from "classnames"
import "./app.scss"

dayjs.extend( customParseFormat );
dayjs.extend( utc );
dayjs.extend( duration );

const PLOT_BAND_COLOR = "#ff000015";

@define
class ConfigModel extends Record {
    static attributes = {
        tl    : 2,
        th    : 5,
        ton   : 10,
        toff  : 10,
        read  : 180,
        log   : 1800,
        flush : 7200
    };

    save() {
        const params = { set : JSON.stringify( this.toJSON() ) };

        return ESPfetch( "/conf", params )
    }
}

@define
class CurInfoModel extends Record {
    static attributes = {
        last : 0,
        rel  : type( Boolean ).value( null ),
        up   : 0,
        s    : [],
        avg  : 0
    };

    load( options ) {
        const params = { cur : 1 };

        if( options.force ) {
            params.f = 1;
        }
        return ESPfetch( "/info", params )
            .then( json => {
                json.last = transformPackedToStamp( json.last );
                this.set( json );
            } )
    }
}

@define
class SensorModel extends Record {
    static attributes = {
        addr   : type( Array ).has.watcher( "onAddrChange" ),
        weight : 10,
        name   : type( String ).has.watcher( "onNameChange" ),
    };

    onNameChange() {
        localStorage.setItem( "/sens/" + this.addr.join( "" ), this.name );
    }

    loadName() {
        this.name = localStorage.getItem( "/sens/" + this.addr.join( "" ) ) || (this.addr[ 0 ] + "~" + this.addr[ 1 ]);
    }

    toLine() {
        return this.addr.join( "," ) + "," + this.weight;
    }

    static collection = {
        loadNames() {
            this.each( x => x.loadName() );
        }
    }
}

@define
class SensorCollection extends SensorModel.Collection {
    save() {
        const params = { sn : this.map( x => x.toLine() ).join( "," ) };

        return ESPfetch( "/conf", params )
    }
}

@define
class FileLogRawLine extends Record {
    static idAttribute = "stamp";

    static attributes = {
        stamp : 0,
        arr   : [],
        event : "",
    };

    parse( _data ) {
        const data       = _.clone( _data );
        const packedDate = data.shift();
        let event        = data.pop();

        if( _.isNumber( event ) ) {
            data.push( event );
            event = "t";
        }

        return {
            stamp : packedDate > 2000000000 ? transformPackedToStamp( packedDate ) : packedDate,
            arr   : data,
            event
        };
    }

    toJSON() {
        return [ transformStampToPacked( this.stamp ), ...this.arr, this.event ];
    }

    static collection = {
        comparator : "stamp"
    }
}

@define
class LineDataModel extends Record {
    static idAttribute = "stamp";

    static attributes = {
        stamp : 0,
        temp  : 0
    };

    toJSON() {
        return [ this.stamp * 1000, this.temp / 10 ];
    }

    static collection = {
        comparator : "stamp"
    }
}

@define
class PlotLineModel extends Record {
    static idAttribute = "value";

    static attributes = {
        type  : "",
        value : 0
    };
}

@define
class LineModel extends Record {
    static attributes = {
        data : LineDataModel.Collection
    };
}

@define
class StatModel extends Record {
    static attributes = {
        start   : 0,
        end     : 0,
        time_on : 0
    };

    get duration() {
        return this.end - this.start;
    }
}

@define
class LsStateModel extends Record {
    static attributes = {
        yearFrom   : 0,
        monthFrom  : 1,
        yearTo     : 0,
        monthTo    : 1,
        curYear    : 0,
        oldestYear : 0
    };

    constructor() {
        super();

        this.curYear = this.yearFrom = this.yearTo = dayjs().year();
    }
}

@define
class Application extends React.Component {
    static state = {
        conf                    : ConfigModel,
        cur                     : CurInfoModel,
        sensors                 : SensorCollection,
        fs                      : FileSystem,
        files                   : FileModel.Collection,
        connection              : false,
        show_relays             : false,
        show_boots              : false,
        chartSelectedPeriod     : 24 * 60 * 60 * 1000,
        chartSelectionRightSide : 0,
        localData               : FileLogRawLine.Collection,
        stat                    : StatModel,
        lsState                 : LsStateModel,
        loading                 : true
    };

    timer         = null;
    chart         = null;
    chart_options = {
        title  : { text : "Temperature" },
        chart  : {
            zoomType : "x",
            panKey   : "alt",
            panning  : true,
            events   : {
                selection : e => this.onChartSelection( e )
            }
        },
        xAxis  : {
            type   : "datetime",
            events : {
                setExtremes : p => this.onSetExtremes( p ),
            }
        },
        time   : {
            timezoneOffset : (new Date).getTimezoneOffset(),
        },
        series : [],
    }

    componentDidMount() {
        this.loadPreferences();
        this.getFullState();
    }

    savePreferences() {
        localStorage.setItem( "prefs",
            JSON.stringify( _.pick( this.state, "show_relays", "show_boots", "chartSelectedPeriod" ) ) );
    }

    loadPreferences() {
        const loaded = localStorage.getItem( "prefs" );

        try {
            this.state.set( JSON.parse( loaded || "{}" ) );
        }
        catch( e ) {
            console.error( "Prefs parse error", e );
        }
    }

    onSetExtremes( params ) {
        if( params.min && params.max ) {
            this.calcStats( params.min, params.max )
        } else {
            this.calcStats(
                this.chart.series[ 0 ].data[ 0 ].x,
                this.chart.series[ 0 ].data[ this.chart.series[ 0 ].data.length - 1 ].x
            );
        }
    }

    calcStats( start, finish ) {
        const { stat } = this.state;
        let sum        = 0;

        // We use plotBands as stats datasource because they are already mostly processed right way
        const bands = this.chart.xAxis[ 0 ].plotLinesAndBands || [];

        for( let i = 0; i < bands.length; i++ ) {
            const band         = bands[ i ];
            const { from, to } = band.options;

            if( !from ) {
                continue;
            }

            if( from > finish ) {
                break;
            }

            if( to > start ) {
                sum += Math.min( to, finish ) - Math.max( from, start );
            }
        }

        stat.start   = start;
        stat.end     = finish;
        stat.time_on = sum;
    }

    parseState( json ) {
        const sensors =
                  json.sn.split( "," ).map( s => {
                      const addr   = s.split( " " );
                      const weight = addr.pop();

                      return { addr, weight }
                  } );

        this.state.set( {
            conf  : json.conf,
            fs    : json.fs,
            sensors,
            files : json.dt
        } );

        this.state.sensors.loadNames();

        this.timer && this.setTimer();
    }

    getFullState() {
        return ESPfetch( "/conf" )
            .then( json => this.parseState( json ) )
            .then( () => {
                this.state.loading = false;
                this.loadAllData();
            } )
            .catch( err => {
                console.error( "getFullState error: ", err );
                this.state.loading = false;
            } )
    }

    getCurInfo( force ) {
        const { cur : cur0 }      = this.state;
        const { rel : prevRelay } = cur0;

        cur0.load( { force } )
            .then( () => {
                const { cur }        = this.state;
                const isRelayChanged = cur.rel !== prevRelay && prevRelay !== null;

                this.state.connection = true;
                this.appendLatestToGraph( isRelayChanged );
            } )
            .catch( err => {
                console.error( err );
                this.state.connection = false;
            } )
    }

    appendLatestToGraph( isRelayChanged ) {
        const { sensors, conf, cur } = this.state;
        const now                    = Math.floor( Date.now() / 1000 ) * 1000;
        const nowRounded             = conf.read > 60 ? Math.floor( Date.now() / 60000 ) * 60000 : now;
        const lastMeasure            = cur.last * 1000;

        for( let i = 0; i < sensors.length; i++ ) {
            const ser = this.chart.series[ i ];

            if( !ser || !ser.data.length ) {
                this.addSplineOnChart( i );
            }

            // ToDo: handle adding plot-bands situation + added variable seems to be absolete
            this.chart.series[ i ].addPoint( [ nowRounded, cur.s[ i ] / 10 ], false );
        }

        if( cur.rel ) {
            if( isRelayChanged ) { // Append new plot band
                this.chart.xAxis[ 0 ].addPlotBand( { from : lastMeasure, to : nowRounded, color : PLOT_BAND_COLOR } )
            } else {
                const band = this.getLatestBand();
                if( band ) {
                    band.options.to = nowRounded;
                }
            }
        } else {
            if( isRelayChanged ) {
                const band = this.getLatestBand();

                if( band ) {
                    band.options.to = lastMeasure;
                }
            }
        }

        //this.addPlotLine({value: lastMeasure, width: 1, color: cur.rel ? 'red' : 'blue'})

        this.chart.redraw();

        this.state.chartSelectedPeriod && this.onSetZoom( nowRounded );
    }

    getLatestBand() {
        const bands = this.chart.xAxis[ 0 ].plotLinesAndBands;

        for( let i = bands.length - 1; i >= 0; i-- ) {
            if( !bands[ i ].options.to ) {
                continue;
            }
            return bands[ i ];
        }

        return null;
    }

    stopTimer = () => {
        clearInterval( this.timer );
    };

    setTimer = () => {
        const { conf } = this.state;
        const handler  = () => this.getCurInfo();

        this.stopTimer();

        this.timer = setInterval( handler, conf.read * 1000 );
        handler();
    };

    loadAllData = () => {
        this.loadLsData();

        const lastLocalDataRecord = this.state.localData.last();
        const latestStampInLs     = lastLocalDataRecord ? lastLocalDataRecord.stamp : 0;

        this.loadFileData( null, latestStampInLs );
    };

    loadLsData = () => {
        let data = localStorage.getItem( "data" );

        if( data ) {
            try {
                data = JSON.parse( data );

                this.state.localData.reset( data, { parse : true } );

                const first                   = this.state.localData.first();
                this.state.lsState.oldestYear = (first ? dayjs( first.stamp * 1000 ) : dayjs()).year();
            }
            catch( e ) {
                this.logStatus( "Loading from LS error. LS data considered as empty." );
                this.state.localData.reset();
            }
        }
    };

    logStatus( msg ) {
        alert( msg );
    }

    loadFileData = ( file = null, latestStampInLs ) => {
        const fileToLoad = file || this.state.files.last();

        if( fileToLoad ) {
            fileToLoad.load().then( data => {
                const firstRecordInFile = new FileLogRawLine( data[ 0 ], { parse : true } )

                this.state.localData.add( _.map( data, item => new FileLogRawLine( item, { parse : true } ) ) );

                if( firstRecordInFile.stamp > latestStampInLs ) {
                    const index = this.state.files.indexOf( fileToLoad );
                    _.defer( () => this.loadFileData( this.state.files.at( index - 1 ), latestStampInLs ) )
                } else {
                    this.chartFillWithData();
                }
            } );
        } else {
            this.chartFillWithData();
        }
    };

    addPlotLine( line ) {
        this.chart.xAxis[ 0 ].addPlotLine( line );
    }

    getLatestChartTime() {
        if( this.chart.series[ 0 ].data.length ) {
            return this.chart.series[ 0 ].data[ this.chart.series[ 0 ].data.length - 1 ].x;
        }

        const now = new Date();

        return now.getTime() - now.getTimezoneOffset() * 60 * 1000;
    }

    setZoom( time ) {
        const latest = this.getLatestChartTime();

        this.state.set( {
            chartSelectedPeriod     : time || latest - this.chart.series[ 0 ].data[ 0 ].x,
            chartSelectionRightSide : latest
        } );
    }

    onSetZoom( _last = null ) {
        if( _last ) {
            this.state.chartSelectionRightSide = _last;
        }

        this.setChartExtremes();
    }

    onChartZoomOut() {
        const width    = this.state.chartSelectedPeriod;
        const latest   = this.getLatestChartTime();
        const right    = this.state.chartSelectionRightSide || latest;
        const newWidth = width * 2;
        const newRight = Math.min( right + (newWidth - width) / 2, latest );

        this.state.set( {
            chartSelectedPeriod     : newWidth,
            chartSelectionRightSide : newRight
        } )

        this.setChartExtremes();
    }

    setChartExtremes() {
        const right = this.state.chartSelectionRightSide || this.getLatestChartTime();
        const width = this.state.chartSelectedPeriod || 24 * 60 * 60 * 1000

        this.chart.xAxis[ 0 ].setExtremes( right - width, right );
    }

    onChartSelection( event ) {
        event.xAxis && event.xAxis[ 0 ] &&
        this.state.set( {
            chartSelectedPeriod     : event.xAxis[ 0 ].max - event.xAxis[ 0 ].min,
            chartSelectionRightSide : event.xAxis[ 0 ].max
        } )
    }

    chartFillWithData() {
        const { sensors, localData } = this.state;
        const sns_count              = sensors.length;
        const series                 = [];

        for( let i = 0; i < sns_count; i++ ) { // cache the series refs
            series[ i ] = [];
        }

        localData.each( line => {
            const { stamp, arr } = line;

            if( arr && arr.length ) {
                for( let i = 0; i < sns_count; i++ ) {
                    if( arr[ i ] > -1000 ) {
                        series[ i ].push( [ stamp * 1000, arr[ i ] / 10 ] );
                    }
                }
            }
        } )

        for( let i = 0; i < sns_count; i++ ) {
            if( !series[ i ].length ) {
                continue;
            }

            if( !this.chart.series[ i ] ) {
                this.addSplineOnChart( i )
            }

            this.chart.series[ i ].setData( series[ i ], false );
        }

        this.resetPlotLines();
        this.onChartIsReady();

        this.chart.chartWidth = this.refs.chartbox.offsetWidth;
        this.chart.redraw();

        localStorage.setItem( "data", JSON.stringify( localData.toJSON() ) );
    }

    resetPlotLines() {
        const lines   = [];
        const bands   = [];
        let latestStamp;
        let bandStart = null;

        this.state.localData.each( line => {
            const { stamp, event } = line;
            const value            = stamp * 1000;

            switch( event ) {
                case "st":
                    if( this.state.show_boots ) {
                        lines.push( { value, width : 1, color : "rgba(0,0,0,.25)" } );
                    }

                    if( bandStart && this.state.show_relays ) {
                        bands.push( { from : bandStart, color : "#ff000015", to : latestStamp } );
                        bandStart = null;
                    }
                    break;
                case "off":
                    if( bandStart && this.state.show_relays ) {
                        bands.push( { from : bandStart, color : PLOT_BAND_COLOR, to : value } );
                        bandStart = null;
                    }

                    //     lines.push({value, width:1, color: 'blue'});
                    break;
                case "on":
                    if( this.state.show_relays ) {
                        bandStart = value;
                    }

                    //     lines.push({value, width:1, color: 'red'});
                    break;
            }
            latestStamp = value;
        } );

        if( bandStart ) {
            bands.push( { from : bandStart, color : PLOT_BAND_COLOR, to : latestStamp } );
        }

        this.chart.xAxis[ 0 ].update( { plotLines : _.compact( lines ), plotBands : _.compact( bands ) } )
    }

    addSplineOnChart( i ) {
        this.chart.addSeries( { type : "spline", name : this.state.sensors.at( i ).name } );
    }

    afterRender = chart => {
        this.chart = chart;
    };

    onChartIsReady() {
        this.setTimer();

        this.listenTo( this.state, "change:show_boots change:show_relays", () => {
            this.savePreferences();
            this.resetPlotLines();
        } );
        this.listenTo( this.state, "change:chartSelectedPeriod", () => {
            this.savePreferences();
            this.onSetZoom();
        } );

        this.onSetZoom();
    }

    cleanLs() {
        const { localData, lsState : { monthFrom, yearFrom, monthTo, yearTo } } = this.state;
        const from                                                              = dayjs.utc(
            `${ yearFrom }-${ monthFrom }-01` ).unix();
        const to                                                                = dayjs.utc(
            `${ yearTo }-${ monthTo }-01` ).add( 1, "month" ).unix();
        const filtered                                                          = localData.filter(
            row => row.stamp < from || row.stamp > to );

        if( confirm( `Are you sure to remove ${ localData.length -
                                                filtered.length } records from ${ monthFrom }/${ yearFrom } to the end of ${ monthTo }/${ yearTo }` ) ) {

            localData.reset( filtered );

            this.chartFillWithData()
        }
    }

    exportFromLs() {
        const { localData, sensors, lsState : { monthFrom, yearFrom, monthTo, yearTo } } = this.state;
        const from                                                                       = dayjs.utc(
            `${ yearFrom }-${ monthFrom }-01` ).unix();
        const to                                                                         = dayjs.utc(
            `${ yearTo }-${ monthTo }-01` ).add( 1, "month" ).unix();
        const periodText                                                                 = dayjs( from * 1000 )
                                                                                               .format( "DD_MM_YYYY" ) +
                                                                                           "-" + dayjs( to * 1000 )
                                                                                               .format( "DD_MM_YYYY" );
        const exportData                                                                 = localData.filter(
            row => row.stamp >= from && row.stamp < to );
        const workbook                                                                   = new ExcelJS.Workbook();
        const sheet                                                                      = workbook.addWorksheet(
            periodText, {
                headerFooter : { firstHeader : periodText }
            } );
        const columns                                                                    = [ {
            header : "Time", key : "time"
        } ];

        sensors.each( ( sensor, i ) => columns.push( { header : sensor.name, key : "s" + i } ) )
        columns.push( { header : "Event", key : "event" } )
        sheet.columns = columns;

        _.each( exportData, row => {
            const { arr, stamp } = row;
            const rowData        = {
                time : dayjs.utc( stamp * 1000 ).toDate()
            }

            if( typeof arr[ 0 ] === "number" ) {
                sensors.each( ( sensor, i ) => rowData[ "s" + i ] = arr[ i ] / 10 )
            } else {
                rowData.event = arr[ 0 ];
            }

            sheet.addRow( rowData )
        } );

        workbook.xlsx.writeBuffer().then( buffer =>
            downloadFile( buffer, "application/octet-stream",
                "temp_data_" + periodText.replace( /[^\w\-]+/g, "" ) + ".xlsx" )
        ).catch( e => {
            console.log( e );
        } )
    }

    getLeftSpaceDaysText() {
        const { conf, sensors, fs } = this.state;
        const recordAvgSize         = 3 + 11 /*punctuation+time*/ + 5 /*event*/ + 4 * sensors.length;
        const recordsPerFile        = Math.floor( 8190 / recordAvgSize );
        const filesLeft             = Math.floor( (fs.tot - fs.used) / 8192 );
        const fileTime              = recordsPerFile * conf.log;
        const timeLeft              = filesLeft * fileTime;

        return [ myHumanizer( timeLeft * 1000 ), myHumanizer( fileTime * 1000 ) ];
    }

    render() {
        const {
                  loading, conf, cur, sensors, fs, files, connection,
                  chartSelectedPeriod, show_relays, show_boots, stat, lsState
              }                                  = this.state;
        const [ daysLeftSpace, oneFileDuration ] = this.getLeftSpaceDaysText();

        return <Container>
            {
                loading ? <Loader/> : void 0
            }
            <div className='top-right'>
                <div className='chart_options'>
                    <span onClick={ () => this.state.show_boots = !show_boots }
                          className={ cx( "z_option red", { option_sel : show_boots } ) }>перезагрузки</span>
                    <span onClick={ () => this.state.show_relays = !show_relays }
                          className={ cx( "z_option red", { option_sel : show_relays } ) }>включения</span>
                    { _.map(
                        [ [ 30, "30m" ],
                          [ 60 * 2, "2h" ],
                          [ 60 * 6, "6h" ],
                          [ 60 * 24, "24h" ],
                          [ 60 * 24 * 7, "7d" ],
                          [ 60 * 24 * 30, "30d" ],
                          [ 60 * 24 * 30 * 3, "90d" ],
                          [ 0, "All" ] ],
                        ( [ min, name ] ) =>
                            <span onClick={ () => this.setZoom( min * 60 * 1000 ) }
                                  className={ cx( "z_option",
                                      { option_sel : chartSelectedPeriod === min * 60 * 1000 } ) }
                                  key={ min }
                            >{ name }</span> )
                    }
                </div>
                <div className='up_time'>{
                    connection ? "Аптайм " + myHumanizer( cur.up * 1000 ) : "Нет связи с платой"
                }</div>
                <Button onClick={ () => this.getCurInfo( true ) }
                        variant='outline-primary'>Load now</Button>
            </div>
            <Tabs defaultActiveKey='chart'
                  onSelect={ key => {
                      key === "chart" && setTimeout( () => {
                          this.chart.setSize( null, null, false )
                      }, 1000 )
                  } }
            >
                <Tab eventKey='chart' title='Данные'>
                    <Row>
                        <div id='chart-container' ref='chartbox'>
                            <ReactHighcharts
                                config={ this.chart_options }
                                callback={ this.afterRender }
                                isPureConfig={ true }
                                height={ 600 }
                            />
                            <Button onClick={ () => this.onChartZoomOut() } label='Zoom out' size='sm'
                                    valiean='outline-info'
                                    id='zoom-out-button'/>
                        </div>
                    </Row>
                    <Row>
                        <Col lg='3'>{
                            connection ? <><h3>{ cur.avg }&deg;C</h3>
                                <h4 className={ cx( "relay", { on : cur.rel } ) }>Обогрев { cur.rel ? "включен" :
                                                                                            "выключен" }</h4>
                                { cur.s.map( ( t, i ) => {
                                    const s = sensors.at( i );
                                    return <li key={ i }>{ (s && s.name) + " " + (t / 10) }&deg;</li>
                                } ) }</> : null
                        }
                        </Col>
                        <Col lg='6'/>
                        <Col lg='3'><StatDonut show={ show_relays } stat={ stat }/>
                        </Col>
                    </Row>
                </Tab>
                <Tab eventKey='config' title='Конфигурация'>
                    <Row>
                        <Col>
                            <Form.Row label='ESP IP'>
                                <Form.ControlLinked valueLink={ Link.value( getServerIp(), x => {
                                    onServerIpChange( x );
                                    this.asyncUpdate()
                                } ) }/>
                            </Form.Row>
                            <Form.Row>
                                <Button onClick={ () => this.getFullState() } variant='outline-info'>Get From
                                    ESP</Button>
                            </Form.Row>
                            <Form.Row label='T low'>
                                <Form.ControlLinked valueLink={ conf.linkAt( "tl" ) }/>
                            </Form.Row>
                            <Form.Row label='T high'>
                                <Form.ControlLinked valueLink={ conf.linkAt( "th" ) }/>
                            </Form.Row>
                            <Form.Row label='ON min'>
                                <Form.ControlLinked valueLink={ conf.linkAt( "ton" ) }/>
                            </Form.Row>
                            <Form.Row label='OFF min'>
                                <Form.ControlLinked valueLink={ conf.linkAt( "toff" ) }/>
                            </Form.Row>
                            <Form.Row label='Read each'>
                                <Form.ControlLinked valueLink={ conf.linkAt( "read" ) }/>
                            </Form.Row>
                            <Form.Row label='Log each'>
                                <Form.ControlLinked valueLink={ conf.linkAt( "log" ) }/>
                            </Form.Row>
                            <Form.Row label='Flush log each'>
                                <Form.ControlLinked valueLink={ conf.linkAt( "flush" ) }/>
                            </Form.Row>
                            <Form.Row>
                                <Button onClick={ () => conf.save()
                                    .then( json => this.parseState( json ) ) } variant='outline-info'>Update
                                    config</Button>
                            </Form.Row>
                        </Col>
                        <Col>
                            {
                                sensors.map( sns =>
                                    <Form.Row key={ sns }>
                                        { sns.addr[ 0 ] + "-" + sns.addr[ 1 ] }
                                        <Form.ControlLinked valueLink={ sns.linkAt( "name" ) }/>
                                        <Form.ControlLinked valueLink={ sns.linkAt( "weight" ) }/>
                                    </Form.Row>
                                )
                            }
                            <Form.Row>
                                <Button onClick={ () => sensors.save()
                                    .then( json => this.parseState( json ) ) } variant='outline-info'>Set
                                    balance</Button>
                            </Form.Row>
                        </Col>
                        <Col>
                            <h4>ESP disk state</h4>
                            { files.length ?
                              <h4>Used { Math.round( fs.used * 1000 / fs.tot ) / 10 }%</h4>
                                           : void 0 }
                            <span className='hint'>Места на ~{ daysLeftSpace }<br/>Файл на ~{ oneFileDuration }</span>
                            <FilesList files={ files }/>
                        </Col>
                        <Col>
                            <h4>LS operations</h4>
                            <Form.Row label='Year from'>
                                <Form.ControlLinked as='select'
                                                    valueLink={ lsState.linkAt( "yearFrom" ) }
                                                    placeholder='Y'>
                                    { _.map(
                                        _.range( lsState.oldestYear, lsState.curYear + 1 ),
                                        year => <option value={ year } key={ year }>{ year }</option>
                                    ) }
                                </Form.ControlLinked>
                            </Form.Row>
                            <Form.Row label='Month from'>
                                <Form.ControlLinked as='select' valueLink={ lsState.linkAt( "monthFrom" ) }>
                                    { _.map( _.range( 1, 13 ),
                                        month => <option value={ month } key={ month }>{ month }</option> ) }
                                </Form.ControlLinked>
                            </Form.Row>
                            <Form.Row label='Year to'>
                                <Form.ControlLinked as='select' valueLink={ lsState.linkAt( "yearTo" ) }>
                                    { _.map(
                                        _.range( lsState.oldestYear, lsState.curYear + 1 ),
                                        year => <option value={ year } key={ year }>{ year }</option>
                                    ) }
                                </Form.ControlLinked>
                            </Form.Row>
                            <Form.Row label='Month to'>
                                <Form.ControlLinked as='select' valueLink={ lsState.linkAt( "monthTo" ) }
                                                    placeholder='M'>
                                    { _.map( _.range( 1, 13 ),
                                        month => <option value={ month } key={ month }>{ month }</option> ) }
                                </Form.ControlLinked>
                            </Form.Row>

                            <Form.Row>
                                <Button label='Clean' variant='outline-info' onClick={ () => this.cleanLs() }/>
                            </Form.Row>
                            <Form.Row>
                                <Button label='Export' variant='outline-info' onClick={ () => this.exportFromLs() }/>
                            </Form.Row>
                        </Col>
                    </Row>
                </Tab>
            </Tabs>
        </Container>;
    }
}

ReactDOM.render( React.createElement( Application, {} ), document.getElementById( "app-mount-root" ) );
