package com.rehletshifaa.document.api;

import com.rehletshifaa.document.application.PatientDocumentService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

/** Uploads from My Care: the signed-in patient or their guardian adds a file to their own case (presign, upload, confirm). */
@RestController
@RequestMapping("/api/v1/patient/cases/{caseId}/documents")
public class PatientDocumentController {
    private final PatientDocumentService service;

    public PatientDocumentController(PatientDocumentService service) { this.service = service; }

    @PostMapping("/presign") @ResponseStatus(HttpStatus.CREATED)
    public DocumentDtos.PresignResponse presign(@PathVariable UUID caseId, @Valid @RequestBody DocumentDtos.PresignRequest request) { return service.presign(caseId, request); }

    @PostMapping("/confirm")
    public DocumentDtos.ConfirmResponse confirm(@PathVariable UUID caseId, @Valid @RequestBody DocumentDtos.ConfirmRequest request) { return service.confirm(caseId, request); }
}
