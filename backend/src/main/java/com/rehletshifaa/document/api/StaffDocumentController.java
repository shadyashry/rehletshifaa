package com.rehletshifaa.document.api;

import com.rehletshifaa.document.application.StaffDocumentService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

/** Uploads by the case team (Operations, Consultant, the owning coordinator): presign, upload, confirm, as for the patient. */
@RestController
@RequestMapping("/api/v1/work/cases/{caseId}/documents")
public class StaffDocumentController {
    private final StaffDocumentService service;

    public StaffDocumentController(StaffDocumentService service) { this.service = service; }

    @PostMapping("/presign") @ResponseStatus(HttpStatus.CREATED)
    public DocumentDtos.PresignResponse presign(@PathVariable UUID caseId, @Valid @RequestBody DocumentDtos.PresignRequest request) { return service.presign(caseId, request); }

    @PostMapping("/confirm")
    public DocumentDtos.ConfirmResponse confirm(@PathVariable UUID caseId, @Valid @RequestBody DocumentDtos.ConfirmRequest request) { return service.confirm(caseId, request); }
}
