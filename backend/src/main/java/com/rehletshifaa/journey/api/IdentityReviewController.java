package com.rehletshifaa.journey.api;

import com.rehletshifaa.journey.application.IdentityVerificationService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

import static com.rehletshifaa.journey.api.JourneyDtos.*;

/**
 * Authorized manual review of patient legal-identity proofing. Restricted to the narrowly-scoped
 * PATIENT_IDENTITY_REVIEWER role (never CREDENTIALING_ADMIN, which is for practitioner credentialing).
 * The verify/reject action itself requires recent authentication and a mandatory reason, and every
 * write is audited with an immutable outcome history.
 */
@RestController
@RequestMapping("/api/v1/identity-review")
public class IdentityReviewController {
    private final IdentityVerificationService identity;
    public IdentityReviewController(IdentityVerificationService identity){this.identity=identity;}
    @GetMapping("/queue") public List<IdentityVerificationView> queue(){return identity.reviewQueue();}
    @PostMapping("/{identityId}/decision") public IdentityVerificationView decide(@PathVariable UUID identityId,@Valid @RequestBody IdentityReviewRequest request){return identity.review(identityId,request);}
}
