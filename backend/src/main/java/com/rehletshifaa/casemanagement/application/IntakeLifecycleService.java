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
import com.rehletshifaa.casemanagement.infrastructure.MedicalCaseRepository;
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
    private final MedicalCaseRepository cases;
    private final PatientProfileRepository patients;
    private final NotificationOutbox notificationOutbox;
    private final AuditTrail auditTrail;
    private final Clock clock; private final SecureRandom random = new SecureRandom();
    private final CryptoService crypto;
    private final String pepper;
    private final String coordinatorEmail;
    public IntakeLifecycleService(Clock clock, @Value("${app.claim.pepper}")String pepper,
                                  @Value("${app.claim.expiry-seconds}")long expirySeconds,
                                  @Value("${app.claim.max-attempts}")int maxAttempts,
                                  @Value("${app.mail.coordinator}")String coordinatorEmail,
                                  CryptoService crypto, AuditTrail auditTrail, NotificationOutbox notificationOutbox, PatientProfileRepository patients, MedicalCaseRepository cases, CaseStatusLog statusLog, CaseSubmissionContactRepository contacts, ConsentRecordRepository consents, CaseAccessLinkRepository links, SubmissionDocuments submissionDocuments) { this.submissionDocuments = submissionDocuments; this.links = links; this.consents = consents; this.contacts = contacts; this.statusLog = statusLog; this.cases = cases; this.patients = patients; this.notificationOutbox = notificationOutbox; this.auditTrail = auditTrail;
        this.clock=clock;this.pepper=pepper;this.coordinatorEmail=coordinatorEmail;this.crypto=crypto;
    }

    /**
     * Creates the provisional patient record, links it to the draft case, and records consent.
     * No verification challenge (OTP) is generated here: a draft may still be receiving document
     * uploads, and we must not start an expiry clock before the case is actually submitted.
     */
    @Transactional public void createFoundation(MedicalCase medicalCase, CreateCaseRequest request) {
        Instant now=clock.instant(); UUID patientId=UUID.randomUUID();
        String given=PatientNames.clean(request.givenName()), family=blankToNull(PatientNames.clean(request.familyName()));
        String displayName=PatientNames.display(given,family);
        boolean self=!request.forSomeoneElse();
        // The submitter's channels are the PATIENT's only when the patient is submitting. A representative's
        // email/WhatsApp is recorded on the submission contact and never promoted into the patient's identity.
        // Email captured here is a candidate contact — unverified until the patient proves ownership later.
        patients.saveAndFlush(PatientProfile.submitted(patientId,given,family,request.country().trim(),self?request.whatsappNumber().trim():null,self?"PATIENT":null,
                self?blankToNull(request.email()):null,request.preferredLanguage(),blankToNull(request.timeZone()),now));
        medicalCase.belongsTo(patientId);cases.saveAndFlush(medicalCase);
        var rep=request.representative();
        contacts.saveAndFlush(new CaseSubmissionContact(medicalCase.getId(),patientId,self?"PATIENT":"REPRESENTATIVE",self?displayName:PatientNames.clean(rep==null?null:rep.name()), self?null:(rep==null?null:rep.relationship()),blankToNull(request.email()),request.whatsappNumber().trim(),request.preferredLanguage(),now));
        String consentText="ar".equals(request.preferredLanguage()) ? "أوافق على معالجة المعلومات التي أقدمها لغرض تنسيق حالتي الطبية." : "I consent to processing the information I submit for the purpose of coordinating my medical case.";
        consents.saveAndFlush(new ConsentRecord(UUID.randomUUID(),patientId,medicalCase.getId(),new ConsentRecord.Terms("DATA_PROCESSING","intake-v1",request.preferredLanguage(),consentText,"Medical case coordination","Submitted case data"),"WEB","guest",now));
        audit("CASE_INTAKE_CREATED","guest","GUEST",medicalCase.getId(),"MedicalCase",medicalCase.getId().toString(),"CREATE","SUCCESS",null,now);
    }

    /**
     * A returning, signed-in patient starting another case: the SAME canonical patient owns the new case.
     * No patient row, submission contact or consent is duplicated beyond what this case needs.
     */
    @Transactional public void createFoundationForExistingPatient(MedicalCase medicalCase, UUID patientId, String consentLanguage) {
        Instant now=clock.instant();
        medicalCase.belongsTo(patientId);cases.saveAndFlush(medicalCase);
        patients.findById(patientId).ifPresent(p->contacts.saveAndFlush(new CaseSubmissionContact(medicalCase.getId(),patientId,"PATIENT",p.getDisplayName(),null,p.getEmail(),p.getWhatsappNumber(),p.getPreferredLanguage(),now)));
        String consentText="ar".equals(consentLanguage) ? "أوافق على معالجة المعلومات التي أقدمها لغرض تنسيق حالتي الطبية." : "I consent to processing the information I submit for the purpose of coordinating my medical case.";
        consents.saveAndFlush(new ConsentRecord(UUID.randomUUID(),patientId,medicalCase.getId(),new ConsentRecord.Terms("DATA_PROCESSING","intake-v1",consentLanguage,consentText,"Medical case coordination","Submitted case data"),"WEB","patient",now));
        audit("CASE_INTAKE_CREATED","patient","PATIENT",medicalCase.getId(),"MedicalCase",medicalCase.getId().toString(),"CREATE","SUCCESS","Returning patient",now);
    }

    public record PatientSnapshot(String displayName, String country, String whatsapp, String language) {}
    /** What a new case needs from an existing canonical patient (display-name snapshot + contact defaults). */
    public java.util.Optional<PatientSnapshot> patientSnapshot(UUID patientId) {
        return patients.findById(patientId).filter(p->p.getMergedIntoPatientId()==null)
            .map(p->new PatientSnapshot(p.getDisplayName(),p.getCountry(),p.getWhatsappNumber()!=null?p.getWhatsappNumber()
                :contacts.findFirstByPatientIdOrderByCreatedAtDesc(p.getId()).map(CaseSubmissionContact::getWhatsappNumber).orElse(null),p.getPreferredLanguage()));
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
        notificationOutbox.enqueueOnce("CASE_STATUS_LINK", "WHATSAPP", medicalCase.getWhatsappNumber(), "case-status-link", payload, "case-status:"+linkId, now);
        notificationOutbox.enqueueOnce("NEW_CASE", "EMAIL", coordinatorEmail, "new-case-received", encryptedJson("{\"case\":\""+medicalCase.getCaseNumber()+"\"}"), "case-submitted:"+medicalCase.getId(), now);
        audit("CASE_SUBMITTED","guest","GUEST",medicalCase.getId(),"MedicalCase",medicalCase.getId().toString(),"SUBMIT","SUCCESS",null,now);
        return linkToken;
    }

    public String hash(String token){try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest((pepper+":"+token).getBytes(StandardCharsets.UTF_8)));}catch(NoSuchAlgorithmException e){throw new IllegalStateException(e);}}
    public String encryptedJson(String json){return "enc:"+crypto.encrypt(json);}
    private String randomToken(){return UUID.randomUUID().toString().replace("-","")+UUID.randomUUID().toString().replace("-","");}
    private String blankToNull(String value){return value==null||value.isBlank()?null:value.trim();}
    private void audit(String type,String subject,String role,UUID caseId,String entity,String entityId,String action,String outcome,String reason,Instant now){auditTrail.event(type).actor(subject, role).caseId(caseId).entity(entity, entityId).action(action).outcome(outcome).reason(reason).at(now).record();}
}
