package com.rehletshifaa.identity;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * In-memory stand-in for the identity provider, active only where no Keycloak admin client is configured
 * (the test JVM and a bare local backend). It mirrors the observable contract the journey relies on —
 * lookup by email/subject, provisioning without a credential, outstanding setup actions, resend — so the
 * identity-resolution rules can be proven without a running Keycloak. {@code ProductionSafetyValidator}
 * refuses to start a production profile on this implementation.
 */
public class LocalPatientIdentitySimulator implements PatientIdentityPort {
    private final Map<String, IdentityUser> bySubject = new ConcurrentHashMap<>();
    private final List<SetupMail> setupMails = Collections.synchronizedList(new ArrayList<>());

    /** A recorded "create your password" email, so tests can assert exactly one was sent per account. */
    public record SetupMail(String subject, String locale, String redirectPath) {}

    @Override public boolean available() { return true; }

    @Override public Optional<IdentityUser> findByEmail(String email) {
        String wanted = email.trim().toLowerCase(Locale.ROOT);
        return bySubject.values().stream().filter(u -> wanted.equals(u.email())).findFirst();
    }

    @Override public Optional<IdentityUser> findBySubject(String subject) { return Optional.ofNullable(bySubject.get(subject)); }

    @Override public String provisionPatient(String email, String givenName, String familyName, String locale, boolean emailVerified) {
        String normalized = email.trim().toLowerCase(Locale.ROOT);
        if (findByEmail(normalized).isPresent()) throw new com.rehletshifaa.shared.api.ApiException(409, "IDENTITY_PROVIDER_ERROR", "This email address is already in use");
        String subject = "sim-" + UUID.randomUUID();
        bySubject.put(subject, new IdentityUser(subject, normalized, emailVerified, true,
                emailVerified ? List.of("UPDATE_PASSWORD") : List.of("VERIFY_EMAIL", "UPDATE_PASSWORD")));
        return subject;
    }

    @Override public void sendAccountSetup(String subject, String locale, String redirectPath) {
        if (!bySubject.containsKey(subject)) throw new com.rehletshifaa.shared.api.ApiException(409, "ACCOUNT_NOT_FOUND", "The account could not be found");
        setupMails.add(new SetupMail(subject, locale, redirectPath));
    }

    @Override public void syncProfile(String subject, String givenName, String familyName, String locale) { /* names are not modelled here */ }

    // ---- test hooks ----
    /** Register a pre-existing, fully set-up account (someone who already signs in). */
    public String seedActiveAccount(String email) {
        String subject = "sim-" + UUID.randomUUID();
        bySubject.put(subject, new IdentityUser(subject, email.trim().toLowerCase(Locale.ROOT), true, true, List.of()));
        return subject;
    }
    /** Simulate the owner completing the Keycloak setup actions (password created, email verified). */
    public void completeSetup(String subject) {
        IdentityUser u = bySubject.get(subject);
        if (u != null) bySubject.put(subject, new IdentityUser(u.subject(), u.email(), true, u.enabled(), List.of()));
    }
    public List<SetupMail> setupMails() { return List.copyOf(setupMails); }
    public long setupMailsFor(String subject) { return setupMails.stream().filter(m -> m.subject().equals(subject)).count(); }
    public int accounts() { return bySubject.size(); }
    public void reset() { bySubject.clear(); setupMails.clear(); }
}
