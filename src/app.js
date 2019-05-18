import React from 'react-type-r'
import * as ReactDOM from 'react-dom'
import { Record, Collection, define } from 'type-r'
import * as moment from 'moment'
//import { Select, Slider } from 'ui/Controls'
import {
    Container, Row, Col,
    Badge,
    Card,
    Modal, Form, Button
} from './Bootstrap'
//import cx from 'classnames'

import './app.scss'

const stampToString = stamp =>
    moment( stamp ).toArray().join( ', ' );

const server_url = ( path, params ) => {
    const esc = encodeURIComponent;
    return 'http://192.168.240.104' + path + (
        params
        ? '?' + Object.keys( params )
               .map( k => esc( k ) + '=' + esc( params[ k ] ) )
               .join( '&' )
        : ''
    );
};

const getJson = res => {
    return res.json()
};

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
        up : 0,
        s    : [],
        avg  : 0
    };

    load() {
        return ESPfetch( server_url( '/info', { cur : 1 } ) ).then( json => this.set( json ) )
    }
}

@define
class FileSysten extends Record {
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
        addr   : [],
        weight : 10
    };

    toLine() {
        return this.addr.join( ',' ) + ',' + this.weight;
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
            .then( json => {
                console.log( json )
            } )
    }
}

@define
class Application extends React.Component {
    static state = {
        conf    : ConfigModel,
        cur     : CurInfoModel,
        sensors : SensorCollection,
        fs      : FileSysten,
        files   : FileModel.Collection,
        connection: false
    };

    timer = null;

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

        this.timer && this.setTimer();
    }

    getFullState() {
        return ESPfetch( server_url( '/conf' ) )
            .then( json => this.parseState( json ) )
    }

    getCurInfo(){
        this.state.cur.load()
            .then(()=>{
                this.state.connection = true;
            })
            .catch(err=>{
            console.error(err);
            this.state.connection = false;
        })
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

    render() {
        const { conf, cur, sensors, fs, files, connection } = this.state;

//        const mom = moment;

        return <Container>
            <Row>
                <Col>
                    <h3>{connection ? cur.avg : '---'}</h3>
                    [{cur.s.map( t => t / 10 ).join( ', ' )}]
                    <h4>Relay is {cur.rel ? 'ON' : 'OFF'}</h4>
                    {connection ? "Up for " + moment.duration(cur.up*1000).humanize() : 'Connection lost'}
                    <div>
                        {this.timer ?
                         <Button onClick={this.stopTimer}>Stop timer</Button> :
                         <Button onClick={this.setTimer}>Start timer</Button>
                        }
                        <Button onClick={() => this.getCurInfo()} color='white'>Get Info</Button>
                    </div>
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
                        .then( json => this.parseState( json ) )}>Update config</Button>
                </Col>
                <Col>
                    {
                        sensors.map( obj => <Form.Row label={obj.addr.join( ',' )} key={obj}>
                                <Form.ControlLinked valueLink={obj.linkAt( 'weight' )}/>
                            </Form.Row>
                        )
                    }
                    <Button onClick={() => sensors.save()
                        .then( json => this.parseState( json ) )}>Set balance</Button>
                </Col>
                <Col>
                    <h4>Used {Math.round( fs.used * 1000 / fs.tot ) / 10}%</h4>
                    {
                        files.map( file => <Form.Row label={file.n + ' ' + Math.round( file.s * 10 / 1024 ) / 10 + 'Kb'}
                                                     key={file}>
                                <Button onClick={() => file.load()}>Load</Button>
                                <Button onClick={() => file.del()}>Delete</Button>
                            </Form.Row>
                        )
                    }
                </Col>
                <Col>
                    <Button onClick={() => this.getFullState()}>Get From ESP</Button>
                </Col>
            </Row>
        </Container>;
    }
}

ReactDOM.render( React.createElement( Application, {} ), document.getElementById( 'app-mount-root' ) );