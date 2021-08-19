import React, { Link }          from "react-mvx"
import { Record, type, define } from "type-r";
import * as ms                  from "./my-ms"
import { Form }                 from "../Bootstrap";

@define
class TimeInputState extends Record {
    static attributes = {
        value : ""
    }

    validate( obj ) {
        if( obj.value === "" || isNaN( ms( obj.value ) ) ) {
            return "Invalid value";
        }

        return super.validate( obj );
    }
}

@define
export class TimeInput extends React.Component {
    static props = {
        valueLink : type( Link ).watcher( "onLinkChange" )
    };
    static state = TimeInputState;

    componentDidMount( ) {
        const initial    = this.props.valueLink.value;
        this.state.value = _.isNumber( initial ) ? ms( initial * 1000 ) : initial;
    }

    onLinkChange( link ) {
        if( _.isNumber( link.value ) && !isNaN( link.value ) ) {
            this.state.set(  { value : ms( link.value * 1000 ) }, { silent : true } );
        }
    }

    onValueChange = _.debounce( () => this.sendValueUp(), 1500 )

    sendValueUp( includeZero = false ) {
        const val = this.state.value === "" ? 0 : Math.round( ms( this.state.value ) / 1000 );

        if( includeZero || !!val ) {
            this.props.valueLink.set( val );
        }
    }

    render() {
        const { state } = this;
        const isValid   = state.isValid();

        return <Form.ControlLinked
            valueLink={ state.linkAt( "value" ) }
            onChange={ this.onValueChange }
            onBlur={ () => this.sendValueUp( true ) }
            isInvalid={ !isValid }
        />;
    }
}

