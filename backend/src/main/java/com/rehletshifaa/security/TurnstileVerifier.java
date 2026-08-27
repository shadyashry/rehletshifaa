package com.rehletshifaa.security;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.rehletshifaa.shared.api.ApiException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.web.client.RestClient;

@Component
public class TurnstileVerifier implements BotProtectionPort {
    private final boolean enabled; private final String secret; private final RestClient client;
    public TurnstileVerifier(@Value("${app.turnstile.enabled:false}") boolean enabled, @Value("${app.turnstile.secret:}") String secret, RestClient.Builder builder) {
        this.enabled = enabled; this.secret = secret; this.client = builder.baseUrl("https://challenges.cloudflare.com").build();
    }
    @Override public void verify(String token, String remoteIp) {
        if (!enabled) return;
        if (secret.isBlank() || token == null || token.isBlank()) throw new ApiException(400, "BOT_VERIFICATION_REQUIRED", "Bot verification is required");
        var body = new LinkedMultiValueMap<String, String>(); body.add("secret", secret); body.add("response", token); if (remoteIp != null) body.add("remoteip", remoteIp);
        try {
            Result result = client.post().uri("/turnstile/v0/siteverify").contentType(MediaType.APPLICATION_FORM_URLENCODED).body(body).retrieve().body(Result.class);
            if (result == null || !result.success()) throw new ApiException(400, "BOT_VERIFICATION_FAILED", "Bot verification failed");
        } catch (ApiException e) { throw e; } catch (Exception e) { throw new ApiException(503, "BOT_VERIFICATION_UNAVAILABLE", "Verification is temporarily unavailable"); }
    }
    private record Result(boolean success, @JsonProperty("error-codes") String[] errors) {}
}

