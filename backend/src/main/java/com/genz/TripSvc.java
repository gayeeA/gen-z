package com.genz;

import static org.springframework.data.mongodb.core.query.Criteria.where;
import static org.springframework.data.mongodb.core.query.Query.query;

import com.genz.Models.*;
import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.bind.annotation.*;

@Service
class TripService {
    final MongoTemplate db; final StationService ss; final Users users; final Py py; final BookingService bookings; final Live live; final Notifier nt;
    TripService(MongoTemplate d, StationService s, Users u, Py p, BookingService b, Live l, Notifier n) { db = d; ss = s; users = u; py = p; bookings = b; live = l; nt = n; }

    static boolean near(Map<String, Object> p, List<Double> c) { return U.km(U.num(p, "lat"), U.num(p, "lng"), c.get(0), c.get(1)) <= 40; }

    /** Finds a stored highway corridor between origin and destination; falls back to a straight line. */
    List<List<Double>> corridor(Map<String, Object> from, Map<String, Object> to) {
        for (Corridor c : db.findAll(Corridor.class)) {
            List<List<Double>> p = c.points;
            if (near(from, p.get(0)) && near(to, p.get(p.size() - 1))) return p;
            if (near(from, p.get(p.size() - 1)) && near(to, p.get(0))) { List<List<Double>> r = new ArrayList<>(p); Collections.reverse(r); return r; }
        }
        return null;
    }

    @SuppressWarnings("unchecked")
    Trip plan(String uid, Map<String, Object> req, boolean persist, String forceFirst) {
        User u = users.get(uid); Vehicle v = users.needVehicle(u);
        Map<String, Object> from = (Map<String, Object>) req.get("from"), to = (Map<String, Object>) req.get("to");
        if (from == null || to == null) throw new ApiEx(400, "Choose a start and a destination");
        double soc = req.get("socPct") instanceof Number n ? n.doubleValue() : v.soc;
        List<List<Double>> route = corridor(from, to);
        Map<String, Object> vd = Users.vdict(v); vd.put("soc", soc);
        List<Map<String, Object>> sts = new ArrayList<>();
        for (Station s : db.findAll(Station.class)) { Map<String, Object> m = ss.view(s, v, null, null); if ((Boolean) m.get("compatible")) sts.add(m); }
        Map<String, Object> body = new HashMap<>();
        body.put("vehicle", vd); body.put("origin", Map.of("lat", U.num(from, "lat"), "lng", U.num(from, "lng")));
        body.put("dest", Map.of("lat", U.num(to, "lat"), "lng", U.num(to, "lng")));
        if (route != null) { body.put("route", route); body.put("roadFactor", 1.05); }
        body.put("socPct", soc); body.put("bufferPct", req.getOrDefault("bufferPct", 20)); body.put("preference", req.getOrDefault("preference", "BALANCED"));
        body.put("avoidTolls", req.getOrDefault("avoidTolls", false)); body.put("minSafety", req.getOrDefault("minSafety", 0));
        body.put("amenities", req.getOrDefault("amenities", List.of())); body.put("weights", req.get("weights"));
        body.put("limitPct", u.settings.limitPct); body.put("hour", U.hourIst()); body.put("stations", sts); body.put("forceFirst", forceFirst);
        Trip t = new Trip();
        t.userId = uid; t.from = from; t.to = to; t.req = req; t.plan = py.post("/plan", body);
        if (persist) { t.id = Models.id(); db.save(t); }
        return t;
    }

    Trip own(String uid, String id) { Trip t = db.findById(id, Trip.class); if (t == null || !t.userId.equals(uid)) throw new ApiEx(404, "Trip not found"); return t; }

    @SuppressWarnings("unchecked")
    Trip select(String uid, String id, String stationId) {
        Trip t = own(uid, id);
        Trip np = plan(uid, t.req, false, stationId);
        List<Map<String, Object>> stops = (List<Map<String, Object>>) np.plan.get("stops");
        if (stops.isEmpty()) throw new ApiEx(400, "This trip needs no charging stop");
        if (t.bookingId != null) { try { bookings.cancel(uid, t.bookingId); } catch (ApiEx ignored) {} t.bookingId = null; }
        t.plan = np.plan;
        Booking bk = bookings.reserve(uid, (String) stops.get(0).get("stationId"), null, 25, "TRIP_HOLD", null);
        t.bookingId = bk.id; db.save(t);
        return t;
    }

    String navUrl(Trip t) {
        StringBuilder sb = new StringBuilder("https://www.google.com/maps/dir/?api=1&travelmode=driving");
        sb.append("&origin=").append(t.from.get("lat")).append(",").append(t.from.get("lng"));
        sb.append("&destination=").append(t.to.get("lat")).append(",").append(t.to.get("lng"));
        @SuppressWarnings("unchecked") List<Map<String, Object>> stops = (List<Map<String, Object>>) t.plan.get("stops");
        if (stops != null && !stops.isEmpty())
            sb.append("&waypoints=").append(stops.stream().map(s -> s.get("lat") + "," + s.get("lng")).collect(Collectors.joining("%7C")));
        return sb.toString();
    }
}

@RestController @RequestMapping("/api/trips")
class TripController {
    final TripService ts; final MongoTemplate db; final Users users;
    TripController(TripService t, MongoTemplate d, Users u) { ts = t; db = d; users = u; }

    @PostMapping("/plan") Trip plan(@RequestAttribute("uid") String uid, @RequestBody Map<String, Object> req, @RequestParam(defaultValue = "false") boolean preview) {
        return ts.plan(uid, req, !preview, null);
    }
    @GetMapping List<Trip> mine(@RequestAttribute("uid") String uid) {
        return db.find(query(where("userId").is(uid)).with(Sort.by(Sort.Direction.DESC, "createdAt")).limit(30), Trip.class);
    }
    @GetMapping("/{id}") Trip one(@RequestAttribute("uid") String uid, @PathVariable String id) { return ts.own(uid, id); }
    @PostMapping("/{id}/select") Trip select(@RequestAttribute("uid") String uid, @PathVariable String id, @RequestBody Map<String, String> b) { return ts.select(uid, id, b.get("stationId")); }
    @PostMapping("/{id}/start") Map<String, Object> start(@RequestAttribute("uid") String uid, @PathVariable String id) {
        Trip t = ts.own(uid, id); t.status = "ACTIVE"; t.startedAt = Instant.now(); db.save(t);
        return Map.of("trip", t, "navUrl", ts.navUrl(t));
    }
    @PostMapping("/{id}/position") Map<String, Object> pos(@RequestAttribute("uid") String uid, @PathVariable String id, @RequestBody Map<String, Double> b) {
        Trip t = ts.own(uid, id); t.lastLat = b.get("lat"); t.lastLng = b.get("lng"); db.save(t); return Map.of("ok", true);
    }
    @PostMapping("/{id}/complete") Trip complete(@RequestAttribute("uid") String uid, @PathVariable String id) {
        Trip t = ts.own(uid, id); t.status = "DONE"; db.save(t); return t;
    }
    @PostMapping("/{id}/replan") Trip replan(@RequestAttribute("uid") String uid, @PathVariable String id) {
        Trip t = ts.own(uid, id); Map<String, Object> req = new HashMap<>(t.req); req.remove("socPct");
        return ts.plan(uid, req, true, null);
    }
}

@Service
class FailsafeService {
    final MongoTemplate db; final StationService ss; final Users users; final Py py; final Live live; final Notifier nt; final BookingService bookings;
    FailsafeService(MongoTemplate d, StationService s, Users u, Py p, Live l, Notifier n, BookingService b) { db = d; ss = s; users = u; py = p; live = l; nt = n; bookings = b; }

    /** Station went offline: cancel holds there (refund) and build a reroute alert for every active trip that was going to charge there. */
    @SuppressWarnings("unchecked")
    void onStationFault(Station s, String reason) {
        for (Booking bk : db.find(query(where("stationId").is(s.id).and("status").is("ACTIVE")), Booking.class)) {
            bookings.release(bk, "CANCELLED");
            User u = users.get(bk.userId); u.wallet += bk.fee; users.save(u);
            nt.send(bk.userId, "Reservation cancelled", s.name + " went offline. Your ₹" + bk.fee + " fee was refunded.", "FAULT");
        }
        for (QueueEntry e : db.find(query(where("stationId").is(s.id).and("status").in("WAITING", "HOLD")), QueueEntry.class)) {
            e.status = "CANCELLED"; db.save(e);
            nt.send(e.userId, "Queue cancelled", s.name + " went offline. Swap to another hub from the Map.", "FAULT");
            live.toUser(e.userId, "QUEUE_UPDATE", Map.of("stationId", s.id));
        }
        for (Trip t : db.find(query(where("status").is("ACTIVE")), Trip.class)) {
            List<Map<String, Object>> stops = (List<Map<String, Object>>) t.plan.get("stops");
            if (stops == null || stops.stream().noneMatch(x -> s.id.equals(x.get("stationId")))) continue;
            User u = users.get(t.userId); Vehicle v = users.vehicle(u);
            List<Map<String, Object>> sts = new ArrayList<>();
            for (Station o : db.findAll(Station.class)) { Map<String, Object> m = ss.view(o, v, null, null); if ((Boolean) m.get("compatible")) sts.add(m); }
            Map<String, Object> body = new HashMap<>();
            body.put("plan", t.plan); body.put("vehicle", Users.vdict(v)); body.put("faultedId", s.id); body.put("route", t.plan.get("route"));
            body.put("roadFactor", t.plan.get("roadFactor")); body.put("stations", sts); body.put("hour", U.hourIst()); body.put("limitPct", u.settings.limitPct);
            if (t.lastLat != null) { body.put("lat", t.lastLat); body.put("lng", t.lastLng); }
            Alert a = new Alert();
            a.id = Models.id(); a.userId = t.userId; a.tripId = t.id; a.stationId = s.id; a.stationName = s.name; a.reason = reason;
            a.reroute = py.post("/reroute", body); a.expiresAt = Instant.now().plusSeconds(30);
            db.save(a);
            nt.send(t.userId, "Station offline: rerouting", s.name + " reported a fault. Review the backup before auto-accept.", "FAILSAFE");
            live.toUser(t.userId, "FAILSAFE_ALERT", a);
        }
    }

    @SuppressWarnings("unchecked")
    Alert accept(String uid, String id) { return accept(uid, id, null); }

    @SuppressWarnings("unchecked")
    Alert accept(String uid, String id, String altId) {
        Alert a = db.findById(id, Alert.class);
        if (a == null || !a.userId.equals(uid)) throw new ApiEx(404, "Alert not found");
        if (!"PENDING".equals(a.status)) return a;
        Map<String, Object> backup = a.reroute == null ? null : (Map<String, Object>) a.reroute.get("backup");
        if (altId != null && a.reroute != null) {
            for (Map<String, Object> alt : (List<Map<String, Object>>) a.reroute.getOrDefault("alternatives", List.of()))
                if (altId.equals(alt.get("stationId"))) {
                    backup = alt; Map<String, Object> orig = (Map<String, Object>) a.reroute.get("original");
                    a.reroute.put("deltaMin", (int) (U.num(alt, "stopMin") - (orig == null ? 0 : U.num(orig, "stopMin"))));
                    a.reroute.put("detourKm", alt.get("detourKm"));
                }
        }
        if (backup == null) throw new ApiEx(409, "No safe backup station is reachable. Use Emergency mode.");
        Trip t = db.findById(a.tripId, Trip.class);
        List<Map<String, Object>> stops = (List<Map<String, Object>>) t.plan.get("stops");
        for (int i = 0; i < stops.size(); i++) if (a.stationId.equals(stops.get(i).get("stationId"))) stops.set(i, backup);
        t.plan.put("stops", stops);
        t.plan.put("totalMin", (int) (U.num(t.plan, "totalMin") + U.num(a.reroute, "deltaMin")));
        t.plan.put("arrivalSoc", a.reroute.get("arrivalBufferPct"));
        try { Booking bk = bookings.reserve(uid, (String) backup.get("stationId"), null, 25, "FAILSAFE", 0); t.bookingId = bk.id; }
        catch (ApiEx e) { nt.send(uid, "Backup bay not held", e.getMessage(), "FAILSAFE"); }
        t.status = "ACTIVE"; db.save(t);
        a.status = "ACCEPTED"; db.save(a);
        nt.send(uid, "Reroute confirmed", "Navigating to " + backup.get("name") + ".", "FAILSAFE");
        live.toUser(uid, "FAILSAFE_RESOLVED", a);
        return a;
    }

    void ignore(String uid, String id) {
        Alert a = db.findById(id, Alert.class);
        if (a == null || !a.userId.equals(uid)) throw new ApiEx(404, "Alert not found");
        a.status = "IGNORED"; db.save(a);
    }

    void autoAccept() {
        for (Alert a : db.find(query(where("status").is("PENDING").and("expiresAt").lt(Instant.now())), Alert.class)) {
            try { accept(a.userId, a.id); } catch (ApiEx e) { a.status = "EXPIRED"; db.save(a); }
        }
    }
}

@RestController @RequestMapping("/api/alerts")
class AlertController {
    final MongoTemplate db; final FailsafeService fs;
    AlertController(MongoTemplate d, FailsafeService f) { db = d; fs = f; }

    @GetMapping("/active") Map<String, Object> active(@RequestAttribute("uid") String uid) {
        Alert a = db.findOne(query(where("userId").is(uid).and("createdAt").gt(Instant.now().minusSeconds(3600))).with(Sort.by(Sort.Direction.DESC, "createdAt")), Alert.class);
        Map<String, Object> m = new HashMap<>(); m.put("alert", a);
        if (a != null) { Trip t = db.findById(a.tripId, Trip.class); m.put("route", t == null ? null : t.plan.get("route")); }
        return m;
    }
    @PostMapping("/{id}/accept") Alert accept(@RequestAttribute("uid") String uid, @PathVariable String id, @RequestBody(required = false) Map<String, String> b) {
        return fs.accept(uid, id, b == null ? null : b.get("stationId"));
    }
    @PostMapping("/{id}/ignore") Map<String, Object> ignore(@RequestAttribute("uid") String uid, @PathVariable String id) { fs.ignore(uid, id); return Map.of("ok", true); }
}
