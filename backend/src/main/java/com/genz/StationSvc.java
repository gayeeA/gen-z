package com.genz;

import static org.springframework.data.mongodb.core.query.Criteria.where;
import static org.springframework.data.mongodb.core.query.Query.query;

import com.genz.Models.*;
import java.time.Duration;
import java.time.Instant;
import java.util.*;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.bind.annotation.*;

@Service
class StationService {
    final MongoTemplate db; final Py py; final Users users;
    StationService(MongoTemplate d, Py p, Users u) { db = d; py = p; users = u; }

    Station get(String id) { Station s = db.findById(id, Station.class); if (s == null) throw new ApiEx(404, "Station not found"); return s; }
    void save(Station s) { s.updatedAt = Instant.now(); db.save(s); }

    static boolean compat(Bay b, Vehicle v) { return v == null || b.connector.equals(v.connector) || ("TYPE2".equals(b.connector) && v.maxAcKw > 0); }
    static double power(Bay b, Vehicle v) {
        if (v == null) return b.powerKw;
        return "TYPE2".equals(b.connector) ? Math.min(b.powerKw, v.maxAcKw) : Math.min(b.powerKw, v.maxDcKw);
    }
    static double tariffNow(Station s) {
        int h = U.hourIst();
        boolean off = s.offPeakTariff > 0 && (s.offPeakFrom > s.offPeakTo ? (h >= s.offPeakFrom || h < s.offPeakTo) : (h >= s.offPeakFrom && h < s.offPeakTo));
        return off ? s.offPeakTariff : s.tariff;
    }
    static int estWait(Station s, Vehicle v, int ahead) {
        List<Integer> t = new ArrayList<>();
        for (Bay b : s.bays) {
            if (!compat(b, v) || "FAULT".equals(b.status)) continue;
            t.add(switch (b.status) { case "AVAILABLE" -> 0; case "RESERVED" -> 10; default -> Math.max(1, b.minutesLeft); });
        }
        if (t.isEmpty() || s.offline) return 999;
        Collections.sort(t);
        return t.get(ahead % t.size()) + (ahead / t.size()) * 25;
    }
    int queueLen(String stationId) { return (int) db.count(query(where("stationId").is(stationId).and("status").in("WAITING", "HOLD")), QueueEntry.class); }

    static Map<String, Object> bayMap(Bay b, boolean mine) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("number", b.number); m.put("label", b.label); m.put("connector", b.connector); m.put("status", b.status); m.put("vehicle", b.vehicle);
        m.put("powerKw", b.powerKw); m.put("minutesLeft", b.minutesLeft); m.put("soc", b.soc); m.put("mine", mine);
        return m;
    }

    Map<String, Object> view(Station s, Vehicle v, Double lat, Double lng) {
        Map<String, Object> m = new LinkedHashMap<>();
        List<Bay> cb = s.bays.stream().filter(b -> compat(b, v)).collect(Collectors.toList());
        int free = (int) cb.stream().filter(b -> "AVAILABLE".equals(b.status)).count(), total = cb.size();
        double maxKw = cb.stream().mapToDouble(b -> power(b, v)).max().orElse(0);
        String status = s.offline ? "OFFLINE" : free == 0 ? "OCCUPIED" : (free == 1 || free * 4 <= total) ? "LIMITED" : "AVAILABLE";
        int q = queueLen(s.id);
        long age = Duration.between(s.updatedAt, Instant.now()).toMinutes();
        m.put("id", s.id); m.put("name", s.name); m.put("network", s.network); m.put("address", s.address); m.put("area", s.area);
        m.put("landmark", s.landmark); m.put("lat", s.lat); m.put("lng", s.lng); m.put("hours", s.hours); m.put("imageUrl", s.imageUrl);
        m.put("rating", s.rating); m.put("reviewCount", s.reviewCount); m.put("tariff", tariffNow(s)); m.put("baseTariff", s.tariff);
        m.put("offPeakTariff", s.offPeakTariff); m.put("offPeakFrom", s.offPeakFrom); m.put("offPeakTo", s.offPeakTo);
        m.put("confidence", s.confidence); m.put("minutesAgo", age);
        m.put("confidenceLabel", age > 360 ? "STALE" : s.verified ? "VERIFIED" : "COMMUNITY");
        m.put("maxKw", maxKw); m.put("totalBays", total); m.put("freeBays", free); m.put("status", status);
        m.put("offline", s.offline); m.put("toll", s.toll); m.put("compatible", !cb.isEmpty());
        m.put("queue", q); m.put("waitMin", estWait(s, v, q));
        m.put("connector", cb.isEmpty() ? null : cb.get(0).connector);
        m.put("connectors", s.bays.stream().map(b -> b.connector).distinct().collect(Collectors.toList()));
        m.put("amenities", s.amenities); m.put("amenityTypes", s.amenities.stream().map(a -> a.type).distinct().collect(Collectors.toList()));
        m.put("amenityNames", s.amenities.stream().map(a -> a.name).collect(Collectors.toList()));
        m.put("safety", s.safety); m.put("safetyScore", s.safety.score); m.put("bays", s.bays.stream().map(b -> bayMap(b, false)).collect(Collectors.toList())); m.put("reservationFee", s.reservationFee);
        if (lat != null && lng != null) {
            double d = Math.round(U.km(lat, lng, s.lat, s.lng) * 10) / 10.0;
            m.put("distanceKm", d); m.put("driveMin", Math.max(1, Math.round(d * 1.3 / 35 * 60)));
        }
        if (v != null && maxKw > 0) {
            double from = Math.min(v.soc, 79), energy = (80 - from) / 100 * v.batteryKwh;
            m.put("estCostTo80", Math.round(energy * tariffNow(s)));
            m.put("estChargeMin", Math.round(energy / (maxKw * 0.78) * 60));
        }
        return m;
    }

    @SuppressWarnings("unchecked")
    Map<String, Object> nearby(User u, Double lat, Double lng, double radius, String amenities, double minKw, String q, String sort, int limit, boolean all, String pref) {
        Vehicle v = users.vehicle(u);
        double la = lat != null ? lat : u.lat, lo = lng != null ? lng : u.lng;
        Set<String> want = amenities == null || amenities.isBlank() ? Set.of() : new HashSet<>(Arrays.asList(amenities.split(",")));
        String needle = q == null ? "" : q.toLowerCase();
        List<Map<String, Object>> vs = new ArrayList<>();
        for (Station s : db.findAll(Station.class)) {
            Map<String, Object> m = view(s, v, la, lo);
            if (!all && !(Boolean) m.get("compatible")) continue;
            if ((Double) m.get("distanceKm") > radius) continue;
            if (minKw > 0 && (Double) m.get("maxKw") < minKw) continue;
            if (!((List<String>) m.get("amenityTypes")).containsAll(want)) continue;
            if (!needle.isEmpty() && !(s.name + " " + s.area + " " + s.address + " " + s.network).toLowerCase().contains(needle)) continue;
            vs.add(m);
        }
        String aiPick = null, rankError = null;
        if (!vs.isEmpty() && v != null) {
            try {
                Map<String, Object> body = new HashMap<>();
                body.put("vehicle", Users.vdict(v)); body.put("stations", vs); body.put("hour", U.hourIst());
                body.put("preference", pref); body.put("amenities", want);
                Map<String, Map<String, Object>> byId = new HashMap<>();
                for (Map<String, Object> r : (List<Map<String, Object>>) py.post("/rank", body).get("ranked")) byId.put((String) r.get("id"), r);
                for (Map<String, Object> m : vs) {
                    Map<String, Object> r = byId.get(m.get("id"));
                    if (r == null) continue;
                    m.put("score", r.get("score")); m.put("reasons", r.get("reasons")); m.put("aiPick", r.get("aiPick"));
                    if (Boolean.TRUE.equals(r.get("aiPick"))) aiPick = (String) m.get("id");
                }
            } catch (ApiEx e) { rankError = e.getMessage(); }
        }
        Comparator<Map<String, Object>> cmp = switch (sort) {
            case "distance" -> Comparator.comparingDouble(m -> (Double) m.get("distanceKm"));
            case "price" -> Comparator.comparingDouble(m -> (Double) m.get("tariff"));
            case "power" -> Comparator.comparingDouble((Map<String, Object> m) -> -(Double) m.get("maxKw"));
            default -> Comparator.comparingDouble((Map<String, Object> m) -> -U.num(m, "score")).thenComparingDouble(m -> (Double) m.get("distanceKm"));
        };
        vs.sort(cmp);
        Map<String, Object> out = new HashMap<>();
        out.put("stations", vs.size() > limit ? vs.subList(0, limit) : vs); out.put("aiPickId", aiPick); out.put("rankError", rankError);
        out.put("center", Map.of("lat", la, "lng", lo));
        return out;
    }
}

@RestController @RequestMapping("/api")
class StationController {
    final StationService ss; final Users users; final MongoTemplate db;
    StationController(StationService s, Users u, MongoTemplate d) { ss = s; users = u; db = d; }

    @GetMapping("/stations/nearby")
    Map<String, Object> nearby(@RequestAttribute("uid") String uid, @RequestParam(required = false) Double lat, @RequestParam(required = false) Double lng,
                               @RequestParam(defaultValue = "40") double radiusKm, @RequestParam(required = false) String amenities,
                               @RequestParam(defaultValue = "0") double minKw, @RequestParam(required = false) String q,
                               @RequestParam(defaultValue = "score") String sort, @RequestParam(defaultValue = "30") int limit,
                               @RequestParam(defaultValue = "false") boolean all, @RequestParam(defaultValue = "BALANCED") String pref) {
        return ss.nearby(users.get(uid), lat, lng, radiusKm, amenities, minKw, q, sort, limit, all, pref);
    }

    @GetMapping("/stations/{id}")
    Map<String, Object> one(@RequestAttribute("uid") String uid, @PathVariable String id, @RequestParam(required = false) Double lat, @RequestParam(required = false) Double lng) {
        User u = users.get(uid);
        Station st = ss.get(id);
        Map<String, Object> m = ss.view(st, users.vehicle(u), lat != null ? lat : u.lat, lng != null ? lng : u.lng);
        m.put("bays", st.bays.stream().map(b -> StationService.bayMap(b, uid.equals(b.holdBy))).collect(Collectors.toList()));
        Review r = db.findOne(query(where("stationId").is(id)).with(Sort.by(Sort.Direction.DESC, "createdAt")), Review.class);
        if (r != null && r.comment != null && !r.comment.isBlank()) {
            Map<String, Object> l = new HashMap<>(); l.put("userName", r.userName); l.put("comment", r.comment); l.put("createdAt", r.createdAt); l.put("rating", r.rating);
            m.put("latestReview", l);
        }
        return m;
    }

    @GetMapping("/stations/{id}/reviews")
    List<Review> reviews(@PathVariable String id) {
        return db.find(query(where("stationId").is(id)).with(Sort.by(Sort.Direction.DESC, "createdAt")).limit(30), Review.class);
    }
}

@RestController @RequestMapping("/api")
class ReviewController {
    final MongoTemplate db; final Users users; final StationService ss; final Notifier nt;
    ReviewController(MongoTemplate d, Users u, StationService s, Notifier n) { db = d; users = u; ss = s; nt = n; }

    @GetMapping("/reviews/tags") List<ReviewTag> tags() { return db.findAll(ReviewTag.class); }

    @GetMapping("/reviews/pending") Map<String, Object> pending(@RequestAttribute("uid") String uid) {
        Session s = db.findOne(query(where("userId").is(uid).and("status").is("DONE").and("reviewed").is(false)).with(Sort.by(Sort.Direction.DESC, "endAt")), Session.class);
        Map<String, Object> r = new HashMap<>();
        if (s == null) { r.put("session", null); return r; }
        User u = users.get(uid);
        r.put("session", s); r.put("station", ss.view(ss.get(s.stationId), users.vehicle(u), null, null));
        r.put("durationMin", Duration.between(s.startAt, s.endAt).toMinutes());
        return r;
    }

    @PostMapping("/reviews") @SuppressWarnings("unchecked")
    Map<String, Object> submit(@RequestAttribute("uid") String uid, @RequestBody Map<String, Object> b) {
        Session s = db.findById(String.valueOf(b.get("sessionId")), Session.class);
        if (s == null || !s.userId.equals(uid)) throw new ApiEx(404, "Session not found");
        if (s.reviewed) throw new ApiEx(409, "Already reviewed");
        int rating = ((Number) b.get("rating")).intValue();
        if (rating < 1 || rating > 5) throw new ApiEx(400, "Pick 1-5 stars");
        User u = users.get(uid);
        Review r = new Review(); r.id = Models.id(); r.userId = uid; r.userName = u.name; r.stationId = s.stationId; r.sessionId = s.id; r.rating = rating;
        r.tags = b.get("tags") == null ? new ArrayList<>() : (List<String>) b.get("tags");
        r.photos = b.get("photos") == null ? new ArrayList<>() : (List<String>) b.get("photos");
        r.comment = b.get("comment") == null ? "" : String.valueOf(b.get("comment"));
        r.latchOk = !Boolean.FALSE.equals(b.get("latchOk")); r.bayClear = !Boolean.FALSE.equals(b.get("bayClear")); r.peakKw = s.peakKw;
        db.save(r);
        s.reviewed = true; db.save(s);
        Station st = ss.get(s.stationId);
        st.rating = Math.round((st.rating * st.reviewCount + rating) / (st.reviewCount + 1) * 100) / 100.0; st.reviewCount++;
        st.confidence = Math.min(99, st.confidence + 1);
        ss.save(st);
        int pts = 100 + (r.photos.isEmpty() ? 0 : 50);
        u.points += pts; u.xp += 30; users.save(u);
        nt.send(uid, "Review verified", "+" + pts + " Spark points for helping other drivers.", "REVIEW");
        return Map.of("pointsAwarded", pts);
    }
}

@RestController @RequestMapping("/api/public")
class PublicController {
    final MongoTemplate db; final Py py; final Cfg cfg;
    PublicController(MongoTemplate d, Py p, Cfg c) { db = d; py = p; cfg = c; }

    @GetMapping("/stats") Map<String, Object> stats() {
        List<Station> all = db.findAll(Station.class);
        Map<String, Object> m = new HashMap<>();
        m.put("stations", all.size()); m.put("chargers", all.stream().mapToInt(s -> s.bays.size()).sum());
        m.put("rating", Math.round(all.stream().mapToDouble(s -> s.rating).average().orElse(0) * 10) / 10.0);
        m.put("networks", all.stream().map(s -> s.network).distinct().count());
        return m;
    }
    @GetMapping("/places") List<Map<String, Object>> places(@RequestParam(required = false) String q, @RequestParam(defaultValue = "false") boolean quick,
                                                           @RequestParam(required = false) Double lat, @RequestParam(required = false) Double lng) {
        org.springframework.data.mongodb.core.query.Query qq = new org.springframework.data.mongodb.core.query.Query().limit(15);
        if (q != null && !q.isBlank()) qq.addCriteria(where("name").regex(Pattern.quote(q.trim()), "i"));
        if (quick) qq.addCriteria(where("quick").is(true));
        List<Map<String, Object>> out = new ArrayList<>();
        for (PlaceDoc p : db.find(qq, PlaceDoc.class)) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", p.id); m.put("name", p.name); m.put("state", p.state); m.put("landmark", p.landmark); m.put("lat", p.lat); m.put("lng", p.lng);
            if (lat != null && lng != null) m.put("distanceKm", Math.round(U.km(lat, lng, p.lat, p.lng)));
            out.add(m);
        }
        return out;
    }
    @GetMapping("/places/nearest") Map<String, Object> nearest(@RequestParam double lat, @RequestParam double lng) {
        PlaceDoc best = null; double bd = 1e9;
        for (PlaceDoc p : db.findAll(PlaceDoc.class)) { double d = U.km(lat, lng, p.lat, p.lng); if (d < bd) { bd = d; best = p; } }
        Map<String, Object> m = new HashMap<>();
        if (best != null) { m.put("name", best.name); m.put("state", best.state); m.put("landmark", best.landmark); }
        return m;
    }
    @GetMapping("/helplines") List<Helpline> helplines() { return db.findAll(Helpline.class); }
    @GetMapping("/fact") Map<String, Object> fact() {
        List<Fact> fs = db.findAll(Fact.class);
        return Map.of("text", fs.isEmpty() ? "" : fs.get(new Random().nextInt(fs.size())).text);
    }
}
