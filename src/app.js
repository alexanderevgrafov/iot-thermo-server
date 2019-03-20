import 'type-r/globals'
import React, { define } from 'react-mvx'
import * as ReactDOM from 'react-dom'

@define
class Application extends React.Component {
    static state = {
        counter : 0
    };

    render() {
        return (
            <div>
                {this.state.counter}
                <button onClick={() => this.state.counter++}>Increase</button>
            </div>
        );
    }
}

ReactDOM.render( React.createElement( Application, {} ), document.getElementById( 'app-mount-root' ) );