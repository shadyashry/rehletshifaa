package com.rehletshifaa.clinic.api;

import com.rehletshifaa.clinic.api.ClinicDtos.AffiliationsView;
import com.rehletshifaa.clinic.api.ClinicDtos.DeclarationRequest;
import com.rehletshifaa.clinic.application.ConsultantAffiliationService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * P1-19 (D-H): the Consultant's yearly affiliation declaration, on their Virtual Clinic. The Consultant reads and files their own;
 * Consultant Operations and Compliance read any. Compliance's review and lists are under {@code /api/v1/compliance}.
 */
@RestController
@RequestMapping("/api/v1/clinics/{practitionerId}/affiliations")
public class AffiliationController {
    private final ConsultantAffiliationService affiliations;

    public AffiliationController(ConsultantAffiliationService affiliations) { this.affiliations = affiliations; }

    @GetMapping public AffiliationsView view(@PathVariable UUID practitionerId) { return affiliations.view(practitionerId); }

    @PostMapping public AffiliationsView declare(@PathVariable UUID practitionerId, @Valid @RequestBody DeclarationRequest request) {
        return affiliations.declare(practitionerId, request);
    }
}
