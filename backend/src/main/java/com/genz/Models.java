package com.genz;

import java.time.Instant;
import java.util.*;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

/** All MongoDB documents. Public fields + no-arg constructors: Spring Data maps fields, Jackson serialises them. */
public final class Models {
    private Models() {}
    public static String id() { return UUID.randomUUID().toString().replace("-", "").substring(0, 12); }

    public static class Amenity { public String type, name; public int meters;
        public Amenity() {} public Amenity(String t, String n, int m) { type = t; name = n; meters = m; } }
    public static class Safety { public int score; public boolean lighting, cctv, guard, sos; public String audit; }
    public static class Bay { public int number; public String label, connector, status = "AVAILABLE", vehicle, holdBy;
        public double powerKw; public int minutesLeft, soc; }

    @Document("stations") public static class Station { @Id public String id;
        public String name, network, address, area, landmark, hours = "24/7", imageUrl;
        public double lat, lng, rating, tariff, offPeakTariff;
        public int offPeakFrom = 23, offPeakTo = 6, reviewCount, confidence = 90, reservationFee = 50;
        public boolean verified, offline, toll;
        public Instant updatedAt = Instant.now();
        public List<Amenity> amenities = new ArrayList<>();
        public Safety safety = new Safety();
        public List<Bay> bays = new ArrayList<>(); }

    public static class Vehicle { public String id, model, variant, plate, connector;
        public double batteryKwh, maxDcKw, maxAcKw, consumption, soc = 60, tempC = 29; public int health = 98, packV = 400;
        public boolean hvacOff, regenHigh, precool;
        public double getRangeKm() { return consumption <= 0 ? 0 : Math.round(soc / 100 * batteryKwh / consumption * 1000) / 10.0; } }
    public static class Settings { public boolean autoReserve = true, emergencyAutoSafe = true, chime = true, gstEmail = false, backgroundGps = true;
        public String location = "WHILE_USING"; public int limitPct = 80, emergencyThreshold = 15; public List<String> networks = new ArrayList<>(); }
    public static class Payment { public boolean autopay = true; public String bank = "", upi = ""; public double limit = 3000; }
    public static class Place { public String name, label; public double lat, lng; }

    @Document("users") public static class User { @Id public String id;
        public String phone, email, name = "Driver", avatar, role = "USER", activeVehicleId;
        public List<Vehicle> vehicles = new ArrayList<>();
        public double wallet, lat = 12.9352, lng = 77.6245;
        public int points, xp, noShows, reliability = 100, streak;
        public Instant reserveBlockedUntil, created = Instant.now();
        public Settings settings = new Settings();
        public Payment payment = new Payment();
        public List<Place> saved = new ArrayList<>(); }

    @Document("otps") public static class OtpDoc { @Id public String id; public String code; public Instant expires; public int tries; }
    @Document("places") public static class PlaceDoc { @Id public String id; public String name, state, landmark; public double lat, lng; public boolean quick; }
    @Document("corridors") public static class Corridor { @Id public String id; public String name; public List<List<Double>> points = new ArrayList<>(); }
    @Document("vehicle_models") public static class VehicleModel { @Id public String id; public String model, variant, connector;
        public double batteryKwh, maxDcKw, maxAcKw, consumption; public int packV = 400; }
    @Document("review_tags") public static class ReviewTag { @Id public String id; public String label; public boolean positive; }
    @Document("facts") public static class Fact { @Id public String id; public String text; }
    @Document("helplines") public static class Helpline { @Id public String id; public String name, phone, detail; public int etaMin; public List<String> services = new ArrayList<>(); }
    @Document("perks") public static class Perk { @Id public String id; public String title, detail; public int xpRequired; }

    @Document("bookings") public static class Booking { @Id public String id;
        public String userId, stationId, stationName, kind = "RESERVATION", status = "ACTIVE"; public int bay, fee;
        public Instant createdAt = Instant.now(), expiresAt; }
    @Document("queue") public static class QueueEntry { @Id public String id;
        public String userId, userName, vehicleModel, stationId, status = "WAITING"; public int token, assignedBay;
        public boolean notify, preorder; public Instant joinedAt = Instant.now(), holdExpiresAt; }
    @Document("sessions") public static class Session { @Id public String id;
        public String userId, stationId, stationName, network, connector, status = "ACTIVE", payment = "PENDING", vehicleModel;
        public int bay; public double powerKw, peakKw, tariff, startSoc, targetSoc, endSoc, energy, cost, batteryKwh, consumption;
        public boolean reviewed; public Instant startAt = Instant.now(), endAt; }
    @Document("reviews") public static class Review { @Id public String id;
        public String userId, userName, stationId, sessionId, comment; public int rating; public double peakKw;
        public List<String> tags = new ArrayList<>(), photos = new ArrayList<>(); public boolean latchOk = true, bayClear = true;
        public Instant createdAt = Instant.now(); }
    @Document("trips") public static class Trip { @Id public String id;
        public String userId, status = "PLANNED", bookingId; public Map<String, Object> from, to, req, plan;
        public Double lastLat, lastLng; public Instant createdAt = Instant.now(), startedAt; }
    @Document("alerts") public static class Alert { @Id public String id;
        public String userId, tripId, stationId, stationName, reason, status = "PENDING"; public Map<String, Object> reroute;
        public Instant createdAt = Instant.now(), expiresAt; }
    @Document("notifications") public static class Notification { @Id public String id;
        public String userId, title, body, type; public boolean read; public Instant createdAt = Instant.now(); }
    @Document("telemetry") public static class Telemetry { @Id public String id;
        public String stationId, status, source; public int bay; public double powerKw, voltage, current, energyKwh, tempC; public Instant ts = Instant.now(); }
    @Document("offline_tx") public static class OfflineTx { @Id public String id; public String stationId; public Map<String, Object> data; public Instant receivedAt = Instant.now(); }
}
