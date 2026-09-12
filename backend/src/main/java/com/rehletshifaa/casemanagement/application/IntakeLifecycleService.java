package com.rehletshifaa.casemanagement.application;

import com.rehletshifaa.casemanagement.api.CaseDtos.CreateCaseRequest;
import com.rehletshifaa.casemanagement.domain.MedicalCase;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.crypto.CryptoService;
import com.rehletshifaa.shared.util.PatientNames;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.simple.JdbcClient;
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

import static com.rehletshifaa.shared.persistence.SqlValues.timestamp;

@Service
public class IntakeLifecycleService {
    private final JdbcClient jdbc; private final Clock clock; private final SecureRandom random = new SecureRandom();
    private final CryptoService crypto;
    private final String pepper;
    private final String coordinatorEmail;
    public IntakeLifecycleService(JdbcClient jdbc, Clock clock, @Value("${app.claim.pepper}")String pepper,
                                  @Value("${app.claim.expiry-seconds}")long expirySeconds,
                                  @Value("${app.claim.max-attempts}")int maxAttempts,
                                  @Value("${app.mail.coordinator}")String coordinatorEmail,
                                  CryptoService crypto) {
        this.jdbc=jdbc;this.clock=clock;this.pepper=pepper;this.coordinatorEmail=coordinatorEmail;this.crypto=crypto;
    }

    /**
     * Creates the provisional patient record, links it to the draft case, and records consent.
     * No verification challenge (OTP) is generated here: a draft may still be receiving document
     * uploads, and we must not start an expiry clock before the case is actually submitted.
     */
    @Transactional public void createFoundation(MedicalCase medicalCase, CreateCaseRequest request) {
        Instant now=clock.instant(); UUID patientId=UUID.randomUUID();
        String given=PatientNames.clean(request.givenName()), family=blankToNull(PatientNames.clean(request.familyName()));
        String displayName=PatientNames.display(given,family,null);
        boolean self=!request.forSomeoneElse();
        // The submitter's channels are the PATIENT's only when the patient is submitting. A representative's
        // email/WhatsApp is recorded on the submission contact and never promoted into the patient's identity.
        // Email captured here is a candidate contact — unverified until the patient proves ownership later.
        jdbc.sql("INSERT INTO patient_profiles(id,full_name,given_name,family_name,name_source,country,whatsapp_number,mobile_owner,email,preferred_language,time_zone,created_at,updated_at,version) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,0)")
            .params(patientId,displayName,given,family,"STRUCTURED",request.country().trim(),self?request.whatsappNumber().trim():null,self?"PATIENT":null,
                    self?blankToNull(request.email()):null,request.preferredLanguage(),blankToNull(request.timeZone()),timestamp(now),timestamp(now)).update();
        jdbc.sql("UPDATE medical_cases SET patient_id=? WHERE id=?").params(patientId,medicalCase.getId()).update();
        var rep=request.representative();
        jdbc.sql("INSERT INTO case_submission_contacts(id,case_id,patient_id,contact_role,contact_name,relationship_to_patient,email,whatsapp_number,preferred_language,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)")
            .params(UUID.randomUUID(),medicalCase.getId(),patientId,self?"PATIENT":"REPRESENTATIVE",self?displayName:PatientNames.clean(rep==null?null:rep.name()),
                    self?null:(rep==null?null:rep.relationship()),blankToNull(request.email()),request.whatsappNumber().trim(),request.preferredLanguage(),timestamp(now)).update();
        String consentText="ar".equals(request.preferredLanguage()) ? "أوافق على معالجة المعلومات التي أقدمها لغرض تنسيق حالتي الطبية." : "I consent to processing the information I submit for the purpose of coordinating my medical case.";
        jdbc.sql("INSERT INTO consent_records(id,patient_id,case_id,consent_type,policy_version,language,exact_text,purpose,scope,channel,captured_by,effective_from,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)")
            .params(UUID.randomUUID(),patientId,medicalCase.getId(),"DATA_PROCESSING","intake-v1",request.preferredLanguage(),consentText,"Medical case coordination","Submitted case data","WEB","guest",timestamp(now),timestamp(now)).update();
        audit("CASE_INTAKE_CREATED","guest","GUEST",medicalCase.getId(),"MedicalCase",medicalCase.getId().toString(),"CREATE","SUCCESS",null,now);
    }

    /**
     * A returning, signed-in patient starting another case: the SAME canonical patient owns the new case.
     * No patient row, submission contact or consent is duplicated beyond what this case needs.
     */
    @Transactional public void createFoundationForExistingPatient(MedicalCase medicalCase, UUID patientId, String consentLanguage) {
        Instant now=clock.instant();
        jdbc.sql("UPDATE medical_cases SET patient_id=? WHERE id=?").params(patientId,medicalCase.getId()).update();
        jdbc.sql("INSERT INTO case_submission_contacts(id,case_id,patient_id,contact_role,contact_name,email,whatsapp_number,preferred_language,created_at) SELECT ?,?,p.id,'PATIENT',"+PatientNames.DISPLAY_SQL+",p.email,p.whatsapp_number,p.preferred_language,? FROM patient_profiles p WHERE p.id=?")
            .params(UUID.randomUUID(),medicalCase.getId(),timestamp(now),patientId).update();
        String consentText="ar".equals(consentLanguage) ? "أوافق على معالجة المعلومات التي أقدمها لغرض تنسيق حالتي الطبية." : "I consent to processing the information I submit for the purpose of coordinating my medical case.";
        jdbc.sql("INSERT INTO consent_records(id,patient_id,case_id,consent_type,policy_version,language,exact_text,purpose,scope,channel,captured_by,effective_from,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)")
            .params(UUID.randomUUID(),patientId,medicalCase.getId(),"DATA_PROCESSING","intake-v1",consentLanguage,consentText,"Medical case coordination","Submitted case data","WEB","patient",timestamp(now),timestamp(now)).update();
        audit("CASE_INTAKE_CREATED","patient","PATIENT",medicalCase.getId(),"MedicalCase",medicalCase.getId().toString(),"CREATE","SUCCESS","Returning patient",now);
    }

    public record PatientSnapshot(String displayName, String country, String whatsapp, String language) {}
    /** What a new case needs from an existing canonical patient (display-name snapshot + contact defaults). */
    public java.util.Optional<PatientSnapshot> patientSnapshot(UUID patientId) {
        return jdbc.sql("SELECT "+PatientNames.DISPLAY_SQL+" display_name,p.country,COALESCE(p.whatsapp_number,(SELECT sc.whatsapp_number FROM case_submission_contacts sc WHERE sc.patient_id=p.id ORDER BY sc.created_at DESC LIMIT 1)) whatsapp_number,p.preferred_language FROM patient_profiles p WHERE p.id=? AND p.merged_into_patient_id IS NULL").param(patientId)
            .query((rs,n)->new PatientSnapshot(rs.getString("display_name"),rs.getString("country"),rs.getString("whatsapp_number"),rs.getString("preferred_language"))).optional();
    }

    public void validateSubmittable(UUID caseId) {
        Integer blocked=jdbc.sql("SELECT count(*) FROM medical_documents WHERE case_id=? AND status IN ('PENDING','QUARANTINED','REJECTED','SCAN_FAILED')")
            .param(caseId).query(Integer.class).single();
        if(blocked!=null&&blocked>0)throw new ApiException(409,"DOCUMENTS_NOT_READY","All attached documents must be verified and clean before submission");
    }

    /**
     * Runs once the case has been successfully submitted (DRAFT -> RECEIVED). It creates a
     * purpose-scoped status link; the patient requests a short-lived verification code only when
     * they use that link. The notification contains no clinical detail.
     */
    @Transactional public String onSubmitted(MedicalCase medicalCase) {
        Instant now=clock.instant();
        jdbc.sql("INSERT INTO case_status_history(id,case_id,from_status,to_status,actor_subject,actor_role,reason,created_at) VALUES(?,?,?,?,?,?,?,?)")
            .params(UUID.randomUUID(),medicalCase.getId(),"DRAFT","RECEIVED","guest","GUEST","Patient submitted intake",timestamp(now)).update();
        UUID patientId=jdbc.sql("SELECT patient_id FROM medical_cases WHERE id=?").param(medicalCase.getId()).query(UUID.class).single();
        UUID linkId=UUID.randomUUID(); String linkToken=randomToken();
        jdbc.sql("INSERT INTO case_access_links(id,case_id,patient_id,purpose,token_hash,expires_at,created_at) VALUES(?,?,?,?,?,?,?)")
            .params(linkId,medicalCase.getId(),patientId,"STATUS",hash(linkToken),timestamp(now.plus(Duration.ofDays(30))),timestamp(now)).update();
        String lang="ar".equals(medicalCase.getPreferredLanguage())?"ar":"en";
        String payload=encryptedJson("{\"token\":\""+linkToken+"\",\"lang\":\""+lang+"\"}");
        jdbc.sql("INSERT INTO notification_outbox(id,notification_type,channel,destination,template_key,template_data,status,attempts,max_attempts,next_attempt_at,idempotency_key,created_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM notification_outbox WHERE idempotency_key=?)")
            .params(UUID.randomUUID(),"CASE_STATUS_LINK","WHATSAPP",medicalCase.getWhatsappNumber(),"case-status-link",payload,"PENDING",0,5,timestamp(now),"case-status:"+linkId,timestamp(now),"case-status:"+linkId).update();
        jdbc.sql("INSERT INTO notification_outbox(id,notification_type,channel,destination,template_key,template_data,status,attempts,max_attempts,next_attempt_at,idempotency_key,created_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM notification_outbox WHERE idempotency_key=?)")
            .params(UUID.randomUUID(),"NEW_CASE","EMAIL",coordinatorEmail,"new-case-received",encryptedJson("{\"case\":\""+medicalCase.getCaseNumber()+"\"}"),"PENDING",0,5,timestamp(now),"case-submitted:"+medicalCase.getId(),timestamp(now),"case-submitted:"+medicalCase.getId()).update();
        audit("CASE_SUBMITTED","guest","GUEST",medicalCase.getId(),"MedicalCase",medicalCase.getId().toString(),"SUBMIT","SUCCESS",null,now);
        return linkToken;
    }

    public String hash(String token){try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest((pepper+":"+token).getBytes(StandardCharsets.UTF_8)));}catch(NoSuchAlgorithmException e){throw new IllegalStateException(e);}}
    public String encryptedJson(String json){return "enc:"+crypto.encrypt(json);}
    private String randomToken(){return UUID.randomUUID().toString().replace("-","")+UUID.randomUUID().toString().replace("-","");}
    private String blankToNull(String value){return value==null||value.isBlank()?null:value.trim();}
    private void audit(String type,String subject,String role,UUID caseId,String entity,String entityId,String action,String outcome,String reason,Instant now){jdbc.sql("INSERT INTO audit_events(id,event_type,actor_subject,actor_role,case_id,entity_type,entity_id,action,outcome,reason,occurred_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)").params(UUID.randomUUID(),type,subject,role,caseId,entity,entityId,action,outcome,reason,timestamp(now)).update();}
}
