package com.rehletshifaa.journey.application;

import com.rehletshifaa.authority.application.Actor;
import com.rehletshifaa.authority.application.Authority;
import com.rehletshifaa.authority.domain.Permission;
import com.rehletshifaa.clinic.application.ConsultantOperationsOwnershipService;
import com.rehletshifaa.clinic.application.VirtualClinicService;
import com.rehletshifaa.clinic.infrastructure.CareCategoryRepository;
import com.rehletshifaa.directory.domain.PractitionerCredential;
import com.rehletshifaa.directory.domain.PractitionerProfile;
import com.rehletshifaa.directory.infrastructure.PractitionerCredentialRepository;
import com.rehletshifaa.directory.infrastructure.PractitionerProfileRepository;
import com.rehletshifaa.identity.operations.IdentityOperationRequested;
import com.rehletshifaa.journey.api.JourneyDtos.CredentialRequest;
import com.rehletshifaa.journey.api.JourneyDtos.IdResponse;
import com.rehletshifaa.journey.api.JourneyDtos.PractitionerRequest;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.audit.AuditTrail;
import com.rehletshifaa.shared.crypto.CryptoService;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/**
 * Consultant onboarding and credentialing (extracted from {@code JourneyService}): create or invite a consultant,
 * resend the invitation, enable or disable the account, add credentials and decide credentialing. Identity-provider
 * work is queued as identity operations and runs after commit.
 */
@Service
public class ConsultantOnboardingService {
    private final PractitionerProfileRepository practitioners;
    private final PractitionerCredentialRepository credentials;
    private final CareCategoryRepository careCategories;
    private final ConsultantOperationsOwnershipService consultantOwnership;
    private final VirtualClinicService clinics;
    private final PricingCatalogService pricingCatalog;
    private final Authority authority;
    private final CryptoService crypto;
    private final AuditTrail auditTrail;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    public ConsultantOnboardingService(PractitionerProfileRepository practitioners, PractitionerCredentialRepository credentials,
                                       CareCategoryRepository careCategories, ConsultantOperationsOwnershipService consultantOwnership,
                                       VirtualClinicService clinics, PricingCatalogService pricingCatalog, Authority authority,
                                       CryptoService crypto, AuditTrail auditTrail, ApplicationEventPublisher events, Clock clock) {
        this.practitioners = practitioners; this.credentials = credentials; this.careCategories = careCategories;
        this.consultantOwnership = consultantOwnership; this.clinics = clinics; this.pricingCatalog = pricingCatalog;
        this.authority = authority; this.crypto = crypto; this.auditTrail = auditTrail; this.events = events; this.clock = clock;
    }

    @Transactional
    public IdResponse createPractitioner(PractitionerRequest request) {
        var actor = authority.authorize(Permission.CONSULTANT_ONBOARD);
        if (request.careCategory() != null && !careCategories.existsBySlug(request.careCategory()))
            throw new ApiException(400, "INVALID_CARE_CATEGORY", "Select a managed care category");
        UUID id = UUID.randomUUID();
        Instant now = clock.instant();
        String subject = request.externalSubject(), email = null, accountStatus = "ACTIVE";
        if (request.email() != null && !request.email().isBlank()) {
            email = request.email().trim().toLowerCase(Locale.ROOT);
            if (practitioners.existsByEmailHash(emailHash(email)))
                throw new ApiException(409, "PRACTITIONER_EMAIL_EXISTS", "A consultant account already uses this email address");
            subject = null;
            accountStatus = "INVITED";
        }
        if ((subject == null || subject.isBlank()) && email == null)
            throw new ApiException(400, "PRACTITIONER_IDENTITY_REQUIRED", "Enter the consultant's work email");
        var clinical = new PractitionerProfile.Clinical(request.legalName(), request.displayName(), request.registrationNumber(),
                request.specialty(), request.subspecialty(), request.qualifications(), request.appointments(), request.hospitalPrivileges(),
                request.languages(), request.approvedProcedures(), request.indemnityReference(), request.contractStatus(), request.expectedReviewHours());
        practitioners.saveAndFlush(PractitionerProfile.onboard(id, subject, clinical,
                request.availabilityStatus() == null ? "UNAVAILABLE" : request.availabilityStatus(),
                request.practitionerType() == null ? "CONSULTANT" : request.practitionerType(), request.careCategory(),
                email == null ? null : crypto.encrypt(email), email == null ? null : emailHash(email), accountStatus,
                email == null ? null : now, now));
        consultantOwnership.assign(id, new ConsultantOperationsOwnershipService.Assign(actor.subject(), "Initial Consultant Operations ownership"));
        if (email != null) {
            String locale = "ar".equals(request.locale()) ? "ar" : "en";
            events.publishEvent(IdentityOperationRequested.create(UUID.randomUUID(), "practitioner-invite:" + id,
                    IdentityOperationRequested.Type.CREATE_PRACTITIONER, actor.subject(), "Create consultant identity and send invitation",
                    "Practitioner", id, Map.of("name", request.legalName().trim(), "email", email, "locale", locale)));
        }
        audit(email == null ? "PRACTITIONER_CREATED" : "PRACTITIONER_INVITE_QUEUED", actor, "Practitioner", id, "CREATE", null);
        clinics.ensureClinic(id);
        pricingCatalog.autoDeriveOnCreate(id, request.careCategory(), actor.subject());
        return new IdResponse(id, email == null ? "UNDER_REVIEW" : "INVITED");
    }

    @Transactional
    public IdResponse resendPractitionerInvite(UUID id, String locale) {
        var actor = authority.authorize(Permission.CONSULTANT_ONBOARD);
        String subject = practitionerSubject(id);
        practitioners.markInvited(id, micros(clock.instant()));
        long revision = practitioners.findById(id).orElseThrow().getVersion();
        events.publishEvent(IdentityOperationRequested.resend(UUID.randomUUID(), "practitioner-resend:" + id + ":" + revision, subject,
                actor.subject(), "Resend an existing identity invitation", locale));
        audit("PRACTITIONER_INVITE_RESEND_QUEUED", actor, "Practitioner", id, "RESEND", null);
        return new IdResponse(id, "INVITED");
    }

    @Transactional
    public IdResponse setPractitionerEnabled(UUID id, boolean enabled) {
        var actor = authority.authorize(Permission.CONSULTANT_ONBOARD);
        String subject = practitionerSubject(id);
        Instant now = micros(clock.instant());
        if (practitioners.setAccountStatus(id, enabled ? "ACTIVE" : "DISABLED", enabled ? null : now, now) != 1)
            throw new ApiException(409, "PRACTITIONER_STATE_CONFLICT", "The consultant account changed; reload and try again");
        long revision = practitioners.findById(id).orElseThrow().getVersion();
        events.publishEvent(IdentityOperationRequested.state(UUID.randomUUID(), "practitioner:" + id + ":" + revision, subject, enabled,
                actor.subject(), enabled ? "Restore sign-in after business lifecycle decision" : "Disable sign-in and end sessions after business lifecycle decision"));
        audit(enabled ? "PRACTITIONER_ENABLE_QUEUED" : "PRACTITIONER_DISABLE_QUEUED", actor, "Practitioner", id, enabled ? "ENABLE" : "DISABLE", null);
        return new IdResponse(id, enabled ? "ACTIVE" : "DISABLED");
    }

    @Transactional
    public IdResponse addCredential(UUID practitionerId, CredentialRequest request) {
        var actor = authority.authorize(Permission.CREDENTIAL_DECIDE);
        UUID id = UUID.randomUUID();
        credentials.saveAndFlush(new PractitionerCredential(id, practitionerId, request.credentialType(), request.referenceNumber(),
                request.source(), request.evidenceDocumentId(), request.issuedAt(), request.expiresAt(), clock.instant()));
        consultantOwnership.openCredentialReview(practitionerId, id);
        audit("PRACTITIONER_CREDENTIAL_ADDED", actor, "PractitionerCredential", id, "CREATE", null);
        return new IdResponse(id, "UNDER_REVIEW");
    }

    @Transactional
    public IdResponse verifyPractitioner(UUID practitionerId, boolean approved, String reason) {
        var actor = authority.authorize(Permission.CREDENTIAL_DECIDE);
        consultantOwnership.requireCredentialReviewer(practitionerId, actor.subject());
        Instant now = micros(clock.instant());
        if (approved) {
            if (credentials.countCurrentUnderReview(practitionerId, now) == 0)
                throw new ApiException(409, "CURRENT_CREDENTIAL_REQUIRED", "At least one current credential must be reviewed before approval");
        } else if (reason == null || reason.isBlank()) throw new ApiException(400, "REJECTION_REASON_REQUIRED", "A rejection reason is required");
        String status = approved ? "VERIFIED" : "REJECTED";
        if (practitioners.decideCredentialing(practitionerId, status, approved ? null : reason, now) != 1)
            throw new ApiException(409, "PRACTITIONER_STATE_CONFLICT", "The practitioner is no longer awaiting a decision");
        credentials.decideUnderReview(practitionerId, status, actor.subject(), now);
        audit("PRACTITIONER_VERIFIED", actor, "Practitioner", practitionerId, approved ? "APPROVE" : "REJECT", reason);
        return new IdResponse(practitionerId, status);
    }

    private String practitionerSubject(UUID id) {
        return practitioners.findById(id).map(PractitionerProfile::getExternalSubject)
                .orElseThrow(() -> new ApiException(404, "PRACTITIONER_NOT_FOUND", "Consultant profile was not found"));
    }

    private void audit(String type, Actor actor, String entity, UUID entityId, String action, String reason) {
        auditTrail.event(type).actor(actor.subject(), actor.label()).entity(entity, entityId).action(action).reason(reason).record();
    }

    private static String emailHash(String email) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(email.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException("Unable to normalize staff email", e);
        }
    }
}
