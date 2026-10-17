package com.rehletshifaa.journey.application;

import com.rehletshifaa.casemanagement.application.IntakeLifecycleService;
import com.rehletshifaa.casemanagement.infrastructure.MedicalCaseRepository;
import com.rehletshifaa.directory.infrastructure.PatientProfileRepository;
import com.rehletshifaa.journey.api.JourneyDtos.ProposalAccessGrant;
import com.rehletshifaa.journey.api.JourneyDtos.ProposalView;
import com.rehletshifaa.journey.api.JourneyDtos.PublicProposalSummary;
import com.rehletshifaa.journey.api.JourneyDtos.PublicProposalView;
import com.rehletshifaa.journey.domain.ProposalAccessChallenge;
import com.rehletshifaa.journey.infrastructure.ProposalAccessChallengeRepository;
import com.rehletshifaa.journey.infrastructure.ProposalShareTokenRepository;
import com.rehletshifaa.journey.infrastructure.ProposalVersionRepository;
import com.rehletshifaa.notification.application.NotificationOutbox;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.audit.AuditTrail;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/** Secure proposal links, one-time verification codes and the resulting view grants. */
@Service
public class PublicProposalSessionService {
    private final ProposalAccessChallengeRepository accessChallenges;
    private final ProposalShareTokenRepository shareTokens;
    private final ProposalVersionRepository proposalVersions;
    private final IntakeLifecycleService intake;
    private final MedicalCaseRepository cases;
    private final PatientProfileRepository patients;
    private final CaseContactResolver caseContacts;
    private final OnboardingService onboarding;
    private final ProposalQueryService proposalQueries;
    private final PaymentService payment;
    private final NotificationOutbox notificationOutbox;
    private final AuditTrail auditTrail;
    private final ApplicationEventPublisher events;
    private final Clock clock;
    private final SecureRandom random = new SecureRandom();

    public PublicProposalSessionService(
            ProposalAccessChallengeRepository accessChallenges, ProposalShareTokenRepository shareTokens,
            ProposalVersionRepository proposalVersions, IntakeLifecycleService intake, MedicalCaseRepository cases,
            PatientProfileRepository patients, CaseContactResolver caseContacts, OnboardingService onboarding,
            ProposalQueryService proposalQueries, PaymentService payment, NotificationOutbox notificationOutbox,
            AuditTrail auditTrail, ApplicationEventPublisher events, Clock clock) {
        this.accessChallenges = accessChallenges;
        this.shareTokens = shareTokens;
        this.proposalVersions = proposalVersions;
        this.intake = intake;
        this.cases = cases;
        this.patients = patients;
        this.caseContacts = caseContacts;
        this.onboarding = onboarding;
        this.proposalQueries = proposalQueries;
        this.payment = payment;
        this.notificationOutbox = notificationOutbox;
        this.auditTrail = auditTrail;
        this.events = events;
        this.clock = clock;
    }

    private static final Duration ACCESS_CODE_TTL=Duration.ofMinutes(15);
    private static final int ACCESS_MAX_ATTEMPTS=5;
    private static final Duration ACCESS_GRANT_TTL=Duration.ofMinutes(30);
    private static final int ACCESS_RESEND_MAX_PER_HOUR=5;

    /** Minimal, non-sensitive summary for a valid link: enough to start verification, nothing more. */
    @Transactional(readOnly=true) public PublicProposalSummary publicProposalSummary(String token){ShareToken share=findShareToken(token);Contact c=proposalContact(share.caseId());String channel=hasText(c.whatsapp())?"WHATSAPP":"EMAIL";String destination=channel.equals("WHATSAPP")?c.whatsapp():c.email();return new PublicProposalSummary(c.caseNumber(),channel,maskContact(destination),hasText(c.whatsapp())?maskContact(c.whatsapp()):null,hasText(c.email())?maskContact(c.email()):null);}

    /** Mints and delivers a one-time OTP to the already-verified contact. Rate limited; neutral output. */
    @Transactional public PublicProposalSummary requestProposalAccess(String token){return requestProposalAccess(token,null);}
    /**
     * Mints and delivers a one-time OTP to the patient's own registered contact. When both a WhatsApp
     * number and an email are on file the patient may pick either channel (default WhatsApp); the
     * destination is ALWAYS taken from the profile — never a caller-supplied value. Resending or switching
     * channels revokes the previous active challenge and mints a fresh, independent one. Neutral output.
     */
    @Transactional public PublicProposalSummary requestProposalAccess(String token,String requestedChannel){ShareToken share=findShareToken(token);requireDecidableProposal(share.versionId());Instant now=clock.instant();long recent=accessChallenges.countByShareTokenIdAndCreatedAtAfter(share.shareId(),micros(now.minus(Duration.ofHours(1))));if(recent>=ACCESS_RESEND_MAX_PER_HOUR)throw new ApiException(429,"TOO_MANY_REQUESTS","Too many verification requests. Please try again later.");accessChallenges.revokeOpen(share.shareId(),micros(now));Contact c=proposalContact(share.caseId());String channel=chooseChannel(requestedChannel,c.whatsapp(),c.email());String destination="WHATSAPP".equals(channel)?c.whatsapp():c.email();String hint=maskContact(destination);UUID id=UUID.randomUUID();String code="%06d".formatted(random.nextInt(1_000_000));accessChallenges.saveAndFlush(new ProposalAccessChallenge(id,new ProposalAccessChallenge.Target(share.shareId(),share.versionId(),share.caseId()),intake.hash(code),channel,hint,now.plus(ACCESS_CODE_TTL),ACCESS_MAX_ATTEMPTS,now));notificationOutbox.enqueue("PROPOSAL_ACCESS", channel, destination, "proposal-access-code", intake.encryptedJson("{\"code\":\""+code+"\",\"lang\":\""+("ar".equals(c.language())?"ar":"en")+"\"}"), "proposal-access:"+id, now);auditPublic("PROPOSAL_ACCESS_REQUESTED",share.caseId(),share.versionId().toString(),"REQUEST_ACCESS");return new PublicProposalSummary(c.caseNumber(),channel,hint,hasText(c.whatsapp())?maskContact(c.whatsapp()):null,hasText(c.email())?maskContact(c.email()):null);}

    /** Verifies the OTP and issues a short-lived, hashed view grant. Neutral errors; brute-force capped. */
    @Transactional(noRollbackFor=ApiException.class) public ProposalAccessGrant verifyProposalAccess(String token,String code){ShareToken share=findShareToken(token);requireDecidableProposal(share.versionId());Instant now=clock.instant();AccessChallenge ch=accessChallenges.findLatest(share.shareId(),Limit.of(1)).stream().findFirst().map(c->new AccessChallenge(c.getId(),c.getCodeHash(),c.getExpiresAt(),c.getAttempts(),c.getMaxAttempts(),c.getConsumedAt(),c.getRevokedAt(),c.getDeliveryChannel())).orElseThrow(()->new ApiException(400,"VERIFICATION_INVALID","The verification code is invalid or has expired"));if(ch.consumedAt()!=null||ch.revokedAt()!=null||ch.expiresAt().isBefore(now)||ch.attempts()>=ch.maxAttempts())throw new ApiException(400,"VERIFICATION_INVALID","The verification code is invalid or has expired");boolean matches=java.security.MessageDigest.isEqual(ch.hash().getBytes(StandardCharsets.US_ASCII),intake.hash(code).getBytes(StandardCharsets.US_ASCII));if(!matches){int attempts=ch.attempts()+1;int updated=accessChallenges.recordFailedAttempt(ch.id(),ch.attempts(),attempts,micros(now));if(updated!=1)throw new ApiException(400,"VERIFICATION_INVALID","The verification code is invalid or has expired");auditPublic("PROPOSAL_ACCESS_FAILED",share.caseId(),share.versionId().toString(),"VERIFY");throw new ApiException(400,"VERIFICATION_INVALID","The verification code is invalid or has expired");}String grant=randomToken();Instant grantExp=now.plus(ACCESS_GRANT_TTL);int consumed=accessChallenges.consume(ch.id(),ch.attempts(),intake.hash(grant),micros(grantExp),micros(now));if(consumed!=1)throw new ApiException(400,"VERIFICATION_INVALID","The verification code is invalid or has expired");proposalVersions.markViewed(share.versionId(),micros(now));
        // A verified OTP proves control of ONE registered contact channel (CONTACT_VERIFIED) — never legal
        // identity. Stamp only the channel that was actually used, preserving any existing timestamps.
        markContactVerified(share.caseId(),ch.channel(),now);auditPublic("PROPOSAL_ACCESS_VERIFIED",share.caseId(),share.versionId().toString(),"VERIFY");return new ProposalAccessGrant(grant,grantExp,share.versionId());}
    /** Sets ONLY the timestamp for the channel that carried the OTP: WhatsApp -> phone_verified_at,
     *  email -> email_verified_at. Never marks the other channel, never erases existing evidence. */
    private void markContactVerified(UUID caseId,String channel,Instant now){
        String column="WHATSAPP".equals(channel)?"phone_verified_at":"EMAIL".equals(channel)?"email_verified_at":null;
        if(column==null)return;
        // A code delivered to the SUBMITTER's channel proves their possession, not the patient's: stamp nothing.
        if(!caseContacts.resolve(caseId).patientOwns(channel)){onboarding.markContactVerified(caseId,now);events.publishEvent(new CaseEvents.PatientReadinessChanged(caseId));return;}
        markPatientChannelVerified(caseId,channel,now);
        onboarding.markContactVerified(caseId,now);
        events.publishEvent(new CaseEvents.PatientReadinessChanged(caseId));
    }

    /** Full sensitive view — only reachable with a valid link AND a valid grant from OTP verification. */
    @Transactional(readOnly=true) public PublicProposalView viewProposal(String token,String grant){ShareToken share=requireGrant(token,grant);ProposalView view=proposal(share.versionId());
        var m=proposalQueries.patientDocument(share.versionId());
        // Totals are the EGP package converted at the SNAPSHOT rate frozen at release. A base-currency proposal has
        // rate 1; a foreign-currency one always carries its snapshot (release refuses otherwise), so a missing rate
        // is a data fault to surface, never a reason to show EGP figures under a foreign-currency label.
        if(m.getFxRate()==null&&m.getCurrency()!=null&&!com.rehletshifaa.shared.currency.CurrencyService.BASE.equals(m.getCurrency()))throw new ApiException(409,"PROPOSAL_FX_SNAPSHOT_MISSING","This proposal has no exchange-rate snapshot and cannot be shown");
        BigDecimal fx=m.getFxRate()==null?BigDecimal.ONE:m.getFxRate();java.util.function.Function<BigDecimal,BigDecimal> conv=egp->egp==null?null:egp.multiply(fx).setScale(2,java.math.RoundingMode.HALF_UP);
        boolean decided=!Set.of("RELEASED","VIEWED").contains(view.status());String decisionState=decided?view.status():null;
        boolean isFinal="FINAL_TREATMENT_QUOTE".equals(m.getDocumentType());
        BigDecimal depositDueDisplay=isFinal?null:payment.depositDueDisplay(share.caseId(),share.versionId());
        BigDecimal depositPaidDisplay=isFinal?conv.apply(payment.netPaidEgp(share.caseId())):null;
        var totals=proposalQueries.displayTotals(share.versionId(),fx); // QA #12: the totals are the sum of the lines shown
        return new PublicProposalView(m.getCaseNumber(),m.getPatientName(),m.getDocumentType(),m.getVersionNumber(),m.getCurrency(),view.items(),totals.min(),totals.expected(),totals.max(),m.getAssumptions(),m.getIncludedServices(),m.getExcludedServices(),m.getScopeChangeReason(),m.getPaymentTerms(),m.getRefundTerms(),m.getDisclaimers(),m.getValidUntil(),decided,decisionState,m.getRecommendedTreatment(),m.getRisksAndLimitations(),view.coordinatorNotes(),depositDueDisplay,depositPaidDisplay,m.getConsultantName(),m.getFxRateDate(),proposalQueries.assistance(share.versionId()),view.acceptableFrom(),view.fxReapprovalStatus(),m.getReleasedAt(),view.payeeTotals());}

    public record GrantContext(UUID caseId, UUID patientId, UUID versionId) {}

    record DecisionGrant(UUID shareId, UUID caseId, UUID versionId) {}

    DecisionGrant requireDecisionGrant(String token, String grant) {
        ShareToken share = requireGrant(token, grant);
        return new DecisionGrant(share.shareId(), share.caseId(), share.versionId());
    }

    /** Resolves an already-verified proposal grant to its canonical patient/case without exposing token internals. */
    @Transactional(readOnly=true) public GrantContext requireProposalGrant(String token,String grant){
        ShareToken share=requireGrant(token,grant);
        UUID patientId=cases.findPatientId(share.caseId()).orElseThrow();
        return new GrantContext(share.caseId(),patientId,share.versionId());
    }

    private ShareToken requireGrant(String token,String grant){ShareToken share=findShareToken(token);if(!accessChallenges.hasLiveGrant(share.shareId(),intake.hash(grant),micros(clock.instant())))throw new ApiException(401,"VERIFICATION_REQUIRED","Please verify your identity to view this proposal");return share;}

    private Contact proposalContact(UUID caseId){var c=caseContacts.resolve(caseId);return new Contact(c.caseNumber(),c.whatsapp(),c.email(),c.preferredLanguage());}

    private String randomToken(){return UUID.randomUUID().toString().replace("-","")+UUID.randomUUID().toString().replace("-","");}

    private boolean hasText(String value){return value!=null&&!value.isBlank();}

    private String chooseChannel(String requested,String whatsapp,String email){
        if(requested==null||requested.isBlank())return hasText(whatsapp)?"WHATSAPP":"EMAIL";
        String c=requested.toUpperCase(Locale.ROOT);
        if(!"WHATSAPP".equals(c)&&!"EMAIL".equals(c))throw new ApiException(400,"INVALID_CONTACT_CHANNEL","Choose WhatsApp or email");
        String dest="WHATSAPP".equals(c)?whatsapp:email;
        if(!hasText(dest))throw new ApiException(409,"CONTACT_CHANNEL_UNAVAILABLE","That contact method is not on file for this case");
        return c;
    }

    private String maskContact(String value){return ProposalQueryService.maskContact(value);}

    private ShareToken findShareToken(String token){return shareTokens.findLive(intake.hash(token)).map(l->new ShareToken(l.getId(),l.getVersionId(),l.getCaseId(),l.getConsumedAt(),l.getRevokedAt(),l.getExpiresAt())).filter(s->s.expiresAt().isAfter(clock.instant())).orElseThrow(()->new ApiException(404,"PROPOSAL_LINK_INVALID","This proposal link is invalid or has expired"));}

    private void auditPublic(String type,UUID caseId,String entityId,String action){auditTrail.event(type).actor("SECURE_LINK", "PATIENT").caseId(caseId).entity("ProposalVersion", entityId).action(action).record();}

    private void requireDecidableProposal(UUID versionId){ProposalView view=proposal(versionId);if(!Set.of("RELEASED","VIEWED").contains(view.status()))throw new ApiException(409,"PROPOSAL_NOT_DECIDABLE","This proposal can no longer be viewed or decided");if(view.validUntil()!=null&&!view.validUntil().isAfter(clock.instant()))throw new ApiException(410,"PROPOSAL_EXPIRED","This proposal has expired");}

    private ProposalView proposal(UUID versionId){return proposalQueries.proposal(versionId);}

    private void markPatientChannelVerified(UUID caseId,String channel,Instant now){UUID patientId=cases.findPatientId(caseId).orElseThrow();var profile=patients.lockById(patientId).orElseThrow();profile.markChannelVerified(channel,now);patients.saveAndFlush(profile);}

    private record AccessChallenge(UUID id,String hash,Instant expiresAt,int attempts,int maxAttempts,Instant consumedAt,Instant revokedAt,String channel){}
    private record Contact(String caseNumber,String whatsapp,String email,String language){}
    private record ShareToken(UUID shareId,UUID versionId,UUID caseId,Instant consumedAt,Instant revokedAt,Instant expiresAt){}
}
