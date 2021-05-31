import React           from "react-mvx"
import { define }      from "type-r";
import cx              from "classnames";
import { myHumanizer } from "./Utils";

const MAX_ARC = Math.PI * 2 / 3;  // supposed to be less than PI, always!

@define
class DonutChart extends React.Component {
    static props = {
        sectors       : Array,  // supposed format is [{ value:Number [, color:String] },...]
        width         : "100%",
        height        : "auto",
        boxSize       : 100,
        outerDiameter : 80,
        innerDiameter : 64,
        startAngle    : 270
    };

    render() {
        const {
                  sectors, boxSize, outerDiameter, innerDiameter, startAngle
              }   = this.props;
        let ang   = startAngle * 2 * Math.PI / 360,
            total = 0;

        _.each( sectors, s => total += s.value );

        if( !total ) {
            return null;
        }

        const groups = [],
              lines  = [],
              r1     = innerDiameter / 2,
              r2     = outerDiameter / 2;

        _.each( sectors, ( sector, i ) => {
            let delta  = 2 * Math.PI * sector.value / total,
                deltas = [],
                fills  = [];

            if( !sector.value ) {
                return;
            }

            while( delta > MAX_ARC + MAX_ARC / 10 ) {
                deltas.push( MAX_ARC );
                delta -= MAX_ARC;
            }
            deltas.push( delta );

            _.each( deltas, ( d, j ) => {
                const ang1      = ang - (j ? 0.025 : 0),
                      ang2      = ang + d,
                      finalLine = !j && sector.value / total < 1;

                const x1i = Math.cos( ang1 ) * r1,
                      y1i = Math.sin( ang1 ) * r1,
                      x2i = Math.cos( ang2 ) * r1,
                      y2i = Math.sin( ang2 ) * r1,
                      x2o = Math.cos( ang2 ) * r2,
                      y2o = Math.sin( ang2 ) * r2,
                      x1o = Math.cos( ang1 ) * r2,
                      y1o = Math.sin( ang1 ) * r2;

                fills.push( <path key={ j }
                                  className={ cx( "color", { line : deltas.length === 1 }, sector.className ) }
                                  style={ sector.color ? { fill : sector.color } : null }

                                  d={ "M" + x1i + "," + y1i +
                                      "A" + r1 + "," + r1 + " 0 0 1" + " " + x2i + "," + y2i +
                                      "L" + x2o + "," + y2o +
                                      "A" + r2 + "," + r2 + " 0 0 0" + " " + x1o + "," + y1o +
                                      "L" + x1i + "," + y1i + "z"
                                  }/> );
                if( deltas.length > 1 ) {
                    lines.push( <path key={ lines.length * 2 }
                                      d={ "M" + x1i + "," + y1i +
                                          "A" + r1 + "," + r1 + " 0 0 1" + " " + x2i + "," + y2i
                                      }/> );
                    lines.push( <path key={ lines.length * 2 + 1 }
                                      d={ "M" + x2o + "," + y2o +
                                          "A" + r2 + "," + r2 + " 0 0 0" + " " + x1o + "," + y1o +
                                          (finalLine ? ("L" + x1i + "," + y1i) : "")
                                      }/> );
                }
                ang = ang2;
            } );

            groups.push( <g className='sector'
                            onMouseEnter={ sector.onMouseEnter }
                            onMouseLeave={ sector.onMouseLeave }
                            key={ i }>{ fills }</g> );
        } );

        return <svg xmlns='http://www.w3.org/2000/svg'
                    version='1.1'
                    width={ this.props.width }
                    height={ this.props.height }
                    viewBox={ "0 0 " + boxSize + " " + boxSize }
                    preserveAspectRatio='xMidYMin meet'
                    className='donut-chart'
        >
            <g transform={ "translate(" + boxSize / 2 + "," + boxSize / 2 + ")" } className='d-c-chart'>
                { groups }
                <g className='strokes'>{ lines }</g>
            </g>
        </svg>;
    }
}

export const StatDonut = ( { show, stat } ) => {
    if( !show || !stat.duration ) {
        return null;
    }

    const percentOn    = stat.duration ? Math.round( stat.time_on * 1000 / stat.duration ) / 10 : 0;
    const heatTimeText = stat.duration ? ("В течение этих " + myHumanizer( stat.duration ) + " " +
                                          (percentOn === 0 ? "не включалось" :
                                           ("обогревало " +
                                          (percentOn > 98 ? ((percentOn < 100 ? "почти " : "") + "постоянно")
                                                          : myHumanizer( stat.time_on ))))) : "";
    return <>
        <div className='square-form'>
            <DonutChart sectors={ [ { value : percentOn, color : "red" },
                                    { value : 100 - percentOn, color : "silver" } ] }
            />
            <div className='percent-text'>
                { stat.duration ? percentOn : "--" }%
            </div>
        </div>
        { heatTimeText }
    </>
}
