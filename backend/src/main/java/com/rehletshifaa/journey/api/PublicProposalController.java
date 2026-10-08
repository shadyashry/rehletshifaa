package com.rehletshifaa.journey.api;

import com.rehletshifaa.journey.application.JourneyService;
import com.rehletshifaa.journey.application.ProposalAssistanceService;
import com.rehletshifaa.journey.application.JourneyProjectionService;
import com.rehletshifaa.journey.application.ReviewProposalActionHandler;
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
    private final JourneyProjectionService journey;
    private final ProposalAssistanceService assistance;
    public PublicProposalController(JourneyService service,JourneyProjectionService journey,ProposalAssistanceService assistance){this.service=service;this.journey=journey;this.assistance=assistance;}

    /** Non-sensitive summary for a valid link (case number + masked contact hint). */
    @GetMapping("/{token}") public PublicProposalSummary summary(@PathVariable String token){return service.publicProposalSummary(token);}
    /** Send (or resend) the OTP to the patient's own registered contact. The optional body may choose the
     *  channel ({"channel":"WHATSAPP"|"EMAIL"}); absent => default (WhatsApp when available). Old clients
     *  that send no body keep working. The destination is never caller-supplied. */
    @PostMapping("/{token}/request-access") public PublicProposalSummary requestAccess(@PathVariable String token,@RequestBody(required=false) @Valid ProposalAccessRequest request){return service.requestProposalAccess(token,request==null?null:request.channel());}
    /** Exchange the OTP for a short-lived view grant. */
    @PostMapping("/{token}/verify") public ProposalAccessGrant verify(@PathVariable String token,@Valid @RequestBody ProposalVerifyRequest request){return service.verifyProposalAccess(token,request.code());}
    /** Full sensitive view — requires a valid grant. */
    @PostMapping("/{token}/view") public PublicProposalView view(@PathVariable String token,@Valid @RequestBody ProposalViewRequest request){return service.viewProposal(token,request.grant());}
    /** Ask the coordinator to go through the terms in Arabic and record the decision; needs the same verified grant as viewing. */
    @PostMapping("/{token}/assistance") public ProposalAssistanceView requestAssistance(@PathVariable String token,@Valid @RequestBody ProposalViewRequest request){return assistance.requestFromSecureLink(token,request.grant());}
    /** Accept / decline / request revision on the exact released version — requires a valid grant. */
    @PostMapping("/{token}/decision") public IdResponse decide(@PathVariable String token,@Valid @RequestBody PublicProposalDecisionRequest request){return service.decideProposalPublic(token,request.grant(),request);}
    /** Journey-bound secure-link decision against the projected business PatientAction. */
    @PostMapping("/{token}/actions/{actionId}/decision") public IdResponse decideJourney(@PathVariable String token,@PathVariable java.util.UUID actionId,@Valid @RequestBody PublicProposalDecisionRequest request){
        boolean accepted=java.util.Set.of("ACCEPTED","ACKNOWLEDGED").contains(request.decision());
        journey.completeSecureProposalAction(token,request.grant(),actionId,new ReviewProposalActionHandler.SecureDecision(token,request.grant(),request),java.util.Map.of("PROPOSAL_ACCEPTED",accepted));
        return new IdResponse(actionId,"COMPLETED");
    }
}
