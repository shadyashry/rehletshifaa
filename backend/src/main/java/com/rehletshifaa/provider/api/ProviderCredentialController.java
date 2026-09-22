package com.rehletshifaa.provider.api;

import com.rehletshifaa.provider.application.ProviderCredentialService;
import org.springframework.web.bind.annotation.*;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/admin/providers/{organizationId}")
public class ProviderCredentialController {
    private final ProviderCredentialService credentials;
    public ProviderCredentialController(ProviderCredentialService credentials){this.credentials=credentials;}
    @GetMapping("/clinicians/{practitionerId}/onboarding") public Object onboarding(@PathVariable UUID organizationId,@PathVariable UUID practitionerId){return credentials.onboarding(organizationId,practitionerId);}
    @PutMapping("/clinicians/{practitionerId}/profile") public Object profile(@PathVariable UUID organizationId,@PathVariable UUID practitionerId,@RequestBody ProviderCredentialService.ProfileCommand command){return credentials.completeProfile(organizationId,practitionerId,command);}
    @GetMapping("/clinicians/{practitionerId}/credential-requirements") public Object requirements(@PathVariable UUID organizationId,@PathVariable UUID practitionerId){return credentials.requirements(organizationId,practitionerId);}
    @PostMapping("/clinicians/{practitionerId}/credential-evidence/presign") public Object presign(@PathVariable UUID organizationId,@PathVariable UUID practitionerId,@RequestBody ProviderCredentialService.EvidenceCommand command){return credentials.presign(organizationId,practitionerId,command);}
    @PostMapping("/credential-evidence/{evidenceId}/confirm") public Object confirm(@PathVariable UUID organizationId,@PathVariable UUID evidenceId,@RequestParam long version){return credentials.confirm(organizationId,evidenceId,version);}
    @GetMapping("/credential-evidence/{evidenceId}/view") public Object view(@PathVariable UUID organizationId,@PathVariable UUID evidenceId){return credentials.viewEvidence(organizationId,evidenceId);}
    @PostMapping("/clinicians/{practitionerId}/credentials") public Object submit(@PathVariable UUID organizationId,@PathVariable UUID practitionerId,@RequestHeader("Idempotency-Key")String key,@RequestBody ProviderCredentialService.SubmissionCommand command){return credentials.submit(organizationId,practitionerId,command,key);}
    @GetMapping("/clinicians/{practitionerId}/credentials") public Object list(@PathVariable UUID organizationId,@PathVariable UUID practitionerId){return credentials.list(organizationId,practitionerId);}
    @GetMapping("/credential-reviews") public Object queue(@PathVariable UUID organizationId){return credentials.queue(organizationId);}
    @GetMapping("/credential-reviews/{revisionId}") public Object reviewDetail(@PathVariable UUID organizationId,@PathVariable UUID revisionId){return credentials.reviewDetail(organizationId,revisionId);}
    @PostMapping("/credential-reviews/{revisionId}/decision") public Object decide(@PathVariable UUID organizationId,@PathVariable UUID revisionId,@RequestHeader("Idempotency-Key")String key,@RequestBody ProviderCredentialService.DecisionCommand command){return credentials.decide(organizationId,revisionId,command,key);}
    @GetMapping("/clinicians/{practitionerId}/readiness") public Object readiness(@PathVariable UUID organizationId,@PathVariable UUID practitionerId){return credentials.readiness(organizationId,practitionerId);}
    @PostMapping("/clinicians/{practitionerId}/legacy-adoption") public Object adoptLegacy(@PathVariable UUID organizationId,@PathVariable UUID practitionerId,@RequestParam long version,@RequestParam String reason,@RequestHeader("Idempotency-Key")String key){return credentials.adoptLegacyMapping(organizationId,practitionerId,version,reason,key);}
    @PostMapping("/clinicians/{practitionerId}/activate") public Object activate(@PathVariable UUID organizationId,@PathVariable UUID practitionerId,@RequestParam long version,@RequestHeader("Idempotency-Key")String key){return credentials.activateClinician(organizationId,practitionerId,version,key);}
    @PostMapping("/activate") public Object activateProvider(@PathVariable UUID organizationId,@RequestParam long version,@RequestHeader("Idempotency-Key")String key){return credentials.activateProvider(organizationId,version,key);}
}
