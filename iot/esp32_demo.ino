// GEN_Z ESP32 demo: Button 1 (GPIO18) = FAULT, Button 2 (GPIO19) = FAILSAFE / offline hotspot.
// Libraries: WebSockets (Markus Sattler), Adafruit SSD1306 + GFX, ArduinoJson, Preferences (built in).
// NOT tested on hardware in this repo: treat as a starting point.
#include <WiFi.h>
#include <WebSocketsClient.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <ArduinoJson.h>

const char* WIFI_SSID = "YOUR_WIFI";  const char* WIFI_PASS = "YOUR_PASS";
const char* HOST = "192.168.1.10";    const uint16_t PORT = 8080;          // Java backend
const char* DEVICE_KEY = "esp32-demo-key";                                  // = DEVICE_KEY on the backend
const char* STATION_ID = "stn_krishnagiri";                                 // a station id from MongoDB

Adafruit_SSD1306 oled(128, 64, &Wire, -1);
WebSocketsClient ws;
const int BTN_FAULT = 18, BTN_FAILSAFE = 19;

void show(const String& a, const String& b = "") { oled.clearDisplay(); oled.setTextSize(1); oled.setTextColor(WHITE); oled.setCursor(0, 8); oled.println(a); oled.println(b); oled.display(); }
void send(const char* type, const char* reason) {
  StaticJsonDocument<192> d; d["type"] = type; d["stationId"] = STATION_ID; d["reason"] = reason;
  String s; serializeJson(d, s); ws.sendTXT(s);
}
void setup() {
  pinMode(BTN_FAULT, INPUT_PULLUP); pinMode(BTN_FAILSAFE, INPUT_PULLUP);
  oled.begin(SSD1306_SWITCHCAPVCC, 0x3C); show("Connecting WiFi...");
  WiFi.mode(WIFI_STA); WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) delay(300);
  ws.begin(HOST, PORT, String("/ws/iot?key=") + DEVICE_KEY); ws.setReconnectInterval(3000);
  show("CHARGER ONLINE", STATION_ID);
}
void loop() {
  ws.loop();
  if (digitalRead(BTN_FAULT) == LOW) {            // Button 1: abrupt hardware fault
    show("FAULT: STATION OFFLINE"); send("FAULT", "Overtemperature alert"); delay(1500);
  }
  if (digitalRead(BTN_FAILSAFE) == LOW) {         // Button 2: network outage -> local hotspot (+ Preferences.h cache in a full build)
    send("FAILSAFE", "Gateway lost");
    WiFi.disconnect(); WiFi.mode(WIFI_AP_STA); WiFi.softAP("DEXATHON_CHARGER_01", "password123");
    show("OFFLINE MODE:", "Connect to DEXATHON_CHARGER_01"); delay(1500);
  }
}
