package com.rehletshifaa.journey.application;

import com.rehletshifaa.casemanagement.domain.CaseSubmissionContact;
import com.rehletshifaa.casemanagement.domain.MedicalCase;
import com.rehletshifaa.casemanagement.infrastructure.CaseSubmissionContactRepository;
import com.rehletshifaa.casemanagement.infrastructure.MedicalCaseRepository;
import com.rehletshifaa.directory.domain.PatientProfile;
import com.rehletshifaa.directory.infrastructure.PatientProfileRepository;
import org.springframework.stereotype.Component;

import java.util.NoSuchElementException;
import java.util.Optional;
import java.util.UUID;

/**
 * Where messages, codes and links about a case go — and whose channel that is.
 *
 * <p>The patient's own channels are used when they exist; otherwise the person who submitted the case (a
 * parent, spouse, guardian) is reached on theirs. A verified code on a channel therefore proves possession
 * of THAT channel by whoever holds it: it stamps the patient's profile only when the channel is the patient's
 * own, never when it belongs to the submitter.
 */
@Component
public class CaseContactResolver {
    private final MedicalCaseRepository cases;
    private final PatientProfileRepository patients;
    private final CaseSubmissionContactRepository submissions;

    public CaseContactResolver(MedicalCaseRepository cases, PatientProfileRepository patients, CaseSubmissionContactRepository submissions) {
        this.cases = cases; this.patients = patients; this.submissions = submissions;
    }

    public record CaseContact(String caseNumber, String whatsapp, String email, boolean patientOwnsWhatsapp, boolean patientOwnsEmail, String preferredLanguage) {
        public boolean patientOwns(String channel) { return "WHATSAPP".equals(channel) ? patientOwnsWhatsapp : "EMAIL".equals(channel) && patientOwnsEmail; }
    }

    public CaseContact resolve(UUID caseId) {
        MedicalCase c = cases.findById(caseId).orElseThrow(() -> new NoSuchElementException("Case " + caseId));
        PatientProfile p = Optional.ofNullable(c.getPatientId()).flatMap(patients::findById)
                .orElseThrow(() -> new NoSuchElementException("Patient of case " + caseId));
        Optional<CaseSubmissionContact> submitter = submissions.findByCaseId(caseId);
        String pw = blankToNull(p.getWhatsappNumber()), pe = blankToNull(p.getEmail());
        String sw = submitter.map(s -> blankToNull(s.getWhatsappNumber())).orElse(null), se = submitter.map(s -> blankToNull(s.getEmail())).orElse(null);
        return new CaseContact(c.getCaseNumber(), pw != null ? pw : sw, pe != null ? pe : se, pw != null, pe != null, c.getPreferredLanguage());
    }

    private static String blankToNull(String v) { return v == null || v.isBlank() ? null : v; }
}
