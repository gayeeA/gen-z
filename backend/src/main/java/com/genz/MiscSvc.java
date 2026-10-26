package com.genz;

import static org.springframework.data.mongodb.core.query.Criteria.where;
import static org.springframework.data.mongodb.core.query.Query.query;

import com.genz.Models.*;
import java.time.*;
import java.util.*;
import java.util.stream.Collectors;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.http.*;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.stereotype.Service;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestClient;

@RestController @RequestMapping("/api/activity")
class ActivityController {
    static final ZoneId IST = ZoneId.of("Asia/Kolkata");
    static final double PETROL_PER_KM = 11.06, CO2_PER_KM = 0.12, TREE_KG = 21;
    final MongoTemplate db; final Users users;
    ActivityController(MongoTemplate d, Users u) { db = d; users = u; }

    List<Session> sessions(String uid, Instant from, Instant to) {
        return db.find(query(where("userId").is(uid).and("status").is("DONE").and("startAt").gte(from).lt(to)), Session.class);
    }
    @GetMapping("/summary") Map<String, Object> summary(@RequestAttribute("uid") String uid, @RequestParam(required = false) String month) {
        YearMonth ym = month == null ? YearMonth.now(IST) : YearMonth.parse(month);
        List<Session> cur = sessions(uid, ym.atDay(1).atStartOfDay(IST).toInstant(), ym.plusMonths(1).atDay(1).atStartOfDay(IST).toInstant());
        List<Session> prev = sessions(uid, ym.minusMonths(1).atDay(1).atStartOfDay(IST).toInstant(), ym.atDay(1).atStartOfDay(IST).toInstant());
        double energy = cur.stream().mapToDouble(s -> s.energy).sum(), spent = cur.stream().mapToDouble(s -> s.cost).sum();
        double prevE = prev.stream().mapToDouble(s -> s.energy).sum();
        double km = cur.stream().mapToDouble(s -> s.consumption > 0 ? s.energy / s.consumption * 100 : 0).sum();
        double co2 = km * CO2_PER_KM;
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("month", ym.toString()); m.put("sessions", cur.size()); m.put("energyKwh", Math.round(energy * 10) / 10.0); m.put("spent", Math.round(spent));
        m.put("avgRate", energy > 0 ? Math.round(spent / energy * 100) / 100.0 : 0); m.put("deltaPct", prevE > 0 ? Math.round((energy - prevE) / prevE * 100) : null);
        m.put("fuelSavings", Math.round(km * PETROL_PER_KM - spent)); m.put("co2Kg", Math.round(co2)); m.put("trees", Math.round(co2 / TREE_KG));
        m.put("kmDriven", Math.round(km)); m.put("title", ym.getMonth().getDisplayName(java.time.format.TextStyle.SHORT, Locale.ENGLISH));
        return m;
    }
    @GetMapping("/timeline") List<Map<String, Object>> timeline(@RequestAttribute("uid") String uid, @RequestParam(defaultValue = "ALL") String type) {
        List<Map<String, Object>> out = new ArrayList<>();
        if (!type.equals("TRIPS"))
            for (Session s : db.find(query(where("userId").is(uid).and("status").is("DONE")).with(Sort.by(Sort.Direction.DESC, "startAt")).limit(40), Session.class)) {
                if (type.equals("FAST") && s.powerKw < 50) continue;
                Review r = db.findOne(query(where("sessionId").is(s.id)), Review.class);
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("kind", "SESSION"); m.put("id", s.id); m.put("at", s.startAt); m.put("stationId", s.stationId); m.put("title", s.stationName); m.put("network", s.network);
                m.put("powerKw", s.powerKw); m.put("energy", Math.round(s.energy * 10) / 10.0); m.put("cost", s.cost); m.put("payment", s.payment);
                m.put("durationMin", Duration.between(s.startAt, s.endAt).toMinutes()); m.put("reviewed", s.reviewed); m.put("rating", r == null ? null : r.rating);
                out.add(m);
            }
        if (!type.equals("FAST"))
            for (Trip t : db.find(query(where("userId").is(uid).and("status").in("ACTIVE", "DONE")).with(Sort.by(Sort.Direction.DESC, "createdAt")).limit(20), Trip.class)) {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("kind", "TRIP"); m.put("id", t.id); m.put("at", t.startedAt != null ? t.startedAt : t.createdAt); m.put("from", t.from.get("name")); m.put("to", t.to.get("name"));
                m.put("plan", t.plan); m.put("status", t.status); out.add(m);
            }
        out.sort(Comparator.comparing((Map<String, Object> m) -> (Instant) m.get("at")).reversed());
        return out;
    }
    @GetMapping("/gamification") Map<String, Object> gamification(@RequestAttribute("uid") String uid) {
        User u = users.get(uid);
        List<Map<String, Object>> perks = new ArrayList<>();
        for (Perk p : db.find(new org.springframework.data.mongodb.core.query.Query().with(Sort.by("xpRequired")), Perk.class)) {
            Map<String, Object> m = new LinkedHashMap<>(); m.put("title", p.title); m.put("detail", p.detail); m.put("xpRequired", p.xpRequired); m.put("unlocked", u.xp >= p.xpRequired); perks.add(m);
        }
        Map<String, Object> m = new LinkedHashMap<>();
        int lv = Users.level(u);
        m.put("level", lv); m.put("levelName", Users.LEVELS[Math.min(lv, Users.LEVELS.length - 1)]); m.put("xp", u.xp); m.put("nextLevelXp", (lv + 1) * (lv + 1) * 150);
        m.put("streak", u.streak); m.put("streakCredits", u.streak * 10); m.put("noShows", u.noShows); m.put("reliability", u.reliability); m.put("perks", perks);
        return m;
    }
    @GetMapping(value = "/export", produces = "text/csv") ResponseEntity<String> export(@RequestAttribute("uid") String uid, @RequestParam(required = false) String month) {
        YearMonth ym = month == null ? YearMonth.now(IST) : YearMonth.parse(month);
        StringBuilder sb = new StringBuilder("Invoice,Date,Station,Network,Bay,Energy kWh,Amount INR,GST INR,Payment\n");
        for (Session s : sessions(uid, ym.atDay(1).atStartOfDay(IST).toInstant(), ym.plusMonths(1).atDay(1).atStartOfDay(IST).toInstant()))
            sb.append("GZ-").append(s.id.toUpperCase()).append(',').append(s.startAt).append(",\"").append(s.stationName).append("\",").append(s.network).append(',').append(s.bay)
              .append(',').append(String.format("%.2f", s.energy)).append(',').append(String.format("%.2f", s.cost)).append(',').append(String.format("%.2f", s.cost * 0.18 / 1.18)).append(',').append(s.payment).append('\n');
        return ResponseEntity.ok().header("Content-Disposition", "attachment; filename=genz-" + ym + ".csv").body(sb.toString());
    }
}

@RestController @RequestMapping("/api/emergency")
class EmergencyController {
    final MongoTemplate db; final Users users; final StationService ss; final Py py; final BookingService bookings;
    EmergencyController(MongoTemplate d, Users u, StationService s, Py p, BookingService b) { db = d; users = u; ss = s; py = p; bookings = b; }

    @PostMapping("/start") @SuppressWarnings("unchecked")
    Map<String, Object> start(@RequestAttribute("uid") String uid, @RequestBody(required = false) Map<String, Double> b) {
        User u = users.get(uid); Vehicle v = users.needVehicle(u);
        double lat = b != null && b.get("lat") != null ? b.get("lat") : u.lat, lng = b != null && b.get("lng") != null ? b.get("lng") : u.lng;
        Booking ex = db.findOne(query(where("userId").is(uid).and("kind").is("EMERGENCY").and("status").is("ACTIVE")), Booking.class);
        List<Map<String, Object>> sts = new ArrayList<>();
        for (Station s : db.findAll(Station.class)) { Map<String, Object> m = ss.view(s, v, lat, lng); if ((Boolean) m.get("compatible")) sts.add(m); }
        Map<String, Object> flags = new HashMap<>(); flags.put("hvacOff", v.hvacOff); flags.put("regenHigh", v.regenHigh);
        Map<String, Object> body = new HashMap<>();
        body.put("vehicle", Users.vdict(v)); body.put("soc", v.soc); body.put("pos", Map.of("lat", lat, "lng", lng)); body.put("stations", sts);
        body.put("flags", flags); body.put("forceId", ex == null ? null : ex.stationId);
        Map<String, Object> r = py.post("/emergency", body);
        Map<String, Object> best = (Map<String, Object>) r.get("best");
        Map<String, Object> out = new LinkedHashMap<>(r);
        out.put("soc", v.soc); out.put("vehicleId", v.id);
        out.put("helplines", db.findAll(Helpline.class));
        if (best != null && Boolean.TRUE.equals(best.get("reachable"))) {
            Booking bk = ex;
            if (bk == null && Boolean.TRUE.equals(best.get("free"))) {
                try { bk = bookings.reserve(uid, (String) ((Map<String, Object>) best.get("station")).get("id"), null, 20, "EMERGENCY", 0); } catch (ApiEx ignored) {}
            }
            out.put("booking", bk);
        }
        return out;
    }
}

@Service
class IotService {
    final MongoTemplate db; final StationService ss; final Live live; final FailsafeService fs;
    IotService(MongoTemplate d, StationService s, Live l, FailsafeService f) { db = d; ss = s; live = l; fs = f; }

    @SuppressWarnings("unchecked")
    Map<String, Object> handle(Map<String, Object> m) {
        String type = String.valueOf(m.get("type")).toUpperCase();
        String sid = String.valueOf(m.get(m.get("stationId") != null ? "stationId" : "chargerId"));
        Station s = ss.get(sid);
        int bay = m.get("bay") instanceof Number n ? n.intValue() : 0;
        Map<String, Object> res = new HashMap<>(); res.put("ack", true); res.put("type", type);
        switch (type) {
            case "FAULT" -> {
                String reason = m.get("reason") == null ? "Hardware fault reported by charger" : String.valueOf(m.get("reason"));
                for (Bay b : s.bays) if (bay == 0 || b.number == bay) { b.status = "FAULT"; b.holdBy = null; b.vehicle = null; }
                s.offline = s.bays.stream().allMatch(b -> "FAULT".equals(b.status)); ss.save(s);
                log(s, bay, "FAULT", m);
                live.all("STATION_FAULT", Map.of("stationId", s.id, "name", s.name, "reason", reason));
                if (s.offline) fs.onStationFault(s, reason);
            }
            case "RECOVER" -> {
                for (Bay b : s.bays) if ("FAULT".equals(b.status)) b.status = "AVAILABLE";
                s.offline = false; ss.save(s); log(s, bay, "RECOVERED", m);
                live.all("STATION_UPDATE", Map.of("stationId", s.id));
            }
            case "FAILSAFE" -> { log(s, bay, "OFFLINE_MODE", m); live.all("STATION_FAILSAFE", Map.of("stationId", s.id, "name", s.name)); }
            case "TELEMETRY" -> {
                for (Bay b : s.bays) if (b.number == bay) {
                    if (m.get("status") != null) b.status = String.valueOf(m.get("status"));
                    if (m.get("soc") instanceof Number n) b.soc = n.intValue();
                    if (m.get("minutesLeft") instanceof Number n) b.minutesLeft = n.intValue();
                }
                ss.save(s); log(s, bay, String.valueOf(m.getOrDefault("status", "TELEMETRY")), m);
                live.all("STATION_UPDATE", Map.of("stationId", s.id));
            }
            case "SYNC" -> {   // transactions cached on the ESP32 while the station was offline
                List<Map<String, Object>> tx = (List<Map<String, Object>>) m.getOrDefault("transactions", List.of());
                for (Map<String, Object> t : tx) { OfflineTx o = new OfflineTx(); o.id = Models.id(); o.stationId = s.id; o.data = t; db.save(o); }
                res.put("stored", tx.size());
            }
            default -> throw new ApiEx(400, "Unknown event type " + type);
        }
        return res;
    }
    void log(Station s, int bay, String status, Map<String, Object> m) {
        Telemetry t = new Telemetry(); t.id = Models.id(); t.stationId = s.id; t.bay = bay; t.status = status; t.source = "IOT";
        t.powerKw = U.num(m, "powerKw"); t.voltage = U.num(m, "voltage"); t.current = U.num(m, "current"); t.energyKwh = U.num(m, "energyKwh"); t.tempC = U.num(m, "tempC");
        db.save(t);
    }
}

@RestController @RequestMapping("/api/iot")
class IotController {
    final IotService iot; final Cfg cfg;
    IotController(IotService i, Cfg c) { iot = i; cfg = c; }
    /** HTTP fallback for devices without a WebSocket: POST /api/iot/event with header X-Device-Key. */
    @PostMapping("/event") Map<String, Object> event(@RequestHeader("X-Device-Key") String key, @RequestBody Map<String, Object> m) {
        if (!cfg.deviceKey.equals(key)) throw new ApiEx(403, "Bad device key");
        return iot.handle(m);
    }
}

@Service
class AiService {
    final Cfg cfg; final RestClient rc = RestClient.create();
    AiService(Cfg c) { cfg = c; }
    boolean configured() { return !cfg.geminiKey.isBlank(); }

    @SuppressWarnings("unchecked")
    String gemini(String prompt) {
        if (!configured()) return null;
        try {
            Map<String, Object> body = Map.of("contents", List.of(Map.of("parts", List.of(Map.of("text", prompt)))));
            Map<String, Object> r = rc.post().uri("https://generativelanguage.googleapis.com/v1beta/models/" + cfg.geminiModel + ":generateContent")
                    .header("x-goog-api-key", cfg.geminiKey).contentType(MediaType.APPLICATION_JSON).body(body).retrieve().body(Map.class);
            Map<String, Object> c = ((List<Map<String, Object>>) r.get("candidates")).get(0);
            return (String) ((List<Map<String, Object>>) ((Map<String, Object>) c.get("content")).get("parts")).get(0).get("text");
        } catch (Exception e) { System.out.println("[Gemini] " + e.getMessage()); return null; }
    }
}

@RestController @RequestMapping("/api/ai")
class AiController {
    final AiService ai; final MongoTemplate db; final Users users;
    AiController(AiService a, MongoTemplate d, Users u) { ai = a; db = d; users = u; }

    @PostMapping("/explain") @SuppressWarnings("unchecked")
    Map<String, Object> explain(@RequestAttribute("uid") String uid, @RequestBody Map<String, String> b) {
        Trip t = db.findById(b.get("tripId"), Trip.class);
        if (t == null || !t.userId.equals(uid)) throw new ApiEx(404, "Trip not found");
        List<Map<String, Object>> cands = (List<Map<String, Object>>) t.plan.getOrDefault("candidates", List.of());
        Map<String, Object> pick = cands.stream().filter(c -> c.get("stationId").equals(b.get("stationId"))).findFirst()
                .orElse(((List<Map<String, Object>>) t.plan.getOrDefault("stops", List.of())).stream().findFirst().orElse(null));
        if (pick == null) throw new ApiEx(400, "No charging stop to explain");
        String facts = String.format("Station: %s. Rank %s of %d. Score %s. Reasons: %s. Arrive at %s%% battery, charge to %s%% in %s min, cost INR %s, wait %s min, detour %s km, safety %s/100.",
                pick.get("name"), pick.get("rank"), cands.size(), pick.get("score"), pick.get("reasons"), pick.get("arrivalSoc"), pick.get("targetSoc"), pick.get("chargeMin"),
                pick.get("cost"), pick.get("waitMin"), pick.get("detourKm"), pick.get("safety"));
        String text = ai.gemini("You are GEN_Z, a concise EV trip assistant. In at most two friendly sentences explain why this charging stop is recommended for the driver. Use ONLY these facts, invent nothing: " + facts);
        Map<String, Object> r = new HashMap<>();
        r.put("source", text != null ? "gemini" : "rules");
        r.put("text", text != null ? text.trim() : "Recommended because: " + String.join("; ", (List<String>) pick.getOrDefault("reasons", List.of())) + ".");
        return r;
    }

    @PostMapping("/assist") @SuppressWarnings("unchecked")
    Map<String, Object> assist(@RequestAttribute("uid") String uid, @RequestBody Map<String, String> b) {
        if (!ai.configured()) return Map.of("source", "unavailable", "text", "AI assistant is not configured. Set GEMINI_API_KEY on the backend to enable it.");
        User u = users.get(uid); Vehicle v = users.vehicle(u);
        String ctx = "Driver vehicle: " + (v == null ? "unknown" : v.model + ", battery " + v.batteryKwh + " kWh, SoC " + v.soc + "%, range " + v.getRangeKm() + " km") + ".";
        if (b.get("tripId") != null) {
            Trip t = db.findById(b.get("tripId"), Trip.class);
            if (t != null && t.userId.equals(uid)) ctx += " Current trip " + t.from.get("name") + " to " + t.to.get("name") + ": " + t.plan.get("distanceKm") + " km, stops "
                    + ((List<Map<String, Object>>) t.plan.get("stops")).stream().map(s -> s.get("name") + " (arrive " + s.get("arrivalSoc") + "%, charge to " + s.get("targetSoc") + "%)").collect(Collectors.toList()) + ".";
        }
        String text = ai.gemini("You are GEN_Z, an EV charging and trip assistant for Indian roads. Be concise (max 4 sentences) and only use the context given; say if you do not know.\nContext: " + ctx + "\nQuestion: " + b.get("message"));
        return Map.of("source", text != null ? "gemini" : "unavailable", "text", text != null ? text.trim() : "The AI service did not respond. Please try again.");
    }
}

@RestController @RequestMapping("/api/health")
class HealthController {
    final MongoTemplate db; final Py py; final AiService ai;
    HealthController(MongoTemplate d, Py p, AiService a) { db = d; py = p; ai = a; }
    @GetMapping Map<String, Object> health() {
        List<Station> all = db.findAll(Station.class);
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("mongo", true); m.put("optimizer", py.up()); m.put("gemini", ai.configured());
        m.put("stations", all.size()); m.put("liveChargers", all.stream().filter(s -> !s.offline).mapToLong(s -> s.bays.stream().filter(b -> !"FAULT".equals(b.status)).count()).sum());
        return m;
    }
}

/** Simulated charger telemetry: bays move Available -> Occupied -> Charging -> Available (see hackathon doc section 12). */
@Component
class Simulator {
    static final String[] CARS = {"Tata Nexon EV", "MG ZS EV", "Hyundai Ioniq 5", "Mahindra XUV400", "BYD Atto 3", "Kia EV6", "Tata Punch EV", "MG Comet"};
    final MongoTemplate db; final StationService ss; final Live live; final Cfg cfg; final Random r = new Random();
    Simulator(MongoTemplate d, StationService s, Live l, Cfg c) { db = d; ss = s; live = l; cfg = c; }

    void tick() {
        if (!cfg.simulator) return;
        int dec = (int) Math.ceil(4 / 60.0 * cfg.timeScale);
        for (Station s : db.findAll(Station.class)) {
            if (s.offline) continue;
            boolean changed = false;
            for (Bay b : s.bays) {
                if (b.holdBy != null || "FAULT".equals(b.status) || "RESERVED".equals(b.status)) continue;
                if ("CHARGING".equals(b.status) || "OCCUPIED".equals(b.status)) {
                    b.minutesLeft -= dec; b.soc = Math.min(100, b.soc + 2);
                    if (b.minutesLeft <= 0) { b.status = "AVAILABLE"; b.vehicle = null; b.minutesLeft = 0; b.soc = 0; }
                    else if ("OCCUPIED".equals(b.status) && r.nextInt(3) == 0) b.status = "CHARGING";
                    changed = true;
                } else if ("AVAILABLE".equals(b.status) && r.nextInt(16) == 0) {
                    b.status = "OCCUPIED"; b.vehicle = CARS[r.nextInt(CARS.length)]; b.soc = 15 + r.nextInt(50); b.minutesLeft = 10 + r.nextInt(35); changed = true;
                    Telemetry t = new Telemetry(); t.id = Models.id(); t.stationId = s.id; t.bay = b.number; t.status = "OCCUPIED"; t.source = "SIM"; t.powerKw = b.powerKw; db.save(t);
                }
            }
            if (changed) { ss.save(s); live.all("STATION_UPDATE", Map.of("stationId", s.id)); }
        }
    }
}

@Component
class Ticker {
    final Simulator sim; final BookingService bookings; final QueueService queue; final SessionService sessions; final FailsafeService fs;
    Ticker(Simulator s, BookingService b, QueueService q, SessionService se, FailsafeService f) { sim = s; bookings = b; queue = q; sessions = se; fs = f; }
    @Scheduled(fixedDelay = 4000, initialDelay = 8000) void slow() { sim.tick(); bookings.expire(); queue.tick(); }
    @Scheduled(fixedDelay = 2000, initialDelay = 8000) void sessionsPush() { sessions.pushAll(); }
    @Scheduled(fixedDelay = 1500, initialDelay = 8000) void failsafe() { fs.autoAccept(); }
}
