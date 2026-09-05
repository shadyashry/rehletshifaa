package com.rehletshifaa.journey.application;

import com.rehletshifaa.journey.api.JourneyDtos.*;
import com.rehletshifaa.shared.api.ApiException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.*;
import java.util.*;
import java.util.stream.Collectors;

import static com.rehletshifaa.shared.persistence.SqlValues.timestamp;

/**
 * The single, backend-computed source of customer readiness. The frontend renders {@link CustomerReadiness}
 * verbatim and must never infer readiness from unrelated case/proposal statuses. Contact verification (OTP
 * possession) is deliberately kept separate from legal identity verification, account activation and deposit
 * satisfaction — each is its own gate here. No internal cost, margin, provider or finance detail is exposed.
 */
@Service
public class CustomerReadinessService {
    private final JdbcClient jdbc; private final Clock clock; private final PaymentService payment;
    // Onboarding-stage consents that live in the existing consent_records table (never a new table).
    static final List<String> BASE_CONSENTS = List.of("PRIVACY_DATA_PROCESSING", "CROSS_BORDER_CARE", "DEPOSIT_CANCELLATION_TERMS");
    static final String REP_CONSENT = "REPRESENTATIVE_AUTHORIZATION";

    public CustomerReadinessService(JdbcClient jdbc, Clock clock, PaymentService payment) { this.jdbc = jdbc; this.clock = clock; this.payment = payment; }

    public List<String> requiredConsentTypes(String subjectType) {
        List<String> required = new ArrayList<>(BASE_CONSENTS);
        if (subjectType != null && !"PATIENT".equals(subjectType)) required.add(REP_CONSENT);
        return required;
    }

    /** Compute readiness for the case's patient. Throws 404 if the case/patient is unknown. */
    public CustomerReadiness compute(UUID caseId) {
        record P(UUID patientId, String subject, Instant phone, Instant email) {}
        P p = jdbc.sql("SELECT p.id,p.external_subject,p.phone_verified_at,p.email_verified_at FROM medical_cases c JOIN patient_profiles p ON p.id=c.patient_id WHERE c.id=?")
                .param(caseId).query((rs, n) -> new P(rs.getObject("id", UUID.class), rs.getString("external_subject"), instN(rs, "phone_verified_at"), instN(rs, "email_verified_at")))
                .optional().orElseThrow(() -> new ApiException(404, "CASE_NOT_FOUND", "Case was not found"));
        record OB(String state, String subjectType) {}
        OB ob = jdbc.sql("SELECT state,subject_type FROM patient_onboardings WHERE case_id=? ORDER BY created_at DESC LIMIT 1")
                .param(caseId).query((rs, n) -> new OB(rs.getString("state"), rs.getString("subject_type"))).optional().orElse(null);
        // A legacy-reviewed exemption stands in for identity/consent evidence on cases that had already
        // progressed before this layer existed — we never fabricate successful identity evidence.
        boolean legacy = ob != null && "LEGACY_EXEMPT".equals(ob.state());
        String subjectType = ob == null ? null : ob.subjectType();

        boolean accountActivated = p.subject() != null;
        boolean whats = p.phone() != null, mail = p.email() != null;
        boolean contactVerified = whats || mail;
        String verifiedChannel = whats && mail ? "BOTH" : whats ? "WHATSAPP" : mail ? "EMAIL" : null;

        boolean identityRequired = true;
        boolean identityVerified = legacy || identityVerified(p.patientId());

        List<String> required = requiredConsentTypes(subjectType);
        boolean consentsDone = legacy || required.stream().allMatch(t -> consentPresent(p.patientId(), caseId, t));
        boolean repValid = legacy || repAuthValid(p.patientId(), subjectType);

        boolean depositWaived = payment.depositWaived(caseId);
        boolean depositSatisfied = payment.depositSatisfied(caseId);
        boolean depositRequired = payment.anticipatedCoordinationDepositEgp(caseId).signum() > 0 && !depositWaived;
        String depositStatus = payment.depositStatusFor(caseId);

        boolean onboardingCompleted = legacy || (ob != null && "COMPLETED".equals(ob.state()));

        List<BlockingItem> blocking = new ArrayList<>();
        if (!accountActivated) blocking.add(new BlockingItem("ACCOUNT_NOT_ACTIVATED", "Activate your account", "فعّل حسابك"));
        if (!contactVerified) blocking.add(new BlockingItem("CONTACT_NOT_VERIFIED", "Verify a contact channel", "تأكيد وسيلة تواصل"));
        if (identityRequired && !identityVerified) blocking.add(new BlockingItem("IDENTITY_NOT_VERIFIED", "Complete identity verification", "أكمل التحقق من الهوية"));
        if (!repValid) blocking.add(new BlockingItem("REPRESENTATIVE_AUTH_MISSING", "Representative authorization required", "مطلوب تفويض ممثّل ساري"));
        if (!consentsDone) blocking.add(new BlockingItem("CONSENTS_INCOMPLETE", "Complete required consents", "أكمل الموافقات المطلوبة"));
        if (depositRequired && !depositSatisfied) blocking.add(new BlockingItem("DEPOSIT_UNPAID", "Pay or waive the coordination deposit", "سداد وديعة التنسيق أو إعفاؤها"));
        if (!onboardingCompleted && !legacy) blocking.add(new BlockingItem("ONBOARDING_INCOMPLETE", "Review and submit your onboarding", "راجِع وأرسل بيانات التسجيل"));
        boolean ready = blocking.isEmpty();

        return new CustomerReadiness(accountActivated, contactVerified, verifiedChannel, identityRequired, identityVerified,
                onboardingCompleted, consentsDone, repValid, depositRequired, depositStatus, depositSatisfied, blocking, ready, clock.instant());
    }

    /** True when everything except the final onboarding submission is satisfied (used by submit()). */
    public boolean readyToSubmit(UUID caseId) {
        return compute(caseId).blockingItems().stream().allMatch(b -> "ONBOARDING_INCOMPLETE".equals(b.code()));
    }

    /**
     * Server-side enforcement before any chargeable / non-cancellable commitment. Legacy cases with no
     * onboarding record keep the pre-existing deposit gate; cases that went through this layer must be fully
     * ready. Returns structured, patient-safe blocking reasons — never a bare 409.
     */
    public void assertReadyForCommitment(UUID caseId) {
        Integer hasOnboarding = jdbc.sql("SELECT count(*) FROM patient_onboardings WHERE case_id=?").param(caseId).query(Integer.class).single();
        if (hasOnboarding == null || hasOnboarding == 0) {
            if (!payment.depositSatisfied(caseId)) throw new ApiException(409, "DEPOSIT_REQUIRED", "The required deposit must be paid before confirming a non-cancellable booking");
            return;
        }
        CustomerReadiness r = compute(caseId);
        if (!r.readyForCoordination()) {
            String reasons = r.blockingItems().stream().map(BlockingItem::labelEn).collect(Collectors.joining("; "));
            throw new ApiException(409, "COORDINATION_NOT_READY", "The customer is not ready for chargeable coordination — outstanding steps: " + reasons);
        }
    }

    private boolean identityVerified(UUID patientId) {
        Integer c = jdbc.sql("SELECT count(*) FROM patient_identity_verifications WHERE patient_id=? AND status='VERIFIED' AND (expires_at IS NULL OR expires_at>?)")
                .params(patientId, timestamp(clock.instant())).query(Integer.class).single();
        return c != null && c > 0;
    }
    private boolean consentPresent(UUID patientId, UUID caseId, String type) {
        Integer c = jdbc.sql("SELECT count(*) FROM consent_records WHERE patient_id=? AND consent_type=? AND revoked_at IS NULL AND (case_id IS NULL OR case_id=?)")
                .params(patientId, type, caseId).query(Integer.class).single();
        return c != null && c > 0;
    }
    private boolean repAuthValid(UUID patientId, String subjectType) {
        // The patient acting for themselves, or a payer (who never receives clinical access), needs no
        // delegation. A guardian/representative needs an active, non-expired authorization row.
        if (subjectType == null || "PATIENT".equals(subjectType) || "PAYER".equals(subjectType)) return true;
        Integer c = jdbc.sql("SELECT count(*) FROM patient_representatives WHERE patient_id=? AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>?)")
                .params(patientId, timestamp(clock.instant())).query(Integer.class).single();
        return c != null && c > 0;
    }
    private static Instant instN(ResultSet rs, String col) throws SQLException { OffsetDateTime v = rs.getObject(col, OffsetDateTime.class); return v == null ? null : v.toInstant(); }
}
