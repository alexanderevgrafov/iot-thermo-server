import React from 'react-type-r'
import * as ReactDOM from 'react-dom'
import { define } from 'type-r'
//import { Select, Slider } from 'ui/Controls'
import {
    Container, Row, Col,
    Badge,
    Card,
    Modal, Form, Button
} from './Bootstrap'
//import cx from 'classnames'
import { _t } from 'app/translate'
import 'scss/app.scss'

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
    }
}

@define
class Application extends React.Component {
    static state = {
        conf : ConfigModel
    };

    render() {
        const { conf } = this.state;

        return <Container>
            <Row>
                <Col>
                    <Row label='T low'>
                        <Form.ControlLinked valueLink={conf.linkAt( 'tl' )}/>
                    </Row>
                    <Row label='T high'>
                        <Form.ControlLinked valueLink={conf.linkAt( 'th' )}/>
                    </Row>
                    <Row label='ON min'>
                        <Form.ControlLinked valueLink={conf.linkAt( 'ton' )}/>
                    </Row>
                    <Row label='OFF min'>
                        <Form.ControlLinked valueLink={conf.linkAt( 'toff' )}/>
                    </Row>
                    <Row label='Read each'>
                        <Form.ControlLinked valueLink={conf.linkAt( 'read' )}/>
                    </Row>
                    <Row label='Log each'>
                        <Form.ControlLinked valueLink={conf.linkAt( 'log' )}/>
                    </Row>
                    <Row label='Flush log each'>
                        <Form.ControlLinked valueLink={conf.linkAt( 'flush' )}/>
                    </Row>
                </Col>
            </Row>
        </Container>;
    }
}

ReactDOM.render( React.createElement( Application, {} ), document.getElementById( 'app-mount-root' ) );