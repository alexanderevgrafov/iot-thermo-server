import React              from "react-mvx";
import { Button }         from "../Bootstrap";
import { define, Record } from "type-r";
import { ESPfetch }        from "./Utils";

// Get rid of it in future since filenames should be correct date and will sort automatically
const fileNameToDate = name => {
    const p = name.split('_');

    if (p.length < 3) {
        return name;
    } else {
        const t = (parseInt(p[0])*10000 + parseInt(p[1])*100 + parseInt(p[2])*1) + ( p[3] ? ('_' + p[3]) : '');

        return t;
    }
}

@define
export class FileSystem extends Record {
    static attributes = {
        tot   : 0,
        used  : 0,
        block : 0,
        page  : 0
    };
}

@define
export class FileModel extends Record {
    static attributes = {
        n : "",
        s : 0,
    };

    del() {
        return new Promise((resolve, reject) => {
            if (confirm('Are you sure to delete file '+this.n+'?')) {
                ESPfetch(  "/data", { d : this.n } )
                    .then( json => {
                        if( json.d ) {
                            this.collection.remove( this );
                        } else {
                            alert( "Nothing happened" )
                        }
                        resolve();
                    } )
            } else {
                reject();
            }
        })
    }

    load() {
        return ESPfetch(  "/data", { f : this.n }, true )
    }

    static collection = {
        comparator : function(a,b) {
            return fileNameToDate(a.n) > fileNameToDate(b.n) ? 1 : -1;
        }
    }
}

export const FilesList = ( { files } ) => <div className='files-list-box'>{
    files.map( file => {
            const sizeKb = Math.round( file.s * 10 / 1024 ) / 10 + "Kb";

            return <div className='files-list-item' key={ file } title={ file.n + ", " + sizeKb } onDoubleClick={ () => file.del() }>
                <span className='name'>{ file.n }</span>
            </div>
        }
    ) }</div>

