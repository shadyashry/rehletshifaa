package com.rehletshifaa.document.api;

import com.rehletshifaa.document.infrastructure.LocalStorageAdapter;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

@RestController
@ConditionalOnProperty(name="app.storage.mode",havingValue="mock",matchIfMissing=true)
@RequestMapping("/api/v1/local-downloads")
public class LocalDownloadController {
    private final LocalStorageAdapter storage;
    public LocalDownloadController(LocalStorageAdapter storage){this.storage=storage;}
    @GetMapping("/{token}") public ResponseEntity<byte[]> download(@PathVariable String token){var file=storage.download(token);return ResponseEntity.ok().contentType(MediaType.parseMediaType(file.contentType())).header(HttpHeaders.CONTENT_DISPOSITION,file.inline()?"inline":"attachment").header(HttpHeaders.CACHE_CONTROL,"no-store").body(file.body());}
}
