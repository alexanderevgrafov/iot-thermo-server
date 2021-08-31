import React          from "react-mvx"
import { useState, useEffect }  from "react"
import * as ms                  from "./my-ms"
import { Form }                 from "../Bootstrap";

export const TimeInput = ({valueLink})=>{
    const [value, setValue] = useState("");
    const [isError, setError] = useState(false);

    useEffect(()=>{
        if( _.isNumber( valueLink.value ) && !isNaN( valueLink.value ) ) {
            setValue(  ms( valueLink.value * 1000 ) );
        }
    }, [valueLink])

    function validate( val ) {
        setError( val === "" || isNaN(ms( val )));
        setValue(val);
    }

    const onValueChange = _.debounce( sendValueUp, 1500 )

    function sendValueUp( val, includeZero = false ) {
        if (isError) {
            return;
        }
        const sec = val === "" ? 0 : Math.round( ms( val ) / 1000 );

        if( includeZero || !!sec ) {
//            console.log("Sending up", sec);
            valueLink.set( sec );
        }
    }

    return <Form.Control
        type="text"
        value={ value }
        onChange={ e=>{
            validate(e.target.value);
            onValueChange(e.target.value);
        } }
        onBlur={ e => sendValueUp( e.target.value, true ) }
        isInvalid={ isError }
    />
}
