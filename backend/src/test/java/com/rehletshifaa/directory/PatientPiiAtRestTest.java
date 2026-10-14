package com.rehletshifaa.directory;

import com.rehletshifaa.casemanagement.domain.CaseStatus;
import com.rehletshifaa.casemanagement.domain.CaseSubmissionContact;
import com.rehletshifaa.casemanagement.infrastructure.CaseSubmissionContactRepository;
import com.rehletshifaa.casemanagement.infrastructure.MedicalCaseRepository;
import com.rehletshifaa.directory.domain.PatientProfile;
import com.rehletshifaa.directory.infrastructure.PatientProfileRepository;
import com.rehletshifaa.shared.PhoneDigits;
import com.rehletshifaa.shared.crypto.CryptoService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * P0-1 (review finding E-01): patient and submitter names and WhatsApp numbers are ciphertext in the database, are read
 * back transparently, are found by the blind index only, and display names are composed from the decrypted parts.
 */
@SpringBootTest(properties = "spring.task.scheduling.enabled=false")
@Transactional
class PatientPiiAtRestTest {
    @Autowired PatientProfileRepository patients;
    @Autowired CaseSubmissionContactRepository contacts;
    @Autowired MedicalCaseRepository cases;
    @Autowired JdbcTemplate jdbc;
    @Autowired CryptoService crypto;
    @Autowired Clock clock;

    private static final String PHONE = "+20 101 044 7898";

    @Test
    void namesAndNumbersAreCiphertextAtRestAndReadBackInClear() {
        Instant now = clock.instant();
        UUID patientId = UUID.randomUUID();
        patients.saveAndFlush(PatientProfile.submitted(patientId, "فاطمة", "النجار", "Libya", PHONE, null, "ar", "Africa/Tripoli", now));

        Map<String, Object> row = jdbc.queryForMap("SELECT given_name, family_name, whatsapp_number, whatsapp_hmac FROM patient_profiles WHERE id = ?", patientId);
        assertThat((String) row.get("given_name")).startsWith("v").doesNotContain("فاطمة");
        assertThat((String) row.get("family_name")).startsWith("v").doesNotContain("النجار");
        assertThat((String) row.get("whatsapp_number")).startsWith("v").doesNotContain("7898");
        assertThat((String) row.get("whatsapp_hmac")).isEqualTo(crypto.hmac(PhoneDigits.of(PHONE))).hasSize(64);
        assertThat(crypto.decrypt((String) row.get("given_name"))).isEqualTo("فاطمة");

        patients.flush();
        PatientProfile read = patients.findById(patientId).orElseThrow();
        assertThat(read.getDisplayName()).isEqualTo("فاطمة النجار");
        assertThat(read.getWhatsappNumber()).isEqualTo(PHONE);
    }

    @Test
    void theBlindIndexFindsTheCaseAnInboundSenderBelongsTo() {
        Instant now = clock.instant();
        UUID patientId = UUID.randomUUID(), caseId = UUID.randomUUID();
        patients.saveAndFlush(PatientProfile.submitted(patientId, "Omar", "Saleh", "Iraq", PHONE, null, "en", null, now));
        jdbc.update("INSERT INTO medical_cases(id,case_number,country,preferred_language,status,consent_timestamp,created_at,updated_at,version,patient_id) "
                + "VALUES(?,?,?,'en','INTAKE_REVIEW',?,?,?,0,?)", caseId, "RS-PII-" + caseId.toString().substring(0, 6), "Iraq", now, now, now, patientId);
        contacts.saveAndFlush(new CaseSubmissionContact(caseId, patientId, "REPRESENTATIVE", "Layla Saleh", "sister", null, "+964 770 123 4567", "en", now));

        String patientToken = crypto.hmac(PhoneDigits.of("00201010447898"));
        String submitterToken = crypto.hmac(PhoneDigits.of("9647701234567"));
        List<MedicalCaseRepository.ChannelCase> byPatient = cases.findChannelCases(patientToken, List.of(CaseStatus.CLOSED));
        List<MedicalCaseRepository.ChannelCase> bySubmitter = cases.findChannelCases(submitterToken, List.of(CaseStatus.CLOSED));
        assertThat(byPatient).extracting(MedicalCaseRepository.ChannelCase::getSenderRole).containsExactly("PATIENT");
        assertThat(bySubmitter).extracting(MedicalCaseRepository.ChannelCase::getSenderRole).containsExactly("PATIENT_REPRESENTATIVE");
        assertThat(cases.findChannelCases(crypto.hmac("201099999999"), List.of(CaseStatus.CLOSED))).isEmpty();

        // The plaintext digits are nowhere in the row; the number itself is readable through the entity only.
        Map<String, Object> contact = jdbc.queryForMap("SELECT contact_name, whatsapp_number, whatsapp_hmac FROM case_submission_contacts WHERE case_id = ?", caseId);
        assertThat((String) contact.get("contact_name")).doesNotContain("Layla");
        assertThat((String) contact.get("whatsapp_number")).doesNotContain("4567");
        assertThat(contact.get("whatsapp_hmac")).isEqualTo(submitterToken);
        assertThat(cases.findPatientWhatsappNumbers(caseId)).containsExactly(PHONE);
        assertThat(cases.findSubmitterWhatsappNumbers(caseId)).containsExactly("+964 770 123 4567");
    }

    @Test
    void displayNamesAreComposedFromDecryptedPartsInEveryProjection() {
        Instant now = clock.instant();
        UUID patientId = UUID.randomUUID(), caseId = UUID.randomUUID();
        patients.saveAndFlush(PatientProfile.submitted(patientId, "Nour", null, "Sudan", null, "nour@example.test", "en", null, now));
        jdbc.update("INSERT INTO medical_cases(id,case_number,country,preferred_language,status,consent_timestamp,created_at,updated_at,version,patient_id) "
                + "VALUES(?,?,?,'en','INTAKE_REVIEW',?,?,?,0,?)", caseId, "RS-PII-" + caseId.toString().substring(0, 6), "Sudan", now, now, now, patientId);

        assertThat(cases.findPatientName(caseId)).contains("Nour");
        assertThat(cases.findCaseRow(caseId).orElseThrow().getPatientName()).isEqualTo("Nour");
        assertThat(cases.findOnboardingHeader(caseId).orElseThrow().getFullName()).isEqualTo("Nour");
        assertThat(jdbc.queryForObject("SELECT whatsapp_hmac FROM patient_profiles WHERE id = ?", String.class, patientId)).isNull();
    }

    @Test
    void verifiedMobileOfAnotherAccountIsDetectedThroughTheIndex() {
        Instant now = clock.instant();
        UUID other = UUID.randomUUID(), me = UUID.randomUUID();
        PatientProfile profile = PatientProfile.submitted(other, "Other", "Person", "Kenya", PHONE, null, "en", null, now);
        profile.markChannelVerified("WHATSAPP", now);
        profile.bindConfirmedOwner("other-subject", "other@example.test", now);
        patients.saveAndFlush(profile);

        String token = crypto.hmac(PhoneDigits.of(PHONE));
        assertThat(patients.isVerifiedMobileOfAnotherAccount(me, token)).isTrue();
        assertThat(patients.isVerifiedMobileOfAnotherAccount(other, token)).isFalse();
    }
}
