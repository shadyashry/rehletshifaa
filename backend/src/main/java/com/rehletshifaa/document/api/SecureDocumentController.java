package com.rehletshifaa.document.api;

import com.rehletshifaa.document.application.SecureDocumentService;
import org.springframework.web.bind.annotation.*;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/documents")
public class SecureDocumentController {
    private final SecureDocumentService service;
    public SecureDocumentController(SecureDocumentService service){this.service=service;}
    @GetMapping("/{documentId}/download") public SecureDocumentService.DownloadResponse download(@PathVariable UUID documentId){return service.download(documentId);}
}
