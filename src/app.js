import React, { Link }                                  from "react-mvx"
import * as ReactDOM                                    from "react-dom"
import { Record, define, type }                         from "type-r"
import * as moment                                      from "moment"
import { Container, Row, Col, Form, Button, Tabs, Tab } from "./Bootstrap"
import * as ReactHighcharts                             from "react-highcharts"
import "./app.scss"

let server_ip = localStorage.getItem( "ip" ) || "192.168.0.0";

const onServerIPchange = ip => {
    localStorage.setItem( "ip", server_ip = ip );
};

const server_url = ( path, params ) => {
    const esc = encodeURIComponent;
    return "http://" + server_ip + path + ".json" + (
        params
        ? "?" + Object.keys( params )
               .map( k => esc( k ) + "=" + esc( params[ k ] ) )
               .join( "&" )
        : ""
    );
};

const Loader = ( { label, inline, absolute, className } ) =>
    <div className={ cx( "loader", { loaderInline : inline, loaderAbsolute : absolute }, className ) }>
        <div className='loaderBody'>
            <img
                alt='Loader'
                className='loaderImg'
                src='./loader.svg'/>
            <div>{ label }</div>
        </div>
    </div>;

const ESPfetch = ( url ) => fetch( url, {
          mode : "cors",
          /*    headers : {
                  'Content-Type' : 'text/json',
                  'Accept'       : 'text/json',
              }*/
      } )
    .then( res => res.text() )
    .then( text => {
        let json;
        try {
            text = text.replace( /,\s{0,}([,\]])/, "$1" );
            json = JSON.parse( text );
        }
        catch( e ) {
            console.log( "JSON parse failed, no matter of try to fix" );
            json = [];
        }

        return json;
    } )
;

//   .catch( err => console.error( err ) );

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

        return ESPfetch( server_url( "/conf", params ) )
    }
}

@define
class CurInfoModel extends Record {
    static attributes = {
        last : Date,
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
        return ESPfetch( server_url( "/info", params ) )
            .then( json => this.set( json ) )
    }
}

@define
class FileSystem extends Record {
    static attributes = {
        tot   : 0,
        used  : 0,
        block : 0,
        page  : 0
    };
}

@define
class SensorModel extends Record {
    static attributes = {
        addr   : type( Array ).has.watcher( "onAddrChange" ),
        weight : 10,
        name   : type( String ).has.watcher( "onNameChange" ),
    };

    /*
        get name() {
            return this._name || this.addr.splice(0,2).join('-');
        }
    */
    onNameChange() {
        localStorage.setItem( "/sens/" + this.addr.join( "" ), this.name );
    }

    loadName() {
        this.name = localStorage.getItem( "/sens/" + this.addr.join( "" ) ) || (this.addr[ 0 ] + "~" + this.addr[ 1 ]);
    }

    /*
        onAddrChange(){
            this._name = localStorage.getItem('/sens/' + this.addr.join('')) || '';
        }
    */
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

        return ESPfetch( server_url( "/conf", params ) )
    }
}

@define
class FileModel extends Record {
    static attributes = {
        n : "",
        s : 0,
    };

    del() {
        return ESPfetch( server_url( "/data", { d : this.n } ) )
            .then( json => {
                if( json.d ) {
                    this.collection.remove( this );
                } else {
                    alert( "Nothing happened" )
                }
            } )
    }

    load() {
        return ESPfetch( server_url( "/data", { f : this.n } ) )
    }

}

@define
class FileLogRawLine extends Record {
    static idAttribute = "stamp";

    static attributes = {
        stamp : 0,
        arr   : []
    };

    parse( data ) {
        const stamp = data.shift();

        return { stamp, arr : data };
    }

    toJSON() {
        return [ this.stamp, ...this.arr ];
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

    /*
        toJSON() {
            return [ this.stamp * 1000, this.temp / 10 ];
        }

        static collection = {
            comparator: 'stamp'
        }
    */
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

    get duration() { return this.end - this.start; }
}

@define
class Application extends React.Component {
    static state = {
        conf          : ConfigModel,
        cur           : CurInfoModel,
        sensors       : SensorCollection,
        fs            : FileSystem,
        files         : FileModel.Collection,
        connection    : false,
        series        : LineModel.Collection,
        plot_lines    : PlotLineModel.Collection,
        show_relays   : true,
        show_boots    : false,
        zoom_last     : 0,
        local_data    : FileLogRawLine.Collection,
        chart_options : {
            title  : { text : "Temperature" },
            chart  : {
                zoomType : "x",
                panKey   : "alt",
                panning  : true
            },
            xAxis  : {
                type : "datetime",
            },
            series : [],
        },
        stat          : StatModel,
        loading       : true
    };

    timer = null;
    chart = null;

    componentWillMount() {
        this.state.chart_options.xAxis.events = { setExtremes : p => this.onSetExtremes( p ) }
    }

    componentDidMount() {
        this.getFullState();
    }

    onSetExtremes( params ) {
        if( params.min && params.max ) {
            this.calcStats( params.min, params.max )
        } else {
            this.calcStats( this.state.series.at( 0 ).data.at( 0 ).stamp * 1000,
                this.chart.series[ 0 ].data[ this.chart.series[ 0 ].data.length - 1 ].x );
        }
    }

    calcStats( start, finish ) {
        const { plot_lines, stat } = this.state;
        let turned                 = null,
            sum                    = 0;

        for( let i = 0; i < plot_lines.length; i++ ) {
            const p = plot_lines.at( i );

            if( p.value > finish ) {
                if( turned ) {
                    sum += finish - turned;
                }
                break;
            }

            if( p.value > start ) {
                switch( p.type ) {
                    case "on":
                        turned = p.value;
                        break;
                    case "off":
                    case "st":
                        if( turned ) {
                            sum += p.value - turned;
                            turned = null;
                        }
                        break;
                }
            }
        }

        stat.start   = start;
        stat.end     = finish;
        stat.time_on = sum;
    }

    parseState( json ) {
        const sensors =
                  json.sn.split( "," ).map( s => {
                      const addr   = s.split( " " ),
                            weight = addr.pop();
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
        return ESPfetch( server_url( "/conf" ) )
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
        const { cur : cur0 } = this.state,
              { rel }        = cur0;

        cur0.load( { force } )
            .then( () => {
                const { cur } = this.state;

                this.state.connection = true;
                this.addPoints();
                if( cur.rel !== rel && rel !== null ) {
                    this.addPlotLine( { value : cur.last * 1000, width : 1, color : cur.rel ? "red" : "blue" } )
                }
            } )
            .catch( err => {
                console.error( err );
                this.state.connection = false;
            } )
    }

    stopTimer = () => {
        clearInterval( this.timer );
    };

    setTimer = () => {
        const { conf } = this.state,
              handler  = () => this.getCurInfo();

        this.stopTimer();

        this.timer = setInterval( handler, conf.read * 1000 );
        handler();
    };

    fileToLs( file ) {
        file.load().then( json => {
            this.state.local_data.add( json, { parse : true } );
            localStorage.setItem( "data", JSON.stringify( this.state.local_data.toJSON() ) );
        } )
    }
    ;

    addDataSet = arr => {
        const series    = [],
              sns_count = this.state.sensors.length;

        for( let i = 0; i < sns_count; i++ ) { // cache the series refs
            series[ i ] = this.state.series.at( i ) || this.state.series.add( {} )[ 0 ];
        }

        _.each( arr, line => {
            if( _.isNumber( line[ 1 ] ) ) {
                for( let i = 0; i < sns_count; i++ ) {
                    if( line[ 1 + i ] > -1000 ) {
                        series[ i ].data.add( { stamp : line[ 0 ], temp : line[ 1 + i ] }, { silent : true } );
                    }
                }
            } else {
                this.state.plot_lines.add( { value : line[ 0 ] * 1000, type : line[ 1 ] }, { silent : true } );
            }
        } );
    };

    loadAllData = () => {
        this.loadLsData();
        this.loadFileData();
    };

    loadLsData = () => {
        let data = localStorage.getItem( "data" );

        if( data ) {
            try {
                data = JSON.parse( data );
                this.addDataSet( data );
                this.state.local_data.reset( data, { parse : true } );
            }
            catch( e ) {
                alert( "Loading from LS error: " + e.message );
            }
        }
    };

    loadFileData = ( file = null ) => {
        const chunk = file || this.state.files.last();

        if( chunk ) {
            chunk.load().then( data => {
                this.addDataSet( data );

                const index = this.state.files.indexOf( chunk );

                if( index > 0 ) {
                    _.defer( () => this.loadFileData( this.state.files.at( index - 1 ) ) )
                } else {
                    this.chartFillWithData();
                }
            } );
        } else {
            this.chartFillWithData();
        }
    };

    setZoomLast( min ) {
        this.state.zoom_last = min;
        localStorage.setItem( "zoom", min );
    }

    resetPlotlines() {
        const lines = this.state.plot_lines.map( line => {
            const { type, value } = line,
                  obj             = { value : value, width : 1, color : "red", label : { text : type } };

            switch( type ) {
                case "st":
                    if( !this.state.show_boots ) {
                        return null;
                    }
                    obj.label.text = "";
                    obj.color      = "rgba(0,0,0,.15)";
                    obj.width      = 7;
                    break;
                case "off":
                    obj.color = "blue";
                case "on":
                    if( !this.state.show_relays ) {
                        return null;
                    }
                    break;
            }

            return obj;
        } );

        this.chart.xAxis[ 0 ].update( { plotLines : _.compact( lines ) } )
    }

    addPlotLine( line ) {
        this.chart.xAxis[ 0 ].addPlotLine( line );
    }

    addPoints() {
        const { sensors, cur } = this.state,
              sns_count        = sensors.length,
              lst              = cur.last * 1000,
              now              = Date.now() - (new Date).getTimezoneOffset() * 60 * 1000;
        let added              = 0;

        for( let i = 0; i < sns_count; i++ ) {
            const ser = this.chart.series[ i ];

            if( !ser || !ser.data.length ) { continue; }
            this.chart.series[ i ].addPoint( [ lst, cur.s[ i ] / 10 ], false );
            added++;
        }

        added && this.chart.redraw();

        added && this.state.zoom_last && this.onSetZoomLast( now );
    }

    onSetZoomLast( _last = null ) {
        const latest = _last || (this.chart.series[ 0 ].data[ this.chart.series[ 0 ].data.length - 1 ]).x;

        this.chart.xAxis[ 0 ].setExtremes(
            this.state.zoom_last ?
            latest - this.state.zoom_last * 60 * 1000
                                 : this.state.series.at( 0 ).data.at( 0 ).stamp * 1000,
            latest
        )
    }

    chartFillWithData() {
        const { sensors } = this.state,
              sns_count   = sensors.length;

        for( let i = 0; i < sns_count; i++ ) {
            if( !this.chart.series[ i ] ) {
                this.chart.addSeries( { type : "spline", name : sensors.at( i ).name } );
            }
            this.chart.series[ i ].setData( this.state.series.at( i ).data.toJSON(), false );
        }

        this.resetPlotlines();

        this.onChartIsReady();

        this.chart.chartWidth = this.refs.chartbox.offsetWidth;
        this.chart.redraw();
    }

    afterRender = chart => {
        this.chart = chart;
    };

    onChartIsReady() {
        this.setTimer();

        this.listenTo( this.state, "change:show_boots change:show_relays", () => this.resetPlotlines() );
        this.listenTo( this.state, "change:zoom_last", () => this.onSetZoomLast() );

        this.state.zoom_last = localStorage.getItem( "zoom" ) || 0;
    }

    moveDataToLS() {

    }

    render() {
        const {
                  loading, conf, cur, sensors, fs, files, connection, chart_options,
                  zoom_last, show_relays, show_boots, stat
              } = this.state;

        return <Container>
            {
                loading ? <Loader/> : void 0
            }
            <div className='top-right'>
                <div className='chart_options'>
                    <span onClick={ () => this.state.show_boots = !show_boots }
                          className={ cx( "z_option red", { option_sel : show_boots } ) }>rst</span>
                    <span onClick={ () => this.state.show_relays = !show_relays }
                          className={ cx( "z_option red", { option_sel : show_relays } ) }>tgl</span>
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
                            <span onClick={ () => this.setZoomLast( min ) }
                                  className={ cx( "z_option", { option_sel : zoom_last === min } ) }
                                  key={ min }
                            >{ name }</span> )
                    }
                </div>
                <div className='up_time'>{
                    connection ? "Up for " + moment.duration( cur.up * 1000 ).humanize() : "Connection lost"
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
                <Tab eventKey='chart' title='Chart'>
                    <Row>
                        <div style={ { width : "100%" } } ref='chartbox'>
                            <ReactHighcharts
                                config={ chart_options }
                                callback={ this.afterRender }
                                isPureConfig={ true }
                                height={ 600 }
                            />
                        </div>
                    </Row>
                    <Row>
                        <Col>
                            <h3>{ connection ? cur.avg : "---" }&deg;C</h3>
                            <h4>Relay is { cur.rel ? "ON" : "OFF" }</h4>
                            { cur.s.map( ( t, i ) => {
                                const s = sensors.at( i );
                                return <li key={ i }>{ (s && s.name) + " " + (t / 10) }&deg;</li>
                            } ) }
                        </Col>
                        <Col>
                            By period of <b>~{ moment.duration( stat.duration ).humanize() }</b> relay
                            was { stat.time_on > 0 ? <span>on
                            for <b>~{ moment.duration( stat.time_on ).humanize() }
                                , { stat.duration ? Math.round( stat.time_on * 1000 / stat.duration ) / 10 :
                                    "--" }%</b></span> : " off" }
                        </Col>
                    </Row>
                </Tab>
                <Tab eventKey='config' title='Config'>
                    <Row>
                        <Col>
                            <Form.Row label='ESP IP'>
                                <Form.ControlLinked valueLink={ Link.value( server_ip, x => {
                                    onServerIPchange( x );
                                    this.asyncUpdate()
                                } ) }/>
                            </Form.Row>
                            <Button onClick={ () => this.getFullState() } variant='outline-info'>Get From ESP</Button>
                        </Col>
                        <Col>
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
                            <Button onClick={ () => conf.save()
                                .then( json => this.parseState( json ) ) } variant='outline-info'>Update config</Button>
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
                            <Button onClick={ () => sensors.save()
                                .then( json => this.parseState( json ) ) } variant='outline-info'>Set balance</Button>
                        </Col>
                        <Col>{ files.length ?
                               <h4>Used { Math.round( fs.used * 1000 / fs.tot ) / 10 }%</h4>
                                            : void 0 }
                            {
                                files.map( file => <div key={ file }>
                                        { file.n + " " + Math.round( file.s * 10 / 1024 ) / 10 + "Kb" }
                                        {/*<Button onClick={() => file.load()} variant='light' size='sm'>Load</Button>*/ }
                                        <Button onClick={ () => file.del() } variant='light' size='sm'>Delete</Button>
                                        <Button onClick={ () => this.fileToLs( file ) } variant='light' size='sm'>to
                                            LS</Button>
                                    </div>
                                )
                            }
                        </Col>
                    </Row>
                </Tab>
            </Tabs>
        </Container>;
    }
}

ReactDOM.render( React.createElement( Application, {} ), document.getElementById( "app-mount-root" ) );
