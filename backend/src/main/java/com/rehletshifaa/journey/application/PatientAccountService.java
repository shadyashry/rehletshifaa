package com.rehletshifaa.journey.application;

import com.rehletshifaa.authority.application.Actor;
import com.rehletshifaa.authority.application.Authority;
import com.rehletshifaa.authority.domain.Permission;
import com.rehletshifaa.authority.domain.Role;
import com.rehletshifaa.casemanagement.application.IntakeEvents;
import com.rehletshifaa.casemanagement.application.IntakeLifecycleService;
import com.rehletshifaa.casemanagement.infrastructure.CaseAccessLinkRepository;
import com.rehletshifaa.casemanagement.infrastructure.CaseSubmissionContactRepository;
import com.rehletshifaa.casemanagement.infrastructure.ConsentRecordRepository;
import com.rehletshifaa.casemanagement.infrastructure.MedicalCaseRepository;
import com.rehletshifaa.directory.domain.PatientProfile;
import com.rehletshifaa.directory.domain.PatientRepresentative;
import com.rehletshifaa.directory.infrastructure.PatientProfileRepository;
import com.rehletshifaa.directory.infrastructure.PatientProfileRepository.Account;
import com.rehletshifaa.directory.infrastructure.PatientRepresentativeRepository;
import com.rehletshifaa.identity.PatientIdentityPort;
import com.rehletshifaa.identity.PatientIdentityPort.IdentityUser;
import com.rehletshifaa.journey.api.ActivationDtos.AccountSetup;
import com.rehletshifaa.journey.api.ActivationDtos.AccountStatus;
import com.rehletshifaa.journey.api.JourneyDtos.AccountLinkRequestView;
import com.rehletshifaa.journey.api.JourneyDtos.AccountLinkResolution;
import com.rehletshifaa.journey.api.JourneyDtos.AccountSessionView;
import com.rehletshifaa.journey.api.JourneyDtos.PatientProfileView;
import com.rehletshifaa.journey.domain.PatientAccountLinkRequest;
import com.rehletshifaa.journey.infrastructure.PatientAccountLinkRequestRepository;
import com.rehletshifaa.journey.infrastructure.PatientAccountLinkRequestRepository.LinkRequest;
import com.rehletshifaa.journey.infrastructure.PatientIdentityVerificationRepository;
import com.rehletshifaa.journey.infrastructure.PatientOnboardingRepository;
import com.rehletshifaa.notification.application.NotificationOutbox;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.audit.AuditTrail;
import com.rehletshifaa.shared.util.PatientNames;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.event.EventListener;
import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.*;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

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
    private final ApplicationEventPublisher events;
    private final PatientIdentityVerificationRepository identityVerifications;
    private final ConsentRecordRepository consentRecords;
    private final CaseAccessLinkRepository accessLinks;
    private final MedicalCaseRepository cases;
    private final PatientAccountLinkRequestRepository linkRequests;
    private final PatientOnboardingRepository onboardings;
    private final CaseSubmissionContactRepository contacts;
    private final PatientRepresentativeRepository representatives;
    private final PatientProfileRepository patients;
    private final NotificationOutbox notificationOutbox;
    private final AuditTrail auditTrail;
    private static final Logger log = LoggerFactory.getLogger(PatientAccountService.class);
    /** How long an "is this you?" continuation link stays valid. */
    private static final Duration LINK_TTL = Duration.ofDays(7);
    /** An automatic (non-explicit) resend of the setup email is suppressed inside this window. */
    private static final Duration SETUP_RESEND_GUARD = Duration.ofMinutes(10);
    private static final String ACCOUNT_LINK_TEMPLATE = "account-link-continue";

    private final PatientIdentityPort identity;
    private final IntakeLifecycleService intake;
    private final com.rehletshifaa.casemanagement.application.CaseService caseService;
    private final Authority authority;
    private final Clock clock;

    public PatientAccountService(PatientIdentityPort identity, IntakeLifecycleService intake, com.rehletshifaa.casemanagement.application.CaseService caseService, Authority authority, Clock clock, AuditTrail auditTrail, NotificationOutbox notificationOutbox, PatientProfileRepository patients, PatientRepresentativeRepository representatives, CaseSubmissionContactRepository contacts, PatientOnboardingRepository onboardings, PatientAccountLinkRequestRepository linkRequests, MedicalCaseRepository cases, CaseAccessLinkRepository accessLinks, ConsentRecordRepository consentRecords, PatientIdentityVerificationRepository identityVerifications, ApplicationEventPublisher events) { this.events = events; this.identityVerifications = identityVerifications; this.consentRecords = consentRecords; this.accessLinks = accessLinks; this.cases = cases; this.linkRequests = linkRequests; this.onboardings = onboardings; this.contacts = contacts; this.representatives = representatives; this.patients = patients; this.notificationOutbox = notificationOutbox; this.auditTrail = auditTrail;
        this.identity = identity; this.intake = intake; this.caseService = caseService; this.authority = authority; this.clock = clock;
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

        if ("ACTIVE".equals(a.getAccountStatus()) && a.getSubject() != null) return view(a, AccountStatus.ACTIVE, false);

        if (a.getSubject() != null) { // SETUP_PENDING: resume, never create a second account
            Optional<IdentityUser> user = safeFind(() -> identity.findBySubject(a.getSubject()));
            if (user.isPresent() && !user.get().setupPending()) { markActive(patientId, now, user.get().emailVerified() && normalized.equals(normalizeEmail(user.get().email()))); return view(load(patientId), AccountStatus.ACTIVE, false); }
            boolean resend = a.getSetupRequestedAt() == null || a.getSetupRequestedAt().isBefore(now.minus(SETUP_RESEND_GUARD));
            if (resend) sendSetup(a.getSubject(), lang, caseId, patientId, now);
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

        boolean verified = a.getEmailVerifiedAt() != null && normalized.equals(normalizeEmail(a.getEmail()));
        String subject = identity.provisionPatient(normalized, a.getGivenName(), a.getFamilyName(), lang, verified);
        boolean bound = changeProfile(patientId, p -> p.bindPendingSetup(subject, now));
        if (!bound) { // lost a race with a parallel request for the same patient: keep the first account
            Account again = load(patientId);
            return view(again, "ACTIVE".equals(again.getAccountStatus()) ? AccountStatus.ACTIVE : AccountStatus.SETUP_PENDING, false);
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
            // Exception messages can carry the recipient address; the type is enough to triage.
            log.warn("Account setup email could not be sent for patient {}: {}", patientId, e.getClass().getSimpleName());
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
        if ("ACTIVE".equals(a.getAccountStatus()) && a.getSubject() != null) return view(a, AccountStatus.ACTIVE, false);
        if (a.getSubject() != null) {
            Optional<IdentityUser> user = safeFind(() -> identity.findBySubject(a.getSubject()));
            if (user.isPresent() && !user.get().setupPending()) { markActive(patientId, now, false); return view(load(patientId), AccountStatus.ACTIVE, false); }
            sendSetup(a.getSubject(), lang, caseId, patientId, now);
            return view(load(patientId), AccountStatus.SETUP_PENDING, true);
        }
        // No account of their own yet: the only thing to resend is a pending continuation link.
        String pendingEmail = newestPendingEmail(patientId).orElse(null);
        if (pendingEmail == null) throw new ApiException(409, "ACCOUNT_SETUP_NOT_STARTED", "Please complete your profile first");
        issueLinkRequest(patientId, caseId, pendingEmail, "PROFILE", lang, now);
        return new AccountSetup(AccountStatus.NOT_PROVISIONED, mask(pendingEmail), true, true);
    }

    /** Patient-safe account state for prefill / results. */
    @Transactional(readOnly = true)
    public AccountSetup state(UUID patientId) {
        Account a = load(patientId);
        AccountStatus status = switch (a.getAccountStatus()) { case "ACTIVE" -> AccountStatus.ACTIVE; case "SETUP_PENDING" -> AccountStatus.SETUP_PENDING; default -> AccountStatus.NOT_PROVISIONED; };
        boolean pendingLink = status == AccountStatus.NOT_PROVISIONED && linkRequests.hasLivePendingFor(patientId, clock.instant());
        String pendingEmail = pendingLink ? newestPendingEmail(patientId).orElse(a.getEmail()) : a.getEmail();
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
        var actor = authority.authorize(Permission.ACCOUNT_BINDING);
        Instant now = clock.instant();
        var claim = com.rehletshifaa.authority.application.Principal.accountEmail().orElse(null);
        Optional<Account> bound = findBySubject(actor.subject());
        if (bound.isPresent()) {
            Account a = bound.get();
            if (!"ACTIVE".equals(a.getAccountStatus())) {
                markActive(a.getPatientId(), now, claim != null && claim.verified() && claim.email().equals(normalizeEmail(a.getEmail())));
                audit(null, "PATIENT_ACCOUNT_ACTIVATED", a.getPatientId(), "First authenticated sign-in after identity-provider setup");
            } else if (claim != null && claim.verified() && claim.email().equals(normalizeEmail(a.getEmail())) && a.getEmailVerifiedAt() == null) {
                changeProfile(a.getPatientId(), p -> p.markEmailVerified(now));
            }
        }
        Account a = findBySubject(actor.subject()).orElse(null);
        // The current case is the one that needs the patient first (responsibility on record with them), else the most recently active one.
        UUID currentCase = a == null ? null : cases.findCurrentCasesOf(a.getPatientId(), Limit.of(1)).stream().findFirst().orElse(null);
        int pendingLinks = claim == null ? 0 : (int) linkRequests.countLivePendingTo(claim.email(), now);
        return new AccountSessionView(a != null, a == null ? null : a.getPatientId(), a == null ? null : PatientNames.display(a.getGivenName(), a.getFamilyName()),
                a == null ? "NOT_PROVISIONED" : a.getAccountStatus(), currentCase, pendingLinks);
    }

    /**
     * A returning, signed-in patient starts another case: the SAME canonical patient, saved details reused,
     * only case information entered. No new patient, no new account, no profile activation.
     */
    @Transactional
    public com.rehletshifaa.casemanagement.api.CaseDtos.CreateCaseResponse startNewCase(com.rehletshifaa.casemanagement.api.CaseDtos.NewCaseForPatientRequest request) {
        var actor = authority.authorize(Permission.PATIENT_SELF_SERVICE);
        if (!actor.has(Role.PATIENT)) throw new ApiException(403, "PERMISSION_NOT_HELD", "Only the patient can start their own case");
        Account a = findBySubject(actor.subject()).orElseThrow(() -> new ApiException(409, "PATIENT_NOT_LINKED", "Your account is not linked to a patient profile yet"));
        if (!"ACTIVE".equals(a.getAccountStatus())) markActive(a.getPatientId(), clock.instant(), false);
        var created = caseService.createForExistingPatient(a.getPatientId(), request);
        audit(created.caseId(), "CASE_STARTED_BY_RETURNING_PATIENT", a.getPatientId(), "New case created for the existing canonical patient");
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
            var s = cases.findSubmissionAddress(event.caseId()).orElse(null);
            if (s == null || s.getEmail() == null || s.getPatientId() == null) return;
            String normalized = normalizeEmail(s.getEmail());
            if (identity.findByEmail(normalized).isEmpty()) return;
            issueLinkRequest(s.getPatientId(), event.caseId(), normalized, "INTAKE", s.getLanguage(), clock.instant());
        } catch (RuntimeException e) {
            log.warn("Existing-account check skipped for case {}: {}", event.caseId(), e.getClass().getSimpleName());
        }
    }

    /** What the authenticated account owner is being asked to resolve. Only the address's own account may see it. */
    @Transactional(readOnly = true)
    public AccountLinkRequestView linkRequest(String token) {
        var actor = authority.authorize(Permission.ACCOUNT_BINDING);
        LinkRequest r = requireLink(token, actor);
        var c = cases.findLinkedCase(r.getCaseId()).orElseThrow(() -> new IllegalStateException("Case " + r.getCaseId() + " of an account-link request has no submission contact"));
        return new AccountLinkRequestView(c.getCaseNumber(), PatientNames.display(c.getGivenName(), c.getFamilyName()), r.getOrigin(),
                c.getContactRole(), c.getRelationship(), r.getResolution());
    }

    /**
     * The authenticated owner of the address decides. Nothing here depends on name, email or phone matching:
     * the proof is the Keycloak session for the account that owns the address, plus an explicit statement.
     */
    @Transactional
    public AccountLinkRequestView resolveLinkRequest(String token, AccountLinkResolution decision) {
        var actor = authority.authorize(Permission.ACCOUNT_BINDING);
        LinkRequest r = requireLink(token, actor);
        Instant now = clock.instant();
        if (r.getResolution() != null) return linkRequest(token); // replay: already resolved, no side effects
        String resolution = decision.resolution() == null ? "" : decision.resolution().trim().toUpperCase(Locale.ROOT);
        switch (resolution) {
            case "SAME_PATIENT" -> linkAsSamePatient(r, actor.subject(), now);
            case "REPRESENTATIVE" -> linkAsRepresentative(r, actor.subject(), decision.relationship(), now);
            case "DECLINED" -> decline(r, now);
            default -> throw new ApiException(400, "INVALID_RESOLUTION", "Choose whether this case is for you or for someone else");
        }
        linkRequests.resolve(r.getId(), actor.subject(), resolution, "REPRESENTATIVE".equals(resolution) ? trimToNull(decision.relationship()) : null, micros(now));
        return linkRequest(token);
    }

    /**
     * "This case is mine." If the signed-in account already owns a canonical patient, the pending patient
     * created at intake is folded into it — an explicit, authenticated, audited merge, never an inferred one.
     * Otherwise the account is bound to the pending patient.
     */
    private void linkAsSamePatient(LinkRequest r, String subject, Instant now) {
        Optional<Account> owner = findBySubject(subject);
        if (owner.isPresent() && !owner.get().getPatientId().equals(r.getPatientId())) {
            mergePatient(r.getPatientId(), owner.get().getPatientId(), now);
            audit(r.getCaseId(), "PATIENT_IDENTITY_MERGED", r.getPatientId(), "Account owner confirmed the case is theirs; pending patient folded into canonical patient " + owner.get().getPatientId());
            return;
        }
        if (!changeProfile(r.getPatientId(), p -> p.bindConfirmedOwner(subject, r.getEmail(), now))) throw new ApiException(409, "ALREADY_LINKED", "This profile is already linked to another account");
        changeProfile(r.getPatientId(), p -> p.activateCompletedProfile(now));
        audit(r.getCaseId(), "PATIENT_ACCOUNT_LINKED", r.getPatientId(), "Account owner confirmed the case is theirs");
    }

    /**
     * "I am acting for the patient." The account owner becomes a representative with the platform's existing
     * delegation model; the patient stays a separate person with no account yet. The submitter's channels are
     * moved off the patient so they are never mistaken for the patient's own.
     */
    private void linkAsRepresentative(LinkRequest r, String subject, String relationship, Instant now) {
        String rel = trimToNull(relationship) == null ? "OTHER" : relationship.trim().toUpperCase(Locale.ROOT);
        if (!representatives.existsByPatientIdAndRepresentativeSubjectAndRevokedAtIsNull(r.getPatientId(), subject))
            representatives.saveAndFlush(new PatientRepresentative(r.getPatientId(), subject, rel, "VIEW,MESSAGE,COORDINATE", now, null, now));
        // The representative's email is not the patient's account email.
        changeProfile(r.getPatientId(), p -> p.withdrawEmail(r.getEmail(), false, now));
        // If the intake said "myself", it was in fact a representative: correct the submission record and the
        // number's ownership. A verified OTP on that number proved the representative's possession, not the patient's.
        contacts.markRepresentative(r.getCaseId(), rel);
        // One submission contact per case: its number, if it gave one.
        List<String> submitterNumbers = contacts.findSubmitter(r.getCaseId()).map(CaseSubmissionContactRepository.Submitter::getWhatsapp)
                .map(List::of).orElse(List.of());
        changeProfile(r.getPatientId(), p -> p.withdrawPhone(submitterNumbers, now));
        onboardings.markRepresentative(r.getCaseId(), micros(now));
        audit(r.getCaseId(), "PATIENT_REPRESENTATIVE_LINKED", r.getPatientId(), "Account owner confirmed they act for the patient (" + rel + ")");
    }

    private void decline(LinkRequest r, Instant now) {
        // Not theirs and not for someone they act for: withdraw the address from the pending patient.
        changeProfile(r.getPatientId(), p -> p.withdrawEmail(r.getEmail(), true, now));
        audit(r.getCaseId(), "PATIENT_ACCOUNT_LINK_DECLINED", r.getPatientId(), "Account owner said the case is not theirs; contact email withdrawn, coordinator to follow up");
    }

    /** Fold the pending patient {@code from} into the canonical {@code into}. Every patient-scoped row moves. */
    private void mergePatient(UUID from, UUID into, Instant now) {
        cases.moveToPatient(from, into);
        contacts.moveToPatient(from, into);
        accessLinks.moveToPatient(from, into);
        consentRecords.moveToPatient(from, into);
        onboardings.moveToPatient(from, into);
        identityVerifications.moveToPatient(from, into);
        representatives.deleteDuplicatesOf(from, into);
        representatives.moveAll(from, into);
        linkRequests.moveToSurvivor(from, into);
        changeProfile(from, p -> { p.mergeInto(into, now); return true; });
        // The canonical patient keeps its own name; a WhatsApp number the pending patient supplied is only
        // adopted when the canonical patient has none (it was never a matching key).
        changeProfile(into, p -> { p.touch(now); return true; });
    }

    // ======================================================================
    // internals
    // ======================================================================

    private void sendSetup(String subject, String lang, UUID caseId, UUID patientId, Instant now) {
        // After the Keycloak actions complete the browser is returned straight to the patient's case; the portal
        // finishes sign-in from the fresh Keycloak session without showing the public homepage.
        identity.sendAccountSetup(subject, lang, "/" + lang + "/portal?case=" + caseId + "&continue=1");
        changeProfile(patientId, p -> { p.recordSetupRequested(now); return true; });
        audit(caseId, "PATIENT_ACCOUNT_SETUP_SENT", patientId, "Identity-provider account setup link sent");
    }

    /** One live request per (patient, email): a repeat rotates the token and re-sends, never accumulates. */
    private void issueLinkRequest(UUID patientId, UUID caseId, String email, String origin, String lang, Instant now) {
        String token = randomToken();
        int rotated = linkRequests.rotate(patientId, email, intake.hash(token), micros(now.plus(LINK_TTL)), caseId, origin, micros(now));
        if (rotated == 0) {
            if (linkRequests.existsByPatientIdAndEmail(patientId, email)) return; // already resolved by the account owner: never re-open it
            linkRequests.saveAndFlush(new PatientAccountLinkRequest(patientId, caseId, email, origin, intake.hash(token), now.plus(LINK_TTL), now));
        }
        String payload = intake.encryptedJson("{\"token\":\"" + token + "\",\"lang\":\"" + ("ar".equals(lang) ? "ar" : "en") + "\"}");
        notificationOutbox.enqueue("ACCOUNT_LINK", "EMAIL", email, ACCOUNT_LINK_TEMPLATE, payload, "account-link:" + patientId + ":" + intake.hash(token), now);
        audit(caseId, "PATIENT_ACCOUNT_LINK_REQUESTED", patientId, "Contact email already has an account; neutral continuation link sent (" + origin + ")");
    }

    /**
     * The account is usable only now (profile complete AND identity-provider setup finished), so this is when the
     * patient's readiness changes: a deposit-settled case may move into treatment coordination, and the ball passes to
     * staff. Nothing is announced when the account was already active.
     */
    private void markActive(UUID patientId, Instant now, boolean emailProven) {
        if (changeProfile(patientId, p -> p.activateAccount(emailProven, now)))
            cases.findIdsByPatientId(patientId).forEach(caseId -> events.publishEvent(new CaseEvents.PatientReadinessChanged(caseId)));
    }

    /** Applies one guarded change to the locked, current patient row; saves only when the guard held. */
    private boolean changeProfile(UUID patientId, java.util.function.Predicate<PatientProfile> change) {
        PatientProfile profile = patients.lockById(patientId).orElseThrow(() -> new ApiException(404, "PATIENT_NOT_FOUND", "Patient was not found"));
        if (!change.test(profile)) return false;
        patients.saveAndFlush(profile);
        return true;
    }

    private LinkRequest requireLink(String token, Actor actor) {
        LinkRequest r = linkRequests.findByToken(intake.hash(token)).orElseThrow(() -> new ApiException(404, "ACCOUNT_LINK_INVALID", "This link is invalid or has expired"));
        if (r.getResolution() == null && !r.getExpiresAt().isAfter(clock.instant())) throw new ApiException(410, "ACCOUNT_LINK_EXPIRED", "This link has expired");
        if (r.getResolution() != null && !actor.subject().equals(r.getResolvedSubject())) throw new ApiException(404, "ACCOUNT_LINK_INVALID", "This link is invalid or has expired");
        // Only the account that owns the address may act on it — the token alone is not enough.
        var claim = com.rehletshifaa.authority.application.Principal.accountEmail().orElse(null);
        if (r.getResolution() == null && (claim == null || !claim.email().equals(r.getEmail()))) throw new ApiException(403, "ACCOUNT_LINK_WRONG_ACCOUNT", "Please sign in with the account that received this email");
        return r;
    }

    /**
     * The signed-in patient's own account and profile facts — what "Profile & Security" shows. Case, clinical,
     * proposal and deposit facts deliberately never appear here: they belong to the case.
     */
    @Transactional(readOnly = true)
    public PatientProfileView myProfile() {
        var actor = authority.authorize(Permission.PATIENT_SELF_SERVICE);
        var p = patients.findOwnProfile(actor.subject())
                .orElseThrow(() -> new ApiException(404, "PATIENT_PROFILE_NOT_FOUND", "No patient profile is linked to this account"));
        return new PatientProfileView(p.getGivenName(), p.getFamilyName(), PatientNames.display(p.getGivenName(), p.getFamilyName()), p.getPreferredName(),
                p.getDateOfBirth(), p.getCountry(), p.getNationality(), p.getLanguage(),
                p.getEmail(), p.getEmailVerifiedAt() != null, p.getPhone(), p.getPhoneVerifiedAt() != null, p.getAccountStatus());
    }

    private Optional<Account> findBySubject(String subject) { return patients.findAccountBySubject(subject); }
    private Account load(UUID patientId) {
        return patients.findAccount(patientId).orElseThrow(() -> new ApiException(404, "PATIENT_NOT_FOUND", "Patient profile was not found"));
    }
    private Optional<String> newestPendingEmail(UUID patientId) { return linkRequests.findNewestPendingEmails(patientId, Limit.of(1)).stream().findFirst(); }
    private AccountSetup view(Account a, AccountStatus status, boolean sent) { return new AccountSetup(status, mask(a.getEmail()), status == AccountStatus.SETUP_PENDING, sent); }
    private Optional<IdentityUser> safeFind(java.util.function.Supplier<Optional<IdentityUser>> call) { try { return call.get(); } catch (RuntimeException e) { log.warn("Identity lookup failed: {}", e.getClass().getSimpleName()); return Optional.empty(); } }
    private void audit(UUID caseId, String type, UUID patientId, String reason) {
        auditTrail.event(type).actor("SYSTEM", "PATIENT").caseId(caseId).entity("PatientProfile", patientId).action("ACCOUNT").reason(reason).record();
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
}
