package com.genz;

import static org.springframework.data.mongodb.core.query.Criteria.where;
import static org.springframework.data.mongodb.core.query.Query.query;

import com.genz.Models.*;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Update;
import org.springframework.stereotype.Service;
import org.springframework.web.bind.annotation.*;

@Service
class Users {
    static final String[] LEVELS = {"Spark Rookie", "Spark Rookie", "Spark Pioneer", "Volt Explorer", "Volt Explorer", "Grid Master", "Grid Master", "Thunder Legend"};
    final MongoTemplate db;
    Users(MongoTemplate d) { db = d; }

    User get(String uid) { User u = db.findById(uid, User.class); if (u == null) throw new ApiEx(401, "User not found"); return u; }
    void save(User u) { db.save(u); }
    Vehicle vehicle(User u) {
        for (Vehicle v : u.vehicles) if (v.id.equals(u.activeVehicleId)) return v;
        return u.vehicles.isEmpty() ? null : u.vehicles.get(0);
    }
    Vehicle needVehicle(User u) { Vehicle v = vehicle(u); if (v == null) throw new ApiEx(409, "Add your EV first"); return v; }
    static int level(User u) { return Math.max(1, (int) Math.floor(Math.sqrt(u.xp / 150.0))); }
    static Map<String, Object> vdict(Vehicle v) {
        Map<String, Object> m = new HashMap<>();
        m.put("batteryKwh", v.batteryKwh); m.put("maxDcKw", v.maxDcKw); m.put("maxAcKw", v.maxAcKw);
        m.put("connector", v.connector); m.put("consumption", v.consumption); m.put("soc", v.soc);
        return m;
    }
    Map<String, Object> view(User u) {
        Map<String, Object> m = new LinkedHashMap<>();
        int lv = level(u);
        m.put("id", u.id); m.put("name", u.name); m.put("phone", u.phone); m.put("email", u.email); m.put("avatar", u.avatar);
        m.put("role", u.role); m.put("wallet", Math.round(u.wallet * 100) / 100.0); m.put("points", u.points); m.put("xp", u.xp);
        m.put("level", lv); m.put("levelName", LEVELS[Math.min(lv, LEVELS.length - 1)]); m.put("nextLevelXp", (lv + 1) * (lv + 1) * 150);
        m.put("reliability", u.reliability); m.put("noShows", u.noShows); m.put("streak", u.streak);
        m.put("settings", u.settings); m.put("payment", u.payment); m.put("saved", u.saved);
        m.put("lat", u.lat); m.put("lng", u.lng); m.put("vehicles", u.vehicles); m.put("vehicle", vehicle(u));
        m.put("redeemable", (int) (Math.floor(u.points * 0.2 / 10) * 10));
        m.put("blockedUntil", u.reserveBlockedUntil);
        m.put("unread", db.count(query(where("userId").is(u.id).and("read").is(false)), Notification.class));
        return m;
    }
}

@Service
class Otp {
    final MongoTemplate db; final Cfg cfg; final SecureRandom sr = new SecureRandom();
    Otp(MongoTemplate d, Cfg c) { db = d; cfg = c; }
    static String norm(String id) {
        if (id == null || id.isBlank()) throw new ApiEx(400, "Phone or email required");
        id = id.trim().toLowerCase().replace(" ", "");
        return id;
    }
    Map<String, Object> send(String id) {
        id = norm(id);
        OtpDoc o = new OtpDoc(); o.id = id; o.code = String.format("%06d", sr.nextInt(1_000_000)); o.expires = Instant.now().plusSeconds(300);
        db.save(o);
        // Plug an SMS / email provider (MSG91, Twilio, SES...) in here. Until then the code is logged.
        System.out.println("[OTP] " + id + " -> " + o.code);
        Map<String, Object> r = new HashMap<>(); r.put("sent", true);
        if (cfg.devOtp) r.put("devOtp", o.code);
        return r;
    }
    boolean verify(String id, String code) {
        OtpDoc o = db.findById(id, OtpDoc.class);
        if (o == null || o.expires.isBefore(Instant.now()) || o.tries >= 5) return false;
        o.tries++; db.save(o);
        if (!o.code.equals(code)) return false;
        db.remove(o); return true;
    }
}

@RestController @RequestMapping("/api/auth")
class AuthController {
    final Otp otp; final MongoTemplate db; final Users users; final Jwt jwt; final Cfg cfg; final Notifier nt;
    AuthController(Otp o, MongoTemplate d, Users u, Jwt j, Cfg c, Notifier n) { otp = o; db = d; users = u; jwt = j; cfg = c; nt = n; }

    @PostMapping("/otp") Map<String, Object> otp(@RequestBody Map<String, String> b) { return otp.send(b.get("id")); }

    @PostMapping("/verify") Map<String, Object> verify(@RequestBody Map<String, String> b) {
        String id = Otp.norm(b.get("id"));
        if (!otp.verify(id, b.get("code"))) throw new ApiEx(400, "Invalid or expired code");
        boolean email = id.contains("@");
        User u = db.findOne(query(where(email ? "email" : "phone").is(id)), User.class);
        boolean isNew = u == null;
        if (isNew) {
            u = new User(); u.id = Models.id();
            if (email) { u.email = id; u.name = id.substring(0, id.indexOf('@')); } else u.phone = id;
            u.wallet = cfg.welcome;
            u.settings.networks = db.findAll(Station.class).stream().map(s -> s.network).distinct().collect(Collectors.toList());
            db.save(u);
            nt.send(u.id, "Welcome to GEN_Z", "₹" + (int) cfg.welcome + " welcome credit added to your Spark AutoPay wallet.", "WELCOME");
        }
        Map<String, Object> r = new HashMap<>();
        r.put("token", jwt.make(u)); r.put("user", users.view(u)); r.put("isNew", isNew);
        return r;
    }
}

@RestController @RequestMapping("/api")
class MeController {
    final Users users; final MongoTemplate db;
    MeController(Users u, MongoTemplate d) { users = u; db = d; }

    @GetMapping("/me") Map<String, Object> me(@RequestAttribute("uid") String uid) { return users.view(users.get(uid)); }

    @PutMapping("/me") Map<String, Object> update(@RequestAttribute("uid") String uid, @RequestBody Map<String, Object> b) {
        User u = users.get(uid);
        if (b.get("name") != null) u.name = String.valueOf(b.get("name"));
        if (b.get("email") != null) u.email = String.valueOf(b.get("email"));
        if (b.get("avatar") != null) u.avatar = String.valueOf(b.get("avatar"));
        users.save(u); return users.view(u);
    }
    @PutMapping("/me/settings") Map<String, Object> settings(@RequestAttribute("uid") String uid, @RequestBody Settings s) {
        User u = users.get(uid); u.settings = s; users.save(u); return users.view(u);
    }
    @PutMapping("/me/payment") Map<String, Object> payment(@RequestAttribute("uid") String uid, @RequestBody Payment p) {
        User u = users.get(uid); u.payment = p; users.save(u); return users.view(u);
    }
    @PutMapping("/me/location") Map<String, Object> loc(@RequestAttribute("uid") String uid, @RequestBody Map<String, Double> b) {
        db.updateFirst(query(where("id").is(uid)), new Update().set("lat", b.get("lat")).set("lng", b.get("lng")), User.class);
        return Map.of("ok", true);
    }
    @PostMapping("/me/places") Map<String, Object> addPlace(@RequestAttribute("uid") String uid, @RequestBody Place p) {
        User u = users.get(uid); u.saved.add(p); users.save(u); return users.view(u);
    }
    @GetMapping("/vehicle-models") List<VehicleModel> models() { return db.findAll(VehicleModel.class); }

    @PostMapping("/me/vehicles") Map<String, Object> addVehicle(@RequestAttribute("uid") String uid, @RequestBody Map<String, Object> b) {
        User u = users.get(uid);
        VehicleModel m = db.findById(String.valueOf(b.get("modelId")), VehicleModel.class);
        if (m == null) throw new ApiEx(400, "Unknown vehicle model");
        Vehicle v = new Vehicle(); v.id = Models.id(); v.model = m.model; v.variant = m.variant; v.connector = m.connector;
        v.batteryKwh = m.batteryKwh; v.maxDcKw = m.maxDcKw; v.maxAcKw = m.maxAcKw; v.consumption = m.consumption; v.packV = m.packV;
        v.plate = b.get("plate") == null ? "" : String.valueOf(b.get("plate"));
        v.soc = b.get("soc") instanceof Number n ? n.doubleValue() : 60;
        u.vehicles.add(v); u.activeVehicleId = v.id; users.save(u); return users.view(u);
    }
    /** Telemetry / OBD push or manual edit of the vehicle. */
    @PutMapping("/me/vehicles/{vid}") Map<String, Object> editVehicle(@RequestAttribute("uid") String uid, @PathVariable String vid, @RequestBody Map<String, Object> b) {
        User u = users.get(uid);
        Vehicle v = u.vehicles.stream().filter(x -> x.id.equals(vid)).findFirst().orElseThrow(() -> new ApiEx(404, "Vehicle not found"));
        if (b.get("soc") instanceof Number n) v.soc = Math.max(0, Math.min(100, n.doubleValue()));
        if (b.get("tempC") instanceof Number n) v.tempC = n.doubleValue();
        if (b.get("health") instanceof Number n) v.health = n.intValue();
        if (b.get("plate") != null) v.plate = String.valueOf(b.get("plate"));
        users.save(u); return users.view(u);
    }
    @PutMapping("/me/vehicles/{vid}/active") Map<String, Object> activate(@RequestAttribute("uid") String uid, @PathVariable String vid) {
        User u = users.get(uid); u.activeVehicleId = vid; users.save(u); return users.view(u);
    }
    @PostMapping("/me/vehicles/{vid}/command") Map<String, Object> command(@RequestAttribute("uid") String uid, @PathVariable String vid, @RequestBody Map<String, String> b) {
        User u = users.get(uid);
        Vehicle v = u.vehicles.stream().filter(x -> x.id.equals(vid)).findFirst().orElseThrow(() -> new ApiEx(404, "Vehicle not found"));
        switch (String.valueOf(b.get("type"))) {
            case "PRECOOL" -> v.precool = !v.precool;
            case "HVAC_OFF" -> v.hvacOff = !v.hvacOff;
            case "REGEN_HIGH" -> v.regenHigh = !v.regenHigh;
            default -> throw new ApiEx(400, "Unknown command");
        }
        users.save(u); return users.view(u);
    }
    @PostMapping("/me/redeem") Map<String, Object> redeem(@RequestAttribute("uid") String uid) {
        User u = users.get(uid);
        int value = (int) (Math.floor(u.points * 0.2 / 10) * 10);
        if (value < 10) throw new ApiEx(400, "Earn at least 50 Spark points to redeem");
        u.wallet += value; u.points -= (int) (value / 0.2); users.save(u); return users.view(u);
    }
    @PostMapping("/wallet/topup") Map<String, Object> topup(@RequestAttribute("uid") String uid, @RequestBody Map<String, Number> b) {
        double a = b.get("amount").doubleValue();
        if (a < 1 || a > 50000) throw new ApiEx(400, "Amount must be between ₹1 and ₹50,000");
        User u = users.get(uid); u.wallet += a; users.save(u); return users.view(u);
    }
    @GetMapping("/notifications") List<Notification> notes(@RequestAttribute("uid") String uid) {
        return db.find(query(where("userId").is(uid)).with(Sort.by(Sort.Direction.DESC, "createdAt")).limit(30), Notification.class);
    }
    @PostMapping("/notifications/read") Map<String, Object> read(@RequestAttribute("uid") String uid) {
        db.updateMulti(query(where("userId").is(uid).and("read").is(false)), new Update().set("read", true), Notification.class);
        return Map.of("ok", true);
    }
    @GetMapping("/networks") List<String> networks() { return db.findAll(Station.class).stream().map(s -> s.network).distinct().sorted().collect(Collectors.toList()); }
}
