const steps        = [
    [ "ms", 1000 ],
    [ "s", 60 ],
    [ "m", 60 ],
    [ "h", 24 ],
    [ "d", 7 ],
    [ "w", 1 ],
];
const regExpString = "^\s{0,}([\\d\\.]+)([" + (steps.map( x => x[ 0 ] ).join( "|" )) + "])\s{0,}$";

console.log( regExpString );

const regExp = new RegExp( regExpString, "" );

function ms( val ) {
    let parsed = parseInt( val );
    let res;

    if( parsed == val ) { // Number provided
        let i   = 0;
        let res = parsed;

        do {
            const divided = res / steps[ i ][ 1 ];
            if( (divided === Math.round( divided )) ) {
                i++;
                res = divided;
            } else {
                break;
            }
        } while( i < steps.length - 1 );

        return res + steps[ i ][ 0 ];
    } else if( res = regExp.exec( val ) ) {
        let ms = res[ 1 ];
        let i  = 0;

        while( res[ 2 ] !== steps[ i ][ 0 ] ) {
            //   console.log('*', i, res[1], res[2], ms)
            ms *= steps[ i ][ 1 ];
            i++;
        }

        return ms;//* steps[i][1];
    } else {
        console.error( "Unable to parse " + val );
        return NaN;
    }

}

module.exports = ms;
