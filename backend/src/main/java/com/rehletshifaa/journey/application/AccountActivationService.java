package com.rehletshifaa.journey.application;

import com.rehletshifaa.casemanagement.application.IntakeLifecycleService;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.timestamp;

/**
 * Owns the one-time credential that binds a canonical patient profile to the Keycloak account the patient
 * signs in with ({@code account_activations}, consumed by {@code JourneyService.activateAccount}).
 *
 * <p>It is an internal capability, never a second customer journey: no notification carries the token, so
 * the patient meets it exactly once — as the "continue to your portal" handoff at the end of onboarding,
 * after a verified onboarding grant has already proved they control the case's registered contact. Issuing
 * therefore mints a fresh single-use token each time it is asked for and invalidates the previous one.
 */
@Service
public class AccountActivationService {
    /** Long enough to survive Keycloak registration and email verification, short enough to stay a handoff. */
    private static final Duration TTL = Duration.ofHours(24);

    private final JdbcClient jdbc;
    private final IntakeLifecycleService intake;
    private final Clock clock;

    public AccountActivationService(JdbcClient jdbc, IntakeLifecycleService intake, Clock clock) {
        this.jdbc = jdbc; this.intake = intake; this.clock = clock;
    }

    /** True once the profile is bound to an identity account — the patient signs in normally from then on. */
    @Transactional(readOnly = true)
    public boolean linked(UUID patientId) { return subjectOf(patientId) != null; }

    /**
     * Mint a single-use binding token for this patient, replacing any earlier unused one.
     *
     * @return the token, or {@code null} when the profile is already bound to an identity account
     */
    @Transactional
    public String issue(UUID patientId, UUID caseId) {
        if (subjectOf(patientId) != null) return null; // already bound; the patient just signs in
        Instant now = clock.instant();
        String token = randomToken();
        // One row per patient (unique constraint): rotate it rather than accumulating live credentials.
        int rotated = jdbc.sql("UPDATE account_activations SET token_hash=?,case_id=?,expires_at=?,consumed_at=NULL,activated_subject=NULL WHERE patient_id=?")
                .params(intake.hash(token), caseId, timestamp(now.plus(TTL)), patientId).update();
        if (rotated == 0) {
            record Contact(String whatsapp, String email) {}
            Contact c = jdbc.sql("SELECT whatsapp_number,email FROM patient_profiles WHERE id=?").param(patientId)
                    .query((rs, n) -> new Contact(rs.getString("whatsapp_number"), rs.getString("email"))).optional().orElse(null);
            if (c == null) return null;
            boolean whatsapp = c.whatsapp() != null && !c.whatsapp().isBlank();
            String destination = whatsapp ? c.whatsapp() : c.email();
            jdbc.sql("INSERT INTO account_activations(id,patient_id,case_id,token_hash,delivery_channel,destination_hint,expires_at,created_at) VALUES(?,?,?,?,?,?,?,?)")
                    .params(UUID.randomUUID(), patientId, caseId, intake.hash(token), whatsapp ? "WHATSAPP" : "EMAIL",
                            mask(destination), timestamp(now.plus(TTL)), timestamp(now)).update();
        }
        audit(caseId, patientId);
        return token;
    }

    private String subjectOf(UUID patientId) {
        return jdbc.sql("SELECT external_subject FROM patient_profiles WHERE id=?").param(patientId)
                .query(String.class).optional().orElse(null);
    }

    private void audit(UUID caseId, UUID patientId) {
        jdbc.sql("INSERT INTO audit_events(id,event_type,actor_subject,actor_role,case_id,entity_type,entity_id,action,outcome,reason,occurred_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)")
                .params(UUID.randomUUID(), "ACCOUNT_ACTIVATION_ISSUED", "SECURE_LINK", "PATIENT", caseId, "PatientProfile",
                        patientId.toString(), "ISSUE", "SUCCESS", "Account binding handed over after profile activation",
                        timestamp(clock.instant())).update();
    }

    private static String randomToken() {
        return UUID.randomUUID().toString().replace("-", "") + UUID.randomUUID().toString().replace("-", "");
    }
    private static String mask(String value) {
        if (value == null) return "***";
        String clean = value.replaceAll("\\s", "");
        if (clean.contains("@")) { int at = clean.indexOf('@'); return (at == 0 ? "*" : clean.charAt(0) + "***") + clean.substring(at); }
        return clean.length() < 4 ? "***" : "***" + clean.substring(clean.length() - 4);
    }
}
