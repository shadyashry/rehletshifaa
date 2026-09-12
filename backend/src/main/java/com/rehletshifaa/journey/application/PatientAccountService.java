package com.rehletshifaa.journey.application;

import com.rehletshifaa.casemanagement.application.IntakeEvents;
import com.rehletshifaa.casemanagement.application.IntakeLifecycleService;
import com.rehletshifaa.identity.PatientIdentityPort;
import com.rehletshifaa.identity.PatientIdentityPort.IdentityUser;
import com.rehletshifaa.journey.api.ActivationDtos.AccountSetup;
import com.rehletshifaa.journey.api.ActivationDtos.AccountStatus;
import com.rehletshifaa.journey.api.JourneyDtos.AccountLinkRequestView;
import com.rehletshifaa.journey.api.JourneyDtos.AccountLinkResolution;
import com.rehletshifaa.journey.api.JourneyDtos.AccountSessionView;
import com.rehletshifaa.journey.api.JourneyDtos.PatientProfileView;
import com.rehletshifaa.security.ActorContext;
import com.rehletshifaa.security.ActorRole;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.util.PatientNames;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.*;

import static com.rehletshifaa.shared.persistence.SqlValues.timestamp;

/**
 * The patient's ACCOUNT — a usable sign-in — as a concern separate from their PROFILE and their CASE.
 *
 * <p>Rules enforced here, in one place:
 * <ul>
 *   <li>Keycloak owns the credential. Accounts are provisioned with no password; the owner creates one
 *       through Keycloak's own time-limited setup action. Nothing here generates, stores or sends a password.</li>
 *   <li>An email that already has an account is a <em>signal</em>, never proof of identity. It never creates a
 *       second account, never auto-links, never merges and is never disclosed. The address receives one
 *       neutral continuation link; the authenticated account owner then says whether the case is theirs.</li>
 *   <li>Every operation is idempotent: re-running provisioning, resending setup, or replaying a resolution
 *       creates no second account, patient, representative row or email.</li>
 * </ul>
 */
@Service
public class PatientAccountService {
    private static final Logger log = LoggerFactory.getLogger(PatientAccountService.class);
    /** How long an "is this you?" continuation link stays valid. */
    private static final Duration LINK_TTL = Duration.ofDays(7);
    /** An automatic (non-explicit) resend of the setup email is suppressed inside this window. */
    private static final Duration SETUP_RESEND_GUARD = Duration.ofMinutes(10);
    private static final String ACCOUNT_LINK_TEMPLATE = "account-link-continue";

    private final JdbcClient jdbc;
    private final PatientIdentityPort identity;
    private final IntakeLifecycleService intake;
    private final com.rehletshifaa.casemanagement.application.CaseService caseService;
    private final ActorContext actors;
    private final Clock clock;

    public PatientAccountService(JdbcClient jdbc, PatientIdentityPort identity, IntakeLifecycleService intake, com.rehletshifaa.casemanagement.application.CaseService caseService, ActorContext actors, Clock clock) {
        this.jdbc = jdbc; this.identity = identity; this.intake = intake; this.caseService = caseService; this.actors = actors; this.clock = clock;
    }

    // ======================================================================
    // Account setup after profile completion
    // ======================================================================

    /**
     * Make sure the canonical patient ends up with a usable sign-in for {@code email}, without ever creating a
     * duplicate account. Called after the profile information has been validated and saved.
     *
     * <ul>
     *   <li>account ACTIVE → nothing to do (the patient signs in).</li>
     *   <li>account SETUP_PENDING → resume: if Keycloak reports the setup finished, mark ACTIVE; otherwise
     *       re-send the setup email at most once per guard window.</li>
     *   <li>no account, email unknown to the provider → provision + send the setup email.</li>
     *   <li>no account, email already has an account → no provisioning; a neutral continuation link is sent to
     *       that address and the authenticated owner resolves ownership (see {@link #resolveLinkRequest}).</li>
     * </ul>
     */
    @Transactional
    public AccountSetup ensureAccount(UUID patientId, UUID caseId, String email, String locale) {
        Account a = load(patientId);
        String normalized = normalizeEmail(email);
        Instant now = clock.instant();
        String lang = "ar".equals(locale) ? "ar" : "en";

        if ("ACTIVE".equals(a.accountStatus()) && a.subject() != null) return view(a, AccountStatus.ACTIVE, false);

        if (a.subject() != null) { // SETUP_PENDING: resume, never create a second account
            Optional<IdentityUser> user = safeFind(() -> identity.findBySubject(a.subject()));
            if (user.isPresent() && !user.get().setupPending()) { markActive(patientId, now, user.get().emailVerified() && normalized.equals(normalizeEmail(user.get().email()))); return view(load(patientId), AccountStatus.ACTIVE, false); }
            boolean resend = a.setupRequestedAt() == null || a.setupRequestedAt().isBefore(now.minus(SETUP_RESEND_GUARD));
            if (resend) sendSetup(a.subject(), lang, caseId, patientId, now);
            return view(load(patientId), AccountStatus.SETUP_PENDING, resend);
        }

        if (normalized == null) return view(a, AccountStatus.NOT_PROVISIONED, false);
        if (!identity.available()) throw new ApiException(503, "IDENTITY_ADMIN_NOT_CONFIGURED", "Account setup is not available in this environment");

        Optional<IdentityUser> existing = identity.findByEmail(normalized);
        if (existing.isPresent()) {
            // Someone already signs in with this address. Neutral continuation: same outward behaviour as a fresh setup.
            issueLinkRequest(patientId, caseId, normalized, "PROFILE", lang, now);
            return new AccountSetup(AccountStatus.NOT_PROVISIONED, mask(normalized), true, true);
        }

        boolean verified = a.emailVerifiedAt() != null && normalized.equals(normalizeEmail(a.email()));
        String subject = identity.provisionPatient(normalized, a.givenName(), a.familyName(), lang, verified);
        int bound = jdbc.sql("UPDATE patient_profiles SET external_subject=?,account_status='SETUP_PENDING',account_setup_requested_at=?,updated_at=?,version=version+1 WHERE id=? AND external_subject IS NULL")
                .params(subject, timestamp(now), timestamp(now), patientId).update();
        if (bound != 1) { // lost a race with a parallel request for the same patient: keep the first account
            Account again = load(patientId);
            return view(again, "ACTIVE".equals(again.accountStatus()) ? AccountStatus.ACTIVE : AccountStatus.SETUP_PENDING, false);
        }
        audit(caseId, "PATIENT_ACCOUNT_PROVISIONED", patientId, "Identity account created without credential; setup delegated to the identity provider");
        // The account now exists and is bound; a failed email must not roll that back (it would orphan the
        // provider account and turn the next attempt into a false "existing account"). The patient can resend.
        boolean sent = trySendSetup(subject, lang, caseId, patientId, now);
        return new AccountSetup(AccountStatus.SETUP_PENDING, mask(normalized), true, sent);
    }

    private boolean trySendSetup(String subject, String lang, UUID caseId, UUID patientId, Instant now) {
        try { sendSetup(subject, lang, caseId, patientId, now); return true; }
        catch (RuntimeException e) {
            log.warn("Account setup email could not be sent for patient {}: {}", patientId, e.getMessage());
            audit(caseId, "PATIENT_ACCOUNT_SETUP_SEND_FAILED", patientId, "Identity-provider setup email failed; patient can resend");
            return false;
        }
    }

    /** Explicit "send me a new link". Works for a pending setup and for a pending existing-account resolution. */
    @Transactional
    public AccountSetup resendSetup(UUID patientId, UUID caseId, String locale) {
        Account a = load(patientId);
        Instant now = clock.instant();
        String lang = "ar".equals(locale) ? "ar" : "en";
        if ("ACTIVE".equals(a.accountStatus()) && a.subject() != null) return view(a, AccountStatus.ACTIVE, false);
        if (a.subject() != null) {
            Optional<IdentityUser> user = safeFind(() -> identity.findBySubject(a.subject()));
            if (user.isPresent() && !user.get().setupPending()) { markActive(patientId, now, false); return view(load(patientId), AccountStatus.ACTIVE, false); }
            sendSetup(a.subject(), lang, caseId, patientId, now);
            return view(load(patientId), AccountStatus.SETUP_PENDING, true);
        }
        // No account of their own yet: the only thing to resend is a pending continuation link.
        String pendingEmail = jdbc.sql("SELECT email FROM patient_account_link_requests WHERE patient_id=? AND consumed_at IS NULL ORDER BY created_at DESC LIMIT 1")
                .param(patientId).query(String.class).optional().orElse(null);
        if (pendingEmail == null) throw new ApiException(409, "ACCOUNT_SETUP_NOT_STARTED", "Please complete your profile first");
        issueLinkRequest(patientId, caseId, pendingEmail, "PROFILE", lang, now);
        return new AccountSetup(AccountStatus.NOT_PROVISIONED, mask(pendingEmail), true, true);
    }

    /** Patient-safe account state for prefill / results. */
    @Transactional(readOnly = true)
    public AccountSetup state(UUID patientId) {
        Account a = load(patientId);
        AccountStatus status = switch (a.accountStatus()) { case "ACTIVE" -> AccountStatus.ACTIVE; case "SETUP_PENDING" -> AccountStatus.SETUP_PENDING; default -> AccountStatus.NOT_PROVISIONED; };
        boolean pendingLink = status == AccountStatus.NOT_PROVISIONED && count("SELECT count(*) FROM patient_account_link_requests WHERE patient_id=? AND consumed_at IS NULL AND expires_at>?", patientId, timestamp(clock.instant())) > 0;
        String pendingEmail = pendingLink ? jdbc.sql("SELECT email FROM patient_account_link_requests WHERE patient_id=? AND consumed_at IS NULL ORDER BY created_at DESC LIMIT 1").param(patientId).query(String.class).optional().orElse(a.email()) : a.email();
        return new AccountSetup(status, mask(pendingEmail), status == AccountStatus.SETUP_PENDING || pendingLink, false);
    }

    // ======================================================================
    // Sign-in: the account becomes ACTIVE the first time its owner authenticates
    // ======================================================================

    /**
     * Called on every authenticated portal entry. The first sign-in after Keycloak setup is what proves the
     * password exists, so this is where SETUP_PENDING becomes ACTIVE. Also records the provider-verified
     * email as the patient's verified account email when the two addresses match. Idempotent.
     */
    @Transactional
    public AccountSessionView session() {
        var actor = actors.require(ActorRole.PATIENT, ActorRole.PATIENT_REPRESENTATIVE);
        Instant now = clock.instant();
        var claim = actors.accountEmail().orElse(null);
        Optional<Account> bound = findBySubject(actor.subject());
        if (bound.isPresent()) {
            Account a = bound.get();
            if (!"ACTIVE".equals(a.accountStatus())) {
                markActive(a.patientId(), now, claim != null && claim.verified() && claim.email().equals(normalizeEmail(a.email())));
                audit(null, "PATIENT_ACCOUNT_ACTIVATED", a.patientId(), "First authenticated sign-in after identity-provider setup");
            } else if (claim != null && claim.verified() && claim.email().equals(normalizeEmail(a.email())) && a.emailVerifiedAt() == null) {
                jdbc.sql("UPDATE patient_profiles SET email_verified_at=?,updated_at=? WHERE id=? AND email_verified_at IS NULL").params(timestamp(now), timestamp(now), a.patientId()).update();
            }
        }
        Account a = findBySubject(actor.subject()).orElse(null);
        // The current case is the one that needs the patient first (responsibility on record with them), else the most recently active one.
        UUID currentCase = a == null ? null : jdbc.sql("SELECT id FROM medical_cases WHERE patient_id=? AND status NOT IN ('CLOSED','CANCELLED','DECLINED','EXPIRED') ORDER BY CASE WHEN waiting_on='PATIENT' THEN 0 ELSE 1 END,updated_at DESC LIMIT 1")
                .param(a.patientId()).query(UUID.class).optional().orElse(null);
        int pendingLinks = claim == null ? 0 : count("SELECT count(*) FROM patient_account_link_requests WHERE email=? AND consumed_at IS NULL AND expires_at>?", claim.email(), timestamp(now));
        return new AccountSessionView(a != null, a == null ? null : a.patientId(), a == null ? null : PatientNames.display(a.givenName(), a.familyName(), a.fullName()),
                a == null ? "NOT_PROVISIONED" : a.accountStatus(), currentCase, pendingLinks);
    }

    /**
     * A returning, signed-in patient starts another case: the SAME canonical patient, saved details reused,
     * only case information entered. No new patient, no new account, no profile activation.
     */
    @Transactional
    public com.rehletshifaa.casemanagement.api.CaseDtos.CreateCaseResponse startNewCase(com.rehletshifaa.casemanagement.api.CaseDtos.NewCaseForPatientRequest request) {
        var actor = actors.require(ActorRole.PATIENT);
        Account a = findBySubject(actor.subject()).orElseThrow(() -> new ApiException(409, "PATIENT_NOT_LINKED", "Your account is not linked to a patient profile yet"));
        if (!"ACTIVE".equals(a.accountStatus())) markActive(a.patientId(), clock.instant(), false);
        var created = caseService.createForExistingPatient(a.patientId(), request);
        audit(created.caseId(), "CASE_STARTED_BY_RETURNING_PATIENT", a.patientId(), "New case created for the existing canonical patient");
        return created;
    }

    // ======================================================================
    // Existing-account resolution ("is this case for you?")
    // ======================================================================

    /**
     * Intake: an unauthenticated submission used an email that already signs in somewhere. The case and its
     * (new, pending) patient stand as submitted; nothing is linked or revealed. The address gets one neutral
     * continuation link. Failure to reach the provider must never fail the submission.
     */
    @EventListener
    @Transactional
    public void onCaseSubmitted(IntakeEvents.CaseSubmitted event) {
        try {
            if (!identity.available()) return;
            record S(UUID patientId, String email, String lang) {}
            S s = jdbc.sql("SELECT c.patient_id,sc.email,c.preferred_language FROM medical_cases c LEFT JOIN case_submission_contacts sc ON sc.case_id=c.id WHERE c.id=?")
                    .param(event.caseId()).query((rs, n) -> new S(rs.getObject("patient_id", UUID.class), rs.getString("email"), rs.getString("preferred_language"))).optional().orElse(null);
            if (s == null || s.email() == null || s.patientId() == null) return;
            String normalized = normalizeEmail(s.email());
            if (identity.findByEmail(normalized).isEmpty()) return;
            issueLinkRequest(s.patientId(), event.caseId(), normalized, "INTAKE", s.lang(), clock.instant());
        } catch (RuntimeException e) {
            log.warn("Existing-account check skipped for case {}: {}", event.caseId(), e.getMessage());
        }
    }

    /** What the authenticated account owner is being asked to resolve. Only the address's own account may see it. */
    @Transactional(readOnly = true)
    public AccountLinkRequestView linkRequest(String token) {
        var actor = actors.require(ActorRole.PATIENT, ActorRole.PATIENT_REPRESENTATIVE);
        LinkRequest r = requireLink(token, actor);
        record C(String caseNumber, String givenName, String familyName, String fullName, String role, String relationship) {}
        C c = jdbc.sql("SELECT c.case_number,p.given_name,p.family_name,p.full_name,sc.contact_role,sc.relationship_to_patient FROM medical_cases c JOIN patient_profiles p ON p.id=c.patient_id LEFT JOIN case_submission_contacts sc ON sc.case_id=c.id WHERE c.id=?")
                .param(r.caseId()).query((rs, n) -> new C(rs.getString("case_number"), rs.getString("given_name"), rs.getString("family_name"), rs.getString("full_name"), rs.getString("contact_role"), rs.getString("relationship_to_patient"))).single();
        return new AccountLinkRequestView(c.caseNumber(), PatientNames.display(c.givenName(), c.familyName(), c.fullName()), r.origin(),
                c.role() == null ? "PATIENT" : c.role(), c.relationship(), r.resolution());
    }

    /**
     * The authenticated owner of the address decides. Nothing here depends on name, email or phone matching:
     * the proof is the Keycloak session for the account that owns the address, plus an explicit statement.
     */
    @Transactional
    public AccountLinkRequestView resolveLinkRequest(String token, AccountLinkResolution decision) {
        var actor = actors.require(ActorRole.PATIENT, ActorRole.PATIENT_REPRESENTATIVE);
        LinkRequest r = requireLink(token, actor);
        Instant now = clock.instant();
        if (r.resolution() != null) return linkRequest(token); // replay: already resolved, no side effects
        String resolution = decision.resolution() == null ? "" : decision.resolution().trim().toUpperCase(Locale.ROOT);
        switch (resolution) {
            case "SAME_PATIENT" -> linkAsSamePatient(r, actor.subject(), now);
            case "REPRESENTATIVE" -> linkAsRepresentative(r, actor.subject(), decision.relationship(), now);
            case "DECLINED" -> decline(r, now);
            default -> throw new ApiException(400, "INVALID_RESOLUTION", "Choose whether this case is for you or for someone else");
        }
        jdbc.sql("UPDATE patient_account_link_requests SET consumed_at=?,resolved_subject=?,resolution=?,relationship=?,updated_at=? WHERE id=? AND consumed_at IS NULL")
                .params(timestamp(now), actor.subject(), resolution, "REPRESENTATIVE".equals(resolution) ? trimToNull(decision.relationship()) : null, timestamp(now), r.id()).update();
        return linkRequest(token);
    }

    /**
     * "This case is mine." If the signed-in account already owns a canonical patient, the pending patient
     * created at intake is folded into it — an explicit, authenticated, audited merge, never an inferred one.
     * Otherwise the account is bound to the pending patient.
     */
    private void linkAsSamePatient(LinkRequest r, String subject, Instant now) {
        Optional<Account> owner = findBySubject(subject);
        if (owner.isPresent() && !owner.get().patientId().equals(r.patientId())) {
            mergePatient(r.patientId(), owner.get().patientId(), now);
            audit(r.caseId(), "PATIENT_IDENTITY_MERGED", r.patientId(), "Account owner confirmed the case is theirs; pending patient folded into canonical patient " + owner.get().patientId());
            return;
        }
        int bound = jdbc.sql("UPDATE patient_profiles SET external_subject=?,account_status='ACTIVE',account_activated_at=COALESCE(account_activated_at,?),email=COALESCE(email,?),email_verified_at=CASE WHEN LOWER(COALESCE(email,?))=? THEN COALESCE(email_verified_at,?) ELSE email_verified_at END,updated_at=?,version=version+1 WHERE id=? AND (external_subject IS NULL OR external_subject=?)")
                .params(subject, timestamp(now), r.email(), r.email(), r.email(), timestamp(now), timestamp(now), r.patientId(), subject).update();
        if (bound != 1) throw new ApiException(409, "ALREADY_LINKED", "This profile is already linked to another account");
        jdbc.sql("UPDATE patient_profiles SET profile_status='ACTIVE',activated_at=COALESCE(activated_at,?) WHERE id=? AND profile_completed_at IS NOT NULL AND profile_status<>'ACTIVE'").params(timestamp(now), r.patientId()).update();
        audit(r.caseId(), "PATIENT_ACCOUNT_LINKED", r.patientId(), "Account owner confirmed the case is theirs");
    }

    /**
     * "I am acting for the patient." The account owner becomes a representative with the platform's existing
     * delegation model; the patient stays a separate person with no account yet. The submitter's channels are
     * moved off the patient so they are never mistaken for the patient's own.
     */
    private void linkAsRepresentative(LinkRequest r, String subject, String relationship, Instant now) {
        String rel = trimToNull(relationship) == null ? "OTHER" : relationship.trim().toUpperCase(Locale.ROOT);
        jdbc.sql("INSERT INTO patient_representatives(id,patient_id,representative_subject,relationship,permissions,effective_from,created_at) SELECT ?,?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM patient_representatives WHERE patient_id=? AND representative_subject=? AND revoked_at IS NULL)")
                .params(UUID.randomUUID(), r.patientId(), subject, rel, "VIEW,MESSAGE,COORDINATE", timestamp(now), timestamp(now), r.patientId(), subject).update();
        // The representative's email is not the patient's account email.
        jdbc.sql("UPDATE patient_profiles SET email=NULL,email_verified_at=NULL,updated_at=? WHERE id=? AND LOWER(email)=?").params(timestamp(now), r.patientId(), r.email()).update();
        // If the intake said "myself", it was in fact a representative: correct the submission record and the
        // number's ownership. A verified OTP on that number proved the representative's possession, not the patient's.
        jdbc.sql("UPDATE case_submission_contacts SET contact_role='REPRESENTATIVE',relationship_to_patient=COALESCE(relationship_to_patient,?) WHERE case_id=?").params(rel, r.caseId()).update();
        jdbc.sql("UPDATE patient_profiles SET whatsapp_number=NULL,mobile_owner=NULL,phone_verified_at=NULL,updated_at=? WHERE id=? AND whatsapp_number IS NOT NULL AND whatsapp_number IN (SELECT whatsapp_number FROM case_submission_contacts WHERE case_id=?)")
                .params(timestamp(now), r.patientId(), r.caseId()).update();
        jdbc.sql("UPDATE patient_onboardings SET subject_type='REPRESENTATIVE',updated_at=? WHERE case_id=? AND (subject_type IS NULL OR subject_type='PATIENT')").params(timestamp(now), r.caseId()).update();
        audit(r.caseId(), "PATIENT_REPRESENTATIVE_LINKED", r.patientId(), "Account owner confirmed they act for the patient (" + rel + ")");
    }

    private void decline(LinkRequest r, Instant now) {
        // Not theirs and not for someone they act for: withdraw the address from the pending patient.
        jdbc.sql("UPDATE patient_profiles SET email=NULL,email_verified_at=NULL,updated_at=? WHERE id=? AND LOWER(email)=? AND external_subject IS NULL").params(timestamp(now), r.patientId(), r.email()).update();
        audit(r.caseId(), "PATIENT_ACCOUNT_LINK_DECLINED", r.patientId(), "Account owner said the case is not theirs; contact email withdrawn, coordinator to follow up");
    }

    /** Fold the pending patient {@code from} into the canonical {@code into}. Every patient-scoped row moves. */
    private void mergePatient(UUID from, UUID into, Instant now) {
        for (String table : List.of("medical_cases", "case_submission_contacts", "case_access_links", "consent_records", "patient_onboardings", "patient_identity_verifications", "case_claim_challenges"))
            jdbc.sql("UPDATE " + table + " SET patient_id=? WHERE patient_id=?").params(into, from).update();
        jdbc.sql("DELETE FROM account_activations WHERE patient_id=?").param(from).update();
        jdbc.sql("DELETE FROM patient_representatives WHERE patient_id=? AND representative_subject IN (SELECT representative_subject FROM patient_representatives WHERE patient_id=?)").params(from, into).update();
        jdbc.sql("UPDATE patient_representatives SET patient_id=? WHERE patient_id=?").params(into, from).update();
        jdbc.sql("UPDATE patient_account_link_requests SET patient_id=? WHERE patient_id=? AND email NOT IN (SELECT email FROM patient_account_link_requests WHERE patient_id=?)").params(into, from, into).update();
        jdbc.sql("UPDATE patient_profiles SET merged_into_patient_id=?,profile_status='MERGED',account_status='NOT_PROVISIONED',email=NULL,whatsapp_number=NULL,updated_at=?,version=version+1 WHERE id=?").params(into, timestamp(now), from).update();
        // The canonical patient keeps its own name; a WhatsApp number the pending patient supplied is only
        // adopted when the canonical patient has none (it was never a matching key).
        jdbc.sql("UPDATE patient_profiles SET updated_at=? WHERE id=?").params(timestamp(now), into).update();
    }

    // ======================================================================
    // internals
    // ======================================================================

    private void sendSetup(String subject, String lang, UUID caseId, UUID patientId, Instant now) {
        // After the Keycloak actions complete the browser is returned straight to the patient's case; the portal
        // finishes sign-in from the fresh Keycloak session without showing the public homepage.
        identity.sendAccountSetup(subject, lang, "/" + lang + "/portal?case=" + caseId + "&continue=1");
        jdbc.sql("UPDATE patient_profiles SET account_setup_requested_at=?,updated_at=? WHERE id=?").params(timestamp(now), timestamp(now), patientId).update();
        audit(caseId, "PATIENT_ACCOUNT_SETUP_SENT", patientId, "Identity-provider account setup link sent");
    }

    /** One live request per (patient, email): a repeat rotates the token and re-sends, never accumulates. */
    private void issueLinkRequest(UUID patientId, UUID caseId, String email, String origin, String lang, Instant now) {
        String token = randomToken();
        int rotated = jdbc.sql("UPDATE patient_account_link_requests SET token_hash=?,expires_at=?,consumed_at=NULL,resolution=NULL,resolved_subject=NULL,case_id=?,origin=?,updated_at=? WHERE patient_id=? AND email=? AND consumed_at IS NULL")
                .params(intake.hash(token), timestamp(now.plus(LINK_TTL)), caseId, origin, timestamp(now), patientId, email).update();
        if (rotated == 0) {
            Integer resolved = count("SELECT count(*) FROM patient_account_link_requests WHERE patient_id=? AND email=?", patientId, email);
            if (resolved > 0) return; // already resolved by the account owner: never re-open it
            jdbc.sql("INSERT INTO patient_account_link_requests(id,patient_id,case_id,email,origin,token_hash,expires_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)")
                    .params(UUID.randomUUID(), patientId, caseId, email, origin, intake.hash(token), timestamp(now.plus(LINK_TTL)), timestamp(now), timestamp(now)).update();
        }
        String payload = intake.encryptedJson("{\"token\":\"" + token + "\",\"lang\":\"" + ("ar".equals(lang) ? "ar" : "en") + "\"}");
        jdbc.sql("INSERT INTO notification_outbox(id,notification_type,channel,destination,template_key,template_data,status,attempts,max_attempts,next_attempt_at,idempotency_key,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)")
                .params(UUID.randomUUID(), "ACCOUNT_LINK", "EMAIL", email, ACCOUNT_LINK_TEMPLATE, payload, "PENDING", 0, 5, timestamp(now), "account-link:" + patientId + ":" + intake.hash(token), timestamp(now)).update();
        audit(caseId, "PATIENT_ACCOUNT_LINK_REQUESTED", patientId, "Contact email already has an account; neutral continuation link sent (" + origin + ")");
    }

    private void markActive(UUID patientId, Instant now, boolean emailProven) {
        jdbc.sql("UPDATE patient_profiles SET account_status='ACTIVE',account_activated_at=COALESCE(account_activated_at,?),email_verified_at=CASE WHEN ? THEN COALESCE(email_verified_at,?) ELSE email_verified_at END,profile_status=CASE WHEN profile_completed_at IS NOT NULL THEN 'ACTIVE' ELSE profile_status END,activated_at=CASE WHEN profile_completed_at IS NOT NULL THEN COALESCE(activated_at,?) ELSE activated_at END,updated_at=?,version=version+1 WHERE id=? AND account_status<>'ACTIVE'")
                .params(timestamp(now), emailProven, timestamp(now), timestamp(now), timestamp(now), patientId).update();
    }

    private LinkRequest requireLink(String token, ActorContext.Actor actor) {
        LinkRequest r = jdbc.sql("SELECT id,patient_id,case_id,email,origin,expires_at,consumed_at,resolution,resolved_subject FROM patient_account_link_requests WHERE token_hash=?")
                .param(intake.hash(token)).query(this::mapLink).optional().orElseThrow(() -> new ApiException(404, "ACCOUNT_LINK_INVALID", "This link is invalid or has expired"));
        if (r.resolution() == null && !r.expiresAt().isAfter(clock.instant())) throw new ApiException(410, "ACCOUNT_LINK_EXPIRED", "This link has expired");
        if (r.resolution() != null && !actor.subject().equals(r.resolvedSubject())) throw new ApiException(404, "ACCOUNT_LINK_INVALID", "This link is invalid or has expired");
        // Only the account that owns the address may act on it — the token alone is not enough.
        var claim = actors.accountEmail().orElse(null);
        if (r.resolution() == null && (claim == null || !claim.email().equals(r.email()))) throw new ApiException(403, "ACCOUNT_LINK_WRONG_ACCOUNT", "Please sign in with the account that received this email");
        return r;
    }

    /**
     * The signed-in patient's own account and profile facts — what "Profile & Security" shows. Case, clinical,
     * proposal and deposit facts deliberately never appear here: they belong to the case.
     */
    @Transactional(readOnly = true)
    public PatientProfileView myProfile() {
        var actor = actors.require(ActorRole.PATIENT, ActorRole.PATIENT_REPRESENTATIVE);
        return jdbc.sql("SELECT given_name,family_name,full_name,preferred_name,date_of_birth,country,nationality,preferred_language,email,email_verified_at,whatsapp_number,phone_verified_at,account_status FROM patient_profiles WHERE external_subject=? AND merged_into_patient_id IS NULL")
                .param(actor.subject())
                .query((rs, n) -> new PatientProfileView(rs.getString("given_name"), rs.getString("family_name"),
                        PatientNames.display(rs.getString("given_name"), rs.getString("family_name"), rs.getString("full_name")), rs.getString("preferred_name"),
                        rs.getObject("date_of_birth", java.time.LocalDate.class), rs.getString("country"), rs.getString("nationality"), rs.getString("preferred_language"),
                        rs.getString("email"), rs.getObject("email_verified_at") != null, rs.getString("whatsapp_number"), rs.getObject("phone_verified_at") != null, rs.getString("account_status")))
                .optional().orElseThrow(() -> new ApiException(404, "PATIENT_PROFILE_NOT_FOUND", "No patient profile is linked to this account"));
    }

    private Optional<Account> findBySubject(String subject) {
        return jdbc.sql("SELECT " + COLUMNS + " FROM patient_profiles WHERE external_subject=? AND merged_into_patient_id IS NULL").param(subject).query(this::mapAccount).optional();
    }
    private Account load(UUID patientId) {
        return jdbc.sql("SELECT " + COLUMNS + " FROM patient_profiles WHERE id=?").param(patientId).query(this::mapAccount).optional()
                .orElseThrow(() -> new ApiException(404, "PATIENT_NOT_FOUND", "Patient profile was not found"));
    }
    private static final String COLUMNS = "id,external_subject,account_status,account_setup_requested_at,email,email_verified_at,given_name,family_name,full_name";
    private record Account(UUID patientId, String subject, String accountStatus, Instant setupRequestedAt, String email, Instant emailVerifiedAt, String givenName, String familyName, String fullName) {}
    private Account mapAccount(ResultSet rs, int n) throws SQLException {
        return new Account(rs.getObject("id", UUID.class), rs.getString("external_subject"), rs.getString("account_status"), instantNullable(rs, "account_setup_requested_at"),
                rs.getString("email"), instantNullable(rs, "email_verified_at"), rs.getString("given_name"), rs.getString("family_name"), rs.getString("full_name"));
    }
    private record LinkRequest(UUID id, UUID patientId, UUID caseId, String email, String origin, Instant expiresAt, Instant consumedAt, String resolution, String resolvedSubject) {}
    private LinkRequest mapLink(ResultSet rs, int n) throws SQLException {
        return new LinkRequest(rs.getObject("id", UUID.class), rs.getObject("patient_id", UUID.class), rs.getObject("case_id", UUID.class), rs.getString("email"), rs.getString("origin"),
                instantNullable(rs, "expires_at"), instantNullable(rs, "consumed_at"), rs.getString("resolution"), rs.getString("resolved_subject"));
    }
    private AccountSetup view(Account a, AccountStatus status, boolean sent) { return new AccountSetup(status, mask(a.email()), status == AccountStatus.SETUP_PENDING, sent); }
    private Optional<IdentityUser> safeFind(java.util.function.Supplier<Optional<IdentityUser>> call) { try { return call.get(); } catch (RuntimeException e) { log.warn("Identity lookup failed: {}", e.getMessage()); return Optional.empty(); } }
    private int count(String sql, Object... args) { Integer n = jdbc.sql(sql).params(args).query(Integer.class).single(); return n == null ? 0 : n; }
    private void audit(UUID caseId, String type, UUID patientId, String reason) {
        jdbc.sql("INSERT INTO audit_events(id,event_type,actor_subject,actor_role,case_id,entity_type,entity_id,action,outcome,reason,occurred_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)")
                .params(UUID.randomUUID(), type, "SYSTEM", "PATIENT", caseId, "PatientProfile", patientId.toString(), "ACCOUNT", "SUCCESS", reason, timestamp(clock.instant())).update();
    }
    static String normalizeEmail(String v) { return v == null || v.isBlank() ? null : v.trim().toLowerCase(Locale.ROOT); }
    private static String trimToNull(String v) { return v == null || v.isBlank() ? null : v.trim(); }
    private static String randomToken() { return UUID.randomUUID().toString().replace("-", "") + UUID.randomUUID().toString().replace("-", ""); }
    static String mask(String value) {
        if (value == null) return null;
        String clean = value.replaceAll("\\s", "");
        if (clean.contains("@")) { int at = clean.indexOf('@'); String user = clean.substring(0, at); return (user.length() <= 2 ? user.charAt(0) + "***" : user.substring(0, 2) + "***") + clean.substring(at); }
        return clean.length() < 4 ? "***" : "***" + clean.substring(clean.length() - 4);
    }
    private static Instant instantNullable(ResultSet rs, String column) throws SQLException { OffsetDateTime v = rs.getObject(column, OffsetDateTime.class); return v == null ? null : v.toInstant(); }
}
