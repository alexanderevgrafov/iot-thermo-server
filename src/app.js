import React, { Link } from 'react-type-r'
import * as ReactDOM from 'react-dom'
import { Record, define, type } from 'type-r'
import * as moment from 'moment'
import { Container, Row, Col, Form, Button, Tabs, Tab } from './Bootstrap'
import * as ReactHighcharts from 'react-highcharts'
import './app.scss'

//import cx from 'classnames'

let server_ip = localStorage.getItem( 'ip' ) || '192.168.0.5';

const onServerIPchange = ip => {
    localStorage.setItem( 'ip', server_ip = ip );
};

//const stampToString = stamp =>    moment( stamp ).toArray().join( ', ' );

const server_url = ( path, params ) => {
    const esc = encodeURIComponent;
    return 'http://' + server_ip + path + (
        params
        ? '?' + Object.keys( params )
               .map( k => esc( k ) + '=' + esc( params[ k ] ) )
               .join( '&' )
        : ''
    );
};

//const getJson = res => res.json();

const ESPfetch = ( url ) => fetch( url, {
    mode : 'cors',
    /*    headers : {
            'Content-Type' : 'text/json',
            'Accept'       : 'text/json',
        }*/
} )
    .then( res => res.json() );

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

        return ESPfetch( server_url( '/conf', params ) )
    }
}

@define
class CurInfoModel extends Record {
    static attributes = {
        last : Date,
        rel  : Boolean,
        up   : 0,
        s    : [],
        avg  : 0
    };

    load( options ) {
        const params = { cur : 1 };
        if( options.force ) {
            params.f = 1;
        }
        return ESPfetch( server_url( '/info', params ) )
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
        addr   : type( Array ).has.watcher( 'onAddrChange' ),
        weight : 10,
        name   : type( String ).has.watcher( 'onNameChange' ),
    };

    /*
        get name() {
            return this._name || this.addr.splice(0,2).join('-');
        }
    */
    onNameChange() {
        localStorage.setItem( '/sens/' + this.addr.join( '' ), this.name );
    }

    loadName() {
        this.name = localStorage.getItem( '/sens/' + this.addr.join( '' ) ) || (this.addr[ 0 ] + '~' + this.addr[ 1 ]);
    }

    /*
        onAddrChange(){
            this._name = localStorage.getItem('/sens/' + this.addr.join('')) || '';
        }
    */
    toLine() {
        return this.addr.join( ',' ) + ',' + this.weight;
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
        const params = { sn : this.map( x => x.toLine() ).join( ',' ) };

        return ESPfetch( server_url( '/conf', params ) )
    }
}

@define
class FileModel extends Record {
    static attributes = {
        n : '',
        s : 0,
    };

    del() {
        return ESPfetch( server_url( '/data', { d : this.n } ) )
            .then( json => {
                if( json.d ) {
                    this.collection.remove( this );
                } else {
                    alert( 'Nothing happened' )
                }
            } )
    }

    load() {
        return ESPfetch( server_url( '/data', { f : this.n } ) )
//            .then( json => {                console.log( json )            } )
    }
}

@define
class LineDataModel extends Record {
    static idAttribute = 'stamp';

    static attributes = {
        stamp : 0,
        temp  : 0
    };

    toJSON() {
        return [ this.stamp * 1000, this.temp / 10 ];
    }

    static collection = {
        comparator : 'stamp'
    }
}

@define
class PlotLineModel extends Record {
    static idAttribute = 'value';

    static attributes = {
        type  : '',
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
        chart_options : {
            title  : { text : 'Temperature' },
            chart  : {
                zoomType : 'x'
            },
            xAxis  : {
                type : 'datetime'
            },
            series : []
        }
    };

    timer = null;
    chart = null;

    componentDidMount() {
        this.getFullState();
        this.setTimer();
    }

    parseState( json ) {
        const sensors =
                  json.sn.split( ',' ).map( s => {
                      const addr   = s.split( ' ' ),
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
        return ESPfetch( server_url( '/conf' ) )
            .then( json => this.parseState( json ) )
            .then( () => this.loadData() )
    }

    addPoints() {
        const { sensors, cur } = this.state,
              sns_count        = sensors.length,
              now              = Date.now() - (new Date).getTimezoneOffset() * 60 * 1000;
        let added              = 0;

        for( let i = 0; i < sns_count; i++ ) {
            const ser = this.chart.series[ i ], val = cur.s[ i ] / 10;
            if( !ser || !ser.data.length ) { return; }
            const last = ser.data[ ser.data.length - 1 ].y;

            if( val !== last ) {
                this.chart.series[ i ].addPoint( [ now, cur.s[ i ] / 10 ], false );
                added++;
            }
        }

        added && this.chart.redraw();
    }

    getCurInfo( force ) {
        this.state.cur.load( { force } )
            .then( () => {
                this.state.connection = true;
                this.addPoints();
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
        const { conf, cur } = this.state,
              handler       = () => this.getCurInfo();

        this.stopTimer();

        this.timer = setInterval( handler, conf.read * 1000 );
        handler();
    };

    loadData = ( file = null ) => {
        const chunk     = file || this.state.files.last(),
              sns_count = this.state.sensors.length;

        chunk &&
        chunk.load().then( json => {
            const series = [];

            for( let i = 0; i < sns_count; i++ ) { // cache the series refs
                series[ i ] = this.state.series.at( i ) || this.state.series.add( {} )[ 0 ];
            }

            _.each( json, line => {
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

            const index = this.state.files.indexOf( chunk );

            if( index > 0 ) {
                _.defer( () => {
                    this.loadData( this.state.files.at( index - 1 ) );
                } )
            } else {
                this.updateChart();
            }
        } );
    };

    updateChart() {
        const { sensors } = this.state,
              sns_count   = sensors.length;

        for( let i = 0; i < sns_count; i++ ) {
            if( !this.chart.series[ i ] ) {
                this.chart.addSeries( { type : 'spline', name : sensors.at( i ).name } );
            }
            this.chart.series[ i ].setData( this.state.series.at( i ).data.toJSON(), false );
        }

        this.state.plot_lines.each( line => {
            const { type, value } = line,
                  obj             = { value : value, width : 1, color : 'red', label : { text : type } };

            switch( type ) {
                case 'st':
                    obj.label.text = '';
                    obj.color      = 'rgba(0,0,0,.15)';
                    obj.width      = 15;
                    break;
                case 'on':
                    break;
                case 'off':
                    obj.color = 'blue';
                    break;
            }

            this.chart.xAxis[ 0 ].addPlotLine( obj )
        } );

        this.chart.chartWidth = this.refs.chartbox.offsetWidth;
        this.chart.redraw();
    }

    afterRender = chart => {
        this.chart = chart;

    };

    render() {
        const { conf, cur, sensors, fs, files, connection, chart_options } = this.state;

        return <Container>
            <Tabs defaultActiveKey='chart'
                  onSelect={key => key === 'chart' && this.chart.reflow()}
            >
                <Tab eventKey='chart' title='Chart'>
                    <Row>
                        <div style={{ width : '100%' }} ref='chartbox'>
                            <ReactHighcharts
                                config={chart_options}
                                callback={this.afterRender}
                                isPureConfig={true}
                                height={600}
                            />
                        </div>
                    </Row>
                    <Row>
                        <Col>
                            <h3>{connection ? cur.avg : '---'}&deg;C</h3>
                            <h4>Relay is {cur.rel ? 'ON' : 'OFF'}</h4>
                            {cur.s.map( ( t, i ) => {
                                const s = sensors.at( i );
                                return <li key={i}>{(s && s.name) + ' ' + (t / 10)}&deg;</li>
                            } )}
                            <Button onClick={() => this.getCurInfo( true )}
                                    variant='outline-primary'>Load now</Button>
                            <div>{connection ? 'Up for ' + moment.duration( cur.up * 1000 ).humanize() :
                                  'Connection lost'}</div>
                        </Col>
                    </Row>
                </Tab>
                <Tab eventKey='config' title='Config'>
                    <Row>
                        <Col>
                            <Form.Row label='ESP IP'>
                                <Form.ControlLinked valueLink={Link.value( server_ip, x => {
                                    onServerIPchange( x );
                                    this.asyncUpdate()
                                } )}/>
                            </Form.Row>
                            <Button onClick={() => this.getFullState()} variant='outline-info'>Get From ESP</Button>
                        </Col>
                        <Col>
                            <Form.Row label='T low'>
                                <Form.ControlLinked valueLink={conf.linkAt( 'tl' )}/>
                            </Form.Row>
                            <Form.Row label='T high'>
                                <Form.ControlLinked valueLink={conf.linkAt( 'th' )}/>
                            </Form.Row>
                            <Form.Row label='ON min'>
                                <Form.ControlLinked valueLink={conf.linkAt( 'ton' )}/>
                            </Form.Row>
                            <Form.Row label='OFF min'>
                                <Form.ControlLinked valueLink={conf.linkAt( 'toff' )}/>
                            </Form.Row>
                            <Form.Row label='Read each'>
                                <Form.ControlLinked valueLink={conf.linkAt( 'read' )}/>
                            </Form.Row>
                            <Form.Row label='Log each'>
                                <Form.ControlLinked valueLink={conf.linkAt( 'log' )}/>
                            </Form.Row>
                            <Form.Row label='Flush log each'>
                                <Form.ControlLinked valueLink={conf.linkAt( 'flush' )}/>
                            </Form.Row>
                            <Button onClick={() => conf.save()
                                .then( json => this.parseState( json ) )} variant='outline-info'>Update config</Button>
                        </Col>
                        <Col>
                            {
                                sensors.map( obj => <Form.Row key={obj}>
                                        <Form.ControlLinked valueLink={obj.linkAt( 'name' )}/>
                                        <Form.ControlLinked valueLink={obj.linkAt( 'weight' )}/>
                                    </Form.Row>
                                )
                            }
                            <Button onClick={() => sensors.save()
                                .then( json => this.parseState( json ) )} variant='outline-info'>Set balance</Button>
                        </Col>
                        <Col>
                            <h4>Used {Math.round( fs.used * 1000 / fs.tot ) / 10}%</h4>
                            {
                                files.map( file => <Form.Row
                                        label={file.n + ' ' + Math.round( file.s * 10 / 1024 ) / 10 + 'Kb'}
                                        key={file}>
                                        <Button onClick={() => file.load()} variant='light' size='sm'>Load</Button>
                                        <Button onClick={() => file.del()} variant='light' size='sm'>Delete</Button>
                                    </Form.Row>
                                )
                            }
                        </Col>
                    </Row>
                </Tab>
            </Tabs>
        </Container>;
    }
}

ReactDOM.render( React.createElement( Application, {} ), document.getElementById( 'app-mount-root' ) );