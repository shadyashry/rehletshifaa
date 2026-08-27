package com.rehletshifaa.document.api;
import com.rehletshifaa.document.infrastructure.LocalStorageAdapter;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
@RestController @ConditionalOnProperty(name="app.storage.mode",havingValue="mock",matchIfMissing=true) @RequestMapping("/api/v1/local-uploads")
public class LocalUploadController {
    private final LocalStorageAdapter storage; public LocalUploadController(LocalStorageAdapter storage){this.storage=storage;}
    @PutMapping("/{token}") public ResponseEntity<Void> upload(@PathVariable String token,@RequestHeader(HttpHeaders.CONTENT_TYPE)String type,@RequestBody byte[] body){storage.upload(token,type,body);return ResponseEntity.noContent().build();}
}

