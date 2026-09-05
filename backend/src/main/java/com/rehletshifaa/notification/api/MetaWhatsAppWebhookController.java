package com.rehletshifaa.notification.api;

import com.rehletshifaa.notification.application.MetaWhatsAppWebhookService;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/public/webhooks/whatsapp/meta")
@ConditionalOnProperty(name="app.whatsapp.mode", havingValue="meta")
public class MetaWhatsAppWebhookController {
    private final MetaWhatsAppWebhookService service;

    public MetaWhatsAppWebhookController(MetaWhatsAppWebhookService service) { this.service = service; }

    @GetMapping
    public ResponseEntity<String> verify(
        @RequestParam(name="hub.mode", required=false) String mode,
        @RequestParam(name="hub.verify_token", required=false) String token,
        @RequestParam(name="hub.challenge", required=false) String challenge
    ) {
        if (!service.acceptsVerification(mode, token) || challenge == null)
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        return ResponseEntity.ok(challenge);
    }

    @PostMapping
    public ResponseEntity<Void> receive(
        @RequestBody byte[] payload,
        @RequestHeader(name="X-Hub-Signature-256", required=false) String signature
    ) {
        if (!service.validSignature(payload, signature))
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        service.process(payload);
        return ResponseEntity.ok().build();
    }
}
