package com.rehletshifaa.identity;

import com.rehletshifaa.shared.api.ApiException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.util.UriComponentsBuilder;

import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.*;

/**
 * Least-privilege Keycloak Admin API implementation of {@link PatientIdentityPort}.
 *
 * <p>Uses the same service-account client as staff provisioning ({@code manage-users}). Accounts are created
 * enabled, with the PATIENT realm role and <em>no credential</em>; Keycloak's own execute-actions email
 * carries the time-limited UPDATE_PASSWORD (+ VERIFY_EMAIL) link, so the password is created inside Keycloak
 * and this application never sees it. Provider errors are translated to neutral API errors — the patient
 * never sees identity-provider terminology.
 */
public class KeycloakPatientIdentityService implements PatientIdentityPort {
    private static final Logger log = LoggerFactory.getLogger(KeycloakPatientIdentityService.class);
    private static final List<String> SETUP_ACTIONS_UNVERIFIED = List.of("VERIFY_EMAIL", "UPDATE_PASSWORD");
    private static final List<String> SETUP_ACTIONS_VERIFIED = List.of("UPDATE_PASSWORD");
    private static final ParameterizedTypeReference<Map<String, Object>> OBJECT = new ParameterizedTypeReference<>() {};
    private static final ParameterizedTypeReference<List<Map<String, Object>>> OBJECTS = new ParameterizedTypeReference<>() {};

    private final RestClient http = RestClient.create();
    private final String baseUrl, realm, clientId, clientSecret, webClientId, webBaseUrl;
    private final int setupLifespan;

    public KeycloakPatientIdentityService(String baseUrl, String realm, String clientId, String clientSecret,
                                          String webClientId, String webBaseUrl, int setupLifespanSeconds) {
        this.baseUrl = stripSlash(baseUrl); this.realm = realm; this.clientId = clientId; this.clientSecret = clientSecret;
        this.webClientId = webClientId; this.webBaseUrl = stripSlash(webBaseUrl); this.setupLifespan = setupLifespanSeconds;
    }

    @Override public boolean available() { return !clientSecret.isBlank(); }

    @Override public Optional<IdentityUser> findByEmail(String email) {
        requireConfigured();
        URI uri = UriComponentsBuilder.fromUriString(admin("/users")).queryParam("email", email.trim().toLowerCase(Locale.ROOT))
                .queryParam("exact", true).build().encode().toUri();
        try {
            List<Map<String, Object>> found = http.get().uri(uri).header("Authorization", bearer()).retrieve().body(OBJECTS);
            return found == null ? Optional.empty() : found.stream().map(this::user).findFirst();
        } catch (RestClientResponseException e) { throw failure(e, "The account service is temporarily unavailable"); }
    }

    @Override public Optional<IdentityUser> findBySubject(String subject) {
        requireConfigured();
        try {
            Map<String, Object> user = http.get().uri(admin("/users/" + encode(subject))).header("Authorization", bearer()).retrieve().body(OBJECT);
            return user == null ? Optional.empty() : Optional.of(user(user));
        } catch (RestClientResponseException e) {
            if (e.getStatusCode().value() == 404) return Optional.empty();
            throw failure(e, "The account service is temporarily unavailable");
        }
    }

    @Override public String provisionPatient(String email, String givenName, String familyName, String locale, boolean emailVerified) {
        requireConfigured();
        String normalized = email.trim().toLowerCase(Locale.ROOT);
        Map<String, Object> user = new LinkedHashMap<>();
        user.put("username", normalized); user.put("email", normalized);
        user.put("firstName", givenName == null ? "" : givenName.trim());
        user.put("lastName", familyName == null ? "" : familyName.trim());
        user.put("enabled", true); user.put("emailVerified", emailVerified);
        user.put("requiredActions", emailVerified ? SETUP_ACTIONS_VERIFIED : SETUP_ACTIONS_UNVERIFIED);
        user.put("attributes", Map.of("locale", List.of("ar".equals(locale) ? "ar" : "en")));
        try {
            ResponseEntity<Void> response = http.post().uri(admin("/users")).header("Authorization", bearer())
                    .contentType(MediaType.APPLICATION_JSON).body(user).retrieve().toBodilessEntity();
            String subject = subjectFrom(response.getHeaders().getLocation());
            try { ensurePatientRole(subject); }
            catch (RuntimeException roleFailure) { deleteQuietly(subject); throw roleFailure; }
            return subject;
        } catch (RestClientResponseException e) {
            // 409 here means a concurrent creation for the same address; the caller re-resolves by email.
            throw failure(e, e.getStatusCode().value() == 409 ? "This email address is already in use" : "The account could not be created right now");
        }
    }

    @Override public void sendAccountSetup(String subject, String locale, String redirectPath) {
        requireConfigured();
        IdentityUser user = findBySubject(subject).orElseThrow(() -> new ApiException(409, "ACCOUNT_NOT_FOUND", "The account could not be found"));
        List<String> actions = user.emailVerified() ? SETUP_ACTIONS_VERIFIED : SETUP_ACTIONS_UNVERIFIED;
        String lang = "ar".equals(locale) ? "ar" : "en";
        URI uri = UriComponentsBuilder.fromUriString(admin("/users/" + encode(subject) + "/execute-actions-email"))
                .queryParam("client_id", webClientId)
                .queryParam("redirect_uri", webBaseUrl + (redirectPath == null || redirectPath.isBlank() ? "/" + lang + "/portal" : redirectPath))
                .queryParam("lifespan", setupLifespan).build().encode().toUri();
        try {
            // Keep the account's locale in step so Keycloak renders the setup email and pages in the patient's language.
            updateUser(subject, raw -> raw.put("attributes", withLocale(raw.get("attributes"), lang)));
            http.put().uri(uri).header("Authorization", bearer()).contentType(MediaType.APPLICATION_JSON).body(actions).retrieve().toBodilessEntity();
        } catch (RestClientResponseException e) { throw failure(e, "The account setup email could not be sent right now"); }
    }

    @Override public void syncProfile(String subject, String givenName, String familyName, String locale) {
        requireConfigured();
        try {
            updateUser(subject, raw -> {
                if (givenName != null) raw.put("firstName", givenName.trim());
                if (familyName != null) raw.put("lastName", familyName.trim());
                raw.put("attributes", withLocale(raw.get("attributes"), "ar".equals(locale) ? "ar" : "en"));
            });
        } catch (RestClientResponseException e) { log.warn("Identity profile sync failed for subject {}: {}", subject, e.getStatusCode()); }
    }

    // ---- internals ----
    private IdentityUser user(Map<String, Object> raw) {
        Object actions = raw.get("requiredActions");
        List<String> required = actions instanceof Collection<?> c ? c.stream().map(String::valueOf).toList() : List.of();
        return new IdentityUser(String.valueOf(raw.get("id")), raw.get("email") == null ? null : String.valueOf(raw.get("email")),
                Boolean.TRUE.equals(raw.get("emailVerified")), !Boolean.FALSE.equals(raw.get("enabled")), required);
    }

    /**
     * The realm's default role grants PATIENT to every new user, and reading the effective mappings only needs
     * {@code view-users}. Assigning explicitly (which needs {@code view-realm}) is attempted only when the default
     * did not apply, so a least-privilege service account still provisions correctly.
     */
    private void ensurePatientRole(String subject) {
        if (hasRealmRole(subject, "PATIENT")) return;
        try {
            Map<String, Object> role = http.get().uri(admin("/roles/PATIENT")).header("Authorization", bearer()).retrieve().body(OBJECT);
            http.post().uri(admin("/users/" + encode(subject) + "/role-mappings/realm")).header("Authorization", bearer())
                    .contentType(MediaType.APPLICATION_JSON).body(List.of(role)).retrieve().toBodilessEntity();
        } catch (RestClientResponseException e) {
            if (!hasRealmRole(subject, "PATIENT")) throw e;
        }
    }

    private boolean hasRealmRole(String subject, String name) {
        try {
            List<Map<String, Object>> roles = http.get().uri(admin("/users/" + encode(subject) + "/role-mappings/realm/composite"))
                    .header("Authorization", bearer()).retrieve().body(OBJECTS);
            return roles != null && roles.stream().anyMatch(r -> name.equals(r.get("name")));
        } catch (RestClientResponseException e) { return false; }
    }

    /**
     * Keycloak's user PUT is a whole-representation replace: a partial body silently clears email, names and
     * attributes. Always read, modify, then write the full representation.
     */
    private void updateUser(String subject, java.util.function.Consumer<Map<String, Object>> change) {
        Map<String, Object> raw = http.get().uri(admin("/users/" + encode(subject))).header("Authorization", bearer()).retrieve().body(OBJECT);
        if (raw == null) throw new ApiException(409, "ACCOUNT_NOT_FOUND", "The account could not be found");
        Map<String, Object> full = new LinkedHashMap<>(raw);
        change.accept(full);
        http.put().uri(admin("/users/" + encode(subject))).header("Authorization", bearer()).contentType(MediaType.APPLICATION_JSON).body(full).retrieve().toBodilessEntity();
    }
    @SuppressWarnings("unchecked")
    private static Map<String, Object> withLocale(Object attributes, String lang) {
        Map<String, Object> merged = attributes instanceof Map<?, ?> m ? new LinkedHashMap<>((Map<String, Object>) m) : new LinkedHashMap<>();
        merged.put("locale", List.of(lang));
        return merged;
    }

    private String bearer() {
        var form = new LinkedMultiValueMap<String, String>();
        form.add("grant_type", "client_credentials"); form.add("client_id", clientId); form.add("client_secret", clientSecret);
        try {
            Map<String, Object> token = http.post().uri(baseUrl + "/realms/" + encode(realm) + "/protocol/openid-connect/token")
                    .contentType(MediaType.APPLICATION_FORM_URLENCODED).body(form).retrieve().body(OBJECT);
            return "Bearer " + Objects.requireNonNull(token).get("access_token");
        } catch (RestClientResponseException e) { throw failure(e, "The account service is temporarily unavailable"); }
    }
    private void deleteQuietly(String subject) {
        try { http.method(HttpMethod.DELETE).uri(admin("/users/" + encode(subject))).header("Authorization", bearer()).retrieve().toBodilessEntity(); }
        catch (Exception ignored) { /* best effort rollback of a half-created account */ }
    }
    private String admin(String path) { return baseUrl + "/admin/realms/" + encode(realm) + path; }
    private void requireConfigured() { if (!available()) throw new ApiException(503, "IDENTITY_ADMIN_NOT_CONFIGURED", "Account setup is not available in this environment"); }
    private ApiException failure(RestClientResponseException e, String message) {
        log.warn("Identity provider call failed: HTTP {} {}", e.getStatusCode().value(), e.getStatusText());
        return new ApiException(e.getStatusCode().value() == 409 ? 409 : 502, "IDENTITY_PROVIDER_ERROR", message);
    }
    private static String subjectFrom(URI location) {
        if (location == null) throw new ApiException(502, "IDENTITY_PROVIDER_ERROR", "The account could not be created right now");
        String path = location.getPath(); return path.substring(path.lastIndexOf('/') + 1);
    }
    private static String stripSlash(String value) { return value.endsWith("/") ? value.substring(0, value.length() - 1) : value; }
    private static String encode(String value) { return URLEncoder.encode(value, StandardCharsets.UTF_8); }
}
