package com.genz;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class Cfg {
    @Value("${genz.jwt-secret}") public String jwtSecret;
    @Value("${genz.dev-otp}") public boolean devOtp;
    @Value("${genz.device-key}") public String deviceKey;
    @Value("${genz.python-url}") public String pythonUrl;
    @Value("${genz.gemini-key:}") public String geminiKey;
    @Value("${genz.gemini-model}") public String geminiModel;
    @Value("${genz.simulator.enabled}") public boolean simulator;
    @Value("${genz.simulator.time-scale}") public double timeScale;
    @Value("${genz.cors-origin}") public String corsOrigin;
    @Value("${genz.seed}") public boolean seed;
    @Value("${genz.welcome-balance}") public double welcome;
    @Value("${genz.hold-seconds}") public int holdSeconds;
    @Value("${genz.reservation-minutes}") public int reserveMinutes;
}
