package com.rehletshifaa.compliance.application;

import com.rehletshifaa.clinic.api.ClinicDtos.DeclarationReviewRequest;
import com.rehletshifaa.clinic.api.ClinicDtos.DeclarationView;
import com.rehletshifaa.clinic.application.ConsultantAffiliationService;
import com.rehletshifaa.journey.api.WorkDtos.WorkCopy;
import com.rehletshifaa.journey.application.StaffWorkService;
import com.rehletshifaa.workforce.application.WorkforceDirectory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Compliance's review of an affiliation declaration (P1-19, design §7.2). The review itself is the clinic module's; a FINDING is then
 * routed to Consultant Operations, who act on it through the existing governance (the auditor changes nothing operational). The
 * notice carries the Consultant's name only, never the finding's text.
 */
@Service
public class DeclarationReviewService {
    public static final String FINDING = "AFFILIATION_FINDING";
    private static final String CONSULTANT_OPS = "CONSULTANT_OPERATIONS_MANAGER";

    private final ConsultantAffiliationService affiliations;
    private final StaffWorkService work;
    private final WorkforceDirectory workforce;

    public DeclarationReviewService(ConsultantAffiliationService affiliations, StaffWorkService work, WorkforceDirectory workforce) {
        this.affiliations = affiliations; this.work = work; this.workforce = workforce;
    }

    @Transactional
    public DeclarationView review(java.util.UUID declarationId, DeclarationReviewRequest request) {
        DeclarationView reviewed = affiliations.review(declarationId, request);
        if ("FINDING".equals(reviewed.reviewStatus()))
            workforce.activeHolders(CONSULTANT_OPS).stream().map(WorkforceDirectory.Member::subject).distinct().forEach(subject ->
                    work.notifyStaff(subject, null, null, FINDING, "Compliance finding on " + reviewed.consultantName() + "'s affiliation declaration",
                            "Compliance recorded a finding on this Consultant's declaration of hospital relationships. Read it in Compliance › Declarations and act on it.",
                            "affiliation-finding:" + declarationId + ":" + subject, true, WorkCopy.of(FINDING, "consultant", reviewed.consultantName())));
        return reviewed;
    }
}
