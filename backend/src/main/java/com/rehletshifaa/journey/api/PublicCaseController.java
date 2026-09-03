package com.rehletshifaa.journey.api;

import com.rehletshifaa.document.api.DocumentDtos;
import com.rehletshifaa.journey.application.PublicCaseAccessService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

import static com.rehletshifaa.journey.api.PublicCaseDtos.*;

@RestController
@RequestMapping("/api/v1/public/cases")
public class PublicCaseController {
    private final PublicCaseAccessService service;
    public PublicCaseController(PublicCaseAccessService service){this.service=service;}
    @PostMapping("/recover") @ResponseStatus(HttpStatus.ACCEPTED) public CaseLinkRecoveryResponse recover(@Valid @RequestBody CaseLinkRecoveryRequest request){service.recoverStatusLink(request);return new CaseLinkRecoveryResponse("If the details match a case, a secure tracking link will be sent shortly.");}
    @GetMapping("/{token}") public CaseAccessSummary summary(@PathVariable String token){return service.summary(token);}
    @PostMapping("/{token}/request-access") public CaseAccessSummary requestAccess(@PathVariable String token){return service.requestAccess(token);}
    @PostMapping("/{token}/verify") public CaseAccessGrant verify(@PathVariable String token,@Valid @RequestBody CaseAccessVerifyRequest request){return service.verify(token,request.code());}
    @PostMapping("/{token}/view") public PublicCaseStatus view(@PathVariable String token,@Valid @RequestBody CaseAccessRequest request){return service.view(token,request.grant());}
    @PostMapping("/{token}/respond") public UUID respond(@PathVariable String token,@Valid @RequestBody InformationResponseRequest request){return service.respond(token,request);}
    @PostMapping("/{token}/documents/presign") public DocumentDtos.PresignResponse presign(@PathVariable String token,@RequestHeader("X-Case-Grant")String grant,@Valid @RequestBody DocumentDtos.PresignRequest request){return service.presign(token,grant,request);}
    @PostMapping("/{token}/documents/confirm") public DocumentDtos.ConfirmResponse confirm(@PathVariable String token,@RequestHeader("X-Case-Grant")String grant,@Valid @RequestBody DocumentDtos.ConfirmRequest request){return service.confirm(token,grant,request);}
}
