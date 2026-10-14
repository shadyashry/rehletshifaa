package com.rehletshifaa.casemanagement.application;

import com.rehletshifaa.casemanagement.api.CaseDtos.CreateCaseRequest;
import com.rehletshifaa.casemanagement.application.CaseStatusLog;
import com.rehletshifaa.casemanagement.application.SubmissionDocuments;
import com.rehletshifaa.casemanagement.domain.CaseAccessLink;
import com.rehletshifaa.casemanagement.domain.CaseSubmissionContact;
import com.rehletshifaa.casemanagement.domain.ConsentRecord;
import com.rehletshifaa.casemanagement.domain.MedicalCase;
import com.rehletshifaa.casemanagement.infrastructure.CaseAccessLinkRepository;
import com.rehletshifaa.casemanagement.infrastructure.CaseSubmissionContactRepository;
import com.rehletshifaa.casemanagement.infrastructure.ConsentRecordRepository;
import com.rehletshifaa.directory.domain.PatientProfile;
import com.rehletshifaa.directory.infrastructure.PatientProfileRepository;
import com.rehletshifaa.notification.application.NotificationOutbox;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.audit.AuditTrail;
import com.rehletshifaa.shared.crypto.CryptoService;
import com.rehletshifaa.shared.util.PatientNames;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;
import java.util.UUID;

@Service
public class IntakeLifecycleService {
    private final SubmissionDocuments submissionDocuments;
    private final CaseAccessLinkRepository links;
    private final ConsentRecordRepository consents;
    private final CaseSubmissionContactRepository contacts;
    private final CaseStatusLog statusLog;
    private final PatientProfileRepository patients;
    private final NotificationOutbox notificationOutbox;
    private final AuditTrail auditTrail;
    private final Clock clock; private final SecureRandom random = new SecureRandom();
    private final CryptoService crypto;
    private final String pepper;
    private final String coordinatorEmail;
    public IntakeLifecycleService(Clock clock, @Value("${app.claim.pepper}")String pepper,
                                  @Value("${app.mail.coordinator}")String coordinatorEmail,
                                  CryptoService crypto, AuditTrail auditTrail, NotificationOutbox notificationOutbox, PatientProfileRepository patients, CaseStatusLog statusLog, CaseSubmissionContactRepository contacts, ConsentRecordRepository consents, CaseAccessLinkRepository links, SubmissionDocuments submissionDocuments) { this.submissionDocuments = submissionDocuments; this.links = links; this.consents = consents; this.contacts = contacts; this.statusLog = statusLog; this.patients = patients; this.notificationOutbox = notificationOutbox; this.auditTrail = auditTrail;
        this.clock=clock;this.pepper=pepper;this.coordinatorEmail=coordinatorEmail;this.crypto=crypto;
    }

    /**
     * Creates the provisional patient record a new intake case belongs to.
     * The submitter's channels are the PATIENT's only when the patient is submitting. A representative's
     * email/WhatsApp is recorded on the submission contact and never promoted into the patient's identity.
     * Email captured here is a candidate contact — unverified until the patient proves ownership later.
     */
    @Transactional public UUID registerPatient(CreateCaseRequest request) {
        Instant now=clock.instant(); UUID patientId=UUID.randomUUID();
        String given=PatientNames.clean(request.givenName()), family=blankToNull(PatientNames.clean(request.familyName()));
        boolean self=!request.forSomeoneElse();
        patients.saveAndFlush(PatientProfile.submitted(patientId,given,family,request.country().trim(),self?request.whatsappNumber().trim():null,
                self?blankToNull(request.email()):null,request.preferredLanguage(),blankToNull(request.timeZone()),now));
        return patientId;
    }

    /** The intake consent's policy version: v2 adds the medical disclaimer (review 2026-10-14, A-02). */
    public static final String INTAKE_CONSENT_VERSION = "intake-v2";
    /** The consent sentence and the medical disclaimer beside it, in the words Send my case shows (form.consent, form.medicalDisclaimer). */
    static final String CONSENT_EN = "I consent to RehletShifaa processing the information I submit for the purpose of coordinating my medical case.";
    static final String DISCLAIMER_EN = "I understand that RehletShifaa coordinates access to medical review and care, is not an emergency service and does not replace a clinical assessment. In an emergency I will seek local care now.";
    static final String CONSENT_AR = "أوافق على معالجة رحلة شفاء للمعلومات التي أقدمها لغرض تنسيق حالتي الطبية.";
    static final String DISCLAIMER_AR = "أفهم أن رحلة شفاء تنسّق الوصول إلى المراجعة والرعاية الطبية، وأنها ليست خدمة طوارئ ولا تحلّ محل التقييم السريري. في حالة الطوارئ سأطلب الرعاية المحلية فورًا.";

    /** What the patient agreed to at intake, in their language: data processing plus the medical disclaimer. */
    static ConsentRecord.Terms intakeConsentTerms(String language) {
        boolean ar = "ar".equals(language);
        String text = ar ? CONSENT_AR + " " + DISCLAIMER_AR : CONSENT_EN + " " + DISCLAIMER_EN;
        return new ConsentRecord.Terms("DATA_PROCESSING", INTAKE_CONSENT_VERSION, ar ? "ar" : "en", text, "Medical case coordination", "Submitted case data");
    }

    /**
     * Records who submitted the draft case and their consent. No verification challenge (OTP) is generated here: a
     * draft may still be receiving document uploads, and we must not start an expiry clock before the case is
     * actually submitted.
     */
    @Transactional public void createFoundation(MedicalCase medicalCase, CreateCaseRequest request) { createFoundation(medicalCase, request, null); }
    /** {@code submittedBy}: the signed-in account that sent the case, recorded as the consent's capturer and the actor. */
    @Transactional public void createFoundation(MedicalCase medicalCase, CreateCaseRequest request, String submittedBy) {
        Instant now=clock.instant(); UUID patientId=medicalCase.getPatientId();
        String actor=submittedBy==null?"guest":submittedBy, actorRole=submittedBy==null?"GUEST":"PATIENT_REPRESENTATIVE";
        String displayName=PatientNames.display(request.givenName(),request.familyName());
        boolean self=!request.forSomeoneElse();
        var rep=request.representative();
        contacts.saveAndFlush(new CaseSubmissionContact(medicalCase.getId(),patientId,self?"PATIENT":"REPRESENTATIVE",self?displayName:PatientNames.clean(rep==null?null:rep.name()), self?null:(rep==null?null:rep.relationship()),blankToNull(request.email()),request.whatsappNumber().trim(),request.preferredLanguage(),now));
        consents.saveAndFlush(new ConsentRecord(UUID.randomUUID(),patientId,medicalCase.getId(),intakeConsentTerms(request.preferredLanguage()),"WEB",actor,now));
        audit("CASE_INTAKE_CREATED",actor,actorRole,medicalCase.getId(),"MedicalCase",medicalCase.getId().toString(),"CREATE","SUCCESS",null,now);
    }

    /**
     * A returning, signed-in patient starting another case: the SAME canonical patient owns the new case.
     * No patient row, submission contact or consent is duplicated beyond what this case needs.
     */
    @Transactional public void createFoundationForExistingPatient(MedicalCase medicalCase, String consentLanguage) {
        Instant now=clock.instant(); UUID patientId=medicalCase.getPatientId();
        PatientProfile p=patients.findById(patientId).orElseThrow();
        contacts.saveAndFlush(new CaseSubmissionContact(medicalCase.getId(),patientId,"PATIENT",p.getDisplayName(),null,p.getEmail(),p.getWhatsappNumber(),p.getPreferredLanguage(),now));
        consents.saveAndFlush(new ConsentRecord(UUID.randomUUID(),patientId,medicalCase.getId(),intakeConsentTerms(consentLanguage),"WEB","patient",now));
        audit("CASE_INTAKE_CREATED","patient","PATIENT",medicalCase.getId(),"MedicalCase",medicalCase.getId().toString(),"CREATE","SUCCESS","Returning patient",now);
    }

    public record PatientSnapshot(String country, String whatsapp, String language) {}
    /**
     * What a new case needs from an existing canonical patient. Only the patient's OWN number counts: a number a
     * representative once submitted with is theirs, never a default for the patient's next case.
     */
    public java.util.Optional<PatientSnapshot> patientSnapshot(UUID patientId) {
        return patients.findById(patientId).filter(p->p.getMergedIntoPatientId()==null)
            .map(p->new PatientSnapshot(p.getCountry(),p.getWhatsappNumber(),p.getPreferredLanguage()));
    }

    public void validateSubmittable(UUID caseId) {
        if(submissionDocuments.notReadyFor(caseId)>0)throw new ApiException(409,"DOCUMENTS_NOT_READY","All attached documents must be verified and clean before submission");
    }

    /**
     * Runs once the case has been successfully submitted (DRAFT -> RECEIVED). It creates a
     * purpose-scoped status link; the patient requests a short-lived verification code only when
     * they use that link. The notification contains no clinical detail.
     */
    @Transactional public String onSubmitted(MedicalCase medicalCase) {
        Instant now=clock.instant();
        statusLog.record(medicalCase.getId(),"DRAFT","RECEIVED","guest","GUEST","Patient submitted intake", now);
        UUID patientId=medicalCase.getPatientId();
        UUID linkId=UUID.randomUUID(); String linkToken=randomToken();
        links.saveAndFlush(new CaseAccessLink(linkId,medicalCase.getId(),patientId,"STATUS",hash(linkToken),now.plus(Duration.ofDays(30)),now));
        String lang="ar".equals(medicalCase.getPreferredLanguage())?"ar":"en";
        String payload=encryptedJson("{\"token\":\""+linkToken+"\",\"lang\":\""+lang+"\"}");
        // The link goes to whoever submitted the case, on the number they submitted with.
        String submitterWhatsapp=contacts.findByCaseId(medicalCase.getId()).map(CaseSubmissionContact::getWhatsappNumber)
                .orElseThrow(()->new IllegalStateException("Case "+medicalCase.getId()+" has no submission contact"));
        notificationOutbox.enqueueOnce("CASE_STATUS_LINK", "WHATSAPP", submitterWhatsapp, "case-status-link", payload, "case-status:"+linkId, now);
        audit("CASE_SUBMITTED","guest","GUEST",medicalCase.getId(),"MedicalCase",medicalCase.getId().toString(),"SUBMIT","SUCCESS",null,now);
        return linkToken;
    }

    /**
     * Tells the coordination team mailbox that a submitted case is waiting in the team queue. Called by admission only
     * when no Coordinator took ownership on submit; a routed case is announced to its Coordinator instead. One mail per case.
     */
    @Transactional public void announceQueuedIntake(UUID caseId, String caseNumber) {
        notificationOutbox.enqueueOnce("NEW_CASE", "EMAIL", coordinatorEmail, "new-case-received", encryptedJson("{\"case\":\""+caseNumber+"\"}"), "case-submitted:"+caseId, clock.instant());
    }

    public String hash(String token){try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest((pepper+":"+token).getBytes(StandardCharsets.UTF_8)));}catch(NoSuchAlgorithmException e){throw new IllegalStateException(e);}}
    public String encryptedJson(String json){return "enc:"+crypto.encrypt(json);}
    private String randomToken(){return UUID.randomUUID().toString().replace("-","")+UUID.randomUUID().toString().replace("-","");}
    private String blankToNull(String value){return value==null||value.isBlank()?null:value.trim();}
    private void audit(String type,String subject,String role,UUID caseId,String entity,String entityId,String action,String outcome,String reason,Instant now){auditTrail.event(type).actor(subject, role).caseId(caseId).entity(entity, entityId).action(action).outcome(outcome).reason(reason).at(now).record();}
}
