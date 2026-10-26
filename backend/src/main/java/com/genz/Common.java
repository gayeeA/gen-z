package com.genz;

import static org.springframework.data.mongodb.core.query.Criteria.where;
import static org.springframework.data.mongodb.core.query.Query.query;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.genz.Models.*;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import jakarta.servlet.http.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import javax.crypto.SecretKey;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.http.*;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestClient;
import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.web.servlet.config.annotation.*;
import org.springframework.web.socket.*;
import org.springframework.web.socket.config.annotation.*;
import org.springframework.web.socket.handler.TextWebSocketHandler;
import org.springframework.web.socket.server.HandshakeInterceptor;
import org.springframework.web.util.UriComponentsBuilder;

class ApiEx extends RuntimeException {
    final int status;
    ApiEx(int s, String m) { super(m); status = s; }
}

@RestControllerAdvice
class Errors {
    @ExceptionHandler(ApiEx.class) ResponseEntity<Map<String, String>> api(ApiEx e) {
        return ResponseEntity.status(e.status).body(Map.of("error", e.getMessage()));
    }
    @ExceptionHandler(Exception.class) ResponseEntity<Map<String, String>> any(Exception e) {
        e.printStackTrace();
        return ResponseEntity.status(500).body(Map.of("error", String.valueOf(e.getMessage())));
    }
}

@Component
class Jwt {
    final SecretKey key;
    Jwt(Cfg c) { key = Keys.hmacShaKeyFor(c.jwtSecret.getBytes(StandardCharsets.UTF_8)); }
    String make(User u) {
        return Jwts.builder().subject(u.id).claim("role", u.role).issuedAt(new Date())
                .expiration(new Date(System.currentTimeMillis() + 7L * 86400000)).signWith(key).compact();
    }
    Claims parse(String t) { return Jwts.parser().verifyWith(key).build().parseSignedClaims(t).getPayload(); }
}

@Component
class AuthInterceptor implements HandlerInterceptor {
    final Jwt jwt;
    AuthInterceptor(Jwt j) { jwt = j; }
    @Override public boolean preHandle(HttpServletRequest rq, HttpServletResponse rs, Object h) throws Exception {
        if (rq.getMethod().equals("OPTIONS")) return true;
        String p = rq.getRequestURI();
        if (p.startsWith("/api/auth") || p.startsWith("/api/public") || p.startsWith("/api/iot") || p.startsWith("/api/health")) return true;
        try {
            Claims c = jwt.parse(rq.getHeader("Authorization").substring(7));
            rq.setAttribute("uid", c.getSubject());
            rq.setAttribute("role", c.get("role", String.class));
            if (p.startsWith("/api/admin") && !"ADMIN".equals(c.get("role", String.class))) { rs.setStatus(403); return false; }
            return true;
        } catch (Exception e) {
            rs.setStatus(401); rs.setContentType("application/json");
            rs.getWriter().write("{\"error\":\"Unauthorized\"}");
            return false;
        }
    }
}

@Configuration
class WebConfig implements WebMvcConfigurer {
    final AuthInterceptor ai; final Cfg cfg;
    WebConfig(AuthInterceptor a, Cfg c) { ai = a; cfg = c; }
    @Override public void addInterceptors(InterceptorRegistry r) { r.addInterceptor(ai).addPathPatterns("/api/**"); }
    @Override public void addCorsMappings(CorsRegistry r) {
        r.addMapping("/api/**").allowedOriginPatterns(cfg.corsOrigin.split(",")).allowedMethods("*").allowedHeaders("*");
    }
}

/** Pushes events to connected React clients over WebSocket. */
@Component
class Live {
    final Map<String, Set<WebSocketSession>> by = new ConcurrentHashMap<>();
    final ObjectMapper om;
    Live(ObjectMapper om) { this.om = om; }
    void add(String uid, WebSocketSession s) { by.computeIfAbsent(uid, k -> ConcurrentHashMap.newKeySet()).add(s); }
    void remove(WebSocketSession s) { by.values().forEach(v -> v.remove(s)); }
    void toUser(String uid, String type, Object data) { Set<WebSocketSession> s = by.get(uid); if (s != null) send(s, type, data); }
    void all(String type, Object data) { by.values().forEach(s -> send(s, type, data)); }
    private void send(Set<WebSocketSession> sessions, String type, Object data) {
        try {
            Map<String, Object> m = new HashMap<>(); m.put("type", type); m.put("data", data);
            TextMessage tm = new TextMessage(om.writeValueAsString(m));
            for (WebSocketSession s : sessions) synchronized (s) { if (s.isOpen()) s.sendMessage(tm); }
        } catch (Exception ignored) {}
    }
}

@Component
class LiveHandler extends TextWebSocketHandler {
    final Live live;
    LiveHandler(Live l) { live = l; }
    @Override public void afterConnectionEstablished(WebSocketSession s) { live.add((String) s.getAttributes().get("uid"), s); }
    @Override public void afterConnectionClosed(WebSocketSession s, CloseStatus st) { live.remove(s); }
    @Override protected void handleTextMessage(WebSocketSession s, TextMessage m) throws Exception {
        if ("ping".equals(m.getPayload())) synchronized (s) { s.sendMessage(new TextMessage("{\"type\":\"pong\"}")); }
    }
}

/** ESP32 / IoT devices connect here: ws://host:8080/ws/iot?key=DEVICE_KEY */
@Component
class IotHandler extends TextWebSocketHandler {
    final IotService iot; final ObjectMapper om;
    IotHandler(IotService i, ObjectMapper o) { iot = i; om = o; }
    @Override @SuppressWarnings("unchecked")
    protected void handleTextMessage(WebSocketSession s, TextMessage m) throws Exception {
        Map<String, Object> reply;
        try { reply = iot.handle(om.readValue(m.getPayload(), Map.class)); }
        catch (Exception e) { reply = Map.of("ack", false, "error", String.valueOf(e.getMessage())); }
        synchronized (s) { s.sendMessage(new TextMessage(om.writeValueAsString(reply))); }
    }
}

@Configuration
@EnableWebSocket
class WsConfig implements WebSocketConfigurer {
    final LiveHandler lh; final IotHandler ih; final Jwt jwt; final Cfg cfg;
    WsConfig(LiveHandler l, IotHandler i, Jwt j, Cfg c) { lh = l; ih = i; jwt = j; cfg = c; }
    @Override public void registerWebSocketHandlers(WebSocketHandlerRegistry r) {
        r.addHandler(lh, "/ws/live").addInterceptors(new HandshakeInterceptor() {
            public boolean beforeHandshake(org.springframework.http.server.ServerHttpRequest rq, org.springframework.http.server.ServerHttpResponse rs, WebSocketHandler h, Map<String, Object> at) {
                try {
                    String t = UriComponentsBuilder.fromUri(rq.getURI()).build().getQueryParams().getFirst("token");
                    at.put("uid", jwt.parse(t).getSubject()); return true;
                } catch (Exception e) { return false; }
            }
            public void afterHandshake(org.springframework.http.server.ServerHttpRequest rq, org.springframework.http.server.ServerHttpResponse rs, WebSocketHandler h, Exception e) {}
        }).setAllowedOriginPatterns("*");
        r.addHandler(ih, "/ws/iot").addInterceptors(new HandshakeInterceptor() {
            public boolean beforeHandshake(org.springframework.http.server.ServerHttpRequest rq, org.springframework.http.server.ServerHttpResponse rs, WebSocketHandler h, Map<String, Object> at) {
                return cfg.deviceKey.equals(UriComponentsBuilder.fromUri(rq.getURI()).build().getQueryParams().getFirst("key"));
            }
            public void afterHandshake(org.springframework.http.server.ServerHttpRequest rq, org.springframework.http.server.ServerHttpResponse rs, WebSocketHandler h, Exception e) {}
        }).setAllowedOriginPatterns("*");
    }
}

/** Client for the Python optimizer service. */
@Component
class Py {
    final RestClient rc;
    Py(Cfg c) {
        SimpleClientHttpRequestFactory f = new SimpleClientHttpRequestFactory();
        f.setConnectTimeout(3000); f.setReadTimeout(20000);
        rc = RestClient.builder().baseUrl(c.pythonUrl).requestFactory(f).build();
    }
    @SuppressWarnings("unchecked")
    Map<String, Object> post(String path, Object body) {
        try { return rc.post().uri(path).contentType(MediaType.APPLICATION_JSON).body(body).retrieve().body(Map.class); }
        catch (Exception e) { throw new ApiEx(502, "Optimizer service unavailable: " + e.getMessage()); }
    }
    boolean up() { try { rc.get().uri("/health").retrieve().body(String.class); return true; } catch (Exception e) { return false; } }
}

@Component
class Notifier {
    final MongoTemplate db; final Live live;
    Notifier(MongoTemplate d, Live l) { db = d; live = l; }
    void send(String uid, String title, String body, String type) {
        Notification n = new Notification();
        n.id = Models.id(); n.userId = uid; n.title = title; n.body = body; n.type = type;
        db.save(n); live.toUser(uid, "NOTIFICATION", n);
    }
}

final class U {
    private U() {}
    static double num(Map<String, ?> m, String k) { Object o = m == null ? null : m.get(k); return o instanceof Number n ? n.doubleValue() : 0; }
    static int hourIst() { return java.time.ZonedDateTime.now(java.time.ZoneId.of("Asia/Kolkata")).getHour(); }
    static double km(double a, double b, double c, double d) {
        double p1 = Math.toRadians(a), p2 = Math.toRadians(c);
        double h = Math.pow(Math.sin((p2 - p1) / 2), 2) + Math.cos(p1) * Math.cos(p2) * Math.pow(Math.sin(Math.toRadians(d - b) / 2), 2);
        return 12742.0 * Math.asin(Math.sqrt(h));
    }
}
