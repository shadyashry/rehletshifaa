package com.rehletshifaa.casemanagement.domain;

import com.rehletshifaa.shared.crypto.EncryptedStringConverter;
import com.rehletshifaa.shared.crypto.PhoneIndexListener;
import com.rehletshifaa.shared.crypto.PhoneIndexed;
import com.rehletshifaa.shared.persistence.AssignedIdEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.EntityListeners;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/**
 * Who submitted a case and how to reach them (one per case). A representative's channels live here and are never
 * promoted into the patient's identity.
 */
@Entity
@Table(name = "case_submission_contacts")
@EntityListeners(PhoneIndexListener.class)
public class CaseSubmissionContact extends AssignedIdEntity implements PhoneIndexed {
    @Column(name = "case_id", nullable = false, unique = true) private UUID caseId;
    @Column(name = "patient_id", nullable = false) private UUID patientId;
    @Column(name = "contact_role", nullable = false, length = 20) private String contactRole;
    @Convert(converter = EncryptedStringConverter.class) @Column(name = "contact_name", length = 600) private String contactName;
    @Column(name = "relationship_to_patient", length = 40) private String relationshipToPatient;
    @Column(length = 254) private String email;
    @Convert(converter = EncryptedStringConverter.class) @Column(name = "whatsapp_number", length = 600) private String whatsappNumber;
    @Column(name = "whatsapp_hmac", length = 64) private String whatsappHmac;
    @Column(name = "preferred_language", length = 8) private String preferredLanguage;
    @Column(name = "created_at", nullable = false) private Instant createdAt;

    protected CaseSubmissionContact() {}

    public CaseSubmissionContact(UUID caseId, UUID patientId, String contactRole, String contactName, String relationshipToPatient,
                                 String email, String whatsappNumber, String preferredLanguage, Instant now) {
        super(UUID.randomUUID());
        this.caseId = caseId; this.patientId = patientId; this.contactRole = contactRole; this.contactName = contactName;
        this.relationshipToPatient = relationshipToPatient; this.email = email; this.whatsappNumber = whatsappNumber;
        this.preferredLanguage = preferredLanguage; this.createdAt = micros(now);
    }

    public UUID getPatientId() { return patientId; }
    public String getContactRole() { return contactRole; }
    public String getWhatsappNumber() { return whatsappNumber; }
    public String getEmail() { return email; }

    @Override public String whatsappNumberForIndex() { return whatsappNumber; }
    @Override public void setWhatsappHmac(String hmac) { this.whatsappHmac = hmac; }
}
