import * as dayjs from "dayjs";
import React      from "react-mvx";
import cx         from "classnames"

const getServerIp = () => localStorage.getItem( "ip" ) || "192.168.0.0"

let server_ip = getServerIp();

const server_url = ( path, params ) => {
    const esc = encodeURIComponent;
    return "http://" + server_ip + path + (
        params
        ? "?" + Object.keys( params )
               .map( k => esc( k ) + "=" + esc( params[ k ] ) )
               .join( "&" )
        : ""
    );
};

const realFetch = url => fetch( url ).then( res => {
    return res.text()
} );
/*const mockFetch = url => {
  const _url = decodeURI(url);
  const urlMap = {
    '20_11_10': require('../txt0321/20-11-10.txt'),
    '20_11_20': require('../txt0321/20-11-20.txt'),
    '20_11_30': require('../txt0321/20-11-30.txt'),
    '20_12_0': require('../txt0321/20-12-0.txt'),
    '20_12_10': require('../txt0321/20-12-10.txt'),
    '20_12_20': require('../txt0321/20-12-20.txt'),
    '20_12_30': require('../txt0321/20-12-30.txt'),
    '21_1_0': require('../txt0321/21-1-0.txt'),
    '21_1_10': require('../txt0321/21-1-10.txt'),
    '21_1_20': require('../txt0321/21-1-20.txt'),
    '21_1_30': require('../txt0321/21-1-30.txt'),
    '21_2_0': require('../txt0321/21-2-0.txt'),
    '21_2_10': require('../txt0321/21-2-10.txt'),
    '21_2_20': require('../txt0321/21-2-20.txt'),
    '21_2_30': require('../txt0321/21-2-30.txt'),
    '21_3_0': require('../txt0321/21-3-0.txt'),
    '21_3_10': require('../txt0321/21-3-10.txt'),
    '/conf': require('../txt0321/conf.txt'),
    '/info?cur=1': require('../txt0321/info.txt'),
  };
  const key = _url.replace(/^http:\/\/[^\/]+(\/data\?f=%2Fd%2F)?/, '');
  const result = urlMap[key];

  return result ? Promise.resolve(result.default) : Promise.reject('Mock not found for ' + url);
}*/

const myHumanizer = dur => dayjs.duration( dur )
    .format( " Y\u00A0[г] M\u00A0[мес] D\u00A0[дн] H\u00A0[ч] m\u00A0[мин]" )
    .replace( /\s0\s[^\d\s]+/g, "" );

const onServerIpChange = ip => {
    localStorage.setItem( "ip", server_ip = ip );
};

const ESPfetch = ( path, params = {}, fixData ) => {
    const url = server_url( path, params );

    return realFetch( url )
        .then( text => {
            let json;
            let cleanSet;

            try {
                if( fixData ) {
                    const regexp = /(\[\d+(,-?\d+){0,}(,"\w+")?\])/g;
                    const result = regexp[ Symbol.matchAll ]( text );
                    const array  = Array.from( result, x => x[ 0 ] );

                    cleanSet = "[" + array.join( "," ) + "]";
                } else {
                    cleanSet = text.replace( /,\s{0,}([,\]])/, "$1" );
                }

                json = JSON.parse( cleanSet );
            }
            catch( e ) {
                console.log( "JSON parse failed, no matter of try to fix" );
                json = [];
            }

            return json;
        } )
}
//  .catch(e => console.error(e.message || e));

const downloadFile = ( buffer, type, fileName ) => {
    const a    = document.createElement( "a" );
    const blob = new Blob( [ buffer ], { type } );

    return new Promise(
        function( resolve ) {
            if( window.navigator.msSaveOrOpenBlob ) {     // IE11
                window.navigator.msSaveOrOpenBlob( blob, fileName );
            } else {
                var url = window.URL.createObjectURL( blob );
                document.body.appendChild( a );
                a.style.display = "none";
                a.href          = url;
                a.download      = fileName;
                a.click();
                window.URL.revokeObjectURL( url );
                setTimeout( function() { //Just to make sure no special effects occurs
                    document.body.removeChild( a );
                }, 2000 );
            }
            resolve();
        } );
}

const transformPackedToStamp = packedDate => {
    let res = dayjs.utc( packedDate + "", "YYMMDDHHmm", true );
    if( !res.isValid() ) {
        return Date.now() / 1000;
    }
    res = res.toDate();
    res = res.getTime() / 1000;

    return res;
}

const transformStampToPacked = stamp => {
    return dayjs.utc( stamp * 1000 ).format( "YYMMDDHHmm" );
}

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

export {
    onServerIpChange, getServerIp, ESPfetch,
    myHumanizer, downloadFile,
    transformPackedToStamp, transformStampToPacked,
    Loader
}
