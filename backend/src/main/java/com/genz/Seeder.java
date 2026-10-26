package com.genz;

import com.genz.Models.*;
import java.util.*;
import org.springframework.boot.CommandLineRunner;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.stereotype.Component;

/** First-run reference data written to MongoDB (stations, places, corridors, vehicle catalogue...). The UI reads everything from the API. */
@Component
class Seeder implements CommandLineRunner {
    final MongoTemplate db; final Cfg cfg; final Random r = new Random(7);
    Seeder(MongoTemplate d, Cfg c) { db = d; cfg = c; }

    static final Map<String, String> AMEN = Map.of("cafe", "Third Wave Coffee", "restaurant", "Star Veg Restaurant", "restroom", "Sanitized Restroom",
            "shopping", "Convenience Mart", "hotel", "Highway Inn", "atm", "ATM", "wifi", "Free Wi-Fi", "parking", "Valet Parking", "security", "24x7 Security");
    static final String[] CARS = {"Tata Nexon EV Max", "MG ZS EV", "Hyundai Ioniq 5", "Mahindra XUV400", "BYD Atto 3", "Kia EV6"};

    @Override public void run(String... args) {
        if (!cfg.seed) return;
        if (db.count(new Query(), Station.class) == 0) stations();
        if (db.count(new Query(), PlaceDoc.class) == 0) places();
        if (db.count(new Query(), VehicleModel.class) == 0) models();
        if (db.count(new Query(), ReviewTag.class) == 0) tags();
        if (db.count(new Query(), Fact.class) == 0) facts();
        if (db.count(new Query(), Helpline.class) == 0) helplines();
        if (db.count(new Query(), Perk.class) == 0) perks();
    }

    void st(String id, String name, String net, String area, String addr, double lat, double lng, double tariff, double off, int safety, boolean toll, String amen, String bays) {
        Station s = new Station();
        s.id = id; s.name = name; s.network = net; s.area = area; s.address = addr; s.landmark = addr; s.lat = lat; s.lng = lng; s.tariff = tariff; s.offPeakTariff = off; s.toll = toll;
        s.rating = Math.round((4.0 + r.nextDouble() * 0.8) * 10) / 10.0; s.reviewCount = 40 + r.nextInt(360); s.confidence = 85 + r.nextInt(14); s.verified = r.nextInt(5) != 0;
        for (String a : amen.split(",")) s.amenities.add(new Amenity(a, AMEN.get(a), 20 + r.nextInt(180)));
        s.safety.score = safety; s.safety.lighting = safety >= 85; s.safety.cctv = true; s.safety.guard = amen.contains("security"); s.safety.sos = safety >= 88;
        s.safety.audit = "Audited by Bangalore EV Alliance";
        int n = 1;
        for (String g : bays.split(",")) {
            String[] p = g.split(":");
            for (int i = 0; i < Integer.parseInt(p[2]); i++) {
                Bay b = new Bay(); b.number = n++; b.powerKw = Double.parseDouble(p[0]); b.connector = p[1];
                b.label = (b.powerKw >= 100 ? "Hypercharger" : b.powerKw >= 50 ? "Rapid Dispenser" : "Destination Charger") + " Gun " + (char) ('A' + b.number - 1);
                if (r.nextInt(100) < 38) { b.status = r.nextBoolean() ? "CHARGING" : "OCCUPIED"; b.vehicle = CARS[r.nextInt(CARS.length)]; b.soc = 15 + r.nextInt(60); b.minutesLeft = 6 + r.nextInt(35); }
                s.bays.add(b);
            }
        }
        db.save(s);
    }

    void stations() {
        st("stn_koramangala", "Zeon FastHub – Koramangala Apex", "Zeon", "Koramangala", "Near Sony World Junction, 80ft Road", 12.9352, 77.6245, 18, 15, 94, false, "cafe,restroom,parking,wifi,security", "120:CCS2:2,60:CCS2:2,22:TYPE2:2");
        st("stn_mgroad", "Jio-bp Pulse – MG Road", "Jio-bp", "MG Road", "MG Road Metro Parking", 12.9756, 77.6068, 21, 17, 88, false, "restaurant,shopping,restroom,parking,security", "150:CCS2:2,60:CCS2:2");
        st("stn_indiranagar", "Bolt.earth – Indiranagar 100ft Road", "Bolt.earth", "Indiranagar", "100ft Road, Indiranagar", 12.9784, 77.6408, 16, 14, 82, false, "parking,wifi", "60:CCS2:2,30:CCS2:1,22:TYPE2:1");
        st("stn_whitefield", "Tata Power EZ – Whitefield", "Tata Power", "Whitefield", "ITPL Main Road", 12.9698, 77.7500, 19, 16, 90, false, "cafe,restroom,atm,parking,security", "60:CCS2:3,22:TYPE2:2");
        st("stn_ecity", "Zeon FastHub – Electronic City", "Zeon", "Electronic City", "Phase 1, Hosur Road", 12.8452, 77.6602, 18, 15, 91, false, "cafe,restaurant,restroom,wifi,security", "120:CCS2:3,60:CCS2:1");
        st("stn_hebbal", "Jio-bp Pulse – Hebbal", "Jio-bp", "Hebbal", "Outer Ring Road, Hebbal", 13.0358, 77.5970, 20, 17, 86, false, "restaurant,restroom,parking", "150:CCS2:2,50:CCS2:2");
        st("stn_jayanagar", "Zeon Hub – Jayanagar", "Zeon", "Jayanagar", "4th Block Complex", 12.9250, 77.5938, 17, 14, 89, false, "cafe,restroom,atm,security,wifi", "60:CCS2:2,22:TYPE2:2");
        st("stn_krpuram", "Tata Power EZ – KR Puram", "Tata Power", "KR Puram", "Old Madras Road", 13.0007, 77.6960, 18, 15, 80, false, "parking,restroom", "50:CCS2:2,22:TYPE2:2");
        st("stn_hosur", "Zeon FastHub – Hosur Gateway", "Zeon", "Hosur", "NH 44, Hosur", 12.7409, 77.8253, 18, 15, 87, true, "cafe,restroom,parking,wifi", "120:CCS2:2,60:CCS2:2");
        st("stn_hosur2", "Relux Electric Park – Hosur", "Relux", "Hosur", "Bagalur Road, Hosur", 12.7200, 77.8700, 20, 16, 78, false, "restroom", "50:CCS2:2");
        st("stn_shoolagiri", "Jio-bp Pulse – Shoolagiri", "Jio-bp", "Shoolagiri", "Shoolagiri Bypass, NH 44", 12.6580, 78.0100, 21, 17, 88, false, "restaurant,restroom,shopping,parking", "60:CCS2:3");
        st("stn_krishnagiri", "Zeon FastHub – Krishnagiri Toll Plaza", "Zeon", "Krishnagiri", "NH 44 toll plaza exit", 12.5186, 78.2137, 18, 15, 96, true, "cafe,restroom,wifi,security,restaurant,parking", "120:CCS2:3,60:CCS2:3");
        st("stn_vaniyambadi", "Relux Electric Hub – Vaniyambadi", "Relux", "Vaniyambadi", "Vaniyambadi Bypass", 12.6820, 78.6200, 20, 16, 76, false, "restroom", "60:CCS2:2");
        st("stn_ambur", "Tata Power EZ – Ambur", "Tata Power", "Ambur", "NH 48, Ambur", 12.7916, 78.7160, 19, 16, 84, false, "restaurant,restroom,parking,atm", "60:CCS2:2");
        st("stn_vellore", "Zeon FastHub – Vellore Fort", "Zeon", "Vellore", "Katpadi Road", 12.9165, 79.1325, 18, 15, 92, false, "cafe,restroom,wifi,shopping,hotel,security", "120:CCS2:2,60:CCS2:2");
        st("stn_ranipet", "Jio-bp Pulse – Ranipet", "Jio-bp", "Ranipet", "NH 48, Ranipet", 12.9308, 79.3333, 21, 17, 86, false, "restaurant,restroom,parking", "60:CCS2:2");
        st("stn_sriperumbudur", "Zeon FastHub – Sriperumbudur", "Zeon", "Sriperumbudur", "NH 48, Sriperumbudur", 12.9675, 79.9419, 18, 15, 93, false, "cafe,restroom,hotel,wifi,security", "120:CCS2:3,22:TYPE2:1");
        st("stn_poonamallee", "Bolt.earth – Poonamallee", "Bolt.earth", "Poonamallee", "Poonamallee High Road", 13.0480, 80.0940, 17, 14, 85, false, "parking,restroom", "30:CCS2:2");
        st("stn_tnagar", "Zeon Hub – T. Nagar Chennai", "Zeon", "T. Nagar", "Usman Road", 13.0418, 80.2341, 18, 15, 90, false, "cafe,restroom,shopping,wifi", "120:CCS2:2,60:CCS2:2");
        st("stn_ramanagara", "Zeon Hub – Ramanagara", "Zeon", "Ramanagara", "Bengaluru–Mysuru Expressway", 12.7157, 77.2810, 18, 15, 88, false, "cafe,restroom,parking", "60:CCS2:2");
        st("stn_mandya", "Jio-bp Pulse – Mandya", "Jio-bp", "Mandya", "Mandya Bypass", 12.5218, 76.8951, 20, 17, 84, false, "restaurant,restroom", "60:CCS2:2");
        st("stn_mysuru", "Zeon FastHub – Mysuru Palace Road", "Zeon", "Mysuru", "Near Mysore Palace", 12.3052, 76.6552, 18, 15, 92, false, "cafe,restroom,hotel,wifi,security", "120:CCS2:2,22:TYPE2:2");
        List<List<Double>> blrMaa = new ArrayList<>();
        for (double[] p : new double[][]{{12.9716, 77.5946}, {12.7409, 77.8253}, {12.5186, 78.2137}, {12.7916, 78.7160}, {12.9165, 79.1325}, {12.9308, 79.3333}, {12.9675, 79.9419}, {13.0827, 80.2707}})
            blrMaa.add(List.of(p[0], p[1]));
        List<List<Double>> blrMys = new ArrayList<>();
        for (double[] p : new double[][]{{12.9716, 77.5946}, {12.7157, 77.2810}, {12.5218, 76.8951}, {12.2958, 76.6394}}) blrMys.add(List.of(p[0], p[1]));
        corridor("Bengaluru – Chennai (NH 48)", blrMaa); corridor("Bengaluru – Mysuru (Expressway)", blrMys);
    }
    void corridor(String name, List<List<Double>> pts) { Corridor c = new Corridor(); c.id = Models.id(); c.name = name; c.points = pts; db.save(c); }

    void place(String name, String state, String landmark, double lat, double lng, boolean quick) {
        PlaceDoc p = new PlaceDoc(); p.id = Models.id(); p.name = name; p.state = state; p.landmark = landmark; p.lat = lat; p.lng = lng; p.quick = quick; db.save(p);
    }
    void places() {
        place("Bengaluru", "Karnataka", "Vidhana Soudha", 12.9716, 77.5946, false);
        place("Chennai", "Tamil Nadu", "Marina Beach Promenade", 13.0827, 80.2707, false);
        place("Mysuru", "Karnataka", "Mysore Palace", 12.2958, 76.6394, false);
        place("Krishnagiri", "Tamil Nadu", "Krishnagiri Dam", 12.5186, 78.2137, false);
        place("Vellore", "Tamil Nadu", "Vellore Fort", 12.9165, 79.1325, false);
        place("Hosur", "Tamil Nadu", "Hosur Bus Stand", 12.7409, 77.8253, false);
        place("Koramangala", "Karnataka", "Sony World Junction", 12.9352, 77.6245, false);
        place("Indiranagar", "Karnataka", "100ft Road", 12.9784, 77.6408, true);
        place("Kempegowda Airport", "Karnataka", "BLR Terminal 1", 13.1986, 77.7066, true);
        place("Phoenix Marketcity", "Karnataka", "Whitefield", 12.9959, 77.6960, true);
        place("Electronic City", "Karnataka", "Phase 1", 12.8452, 77.6602, true);
    }
    void model(String id, String model, String variant, double kwh, double dc, double ac, double cons, int v) {
        VehicleModel m = new VehicleModel(); m.id = id; m.model = model; m.variant = variant; m.connector = "CCS2"; m.batteryKwh = kwh; m.maxDcKw = dc; m.maxAcKw = ac; m.consumption = cons; m.packV = v; db.save(m);
    }
    void models() {
        model("nexon-max", "Tata Nexon EV Max", "XZ+ Lux", 40.5, 50, 7.2, 15.5, 400);
        model("punch-ev", "Tata Punch EV", "Empowered LR", 35, 50, 7.2, 14.5, 400);
        model("zs-ev", "MG ZS EV", "Exclusive Plus", 50.3, 76, 7.4, 16.5, 400);
        model("xuv400", "Mahindra XUV400", "EL Pro", 39.4, 50, 7.2, 15.0, 400);
        model("atto3", "BYD Atto 3", "Superior", 60.5, 88, 7.0, 16.0, 400);
        model("ioniq5", "Hyundai Ioniq 5", "Long Range", 72.6, 220, 11, 17.0, 800);
        model("ev6", "Kia EV6", "GT Line AWD", 77.4, 233, 11, 17.5, 800);
    }
    void tag(String label, boolean pos) { ReviewTag t = new ReviewTag(); t.id = Models.id(); t.label = label; t.positive = pos; db.save(t); }
    void tags() {
        for (String s : new String[]{"Flawless Charger", "Zero Wait Time", "Ultra-Fast Speed", "Clean Restroom", "Safe & Well-Lit", "Helpful Guard", "Working Screen", "AutoPay Seamless"}) tag(s, true);
        for (String s : new String[]{"Slow Charging", "Long Queue", "Dirty Restroom", "Poorly Lit", "Connector Issue"}) tag(s, false);
    }
    void facts() {
        for (String t : new String[]{"Regenerative braking can win back a meaningful share of the energy you spend while driving.",
                "EVs usually charge fastest between about 10% and 50% battery; the last 20% is much slower.",
                "Pre-conditioning the battery before a fast-charge stop can shorten charging time.",
                "Driving a little slower on highways can extend EV range noticeably.",
                "CCS2 is the common DC fast-charging connector for cars sold in India."}) { Fact f = new Fact(); f.id = Models.id(); f.text = t; db.save(f); }
    }
    void helplines() {
        Helpline h = new Helpline(); h.id = Models.id(); h.name = "Bangalore EV Alliance Helpline"; h.detail = "Immediate flatbed towing or mobile power bank";
        h.phone = "REPLACE-WITH-PARTNER-NUMBER"; h.etaMin = 12; h.services = List.of("Flatbed Tow", "Mobile Fast Rescue"); db.save(h);
        Helpline e = new Helpline(); e.id = Models.id(); e.name = "National Emergency"; e.detail = "Police, fire and ambulance"; e.phone = "112"; e.etaMin = 0; e.services = List.of(); db.save(e);
    }
    void perks() {
        String[][] p = {{"Early Spark badge", "Welcome to the GEN_Z network", "0"}, {"15-min complimentary charger hold", "Hold a bay for free once a month", "1000"},
                {"Priority queue boost", "Move up one place in busy queues", "2000"}, {"Free reservations", "Zero reservation fee for a month", "3500"}};
        for (String[] x : p) { Perk k = new Perk(); k.id = Models.id(); k.title = x[0]; k.detail = x[1]; k.xpRequired = Integer.parseInt(x[2]); db.save(k); }
    }
}
