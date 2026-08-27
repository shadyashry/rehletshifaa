package com.rehletshifaa.casemanagement.api;

import com.rehletshifaa.casemanagement.application.CaseService;
import com.rehletshifaa.security.BotProtectionPort;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import java.util.UUID;

@RestController @RequestMapping("/api/v1/cases")
public class CaseController {
    private final CaseService service; private final BotProtectionPort botProtection;
    public CaseController(CaseService service, BotProtectionPort botProtection) { this.service=service; this.botProtection=botProtection; }
    @PostMapping @ResponseStatus(HttpStatus.CREATED) public CaseDtos.CreateCaseResponse create(@Valid @RequestBody CaseDtos.CreateCaseRequest request, HttpServletRequest http) { botProtection.verify(request.turnstileToken(), http.getRemoteAddr()); return service.create(request); }
    @PostMapping("/{caseId}/submit") public CaseDtos.SubmitCaseResponse submit(@PathVariable UUID caseId) { return service.submit(caseId); }
}
