# GEN_Z – Smart EV Charging & Intelligent Trip Planning

React · Java (Spring Boot) · Python (FastAPI) · MongoDB · WebSocket/ESP32 · Google Gemini

```
React (Vite) ──REST / WebSocket──▶ Java backend ──▶ MongoDB
                                        ├─▶ Python optimizer (/rank /plan /reroute /emergency)
                                        ├─▶ Gemini API (AI explanations + trip assistant)
ESP32 ──WebSocket /ws/iot or POST /api/iot/event──▶ Java backend ──▶ live push to React
```

## Run it
### Option A: Docker
```
docker compose up --build            # optional: GEMINI_API_KEY=... docker compose up --build
```
App: http://localhost:3000 · API: :8080 · Optimizer: :8000 · MongoDB: :27017

### Option B: local dev
```
docker run -d -p 27017:27017 mongo:7
cd optimizer && pip install -r requirements.txt && uvicorn main:app --port 8000
cd backend   && mvn spring-boot:run            # Java 21, seeds MongoDB on first start
cd frontend  && npm install && npm run dev     # http://localhost:5173 (proxies /api and /ws)
```
Login: enter any 10-digit number → GET OTP. With `DEV_OTP=true` (default) the OTP comes back in the API response and is auto-filled.
For real SMS/email, implement the send step in `Otp.send()` and set `DEV_OTP=false`.

## Configuration (backend env vars)
`MONGO_URI`, `PYTHON_URL`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `JWT_SECRET`, `DEVICE_KEY`, `DEV_OTP`, `SIMULATOR` (simulated charger telemetry), `TIME_SCALE` (charging-session speed-up, default 20x; set 1 for real time), `HOLD_SECONDS` (queue hold window), `WELCOME_BALANCE`, `CORS_ORIGIN`, `SEED`.

## Where the data comes from (nothing is hard-coded in the UI)
* Stations, bays, tariffs, amenities, safety, places, route corridors, vehicle catalogue, review tags, facts, helplines and perks are seeded into MongoDB by `Seeder.java` on first run. Replace/extend with real datasets or OCPI feeds.
* Station availability changes live: the **simulator** (Available → Occupied → Charging → Available) and any **ESP32/OCPP-style events** update MongoDB and are pushed to every open app over `/ws/live`.
* Ranking, trip planning, failsafe rerouting and emergency picks are computed by the **Python optimizer** from that data. Gemini only *explains* the result in words (falls back to rule-based text without a key).

## Demo the failsafe (the two ESP32 buttons)
1. Log in, link an EV, plan *Bengaluru → Chennai*, pick the stop, tap **Start live navigation**.
2. Fire the fault (what Button 1 sends):
```
curl -X POST localhost:8080/api/iot/event -H 'X-Device-Key: esp32-demo-key' -H 'Content-Type: application/json' \
  -d '{"type":"FAULT","stationId":"stn_krishnagiri","reason":"Overtemperature alert"}'
```
The app jumps to **Failsafe Reroute Alert** with a 30 s auto-accept countdown. `{"type":"RECOVER","stationId":"..."}` brings the charger back.
3. Button 2: `{"type":"FAILSAFE","stationId":"..."}` (outage/hotspot mode) and `{"type":"SYNC","stationId":"...","transactions":[...]}` (cached offline billing uploaded when back online).
WebSocket devices connect to `ws://HOST:8080/ws/iot?key=DEVICE_KEY` and send the same JSON. See `iot/esp32_demo.ino`.

## API map
Auth `/api/auth/{otp,verify}` · Me `/api/me…` · Stations `/api/stations/nearby|{id}|{id}/reserve|{id}/queue` · Trips `/api/trips/plan|{id}/select|start|position|replan` · Queue `/api/queue/…` · Sessions `/api/sessions/{start,active,{id}/stop,boost,invoice}` · Reviews `/api/reviews…` · Activity `/api/activity/{summary,timeline,gamification,export}` · Emergency `/api/emergency/start` · Alerts `/api/alerts/…` · AI `/api/ai/{explain,assist}` · IoT `/api/iot/event`, `/ws/iot` · Live `/ws/live`.

## Known gaps / honest notes
* **The Java backend has not been compiled here** (no Maven/Central access in the build sandbox); the Python optimizer and the React build were run. Expect to fix a few compile-level typos on the first `mvn spring-boot:run`.
* Payments are a **simulated prepaid wallet** (no gateway). OTP delivery, Google/Apple sign-in and a real PDF invoice are not implemented (invoice = print dialog, export = CSV).
* Turn-by-turn navigation opens Google Maps; there is no in-app routing engine. Route distance uses stored corridors (Bengaluru–Chennai, Bengaluru–Mysuru) or a straight line × 1.22 elsewhere.
* The roadside helpline number is a placeholder: edit `Seeder.helplines()` / the `helplines` collection. Character artwork from the mock screens is not included (a ⚡ mascot is used).
