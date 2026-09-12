package com.rehletshifaa.journey.application;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

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
    private final JdbcClient jdbc;
    public CaseContactResolver(JdbcClient jdbc) { this.jdbc = jdbc; }

    public record CaseContact(String caseNumber, String whatsapp, String email, boolean patientOwnsWhatsapp, boolean patientOwnsEmail, String preferredLanguage) {
        public boolean patientOwns(String channel) { return "WHATSAPP".equals(channel) ? patientOwnsWhatsapp : "EMAIL".equals(channel) && patientOwnsEmail; }
    }

    public CaseContact resolve(UUID caseId) {
        return jdbc.sql("SELECT c.case_number,c.preferred_language,p.whatsapp_number patient_whatsapp,p.email patient_email,sc.whatsapp_number submitter_whatsapp,sc.email submitter_email "
                        + "FROM medical_cases c JOIN patient_profiles p ON p.id=c.patient_id LEFT JOIN case_submission_contacts sc ON sc.case_id=c.id WHERE c.id=?")
                .param(caseId)
                .query((rs, n) -> {
                    String pw = blankToNull(rs.getString("patient_whatsapp")), pe = blankToNull(rs.getString("patient_email"));
                    String sw = blankToNull(rs.getString("submitter_whatsapp")), se = blankToNull(rs.getString("submitter_email"));
                    return new CaseContact(rs.getString("case_number"), pw != null ? pw : sw, pe != null ? pe : se, pw != null, pe != null, rs.getString("preferred_language"));
                }).single();
    }

    private static String blankToNull(String v) { return v == null || v.isBlank() ? null : v; }
}
