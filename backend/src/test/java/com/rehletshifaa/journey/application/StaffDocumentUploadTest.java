package com.rehletshifaa.journey.application;

import com.rehletshifaa.authority.domain.Role;
import com.rehletshifaa.document.api.DocumentDtos.PresignRequest;
import com.rehletshifaa.document.application.StaffDocumentService;
import com.rehletshifaa.shared.api.ApiException;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Deep validation D-10 (post-deposit design §4.8): the case team files the hospital's and the Consultant's paperwork as case
 * documents — the case's Operations person and Consultant (and owning coordinator) may, nobody else on the platform may.
 */
class StaffDocumentUploadTest extends AdmissionFixture {
    @Autowired StaffDocumentService staffDocuments;

    static PresignRequest letter() { return new PresignRequest("admission-letter.pdf", "application/pdf", 2048L); }

    @Test void theCaseTeamAddsPaperworkAndNobodyElseCan() {
        Arrived c = arrived("15000.00");
        asOps();
        assertThat(staffDocuments.presign(c.caseId, letter()).documentId()).isNotNull();
        asDoctor();
        assertThat(staffDocuments.presign(c.caseId, letter()).documentId()).isNotNull();
        assertThat(count("SELECT COUNT(*) FROM medical_documents WHERE case_id=? AND uploaded_by IN (?,?)", c.caseId, OPS, DOCTOR)).isEqualTo(2);

        signIn("other-ops", Role.OPERATIONS);
        assertThatThrownBy(() -> staffDocuments.presign(c.caseId, letter())).isInstanceOf(ApiException.class).extracting("code").isEqualTo("OUT_OF_SCOPE");
        asFinance();
        assertThatThrownBy(() -> staffDocuments.presign(c.caseId, letter())).isInstanceOf(ApiException.class).extracting("code").isEqualTo("PERMISSION_NOT_HELD");
        asPatient();
        assertThatThrownBy(() -> staffDocuments.presign(c.caseId, letter())).isInstanceOf(ApiException.class).extracting("code").isEqualTo("PERMISSION_NOT_HELD");
    }

    @Test void anUploadIsConfirmedByItsUploaderAndAnEndedCaseTakesNoPaperwork() {
        Arrived c = arrived("15000.00");
        asOps();
        var mine = staffDocuments.presign(c.caseId, letter()).documentId();
        asDoctor();
        assertThatThrownBy(() -> staffDocuments.confirm(c.caseId, new com.rehletshifaa.document.api.DocumentDtos.ConfirmRequest(mine)))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("NOT_YOUR_UPLOAD");
        jdbc.update("UPDATE medical_cases SET status='CANCELLED' WHERE id=?", c.caseId);
        em.flush(); em.clear();
        asOps();
        assertThatThrownBy(() -> staffDocuments.presign(c.caseId, letter())).isInstanceOf(ApiException.class).extracting("code").isEqualTo("CASE_ENDED");
    }
}
