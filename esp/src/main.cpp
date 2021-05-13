#include <DNSServer.h>
#include <DallasTemperature.h>
#include <ESP8266WebServer.h>
#include <ESP8266WiFi.h>
#include <ESP8266mDNS.h>
#include <OneWire.h>
#include <Ticker.h>
#include <WiFiClient.h>
#include <WiFiManager.h>  //https://github.com/tzapu/WiFiManager
#include <coredecls.h>    // settimeofday_cb()
#include <sys/time.h>
#include <time.h>  // time() ctime()

#include "ArduinoJson.h"
#include "FS.h"
#include "LittleFS.h"  // LittleFS is declared
#include "MyTicker.h"

#define CONFIG_FILE "conf"
#define SENSORS_FILE "sensors"
//#define DATA_FILE "data"
#define DATA_DIR "/d"
#define DATA_DIR_SLASH "/d/"

#define WIFI_CONFIG_DURATION_SEC 15
// #define TZ 3      // (utc+) TZ in hours
// #define DST_MN 0  // use 60mn for summer time in some countries
// #define TZ_MN ((TZ)*60)
#define TZ_SEC 0//((TZ)*3600)
#define DST_SEC 0//((DST_MN)*60)

#define SEC 1
#define MAX_SENSORS_COUNT 8
#define TEMP_BYTE_SIZE 4
#define STAMP_BYTE_SIZE 4

#define TICKERS 3

#define LED_PIN 4       // D2 on board
#define RELAY_PIN 14    // D5 on NodeMCU and WeMos.
#define ONE_WIRE_BUS 5  //D1 on board

int current_log_id = 2;

struct event_record {
  time_t stamp;
  char event;
  int t[MAX_SENSORS_COUNT];
};

struct sensor_config {
  uint8_t addr[8];
  uint8_t weight;
};

struct config {
  int tl;
  int th;
  unsigned int ton;
  unsigned int toff;
  unsigned int read;
  unsigned int log;
  unsigned int flush;
};

const int MIN = SEC * 60;
const int LOOP_DELAY = 4 * SEC;
const int SENSORS_READ_EACH = 5 * MIN;
const int LOG_EACH = 10 * MIN;
const int FLUSH_LOG_EACH = 60 * MIN;
const int DATA_BUFFER_SIZE = 150;  // Maximum events we can keep in memory before Internet is back(===real time is known, and we can write a log)
const int PIN_LED = LED_BUILTIN;   // D4 on NodeMCU and WeMos. Controls the onboard LED.

bool initialConfig = false;

const char *strAllowOrigin = "Access-Control-Allow-Origin";
const char *strAllowMethod = "Access-Control-Allow-Method";
const char *strContentType = "application/json";

event_record data_log[DATA_BUFFER_SIZE];
event_record cur_sensors;

config conf = {3, 10, 10, 10, 180, 1800, 7200};

Ticker led_sin_ticker;
Ticker timers_aligner;

MyTicker tickers[TICKERS];
bool timers_hour_aligned = false;

const size_t capacity = JSON_OBJECT_SIZE(7) * 2 + 50;

DynamicJsonDocument doc(capacity);
OneWire oneWire(ONE_WIRE_BUS);
DallasTemperature DS18B20(&oneWire);
ESP8266WebServer server(80);

sensor_config sensor[MAX_SENSORS_COUNT];

#define LED_WIFI 0
#define LED_R_ON 1
#define LED_R_OFF 2
unsigned led_profiles[3][7] = {
    2, 2, 2, 2, 2, 10, 0,
    450, 1, 5, 1, 0, 0, 0,
    1, 5, 1, 450, 0, 0, 0};
byte led_current_profile = LED_WIFI;
byte led_profile_phase = 0;
bool led_status = false;
bool led_status_prev = false;

timeval tv;
timespec tp;
struct tm *t_tmp;

time_t now_is;
time_t start;
time_t relay_switched_at = 0;

char string20[20];
int sensors_count = 0;
int data_log_pointer = 0;
bool relay_on = false;

extern "C" int clock_gettime(clockid_t unused, struct timespec *tp);
void WiFi_setup(void);
void setTimers(void);
void _flush_log(void);

/*
void stampToString(time_t stamp, char *buffer)
{
  t_tmp = localtime(&stamp);

  if (stamp < 3600)
  {
    sprintf(buffer, "%02d:%02d", t_tmp->tm_min, t_tmp->tm_sec);
  }
  else if (stamp < 3600 * 24)
  {
    sprintf(buffer, "%02d:%02d:%02d", t_tmp->tm_hour, t_tmp->tm_min, t_tmp->tm_sec);
  }
  else if (stamp < 3600 * 24 * 50)
  {
    sprintf(buffer, "%02dd %02d:%02d:%02d", t_tmp->tm_mday, t_tmp->tm_hour, t_tmp->tm_min, t_tmp->tm_sec);
  }
  else if (stamp < 3600 * 24 * 365)
  {
    sprintf(buffer, "%02dm %02dd %02d:%02d:%02d", t_tmp->tm_mon + 1, t_tmp->tm_mday, t_tmp->tm_hour, t_tmp->tm_min, t_tmp->tm_sec);
  }
  else
  {
    sprintf(buffer, "%04d/%02d/%02d  %02d:%02d:%02d", t_tmp->tm_year + 1900, t_tmp->tm_mon + 1, t_tmp->tm_mday, t_tmp->tm_hour, t_tmp->tm_min, t_tmp->tm_sec);
  }
}
*/

void serial_print(String msg) {
  Serial.print(msg);
};

void serial_println(String msg) {
  Serial.println(msg);
};

void pwmLedManager2() {
  if (!led_profiles[led_current_profile][led_profile_phase])
    led_profile_phase = 0;

  if (led_profiles[led_current_profile][led_profile_phase]) {
    led_sin_ticker.once(led_profiles[led_current_profile][led_profile_phase] / 10.0, pwmLedManager2);

    //serial_print('.');
    led_status = !led_status;
    led_profile_phase++;
  }
}

void setLedProfile(byte profile_num) {
  led_current_profile = profile_num;
  led_profile_phase = 0;
  led_status = false;
  pwmLedManager2();
}

void server_send_headers() {
  server.sendHeader(strAllowOrigin, "*");
  server.sendHeader(strAllowMethod, "GET");
}

void server_send(String smth) {
  server_send_headers();
  server.send(200, strContentType, smth);
}

void genFilename(String *filename) {
  t_tmp = localtime(&now_is);
  *filename = DATA_DIR_SLASH + String(t_tmp->tm_year - 100) + "_" + String(t_tmp->tm_mon + 1) + "_" + String(t_tmp->tm_mday);  //+ String(10*(t_tmp->tm_mday/8));
}

void setCurrentEvent(char type) {
  cur_sensors.stamp = start ? now_is : millis() / 1000;  // записываем число секунд от загрузки если нет настоящего времени (нет интернета)
  cur_sensors.event = type;
}

void writeToFile(String *line) {
  File file;
  bool is_new_file = false;
  String filename;

  //if (!line->length()) return;
  //serial_println("writeToFile");

  genFilename(&filename);

  // serial_print("File opened to append:");
  //serial_println(filename);

  file = LittleFS.open(filename, "a");

  if (!file.size()) {
    is_new_file = true;
    file.print('[');
  }

  if (!is_new_file)
    file.print(',');

  file.print(*line);
  file.close();
}

void time_sync_cb() {
  gettimeofday(&tv, NULL);

  serial_println("--Time sync event--");
  if (start == 0) {
    //   serial_print("Start time is set == ");
    now_is = time(nullptr);
    start = now_is;
    //   serial_println(start);
    _flush_log();
  }

  if (!timers_hour_aligned) {
    int delta = ceil(now_is / 3600.0) * 3600 - now_is;

    if (delta > 30) {
      serial_print("Align to hour required after(sec): ");
      serial_println(String(delta));

      timers_aligner.once(delta, [](void) { setTimers(); });
      timers_hour_aligned = true;
    }
  }
}

void _log_data() {
  if (data_log_pointer < DATA_BUFFER_SIZE) {
    data_log[data_log_pointer] = cur_sensors;
    data_log_pointer++;
  }
}

String stampToPackedDate(time_t * time) {
    char buffer[12];
    
    t_tmp = localtime(time);

    sprintf(buffer, "%02d%02d%02d%02d%02d", t_tmp->tm_year - 100, t_tmp->tm_mon + 1, t_tmp->tm_mday, t_tmp->tm_hour, t_tmp->tm_min);
    return String(buffer);
}    

void _flush_log() {
  String all = "";

  //serial_print("Flush log events(");
  //serial_print(data_log_pointer);

  //serial_print("): ");

  if (start == 0 || data_log_pointer == 0) {  // мы пишем лог только если знаем настоящее время.
    return;
  }

  for (int i = 0; i < data_log_pointer; i++) {
    String line, data = "";

    if (i > 0) {
      all += ",";
    }

    if (data_log[i].event == 'b') {
      data = ",\"st\"";
    } else {
      for (int k = 0; k < sensors_count; k++) {
        data += ",";
        data += data_log[i].t[k];
      }
      switch (data_log[i].event) {
        case 'n':
          data += ",\"on\"";
          break;
        case 'f':
          data += ",\"off\"";
          break;
      }
    }

    // маленькое число в stamp означает что запись была добавлена ДО синхронизации со временем и является числом секунд со старта.
    time_t time = data_log[i].stamp > 900000000 ? data_log[i].stamp : (time_t)(now_is - millis() / 1000 + data_log[i].stamp);

    line = "[" + stampToPackedDate(&time) + data + "]";

    all += line;

    serial_print(line);
  }

  writeToFile(&all);

  data_log_pointer = 0;
}

void setRelay(bool set) {
  relay_on = set;

  digitalWrite(RELAY_PIN, relay_on ? HIGH : LOW);

  serial_print("Relay is ");
  serial_println(relay_on ? "ON" : "OFF");

  relay_switched_at = now_is;

  //  _log_data();

  setCurrentEvent(relay_on ? 'n' : 'f');

  _log_data();
  _flush_log();
}

void _scan_sensors() {
  float tC, w, ws = 0, average = 0;

  gettimeofday(&tv, nullptr);
  clock_gettime(0, &tp);
  now_is = time(nullptr);

  //  stampToString(now_is - start, string20);
  //  serial_print(string20);
  //  serial_print("  ");

  setCurrentEvent('t');

  digitalWrite(PIN_LED, LOW);
  DS18B20.requestTemperatures();

  for (int i = 0; i < sensors_count; i++) {
    tC = DS18B20.getTempCByIndex(i);
    cur_sensors.t[i] = (int)round(tC * 10);

    w = sensor[i].weight / 100.0;
    ws += w;

    average += tC * w;
  }

  average = ws ? average / ws : -127;

  digitalWrite(PIN_LED, HIGH);

  serial_println(String(average));

  if (average < -100 ||  // average -127 mean sensors problems so we better to switch off
      (average >= conf.th && relay_on && now_is - relay_switched_at >= (int)conf.ton * 60)) {
    setRelay(false);
    setLedProfile(LED_R_OFF);
  } else if (
      average > -100  // -127 if contact is broken or if weights are all 0
      && average <= conf.tl && !relay_on && now_is - relay_switched_at >= (int)conf.toff * 60) {
    setRelay(true);
    setLedProfile(LED_R_ON);
  }
}

void setTimers() {
  serial_println("Set timers");

  tickers[0].attach(conf.read, _scan_sensors);
  tickers[1].attach(conf.log, _log_data);
  tickers[2].attach(conf.flush, _flush_log);
}

void sensorsPrepareAddresses() {
  //String msg;

  for (byte i = 0; i < sensors_count; i++) {
    //  msg = "Sensor ";
    DS18B20.getAddress((uint8_t *)&sensor[i].addr, (uint8_t)i);

    sensor[i].weight = (byte)100 / sensors_count;
  }
}

void sensorsParseString(String *line, byte *buffer) {
  int ptr = 0, sum = 0;

  for (unsigned i = 0; i < line->length(); i++) {
    char ch = line->charAt(i);

    if (ch >= '0' && ch <= '9')
      sum = sum * 10 + (ch - '0');
    else {
      buffer[ptr++] = (byte)sum;
      sum = 0;
    }

    if (ptr >= MAX_SENSORS_COUNT * 9)
      return;
  }
  buffer[ptr] = (byte)sum;
}

void sensorsBufferToFile(byte *buffer) {
  File file = LittleFS.open(SENSORS_FILE, "w");  // Open it
  file.write(buffer, sensors_count * 9);
  file.close();  // Then close the file again
                 //serial_print("Sensor data saved to file");
}

void sensorsBufferFromFile(byte *buffer) {
  // int bytes;
  if (LittleFS.exists(SENSORS_FILE)) {
    File file = LittleFS.open(SENSORS_FILE, "r");  // Open it
    file.readBytes((char *)buffer, sensors_count * 9);
    file.close();  // Then close the file again
                   //                if (bytes < sensors_count*9         )         serial_println("--SERIOUS: sensor data read less than expected--");    else       serial_print("Sensor data is read from file");
  }
}

void sensorsApplyBufferOn(byte *buffer) {
  for (byte i = 0; i < sensors_count; i++) {
    for (byte j = 0; j < sensors_count; j++) {
      int comp = 0;

      while (comp < 8 && sensor[i].addr[j] == buffer[i * 9 + j])
        comp++;

      if (comp == 8) {
        sensor[i].weight = buffer[i * 9 + 8];
        break;
      }
    }
  }
}

void server_sendfile(String filename) {
  File f = LittleFS.open(DATA_DIR_SLASH + filename, "r");

  if (f) {
    char buf[2048];
    size_t sent = 0;
    int siz = f.size();
    /*
    String S = "HTTP/1.1 200\r\nContent-Type: " + String(strContentType) + "\r\n" +
               String(strAllowOrigin) + ": *\r\n" + String(strAllowMethod) + ": GET\r\nContent-Length: " + String(siz + 1)  // +1 for closing square bracket
               + "\r\nConnection: close\r\n\r\n";
*/
    server_send_headers();
    server.setContentLength(siz+1); 
    server.send(200, strContentType, "");
    //  server.client().write(S.c_str(), S.length());
    //  serial_println("\nSend file " + fn + " size=" + String(siz));
    while (siz > 0) {
      size_t len = std::min((int)(sizeof(buf) - 1), siz);
      f.read((uint8_t *)buf, len);
      //server.client().write((const char *)buf, len);
      server.sendContent(buf, len);
      siz -= len;
      sent += len;
    }
    f.close();
    //    server.client().write("]", 1);  // finnaly we have correct JSON output!
    // buf[0] = ']';
    // server.sendContent(buf, 1);
    server.sendContent("]", 1);

    //  serial_println(String(sent) + "b sent");
    //   return (sent);
  } else {
    server_send_headers();
    server.send(404, strContentType, "File Not Found: " + String(DATA_DIR_SLASH) + filename);
    serial_println("Bad open file " + filename);
  }
  // return (0);
}

void parseConfJson(String *json) {
  DeserializationError err = deserializeJson(doc, *json);

  serial_print("Conf parse ");
  serial_println(err.c_str());

  if (!err) {
    conf.tl = doc["tl"].as<int>();
    conf.th = doc["th"].as<int>();
    conf.ton = doc["ton"].as<int>();
    conf.toff = doc["toff"].as<int>();
    conf.read = doc["read"].as<int>();
    conf.log = doc["log"].as<int>();
    conf.flush = doc["flush"].as<int>();
  }
}

void handleInfo() {
  String msg = "{";

  if (server.arg("cur").length() > 0) {
    float w, ws = 0, average = 0;
    // даже если последняя событие cur_sensors - НЕ типа 't' - все равно в массиве записи сохраняются последние показания датчиков. Их перетирают только более свежие показания.

    if (server.arg("f").length() > 0)
      _scan_sensors();
    else
      now_is = time(nullptr);

    msg += "\"last\":" + stampToPackedDate(&cur_sensors.stamp) + ",\"up\":" + String(now_is - start) + ",\"rel\":" + String((int)relay_on) + ",\"s\":[";

    for (int i = 0; i < sensors_count; i++) {
      if (i > 0)
        msg += ",";
      msg += cur_sensors.t[i];
      w = sensor[i].weight / 100.0;
      ws += w;
      average += cur_sensors.t[i] * w / 10;
    }

    average = ws ? average / ws : -127;

    msg += "],\"avg\":" + String(average) + "}";
  } else {
    FSInfo fs;
    float flag = false;

    LittleFS.info(fs);

    msg += "\"fs\":{\"tot\":";
    msg += fs.totalBytes;
    msg += ",\"used\":";
    msg += fs.usedBytes;
    msg += ",\"block\":";
    msg += fs.blockSize;
    msg += ",\"page\":";
    msg += fs.pageSize;
    msg += "},\"cur\":[";
    for (int i = 0; i < sensors_count; i++) {
      if (i > 0)
        msg += ",";

      msg += cur_sensors.t[i];
    }
    msg += "],\"conf\":{\"tl\":";
    msg += conf.tl;
    msg += ",\"th\":";
    msg += conf.th;
    msg += ",\"ton\":";
    msg += conf.ton;
    msg += ",\"toff\":";
    msg += conf.toff;
    msg += ",\"read\":";
    msg += conf.read;
    msg += ",\"log\":";
    msg += conf.log;
    msg += ",\"flush\":";
    msg += conf.flush;
    msg += "},\"sn\":\"";

    for (int i = 0; i < sensors_count; i++) {
      if (i > 0)
        msg += ",";

      for (int k = 0; k < 8; k++) {
        msg += String(sensor[i].addr[k]);
        msg += ' ';
      }
      msg += String(sensor[i].weight);
    }

    msg += "\",\"dt\":[";

    Dir dir = LittleFS.openDir(DATA_DIR);
    while (dir.next()) {
      if (flag)
        msg += ",";
      msg += "{\"n\":\"";
      msg += dir.fileName();
      msg += "\",\"s\":";
      if (dir.fileSize()) {
        File f = dir.openFile("r");
        msg += f.size();
      } else
        msg += 0;
      flag = true;
      msg += "}";
    }
    msg += "]}";
  }

  server_send(msg);
}

void handleConfig() {
  String msg;
  byte sens_buff[9 * MAX_SENSORS_COUNT];

  if (server.arg("set").length() > 0) {
    String json = server.arg("set");
    parseConfJson(&json);

    File file = LittleFS.open(CONFIG_FILE, "w");  // Open it
    file.println(server.arg("set"));
    file.close();  // Then close the file again

    serial_print("Conf<--");
    serial_print(server.arg("set"));

    setTimers();
    _log_data();  // TODO - added this line to log as soon as possible after board restart. If not, first log record can be found after 'conf.log' from restart (and this period is about few hours, which is not nice is final graph)

    timers_hour_aligned = false;
  }

  if (server.arg("sn").length() > 0) {
    String line = server.arg("sn");
    sensorsParseString(&line, sens_buff);
    sensorsBufferToFile(sens_buff);
    sensorsApplyBufferOn(sens_buff);

    serial_print("SensConf<--");
    serial_println(line);
  }

  handleInfo();
}

void handleGetData() {
  if (server.arg("f").length() > 0) {
    server_sendfile(server.arg("f"));
  }  else if (server.arg("d").length() > 0) {
    String path = DATA_DIR_SLASH + server.arg("d");

    if (LittleFS.exists(path)) {
      LittleFS.remove(path);  // Remove it
      server_send("{\"d\":1}");
    } else {
      server_send("{\"d\":0}");
    }
  }
}

void configFromFile() {
  File file;
  if (LittleFS.exists(CONFIG_FILE)) {
    int fsize = 0;
    String json;
    File file = LittleFS.open(CONFIG_FILE, "r");  // Open it
                                                  //    serial_println("Config file opened. Size=");
    fsize = file.size();
    //    serial_println(fsize);
    if (fsize > 20 && fsize < 150) {
      json = file.readString();
      //      serial_println("Config file content:");
      //      serial_println(json);
      parseConfJson(&json);
      serial_print("Conf <-- ");
      serial_println(json);
    }
    file.close();  // Then close the file again
  }
}

void is_wifi_connected() {
  if (WiFi.status() != WL_CONNECTED) {
    //    serial_println("No wifi located - set time for next period");
    timers_aligner.once(60 * 15, is_wifi_connected);
  } else {
    settimeofday_cb(time_sync_cb);
    configTime(TZ_SEC, DST_SEC, "pool.ntp.org");

    server.on("/conf", handleConfig);
    server.on("/data", handleGetData);
    server.on("/info", handleInfo);

    server.begin();

    serial_print("IP is ");
    serial_println(WiFi.localIP().toString());
  }
}

void WiFi_setup() {
  // unsigned long startedAt = millis();
  WiFiManager wifiManager;

  setLedProfile(LED_WIFI);

  WiFi.mode(WIFI_STA);
  serial_println("Waiting wifi");

  if (WiFi.SSID() != "")
    wifiManager.setConfigPortalTimeout(WIFI_CONFIG_DURATION_SEC);  //If no access point name has been previously entered disable timeout.

  wifiManager.autoConnect("ESP8266_192.168.4.1");

  is_wifi_connected();

  //digitalWrite(PIN_LED, HIGH); // Turn led off as we are not in configuration mode.
  // For some unknown reason webserver can only be started once per boot up
  // so webserver can not be used again in the sketch.
}

void setup() {
  byte sens_buff[9 * MAX_SENSORS_COUNT];

  pinMode(PIN_LED, OUTPUT);
  pinMode(LED_PIN, OUTPUT);
  pinMode(RELAY_PIN, OUTPUT);

  Serial.begin(115200);
  serial_println("\n Starting");
  setCurrentEvent('b');
  _log_data();

  analogWrite(LED_PIN, 300);  //Just light up for setup period

  DS18B20.begin();
  LittleFS.begin();

  WiFi_setup();

  sensors_count = DS18B20.getDeviceCount();
  sensors_count = MAX_SENSORS_COUNT > sensors_count ? sensors_count : MAX_SENSORS_COUNT;

  configFromFile();

  sensorsPrepareAddresses();
  sensorsBufferFromFile(sens_buff);
  sensorsApplyBufferOn(sens_buff);

  setLedProfile(LED_R_OFF);

  setTimers();

  _scan_sensors();
  _log_data();
}

void loop() {
  int i;
  server.handleClient();

  if (led_status != led_status_prev) {
    analogWrite(LED_PIN, led_status ? 600 : 0);
    led_status_prev = led_status;
  }

  for (i = 0; i < TICKERS; i++)
    if (tickers[i].armed())
      tickers[i].run();
}
