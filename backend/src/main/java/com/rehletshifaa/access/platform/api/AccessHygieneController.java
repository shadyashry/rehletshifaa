package com.rehletshifaa.access.platform.api;

import com.rehletshifaa.access.platform.application.AccessHygieneService;
import com.rehletshifaa.access.platform.application.AccessHygieneService.Decision;
import com.rehletshifaa.access.platform.application.AccessHygieneService.ItemDecision;
import com.rehletshifaa.access.platform.application.AccessHygieneService.MfaResetRequest;
import com.rehletshifaa.access.platform.application.AccessHygieneService.Registration;
import com.rehletshifaa.access.platform.application.AccessHygieneService.Rotation;
import com.rehletshifaa.access.platform.application.AccessHygieneService.SupportAction;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/** Account support, MFA reset, recertification and the service-account registry (Section 1.5). */
@RestController
public class AccessHygieneController {
    private static final String ADMIN = "/api/v1/admin/platform-access";
    private final AccessHygieneService hygiene;

    public AccessHygieneController(AccessHygieneService hygiene) { this.hygiene = hygiene; }

    @GetMapping("/api/v1/support/accounts") public ResponseEntity<Object> account(@RequestParam String query) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(hygiene.supportAccount(query));
    }
    @PostMapping("/api/v1/support/accounts/{subject}/resend-invitation") public void resend(@PathVariable String subject, @RequestBody SupportAction command) { hygiene.supportResendInvitation(subject, command); }
    @PostMapping("/api/v1/support/accounts/{subject}/password-reset") public void passwordReset(@PathVariable String subject, @RequestBody SupportAction command) { hygiene.supportPasswordReset(subject, command); }
    @PostMapping("/api/v1/support/mfa-reset-requests") public Object requestMfaReset(@RequestBody MfaResetRequest command) { return hygiene.requestMfaReset(command); }
    @PostMapping("/api/v1/me/mfa-reset-requests") public Object requestOwnMfaReset(@RequestBody MfaResetRequest command) { return hygiene.requestMfaReset(command); }

    @GetMapping(ADMIN + "/mfa-reset-requests") public Object mfaResets() { return hygiene.mfaResets(); }
    @PostMapping(ADMIN + "/mfa-reset-requests/{id}/decision") public Object decideMfaReset(@PathVariable UUID id, @RequestBody Decision command) { return hygiene.decideMfaReset(id, command); }

    @GetMapping(ADMIN + "/recertifications") public Object campaigns() { return hygiene.campaigns(); }
    @PostMapping(ADMIN + "/recertifications") public Object start(@RequestParam String scope) { return hygiene.startCampaign(scope); }
    @GetMapping(ADMIN + "/recertifications/{id}") public Object campaign(@PathVariable UUID id) { return hygiene.campaign(id); }
    @PostMapping(ADMIN + "/recertification-items/{id}/decision") public Object decideItem(@PathVariable UUID id, @RequestBody ItemDecision command) { return hygiene.decideItem(id, command); }

    @GetMapping(ADMIN + "/service-accounts") public Object serviceAccounts() { return hygiene.serviceAccounts(); }
    @PostMapping(ADMIN + "/service-accounts") public Object register(@RequestBody Registration command) { return hygiene.register(command); }
    @PostMapping(ADMIN + "/service-accounts/{clientId}/rotation") public Object rotation(@PathVariable String clientId, @RequestBody Rotation command) { return hygiene.recordRotation(clientId, command); }
    @PostMapping(ADMIN + "/service-accounts/{clientId}/retire") public Object retire(@PathVariable String clientId, @RequestBody Rotation command) { return hygiene.retire(clientId, command); }
}
