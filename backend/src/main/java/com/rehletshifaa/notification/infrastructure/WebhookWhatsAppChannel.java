package com.rehletshifaa.notification.infrastructure;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.rehletshifaa.notification.application.NotificationChannelPort;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.*;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import java.util.Map;

@Component
@ConditionalOnProperty(name="app.whatsapp.mode",havingValue="webhook")
public class WebhookWhatsAppChannel implements NotificationChannelPort {
    private final RestClient client; private final String token; private final ObjectMapper json;
    public WebhookWhatsAppChannel(RestClient.Builder builder,ObjectMapper json,@Value("${app.whatsapp.webhook-url}")String url,@Value("${app.whatsapp.token}")String token){this.client=builder.baseUrl(url).build();this.json=json;this.token=token;}
    @Override public boolean supports(String channel){return "WHATSAPP".equals(channel);}
    @Override public String deliver(String destination,String subject,String body,String idempotencyKey){try{return client.post().header(HttpHeaders.AUTHORIZATION,"Bearer "+token).header("Idempotency-Key",idempotencyKey).contentType(MediaType.APPLICATION_JSON).body(Map.of("to",destination,"message",body)).retrieve().body(String.class);}catch(Exception e){throw new IllegalStateException("WhatsApp provider rejected the notification",e);}}
}
