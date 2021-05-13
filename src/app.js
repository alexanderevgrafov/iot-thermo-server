import React, {Link} from 'react-mvx'
import * as ReactDOM from 'react-dom'
import {Record, define, type} from 'type-r'
import * as dayjs from 'dayjs'
import * as ExcelJS from 'exceljs'
import * as duration from 'dayjs/plugin/duration'
import * as utc from 'dayjs/plugin/utc'
import * as customParseFormat from 'dayjs/plugin/customParseFormat'
import DonutChart from './DonutChart'
import {Container, Row, Col, Form, Button, Tabs, Tab} from './Bootstrap'
import * as ReactHighcharts from 'react-highcharts'
import './app.scss'

dayjs.extend(customParseFormat);
dayjs.extend(utc);
dayjs.extend(duration);

let server_ip = localStorage.getItem('ip') || '192.168.0.0';

const myHumanizer = dur => dayjs.duration(dur)
  .format(' Y\u00A0[г] M\u00A0[мес] D\u00A0[дн] H\u00A0[ч] m\u00A0[мин]')
  .replace(/\s0\s[^\d\s]+/g, '');

const onServerIPchange = ip => {
  localStorage.setItem('ip', server_ip = ip);
};

const server_url = (path, params) => {
  const esc = encodeURIComponent;
  return 'http://' + server_ip + path + (
    params
      ? '?' + Object.keys(params)
      .map(k => esc(k) + '=' + esc(params[k]))
      .join('&')
      : ''
  );
};

const Loader = ({label, inline, absolute, className}) =>
  <div className={cx('loader', {loaderInline: inline, loaderAbsolute: absolute}, className)}>
    <div className='loaderBody'>
      <img
        alt='Loader'
        className='loaderImg'
        src='./loader.svg'/>
      <div>{label}</div>
    </div>
  </div>;

const realFetch = url => fetch( url).then(res => {
  return res.text()
});
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

const ESPfetch = (url, fixData) => realFetch(url)
  .then(text => {
    let json;
    let cleanSet;

    try {
      if (fixData) {
        const regexp = /(\[\d+((,-?\d+,?){0,}),"\w+"\])/g;
        const result = regexp[Symbol.matchAll](text);
        const array = Array.from(result, x => x[0]);

        cleanSet = '[' + array.join(',') + ']';
      } else {
        cleanSet = text.replace(/,\s{0,}([,\]])/, '$1');
      }

      json = JSON.parse(cleanSet);
    } catch (e) {
      console.log('JSON parse failed, no matter of try to fix');
      json = [];
    }

    return json;
  })
//  .catch(e => console.error(e.message || e));

const downloadFile = (buffer, type, fileName) => {
  const a = document.createElement('a');
  const blob = new Blob([buffer], {type});

  return new Promise(
    function (resolve) {
      if (window.navigator.msSaveOrOpenBlob) {     // IE11
        window.navigator.msSaveOrOpenBlob(blob, fileName);
      } else {
        var url = window.URL.createObjectURL(blob);
        document.body.appendChild(a);
        a.style.display = 'none';
        a.href = url;
        a.download = fileName;
        a.click();
        window.URL.revokeObjectURL(url);
        setTimeout(function () { //Just to make sure no special effects occurs
          document.body.removeChild(a);
        }, 2000);
      }
      resolve();
    });
}

const transformPackedToStamp = packedDate => {
  let res = dayjs(packedDate + '', "YYMMDDHHmm", true);
  res = res.toDate();
  res = res.getTime() / 1000;

  return res;
}

const transformStampToPacked = stamp => {
  let res = dayjs(stamp).format("YYMMDDHHmm");

  return res;
}

@define
class ConfigModel extends Record {
  static attributes = {
    tl: 2,
    th: 5,
    ton: 10,
    toff: 10,
    read: 180,
    log: 1800,
    flush: 7200
  };

  save() {
    const params = {set: JSON.stringify(this.toJSON())};

    return ESPfetch(server_url('/conf', params))
  }
}

@define
class CurInfoModel extends Record {
  static attributes = {
    last: Date,
    rel: type(Boolean).value(null),
    up: 0,
    s: [],
    avg: 0
  };

  load(options) {
    const params = {cur: 1};
    if (options.force) {
      params.f = 1;
    }
    return ESPfetch(server_url('/info', params))
      .then(json =>{
        json.last = transformPackedToStamp(json.last);
        this.set(json);
      })
  }
}

@define
class FileSystem extends Record {
  static attributes = {
    tot: 0,
    used: 0,
    block: 0,
    page: 0
  };
}

@define
class SensorModel extends Record {
  static attributes = {
    addr: type(Array).has.watcher('onAddrChange'),
    weight: 10,
    name: type(String).has.watcher('onNameChange'),
  };

  onNameChange() {
    localStorage.setItem('/sens/' + this.addr.join(''), this.name);
  }

  loadName() {
    this.name = localStorage.getItem('/sens/' + this.addr.join('')) || (this.addr[0] + '~' + this.addr[1]);
  }

  toLine() {
    return this.addr.join(',') + ',' + this.weight;
  }

  static collection = {
    loadNames() {
      this.each(x => x.loadName());
    }
  }
}

@define
class SensorCollection extends SensorModel.Collection {
  save() {
    const params = {sn: this.map(x => x.toLine()).join(',')};

    return ESPfetch(server_url('/conf', params))
  }
}

@define
class FileModel extends Record {
  static attributes = {
    n: '',
    s: 0,
  };

  del() {
    return ESPfetch(server_url('/data', {d: this.n}))
      .then(json => {
        if (json.d) {
          this.collection.remove(this);
        } else {
          alert('Nothing happened')
        }
      })
  }

  load() {
    return ESPfetch(server_url('/data', {f: this.n}), true)
  }

  static collection = {
    comparator: 'n'
  }
}

@define
class FileLogRawLine extends Record {
  static idAttribute = 'stamp';

  static attributes = {
    stamp: 0,
    arr: [],
    event:'',
  };

  parse(data) {
    const packedDate = data.shift();
    let event = data.pop();

    if (_.isNumber(event)) {
      data.push( event );
      event = 't';
    }

    return {
      stamp: transformPackedToStamp(packedDate),
      arr: data,
      event
    };
  }

  toJSON() {
    return [transformStampToPacked(this.stamp), ...this.arr, this.event];
  }

  static collection = {
    comparator: 'stamp'
  }
}

@define
class LineDataModel extends Record {
  static idAttribute = 'stamp';

  static attributes = {
    stamp: 0,
    temp: 0
  };

  toJSON() {
    return [this.stamp * 1000, this.temp / 10];
  }

  static collection = {
    comparator: 'stamp'
  }
}

@define
class PlotLineModel extends Record {
  static idAttribute = 'value';

  static attributes = {
    type: '',
    value: 0
  };
}

@define
class LineModel extends Record {
  static attributes = {
    data: LineDataModel.Collection
  };
}

@define
class StatModel extends Record {
  static attributes = {
    start: 0,
    end: 0,
    time_on: 0
  };

  get duration() {
    return this.end - this.start;
  }
}

@define
class LsStateModel extends Record {
  static attributes = {
    yearFrom: 0,
    monthFrom: 1,
    yearTo: 0,
    monthTo: 1,
    curYear: 0,
    oldestYear: 0
  };

  constructor() {
    super();

    this.curYear = this.yearFrom = this.yearTo = dayjs().year();
  }
}

@define
class Application extends React.Component {
  static state = {
    conf: ConfigModel,
    cur: CurInfoModel,
    sensors: SensorCollection,
    fs: FileSystem,
    files: FileModel.Collection,
    connection: false,
    series: LineModel.Collection,
    plot_lines: PlotLineModel.Collection,
    show_relays: false,
    show_boots: false,
    chartSelectedPeriod: 24 * 60 * 60 * 1000,
    chartSelectionRightSide: 0,
    localData: FileLogRawLine.Collection,
    chart_options: {
      title: {text: 'Temperature'},
      chart: {
        zoomType: 'x',
        panKey: 'alt',
        panning: true,
      },
      xAxis: {
        type: 'datetime',
      },
      series: [],
    },
    stat: StatModel,
    lsState: LsStateModel,
    loading: true
  };

  timer = null;
  chart = null;

  componentWillMount() {
    this.loadPreferences();
    this.state.chart_options.xAxis.events = {
      setExtremes: p => this.onSetExtremes(p),
    }
    this.state.chart_options.chart.events = {
      selection: e => this.onChartSelection(e)
    }
  }

  componentDidMount() {
    this.getFullState();
  }

  savePreferences() {
    localStorage.setItem('prefs',
      JSON.stringify(_.pick(this.state, 'show_relays', 'show_boots', 'chartSelectedPeriod')));
  }

  loadPreferences() {
    const loaded = localStorage.getItem('prefs');

    try {
      this.state.set(JSON.parse(loaded || '{}'));
    } catch (e) {
      console.error('Prefs parse error', e);
    }
  }

  onSetExtremes(params) {
    if (params.min && params.max) {
      this.calcStats(params.min, params.max)
    } else {
      this.calcStats(this.state.series.at(0).data.at(0).stamp * 1000,
        this.chart.series[0].data[this.chart.series[0].data.length - 1].x);
    }
  }

  calcStats(start, finish) {
    const {plot_lines, stat} = this.state;
    let turned = null;
    let sum = 0;

    for (let i = 0; i < plot_lines.length; i++) {
      const p = plot_lines.at(i);

      if (p.value > finish) {
        if (turned) {
          sum += finish - Math.max(turned, start);
        }
        break;
      }

      if (p.type === 'on') {
        turned = p.value;
      } else {
        if (turned && p.value > start) {
          sum += p.value - Math.max(turned, start);
        }
        turned = null;
      }
      /*  if (p.value > start) {
          switch (p.type) {
          case 'on':
            turned = p.value;
            break;
          case 'off':
          case 'st':
            if (turned) {
              sum += p.value - turned;
              turned = null;
            }
            break;
          }
        }*/
    }

    stat.start = start;
    stat.end = finish;
    stat.time_on = sum;
  }

  parseState(json) {
    const sensors =
      json.sn.split(',').map(s => {
        const addr = s.split(' '),
          weight = addr.pop();
        return {addr, weight}
      });

    this.state.set({
      conf: json.conf,
      fs: json.fs,
      sensors,
      files: json.dt
    });

    this.state.sensors.loadNames();

    this.timer && this.setTimer();
  }

  getFullState() {
    return ESPfetch(server_url('/conf'))
      .then(json => this.parseState(json))
      .then(() => {
        this.state.loading = false;
        this.loadAllData();
      })
      .catch(err => {
        console.error('getFullState error: ', err);
        this.state.loading = false;
      })
  }

  getCurInfo(force) {
    const {cur: cur0} = this.state,
      {rel} = cur0;

    cur0.load({force})
      .then(() => {
        const {cur} = this.state;

        this.state.connection = true;
        this.addPoints();
        if (cur.rel !== rel && rel !== null) {
          this.addPlotLine({value: cur.last * 1000, width: 1, color: cur.rel ? 'red' : 'blue'})
        }
      })
      .catch(err => {
        console.error(err);
        this.state.connection = false;
      })
  }

  stopTimer = () => {
    clearInterval(this.timer);
  };

  setTimer = () => {
    const {conf} = this.state,
      handler = () => this.getCurInfo();

    this.stopTimer();

    this.timer = setInterval(handler, conf.read * 1000);
    handler();
  };

  loadAllData = () => {
    this.loadLsData();

    const lastLocalDataRecord = this.state.localData.last();
    const lastMoment = lastLocalDataRecord ? dayjs(lastLocalDataRecord.stamp * 1000) : 0;
    const lastFileDataToLoad = lastMoment ? ('/d/' + lastMoment.format('YY_M_') + Math.floor(lastMoment.get('date') / 10) * 10) : null;

    this.loadFileData(null, lastFileDataToLoad);
  };

  loadLsData = () => {
    let data = localStorage.getItem('data');

    if (data) {
      try {
        data = JSON.parse(data);

        this.state.localData.reset(data, {parse: true});

        const first = this.state.localData.first();
        this.state.lsState.oldestYear = (first ? dayjs(first.stamp * 1000) : dayjs()).year();
      } catch (e) {
        this.logStatus('Loading from LS error. LS data considered as empty.');
        this.state.localData.reset();
      }
    }
  };

  logStatus(msg) {
    alert(msg);
  }

  loadFileData = (file = null, lastFileDataToLoad) => {
    const chunk = file || this.state.files.last();

    if (chunk) {
      chunk.load().then(data => {
        this.state.localData.add(data, {parse: true})

        const index = this.state.files.indexOf(chunk);

        if (index > 0 && (!lastFileDataToLoad || chunk.n > lastFileDataToLoad)) {
          _.defer(() => this.loadFileData(this.state.files.at(index - 1), lastFileDataToLoad))
        } else {
          this.chartFillWithData();
        }
      });
    } else {
      this.chartFillWithData();
    }
  };

  resetPlotLines() {
    const lines = [];
    const bands = [];
    let band = null;

    this.state.plot_lines.each(line => {
      const {type, value} = line,
        obj = {value: value, width: 1, color: 'red', label: {text: type}};

      switch (type) {
      case 'st':
        if (!this.state.show_boots) {
          return null;
        }
        obj.label.text = '';
        obj.color = 'rgba(0,0,0,.15)';
        obj.width = 7;
        lines.push(obj);
        break;
      case 'off':
        obj.color = 'blue';
      case 'on':
        if (!this.state.show_relays) {
          return null;
        }
        lines.push(obj);
        break;
      }

      return obj;
    });

    this.chart.xAxis[0].update({plotLines: _.compact(lines), plotBands: _.compact(bands)})
  }

  addPlotLine(line) {
    this.chart.xAxis[0].addPlotLine(line);
  }

  addPoints() {
    const {sensors, cur} = this.state,
      sns_count = sensors.length,
      lst = cur.last * 1000,
      now = Date.now() - (new Date).getTimezoneOffset() * 60 * 1000;
    let added = 0;

    for (let i = 0; i < sns_count; i++) {
      const ser = this.chart.series[i];

      if (!ser || !ser.data.length) {
        this.fillChartSeriaWithData(i);
      }
      this.chart.series[i].addPoint([lst, cur.s[i] / 10], false);
      added++;
    }

    added && this.chart.redraw();

    added && this.state.chartSelectedPeriod && this.onSetZoom(now);
  }

  getLatestChartTime() {
    return this.chart.series[0].data.length ? (this.chart.series[0].data[this.chart.series[0].data.length - 1]).x : Date.now();
  }

  setZoom(time) {
    const latest = this.getLatestChartTime();

    this.state.set({
      chartSelectedPeriod: time || latest - this.chart.series[0].data[0].x,
      chartSelectionRightSide: latest
    });
  }

  onSetZoom(_last = null) {
    if (_last) {
      this.state.chartSelectionRightSide = _last;
    }

    this.setChartExtremes();
  }

  onChartZoomOut() {
    const width = this.state.chartSelectedPeriod;
    const latest = this.getLatestChartTime();
    const right = this.state.chartSelectionRightSide || latest;
    const newWidth = width * 2;
    const newRight = Math.min(right + (newWidth - width) / 2, latest);

    this.state.set({
      chartSelectedPeriod: newWidth,
      chartSelectionRightSide: newRight
    })

    this.setChartExtremes();
  }

  setChartExtremes() {
    const right = this.state.chartSelectionRightSide || this.getLatestChartTime();
    const width = this.state.chartSelectedPeriod || 24 * 60 * 60 * 1000

    this.chart.xAxis[0].setExtremes(right - width, right);
  }

  onChartSelection(event) {
    this.state.set({
      chartSelectedPeriod: event.xAxis[0].max - event.xAxis[0].min,
      chartSelectionRightSide: event.xAxis[0].max
    })
  }

  chartFillWithData() {
    const {sensors, localData, plot_lines} = this.state;
    const sns_count = sensors.length;
    const series = [];

    for (let i = 0; i < sns_count; i++) { // cache the series refs
      series[i] = this.state.series.at(i) || this.state.series.add({})[0];
      series[i].data.reset();
    }
    plot_lines.reset();

    localData.each(line => {
      const {stamp, arr, event} = line;

      if (arr && arr.length) {
        for (let i = 0; i < sns_count; i++) {
          if (arr[i] > -1000) {
            series[i].data.add({stamp, temp: arr[i]}, {silent: true});
          }
        }
      } else {
        plot_lines.add({value: stamp * 1000, type: event}, {silent: true});
      }
    });

    for (let i = 0; i < sns_count; i++) {
      this.fillChartSeriaWithData(i);
    }

    this.resetPlotLines();
    this.onChartIsReady();

    this.chart.chartWidth = this.refs.chartbox.offsetWidth;
    this.chart.redraw();

    localStorage.setItem('data', JSON.stringify(localData.toJSON()));
  }

  fillChartSeriaWithData(seriaIndex) {
    const seria = this.state.series.at(seriaIndex);

    if (!this.chart.series[seriaIndex]) {
      this.chart.addSeries({type: 'spline', name: this.state.sensors.at(seriaIndex).name});
    }

    this.chart.series[seriaIndex].setData(seria.data.toJSON(), false);
  }

  afterRender = chart => {
    this.chart = chart;
  };

  onChartIsReady() {
    this.setTimer();

    this.listenTo(this.state, 'change:show_boots change:show_relays', () => {
      this.savePreferences();
      this.resetPlotLines();
    });
    this.listenTo(this.state, 'change:chartSelectedPeriod', () => {
      this.savePreferences();
      this.onSetZoom();
    });

    this.onSetZoom();
  }

  cleanLs() {
    const {localData, lsState: {monthFrom, yearFrom, monthTo, yearTo}} = this.state;
    const from = dayjs.utc(`${yearFrom}-${monthFrom}-01`).unix();
    const to = dayjs.utc(`${yearTo}-${monthTo}-01`).add(1, 'month').unix();
    const filtered = localData.filter(row => row.stamp < from || row.stamp > to);

    if (confirm(`Are you sure to remove ${localData.length - filtered.length} records from ${monthFrom}/${yearFrom} to the end of ${monthTo}/${yearTo}`)) {

      localData.reset(filtered);

      this.chartFillWithData()
    }
  }

  exportFromLs() {
    const {localData, sensors, lsState: {monthFrom, yearFrom, monthTo, yearTo}} = this.state;
    const from = dayjs.utc(`${yearFrom}-${monthFrom}-01`).unix();
    const to = dayjs.utc(`${yearTo}-${monthTo}-01`).add(1, 'month').unix();
    const periodText = dayjs(from * 1000).format('DD_MM_YYYY') + '-' + dayjs(to * 1000).format('DD_MM_YYYY');
    const exportData = localData.filter(row => row.stamp >= from && row.stamp < to);
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(periodText, {
      headerFooter: {firstHeader: periodText}
    });
    const columns = [{header: 'Time', key: 'time'}];

    sensors.each((sensor, i) => columns.push({header: sensor.name, key: 's' + i}))
    columns.push({header: 'Event', key: 'event'})
    sheet.columns = columns;

    _.each(exportData, row => {
      const {arr, stamp} = row;
      const rowData = {
        time: dayjs.utc(stamp * 1000).toDate()
      }

      if (typeof arr[0] === 'number') {
        sensors.each((sensor, i) => rowData['s' + i] = arr[i] / 10)
      } else {
        rowData.event = arr[0];
      }

      sheet.addRow(rowData)
    });

    workbook.xlsx.writeBuffer().then(buffer =>
      downloadFile(buffer, 'application/octet-stream', 'temp_data_' + periodText.replace(/[^\w\-]+/g, '') + '.xlsx')
    ).catch(e => {
      console.log(e);
    })
  }

  render() {
    const {
      loading, conf, cur, sensors, fs, files, connection, chart_options,
      chartSelectedPeriod, show_relays, show_boots, stat, lsState
    } = this.state;
    const percentOn = stat.duration ? Math.round(stat.time_on * 1000 / stat.duration) / 10 : 0;

    return <Container>
      {
        loading ? <Loader/> : void 0
      }
      <div className='top-right'>
        <div className='chart_options'>
                    <span onClick={() => this.state.show_boots = !show_boots}
                          className={cx('z_option red', {option_sel: show_boots})}>перезагрузки</span>
          <span onClick={() => this.state.show_relays = !show_relays}
                className={cx('z_option red', {option_sel: show_relays})}>включения</span>
          {_.map(
            [[30, '30m'],
              [60 * 2, '2h'],
              [60 * 6, '6h'],
              [60 * 24, '24h'],
              [60 * 24 * 7, '7d'],
              [60 * 24 * 30, '30d'],
              [60 * 24 * 30 * 3, '90d'],
              [0, 'All']],
            ([min, name]) =>
              <span onClick={() => this.setZoom(min * 60 * 1000)}
                    className={cx('z_option', {option_sel: chartSelectedPeriod === min * 60 * 1000})}
                    key={min}
              >{name}</span>)
          }
        </div>
        <div className='up_time'>{
          connection ? 'Аптайм ' + myHumanizer(cur.up * 1000) : 'Нет связи с платой'
        }</div>
        <Button onClick={() => this.getCurInfo(true)}
                variant='outline-primary'>Load now</Button>
      </div>
      <Tabs defaultActiveKey='chart'
            onSelect={key => {
              key === 'chart' && setTimeout(() => {
                this.chart.setSize(null, null, false)
              }, 1000)
            }}
      >
        <Tab eventKey='chart' title='Данные'>
          <Row>
            <div id="chart-container" ref='chartbox'>
              <ReactHighcharts
                config={chart_options}
                callback={this.afterRender}
                isPureConfig={true}
                height={600}
              />
              <Button onClick={() => this.onChartZoomOut()} label="Zoom out" size="sm" valiean="outline-info"
                      id="zoom-out-button"/>
            </div>
          </Row>
          <Row>
            <Col lg='3'>{
              connection ? <><h3>{cur.avg}&deg;C</h3>
                <h4 className={cx('relay', {on: cur.rel})}>Обогрев {cur.rel ? 'включен' :
                  'выключен'}</h4>
                {cur.s.map((t, i) => {
                  const s = sensors.at(i);
                  return <li key={i}>{(s && s.name) + ' ' + (t / 10)}&deg;</li>
                })}</> : null
            }
            </Col>
            <Col lg='6'/>
            <Col lg='3'>{
              stat.duration ? <>
                <div className='square-form'>
                  <DonutChart sectors={[{value: percentOn, color: 'red'},
                    {value: 100 - percentOn, color: 'silver'}]}
                  />
                  <div className='percent-text'>
                    {stat.duration ? percentOn : '--'}%
                  </div>
                </div>
                В течение этих {myHumanizer(stat.duration)}
                {stat.time_on > 0 ? <span> обогревало {myHumanizer(stat.time_on)}
              </span> : ' не включалось'}
              </> : null
            }
            </Col>
          </Row>
        </Tab>
        <Tab eventKey='config' title='Конфигурация'>
          <Row>
            <Col>
              <Form.Row label='ESP IP'>
                <Form.ControlLinked valueLink={Link.value(server_ip, x => {
                  onServerIPchange(x);
                  this.asyncUpdate()
                })}/>
              </Form.Row>
              <Form.Row>
                <Button onClick={() => this.getFullState()} variant='outline-info'>Get From ESP</Button>
              </Form.Row>
              <Form.Row label='T low'>
                <Form.ControlLinked valueLink={conf.linkAt('tl')}/>
              </Form.Row>
              <Form.Row label='T high'>
                <Form.ControlLinked valueLink={conf.linkAt('th')}/>
              </Form.Row>
              <Form.Row label='ON min'>
                <Form.ControlLinked valueLink={conf.linkAt('ton')}/>
              </Form.Row>
              <Form.Row label='OFF min'>
                <Form.ControlLinked valueLink={conf.linkAt('toff')}/>
              </Form.Row>
              <Form.Row label='Read each'>
                <Form.ControlLinked valueLink={conf.linkAt('read')}/>
              </Form.Row>
              <Form.Row label='Log each'>
                <Form.ControlLinked valueLink={conf.linkAt('log')}/>
              </Form.Row>
              <Form.Row label='Flush log each'>
                <Form.ControlLinked valueLink={conf.linkAt('flush')}/>
              </Form.Row>
              <Form.Row>
                <Button onClick={() => conf.save()
                  .then(json => this.parseState(json))} variant='outline-info'>Update config</Button>
              </Form.Row>
            </Col>
            <Col>
              {
                sensors.map(sns =>
                  <Form.Row key={sns}>
                    {sns.addr[0] + '-' + sns.addr[1]}
                    <Form.ControlLinked valueLink={sns.linkAt('name')}/>
                    <Form.ControlLinked valueLink={sns.linkAt('weight')}/>
                  </Form.Row>
                )
              }
              <Form.Row>
                <Button onClick={() => sensors.save()
                  .then(json => this.parseState(json))} variant='outline-info'>Set balance</Button>
              </Form.Row>
            </Col>
            <Col>
              <h4>ESP disk state</h4>
              {files.length ?
                <h4>Used {Math.round(fs.used * 1000 / fs.tot) / 10}%</h4>
                : void 0}
              {
                files.map(file => <div key={file}>
                    {file.n + ' ' + Math.round(file.s * 10 / 1024) / 10 + 'Kb'}
                    <Button onClick={() => file.del()} variant='light' size='sm'>Delete</Button>
                  </div>
                )
              }
            </Col>
            <Col>
              <h4>LS operations</h4>
              <Form.Row label="Year from">
                <Form.ControlLinked as="select"
                                    valueLink={lsState.linkAt('yearFrom')}
                                    placeholder="Y">
                  {_.map(
                    _.range(lsState.oldestYear, lsState.curYear + 1),
                    year => <option value={year} key={year}>{year}</option>
                  )}
                </Form.ControlLinked>
              </Form.Row>
              <Form.Row label="Month from">
                <Form.ControlLinked as="select" valueLink={lsState.linkAt('monthFrom')}>
                  {_.map(_.range(1, 13), month => <option value={month} key={month}>{month}</option>)}
                </Form.ControlLinked>
              </Form.Row>
              <Form.Row label="Year to">
                <Form.ControlLinked as="select" valueLink={lsState.linkAt('yearTo')}>
                  {_.map(
                    _.range(lsState.oldestYear, lsState.curYear + 1),
                    year => <option value={year} key={year}>{year}</option>
                  )}
                </Form.ControlLinked>
              </Form.Row>
              <Form.Row label="Month to">
                <Form.ControlLinked as="select" valueLink={lsState.linkAt('monthTo')} placeholder="M">
                  {_.map(_.range(1, 13), month => <option value={month} key={month}>{month}</option>)}
                </Form.ControlLinked>
              </Form.Row>

              <Form.Row>
                <Button label="Clean" variant='outline-info' onClick={() => this.cleanLs()}/>
              </Form.Row>
              <Form.Row>
                <Button label="Export" variant='outline-info' onClick={() => this.exportFromLs()}/>
              </Form.Row>
            </Col>
          </Row>
        </Tab>
      </Tabs>
    </Container>;
  }
}

ReactDOM.render(React.createElement(Application, {}), document.getElementById('app-mount-root'));
