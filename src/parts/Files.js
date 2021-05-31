import React              from "react-mvx";
import { Button }         from "../Bootstrap";
import { define, Record } from "type-r";
import { ESPfetch }        from "./Utils";

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
        comparator : "n"
    }
}

export const FilesList = ( { files } ) => <div className='files-list-box'>{
    files.map( file => {
            const sizeKb = Math.round( file.s * 10 / 1024 ) / 10 + "Kb";

            return <div className='files-list-item' key={ file } title={ file.n + ", " + sizeKb } onDoubleClick={ () => file.del() }>
                {/*<span className='name'>{ file.n }</span>*/}
                {/*<span className='size'>{ sizeKb }</span>*/}
                {/*<Button onClick={ () => file.del() } variant='light' size='sm'>Delete</Button>*/}
            </div>
        }
    ) }</div>

