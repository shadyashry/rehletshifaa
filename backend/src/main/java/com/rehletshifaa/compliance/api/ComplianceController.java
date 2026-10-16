package com.rehletshifaa.compliance.api;

import com.rehletshifaa.clinic.api.ClinicDtos.AffiliationFlagView;
import com.rehletshifaa.clinic.api.ClinicDtos.DeclarationReviewRequest;
import com.rehletshifaa.clinic.api.ClinicDtos.DeclarationView;
import com.rehletshifaa.clinic.application.ConsultantAffiliationService;
import com.rehletshifaa.compliance.api.ComplianceDtos.SampleRequest;
import com.rehletshifaa.compliance.api.ComplianceDtos.SampleReviewRequest;
import com.rehletshifaa.compliance.api.ComplianceDtos.SampleSummary;
import com.rehletshifaa.compliance.api.ComplianceDtos.SampleView;
import com.rehletshifaa.compliance.api.ComplianceDtos.ScorecardView;
import com.rehletshifaa.compliance.application.DeclarationReviewService;
import com.rehletshifaa.compliance.application.SamplingAuditService;
import com.rehletshifaa.compliance.application.ScorecardService;
import jakarta.validation.Valid;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * The hospital-agreement audit (P1-19, design §7): scorecards (Compliance and Consultant Operations), the monthly samples and the
 * affiliation declarations with their undeclared-facility flags. Compliance's only writes are its own review records.
 */
@RestController
@RequestMapping("/api/v1/compliance")
public class ComplianceController {
    private final ScorecardService scorecards;
    private final SamplingAuditService sampling;
    private final ConsultantAffiliationService affiliations;
    private final DeclarationReviewService declarationReviews;

    public ComplianceController(ScorecardService scorecards, SamplingAuditService sampling, ConsultantAffiliationService affiliations,
                                DeclarationReviewService declarationReviews) {
        this.scorecards = scorecards; this.sampling = sampling; this.affiliations = affiliations; this.declarationReviews = declarationReviews;
    }

    @GetMapping("/scorecards/consultants/{practitionerId}")
    public ScorecardView consultant(@PathVariable UUID practitionerId, @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                    @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return scorecards.consultant(practitionerId, from, to);
    }

    @GetMapping("/scorecards/facilities/{facilityId}")
    public ScorecardView facility(@PathVariable UUID facilityId, @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                  @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return scorecards.facility(facilityId, from, to);
    }

    @GetMapping("/audit-samples") public List<SampleSummary> samples() { return sampling.samples(); }

    @GetMapping("/audit-samples/{sampleId}") public SampleView sample(@PathVariable UUID sampleId) { return sampling.sample(sampleId); }

    @PostMapping("/audit-samples") public SampleView draw(@Valid @RequestBody SampleRequest request) { return sampling.drawOnDemand(request); }

    @PostMapping("/audit-samples/{sampleId}/cases/{caseId}/review")
    public SampleView reviewCase(@PathVariable UUID sampleId, @PathVariable UUID caseId, @Valid @RequestBody SampleReviewRequest request) {
        return sampling.review(sampleId, caseId, request);
    }

    @GetMapping("/affiliations/declarations")
    public List<DeclarationView> declarations(@RequestParam(required = false) String reviewStatus) { return affiliations.declarations(reviewStatus); }

    @PostMapping("/affiliations/declarations/{declarationId}/review")
    public DeclarationView reviewDeclaration(@PathVariable UUID declarationId, @Valid @RequestBody DeclarationReviewRequest request) {
        return declarationReviews.review(declarationId, request);
    }

    @GetMapping("/affiliations/flags")
    public List<AffiliationFlagView> flags(@RequestParam(defaultValue = "true") boolean openOnly) { return affiliations.flags(openOnly); }
}
