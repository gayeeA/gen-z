package com.genz;

import static org.springframework.data.mongodb.core.query.Criteria.where;
import static org.springframework.data.mongodb.core.query.Query.query;

import com.genz.Models.*;
import java.time.Duration;
import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.bind.annotation.*;

@Service
class SessionService {
    final MongoTemplate db; final StationService ss; final Users users; final Live live; final Cfg cfg; final Notifier nt;
    SessionService(MongoTemplate d, StationService s, Users u, Live l, Cfg c, Notifier n) { db = d; ss = s; users = u; live = l; cfg = c; nt = n; }

    static double taper(double s) { return s < 50 ? 1 : s < 80 ? 1 - 0.45 * (s - 50) / 30 : 0.55 - 0.40 * (Math.min(s, 100) - 80) / 20; }
    double elapsedMin(Session x) { return Duration.between(x.startAt, x.endAt != null ? x.endAt : Instant.now()).toMillis() / 60000.0 * cfg.timeScale; }

    Session active(String uid) { return db.findOne(query(where("userId").is(uid).and("status").is("ACTIVE")), Session.class); }

    Session start(String uid, String stationId, Integer bayNo, Integer target) {
        User u = users.get(uid); Vehicle v = users.needVehicle(u); Station s = ss.get(stationId);
        if (s.offline) throw new ApiEx(409, "Station is offline");
        if (active(uid) != null) throw new ApiEx(409, "You already have an active charging session");
        Bay b = null;
        if (bayNo != null) b = s.bays.stream().filter(x -> x.number == bayNo).findFirst().orElse(null);
        else {
            b = s.bays.stream().filter(x -> uid.equals(x.holdBy) && "RESERVED".equals(x.status)).findFirst().orElse(null);
            if (b == null) b = s.bays.stream().filter(x -> "AVAILABLE".equals(x.status) && StationService.compat(x, v))
                    .max(Comparator.comparingDouble(x -> StationService.power(x, v))).orElse(null);
        }
        if (b == null || !StationService.compat(b, v)) throw new ApiEx(409, "No compatible bay is free right now");
        boolean mine = "RESERVED".equals(b.status) && uid.equals(b.holdBy);
        if (!"AVAILABLE".equals(b.status) && !mine) throw new ApiEx(409, "Bay #" + b.number + " is not available");
        b.status = "CHARGING"; b.holdBy = uid; b.vehicle = v.model; b.soc = (int) v.soc; b.minutesLeft = 30;
        ss.save(s);
        for (Booking bk : db.find(query(where("userId").is(uid).and("stationId").is(stationId).and("status").is("ACTIVE")), Booking.class)) {
            bk.status = "COMPLETED"; db.save(bk); u.wallet += bk.fee;     // hold fee is refunded when you plug in
        }
        Session x = new Session();
        x.id = Models.id(); x.userId = uid; x.stationId = s.id; x.stationName = s.name; x.network = s.network; x.bay = b.number; x.connector = b.connector;
        x.powerKw = StationService.power(b, v); x.tariff = StationService.tariffNow(s); x.startSoc = v.soc; x.endSoc = v.soc;
        x.targetSoc = Math.max(v.soc + 1, target != null ? target : u.settings.limitPct); x.batteryKwh = v.batteryKwh; x.consumption = v.consumption;
        x.vehicleModel = v.model; x.peakKw = Math.round(x.powerKw * taper(v.soc) * 10) / 10.0;
        db.save(x); users.save(u);
        live.all("STATION_UPDATE", Map.of("stationId", s.id));
        return x;
    }

    /** Charging simulation: taper curve integrated in 15 s steps; time is scaled by genz.simulator.time-scale. */
    Map<String, Object> state(Session x) {
        double soc = x.startSoc, energy = 0, t = 0, el = elapsedMin(x), step = 0.25;
        while (t < el && soc < x.targetSoc) { double p = x.powerKw * taper(soc); double de = p * step / 60; energy += de; soc += de / x.batteryKwh * 100; t += step; }
        soc = Math.min(soc, x.targetSoc);
        double s2 = soc, t2 = 0, m80 = -1;
        while (s2 < x.targetSoc && t2 < 400) { s2 += x.powerKw * taper(s2) * step / 60 / x.batteryKwh * 100; t2 += step; if (m80 < 0 && s2 >= 80) m80 = t2; }
        boolean done = soc >= x.targetSoc - 1e-6;
        double pw = done ? 0 : x.powerKw * taper(soc);
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", x.id); m.put("stationId", x.stationId); m.put("stationName", x.stationName); m.put("network", x.network); m.put("bay", x.bay);
        m.put("status", x.status); m.put("soc", Math.round(soc * 10) / 10.0); m.put("targetSoc", x.targetSoc); m.put("powerKw", Math.round(pw * 10) / 10.0);
        m.put("advertisedKw", x.powerKw); m.put("energyKwh", Math.round(energy * 100) / 100.0); m.put("cost", Math.round(energy * x.tariff * 100) / 100.0);
        m.put("tariff", x.tariff); m.put("minsToTarget", Math.round(t2)); m.put("minsTo80", soc >= 80 ? 0 : Math.round(m80 < 0 ? t2 : m80));
        m.put("rateKwhPerMin", Math.round(pw / 60 * 100) / 100.0); m.put("addedRangeKm", Math.round(energy / x.consumption * 1000) / 10.0);
        m.put("totalRangeKm", Math.round(soc / 100 * x.batteryKwh / x.consumption * 1000) / 10.0);
        m.put("tempC", Math.round((26 + pw * 0.09) * 10) / 10.0); m.put("elapsedMin", Math.round(el)); m.put("done", done);
        m.put("startSoc", x.startSoc);
        return m;
    }

    Map<String, Object> live(Session x) {
        Map<String, Object> m = state(x);
        User u = users.get(x.userId);
        m.put("wallet", Math.round(u.wallet * 100) / 100.0); m.put("autopay", u.payment.autopay);
        Station s = db.findById(x.stationId, Station.class);
        if (s != null) s.amenities.stream().filter(a -> a.type.equals("cafe")).findFirst().ifPresent(a -> m.put("cafe", a));
        return m;
    }

    Session finish(Session x) {
        Map<String, Object> st = state(x);
        x.status = "DONE"; x.endAt = Instant.now(); x.energy = ((Number) st.get("energyKwh")).doubleValue(); x.cost = ((Number) st.get("cost")).doubleValue();
        x.endSoc = ((Number) st.get("soc")).doubleValue();
        User u = users.get(x.userId);
        if (u.payment.autopay && u.wallet >= x.cost) { u.wallet -= x.cost; x.payment = "PAID"; } else x.payment = "PENDING";
        u.points += (int) x.energy; u.xp += 20 + (int) x.energy; u.streak++;
        Vehicle v = users.vehicle(u);
        if (v != null) v.soc = x.endSoc;
        users.save(u); db.save(x);
        Station s = db.findById(x.stationId, Station.class);
        if (s != null) {
            for (Bay b : s.bays) if (b.number == x.bay && x.userId.equals(b.holdBy)) { b.status = "AVAILABLE"; b.holdBy = null; b.vehicle = null; b.minutesLeft = 0; }
            ss.save(s); live.all("STATION_UPDATE", Map.of("stationId", s.id));
        }
        nt.send(x.userId, "Charging complete", String.format("%.1f kWh added at %s · ₹%.2f %s", x.energy, x.stationName, x.cost, x.payment.equals("PAID") ? "paid via AutoPay" : "payment pending"), "SESSION");
        live.toUser(x.userId, "SESSION_DONE", Map.of("id", x.id));
        return x;
    }

    void pushAll() {
        for (Session x : db.find(query(where("status").is("ACTIVE")), Session.class)) {
            if ((Boolean) state(x).get("done")) { finish(x); continue; }
            live.toUser(x.userId, "SESSION_UPDATE", live(x));
        }
    }
}

@RestController @RequestMapping("/api/sessions")
class SessionController {
    final SessionService sv; final MongoTemplate db;
    SessionController(SessionService s, MongoTemplate d) { sv = s; db = d; }

    @PostMapping("/start") Map<String, Object> start(@RequestAttribute("uid") String uid, @RequestBody Map<String, Object> b) {
        Session x = sv.start(uid, String.valueOf(b.get("stationId")), b.get("bayNumber") instanceof Number n ? n.intValue() : null,
                b.get("targetPct") instanceof Number n ? n.intValue() : null);
        return sv.live(x);
    }
    @GetMapping("/active") Map<String, Object> active(@RequestAttribute("uid") String uid) {
        Session x = sv.active(uid); Map<String, Object> m = new HashMap<>(); m.put("session", x == null ? null : sv.live(x)); return m;
    }
    @PostMapping("/{id}/stop") Session stop(@RequestAttribute("uid") String uid, @PathVariable String id) { return sv.finish(own(uid, id)); }
    @PostMapping("/{id}/boost") Map<String, Object> boost(@RequestAttribute("uid") String uid, @PathVariable String id) {
        Session x = own(uid, id); x.targetSoc = 100; db.save(x); return sv.live(x);
    }
    @GetMapping("/{id}/invoice") Map<String, Object> invoice(@RequestAttribute("uid") String uid, @PathVariable String id) {
        Session x = own(uid, id); Map<String, Object> m = new LinkedHashMap<>();
        m.put("invoiceNo", "GZ-" + x.id.toUpperCase()); m.put("session", x); m.put("durationMin", Duration.between(x.startAt, x.endAt == null ? Instant.now() : x.endAt).toMinutes());
        m.put("gst", Math.round(x.cost * 0.18 / 1.18 * 100) / 100.0); m.put("customer", db.findById(uid, User.class).name);
        return m;
    }
    Session own(String uid, String id) { Session x = db.findById(id, Session.class); if (x == null || !x.userId.equals(uid)) throw new ApiEx(404, "Session not found"); return x; }
}

@Service
class BookingService {
    final MongoTemplate db; final StationService ss; final Users users; final Cfg cfg; final Live live; final Notifier nt;
    BookingService(MongoTemplate d, StationService s, Users u, Cfg c, Live l, Notifier n) { db = d; ss = s; users = u; cfg = c; live = l; nt = n; }

    Booking reserve(String uid, String stationId, Integer bayNo, Integer minutes, String kind, Integer feeOverride) {
        User u = users.get(uid);
        if (u.reserveBlockedUntil != null && u.reserveBlockedUntil.isAfter(Instant.now()))
            throw new ApiEx(403, "Reservations are paused after repeated no-shows until " + u.reserveBlockedUntil);
        Vehicle v = users.needVehicle(u); Station s = ss.get(stationId);
        if (s.offline) throw new ApiEx(409, "Station is offline");
        if ("RESERVATION".equals(kind) && db.exists(query(where("userId").is(uid).and("status").is("ACTIVE").and("kind").is("RESERVATION")), Booking.class))
            throw new ApiEx(409, "You already hold a reserved bay. Cancel it first.");
        Bay b = bayNo != null ? s.bays.stream().filter(x -> x.number == bayNo).findFirst().orElse(null)
                : s.bays.stream().filter(x -> "AVAILABLE".equals(x.status) && StationService.compat(x, v)).max(Comparator.comparingDouble(x -> StationService.power(x, v))).orElse(null);
        if (b == null || !"AVAILABLE".equals(b.status) || !StationService.compat(b, v)) throw new ApiEx(409, "No compatible bay is free. Join the smart queue instead.");
        int fee = feeOverride != null ? feeOverride : s.reservationFee;
        if (u.wallet < fee) throw new ApiEx(402, "Wallet balance is below the ₹" + fee + " reservation fee. Top up in Profile.");
        u.wallet -= fee; b.status = "RESERVED"; b.holdBy = uid; ss.save(s);
        Booking bk = new Booking(); bk.id = Models.id(); bk.userId = uid; bk.stationId = s.id; bk.stationName = s.name; bk.bay = b.number; bk.fee = fee; bk.kind = kind;
        bk.expiresAt = Instant.now().plusSeconds((minutes != null ? minutes : cfg.reserveMinutes) * 60L);
        db.save(bk); users.save(u);
        live.all("STATION_UPDATE", Map.of("stationId", s.id));
        return bk;
    }
    void release(Booking bk, String status) {
        bk.status = status; db.save(bk);
        Station s = db.findById(bk.stationId, Station.class);
        if (s != null) {
            for (Bay b : s.bays) if (b.number == bk.bay && bk.userId.equals(b.holdBy) && "RESERVED".equals(b.status)) { b.status = "AVAILABLE"; b.holdBy = null; }
            ss.save(s); live.all("STATION_UPDATE", Map.of("stationId", s.id));
        }
    }
    void cancel(String uid, String id) {
        Booking bk = db.findById(id, Booking.class);
        if (bk == null || !bk.userId.equals(uid) || !"ACTIVE".equals(bk.status)) throw new ApiEx(404, "Booking not found");
        release(bk, "CANCELLED");
    }
    /** Grace period over: automatic cancellation, next user gets the bay, fair-use penalty applies to normal reservations. */
    void expire() {
        for (Booking bk : db.find(query(where("status").is("ACTIVE").and("expiresAt").lt(Instant.now())), Booking.class)) {
            release(bk, "EXPIRED");
            if ("RESERVATION".equals(bk.kind)) penalise(bk.userId, "Reservation at " + bk.stationName + " expired (no-show)");
        }
    }
    void penalise(String uid, String why) {
        User u = users.get(uid);
        u.noShows++; u.reliability = Math.max(0, u.reliability - 5); u.streak = 0;
        String extra = "";
        if (u.noShows % 3 == 0) { u.reserveBlockedUntil = Instant.now().plusSeconds(86400); extra = " Reservations are paused for 24 hours."; }
        else extra = " Warning " + (u.noShows % 3) + " of 3.";
        users.save(u); nt.send(uid, "No-show recorded", why + "." + extra, "PENALTY");
    }
}

@Service
class QueueService {
    final MongoTemplate db; final StationService ss; final Users users; final SessionService sessions; final BookingService bookings;
    final Cfg cfg; final Live live; final Notifier nt;
    QueueService(MongoTemplate d, StationService s, Users u, SessionService se, BookingService b, Cfg c, Live l, Notifier n) {
        db = d; ss = s; users = u; sessions = se; bookings = b; cfg = c; live = l; nt = n;
    }
    QueueEntry active(String uid) { return db.findOne(query(where("userId").is(uid).and("status").in("WAITING", "HOLD")), QueueEntry.class); }
    List<QueueEntry> line(String stationId) {
        return db.find(query(where("stationId").is(stationId).and("status").in("WAITING", "HOLD")).with(Sort.by("joinedAt")), QueueEntry.class);
    }
    QueueEntry join(String uid, String stationId) {
        if (active(uid) != null) throw new ApiEx(409, "You are already in a queue. Leave it first.");
        User u = users.get(uid); Vehicle v = users.needVehicle(u); Station s = ss.get(stationId);
        if (s.offline) throw new ApiEx(409, "Station is offline");
        if (s.bays.stream().noneMatch(b -> StationService.compat(b, v))) throw new ApiEx(409, "This station has no connector compatible with your EV");
        QueueEntry e = new QueueEntry(); e.id = Models.id(); e.userId = uid; e.userName = u.name; e.vehicleModel = v.model; e.stationId = stationId;
        e.token = (int) db.count(query(where("stationId").is(stationId)), QueueEntry.class) + 1;
        db.save(e); tick(); live.all("QUEUE_UPDATE", Map.of("stationId", stationId));
        return e;
    }
    void leave(String uid, String id) {
        QueueEntry e = own(uid, id);
        if ("HOLD".equals(e.status)) freeBay(e);
        e.status = "CANCELLED"; db.save(e); tick(); live.all("QUEUE_UPDATE", Map.of("stationId", e.stationId));
    }
    void freeBay(QueueEntry e) {
        Station s = db.findById(e.stationId, Station.class);
        if (s == null) return;
        for (Bay b : s.bays) if (b.number == e.assignedBay && e.userId.equals(b.holdBy) && "RESERVED".equals(b.status)) { b.status = "AVAILABLE"; b.holdBy = null; }
        ss.save(s);
    }
    Map<String, Object> arrive(String uid, String id) {
        QueueEntry e = own(uid, id);
        if (!"HOLD".equals(e.status)) throw new ApiEx(409, "Your bay is not ready yet");
        Session x = sessions.start(uid, e.stationId, e.assignedBay, null);
        e.status = "DONE"; db.save(e);
        return sessions.live(x);
    }
    QueueEntry own(String uid, String id) { QueueEntry e = db.findById(id, QueueEntry.class); if (e == null || !e.userId.equals(uid)) throw new ApiEx(404, "Queue entry not found"); return e; }

    /** Assign free bays to the head of each queue; expire holds that were not claimed in time (no-show). */
    void tick() {
        Instant now = Instant.now();
        for (QueueEntry e : db.find(query(where("status").is("HOLD").and("holdExpiresAt").lt(now)), QueueEntry.class)) {
            freeBay(e); e.status = "EXPIRED"; db.save(e);
            bookings.penalise(e.userId, "Bay hold at your queue stop expired");
            live.toUser(e.userId, "QUEUE_UPDATE", Map.of("stationId", e.stationId));
        }
        Set<String> stationIds = db.find(query(where("status").is("WAITING")), QueueEntry.class).stream().map(x -> x.stationId).collect(Collectors.toSet());
        for (String sid : stationIds) {
            Station s = db.findById(sid, Station.class);
            if (s == null || s.offline) continue;
            for (QueueEntry e : line(sid)) {
                if (!"WAITING".equals(e.status)) continue;
                User u = users.get(e.userId); Vehicle v = users.vehicle(u);
                Bay b = s.bays.stream().filter(x -> "AVAILABLE".equals(x.status) && StationService.compat(x, v)).max(Comparator.comparingDouble(x -> StationService.power(x, v))).orElse(null);
                if (b == null) continue;
                b.status = "RESERVED"; b.holdBy = e.userId; ss.save(s);
                e.status = "HOLD"; e.assignedBay = b.number; e.holdExpiresAt = now.plusSeconds(cfg.holdSeconds); db.save(e);
                nt.send(e.userId, "Bay #" + b.number + " is ready", "Arrive at " + s.name + " within " + cfg.holdSeconds / 60 + " min to keep your slot.", "QUEUE");
                live.toUser(e.userId, "QUEUE_BAY_FREE", Map.of("stationId", sid, "bay", b.number));
            }
        }
    }

    Map<String, Object> view(String uid) {
        QueueEntry e = active(uid);
        Map<String, Object> r = new LinkedHashMap<>();
        if (e == null) { r.put("active", null); return r; }
        User u = users.get(uid); Vehicle v = users.vehicle(u); Station s = ss.get(e.stationId);
        List<QueueEntry> line = line(e.stationId);
        int idx = 0; for (int i = 0; i < line.size(); i++) if (line.get(i).id.equals(e.id)) idx = i;
        boolean hold = "HOLD".equals(e.status);
        int wait = hold ? 0 : StationService.estWait(s, v, idx);
        r.put("active", e); r.put("station", ss.view(s, v, null, null)); r.put("position", idx + 1); r.put("ahead", idx);
        r.put("waitMin", wait); r.put("readyAt", Instant.now().plusSeconds(wait * 60L));
        r.put("holdSecondsLeft", hold ? Math.max(0, Duration.between(Instant.now(), e.holdExpiresAt).getSeconds()) : null);
        r.put("holdWindowSeconds", cfg.holdSeconds); r.put("assignedBay", hold ? e.assignedBay : null);
        List<Map<String, Object>> bays = new ArrayList<>();
        Bay soonest = s.bays.stream().filter(b -> StationService.compat(b, v) && !"FAULT".equals(b.status)).min(Comparator.comparingInt(b -> "AVAILABLE".equals(b.status) ? 0 : b.minutesLeft)).orElse(null);
        for (Bay b : s.bays) {
            if (!StationService.compat(b, v)) continue;
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("number", b.number); m.put("status", b.status); m.put("powerKw", b.powerKw); m.put("vehicle", b.vehicle); m.put("soc", b.soc); m.put("minutesLeft", b.minutesLeft);
            m.put("assignedToYou", hold ? b.number == e.assignedBay : b == soonest);
            bays.add(m);
        }
        r.put("bays", bays);
        List<Map<String, Object>> prog = new ArrayList<>();
        for (int i = 0; i < line.size(); i++) {
            QueueEntry q = line.get(i); Map<String, Object> m = new LinkedHashMap<>();
            m.put("token", q.token); m.put("vehicle", q.vehicleModel); m.put("status", q.status); m.put("you", q.id.equals(e.id));
            m.put("etaMin", "HOLD".equals(q.status) ? 0 : StationService.estWait(s, v, i)); prog.add(m);
        }
        r.put("progression", prog);
        s.amenities.stream().filter(a -> a.type.equals("cafe")).findFirst().ifPresent(a -> r.put("cafe", a));
        Map<String, Object> swap = null; double best = 15;
        for (Station o : db.findAll(Station.class)) {
            if (o.id.equals(s.id) || o.offline) continue;
            Map<String, Object> ov = ss.view(o, v, s.lat, s.lng);
            double d = (Double) ov.get("distanceKm");
            if ((Boolean) ov.get("compatible") && (Integer) ov.get("freeBays") > 0 && d < best) {
                best = d; swap = new LinkedHashMap<>(); swap.put("id", o.id); swap.put("name", o.name); swap.put("distanceKm", d); swap.put("waitMin", 0);
            }
        }
        r.put("swap", swap);
        return r;
    }
}

@RestController @RequestMapping("/api")
class QueueController {
    final QueueService qs; final BookingService bs; final MongoTemplate db;
    QueueController(QueueService q, BookingService b, MongoTemplate d) { qs = q; bs = b; db = d; }

    @PostMapping("/stations/{id}/queue") Map<String, Object> join(@RequestAttribute("uid") String uid, @PathVariable String id) { qs.join(uid, id); return qs.view(uid); }
    @GetMapping("/queue/active") Map<String, Object> active(@RequestAttribute("uid") String uid) { return qs.view(uid); }
    @DeleteMapping("/queue/{id}") Map<String, Object> leave(@RequestAttribute("uid") String uid, @PathVariable String id) { qs.leave(uid, id); return Map.of("ok", true); }
    @PostMapping("/queue/{id}/arrive") Map<String, Object> arrive(@RequestAttribute("uid") String uid, @PathVariable String id) { return qs.arrive(uid, id); }
    @PostMapping("/queue/{id}/notify") Map<String, Object> notifyMe(@RequestAttribute("uid") String uid, @PathVariable String id) {
        QueueEntry e = qs.own(uid, id); e.notify = true; db.save(e); return Map.of("ok", true);
    }
    @PostMapping("/queue/{id}/preorder") Map<String, Object> preorder(@RequestAttribute("uid") String uid, @PathVariable String id) {
        QueueEntry e = qs.own(uid, id); e.preorder = true; db.save(e); return Map.of("ok", true);
    }
    @PostMapping("/queue/{id}/swap") Map<String, Object> swap(@RequestAttribute("uid") String uid, @PathVariable String id, @RequestBody Map<String, String> b) {
        qs.leave(uid, id); qs.join(uid, b.get("stationId")); return qs.view(uid);
    }
    @PostMapping("/stations/{id}/reserve") Booking reserve(@RequestAttribute("uid") String uid, @PathVariable String id, @RequestBody(required = false) Map<String, Object> b) {
        Integer bay = b != null && b.get("bayNumber") instanceof Number n ? n.intValue() : null;
        Integer min = b != null && b.get("minutes") instanceof Number n ? n.intValue() : null;
        return bs.reserve(uid, id, bay, min, "RESERVATION", null);
    }
    @GetMapping("/bookings") List<Booking> bookings(@RequestAttribute("uid") String uid) {
        return db.find(query(where("userId").is(uid).and("status").is("ACTIVE")).with(Sort.by(Sort.Direction.DESC, "createdAt")), Booking.class);
    }
    @DeleteMapping("/bookings/{id}") Map<String, Object> cancel(@RequestAttribute("uid") String uid, @PathVariable String id) { bs.cancel(uid, id); return Map.of("ok", true); }
}
