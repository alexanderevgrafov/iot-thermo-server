const _    = require( "underscore" );
const myms = require( "../src/parts/my-ms" );
const ms   = require( "ms" );

const vals = [
    -100,
    // 45000,
    // "1s",
    // "2m",
    "3.5hy",
    "1.9h",
    "25hh",
    "0.3d",
    "360s",
    18814400000
]

_.each( vals, val => {
    try {
        console.log( "-------------" );
        console.log( val );
        console.log( myms( val ) );
        console.log( myms( myms( val ) ) );
        console.log( ms( myms( val ) ) );

    }
    catch( e ) {
        console.log( "ERROR:", e.message || e );
    }
} )
