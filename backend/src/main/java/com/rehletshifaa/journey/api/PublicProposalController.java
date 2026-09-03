package com.rehletshifaa.journey.api;

import com.rehletshifaa.journey.application.JourneyService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import static com.rehletshifaa.journey.api.JourneyDtos.*;

@RestController
@RequestMapping("/api/v1/public/proposals")
public class PublicProposalController {
    private final JourneyService service;
    public PublicProposalController(JourneyService service){this.service=service;}
    @GetMapping("/{token}") public PublicProposalView get(@PathVariable String token){return service.publicProposal(token);}
    @PostMapping("/{token}/sign") public IdResponse sign(@PathVariable String token,@Valid @RequestBody SignProposalRequest request){return service.signProposal(token,request);}
}
