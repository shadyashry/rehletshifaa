package com.rehletshifaa.document.api;
import com.rehletshifaa.document.application.DocumentService;
import com.rehletshifaa.document.application.SecureDocumentService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import java.util.List;
import java.util.UUID;
@RestController @RequestMapping("/api/v1/cases/{caseId}/documents")
public class DocumentController {
    private final DocumentService service; private final SecureDocumentService secureDocuments;
    public DocumentController(DocumentService service,SecureDocumentService secureDocuments){this.service=service;this.secureDocuments=secureDocuments;}
    @GetMapping public List<SecureDocumentService.DocumentSummary> list(@PathVariable UUID caseId){return secureDocuments.list(caseId);}
    @PostMapping("/presign") @ResponseStatus(HttpStatus.CREATED) public DocumentDtos.PresignResponse presign(@PathVariable UUID caseId,@Valid @RequestBody DocumentDtos.PresignRequest request){return service.presign(caseId,request);}
    @PostMapping("/confirm") public DocumentDtos.ConfirmResponse confirm(@PathVariable UUID caseId,@Valid @RequestBody DocumentDtos.ConfirmRequest request){return service.confirm(caseId,request);}
}

