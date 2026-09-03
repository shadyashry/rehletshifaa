package com.rehletshifaa.journey.api;

import com.rehletshifaa.journey.application.JourneyService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import static com.rehletshifaa.journey.api.JourneyDtos.*;

/**
 * Anonymous, no-login access to a released proposal via a secure link. Possession of the link is
 * never sufficient: viewing sensitive clinical/pricing detail and making a decision both require a
 * one-time OTP delivered to the already-verified contact, exchanged here for a short-lived grant.
 * The grant is passed in the request body (never a query string) to keep it out of URLs/logs.
 */
@RestController
@RequestMapping("/api/v1/public/proposals")
public class PublicProposalController {
    private final JourneyService service;
    public PublicProposalController(JourneyService service){this.service=service;}

    /** Non-sensitive summary for a valid link (case number + masked contact hint). */
    @GetMapping("/{token}") public PublicProposalSummary summary(@PathVariable String token){return service.publicProposalSummary(token);}
    /** Send (or resend) the OTP to the verified contact. */
    @PostMapping("/{token}/request-access") public PublicProposalSummary requestAccess(@PathVariable String token){return service.requestProposalAccess(token);}
    /** Exchange the OTP for a short-lived view grant. */
    @PostMapping("/{token}/verify") public ProposalAccessGrant verify(@PathVariable String token,@Valid @RequestBody ProposalVerifyRequest request){return service.verifyProposalAccess(token,request.code());}
    /** Full sensitive view — requires a valid grant. */
    @PostMapping("/{token}/view") public PublicProposalView view(@PathVariable String token,@Valid @RequestBody ProposalViewRequest request){return service.viewProposal(token,request.grant());}
    /** Accept / decline / request revision on the exact released version — requires a valid grant. */
    @PostMapping("/{token}/decision") public IdResponse decide(@PathVariable String token,@Valid @RequestBody PublicProposalDecisionRequest request){return service.decideProposalPublic(token,request.grant(),request);}
}
