package com.rehletshifaa.notification.infrastructure;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.rehletshifaa.notification.application.WhatsAppMediaPort;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClient;

import java.net.URI;

/** Media download on the Cloud API: {@code GET /{media-id}} for a short-lived URL, then the bytes with the same token. */
@Component
@ConditionalOnProperty(name = "app.whatsapp.mode", havingValue = "meta")
public class MetaWhatsAppMediaClient implements WhatsAppMediaPort {
    private final RestClient client;
    private final ObjectMapper json;
    private final String accessToken;

    public MetaWhatsAppMediaClient(RestClient.Builder builder, ObjectMapper json,
                                   @Value("${app.whatsapp.meta.graph-base-url}") String graphBaseUrl,
                                   @Value("${app.whatsapp.meta.graph-version}") String graphVersion,
                                   @Value("${app.whatsapp.meta.access-token}") String accessToken) {
        this.client = builder.baseUrl(graphBaseUrl + "/" + graphVersion).build();
        this.json = json;
        this.accessToken = accessToken;
    }

    @Override
    public Media fetch(String mediaId, long maximumBytes) {
        JsonNode meta;
        try {
            meta = json.readTree(client.get().uri("/{mediaId}", mediaId)
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken).retrieve().body(String.class));
        } catch (HttpClientErrorException e) {
            if (e.getStatusCode() == HttpStatus.NOT_FOUND || e.getStatusCode() == HttpStatus.BAD_REQUEST)
                throw new MediaGoneException("Meta no longer has media " + mediaId);
            throw e;
        } catch (Exception e) {
            throw new IllegalStateException("Media metadata could not be read", e);
        }
        long size = meta.path("file_size").asLong(-1);
        if (size > maximumBytes) throw new MediaTooLargeException("Media is " + size + " bytes");
        String url = meta.path("url").asText();
        if (url.isBlank()) throw new MediaGoneException("Meta returned no download URL for media " + mediaId);
        byte[] content = client.get().uri(URI.create(url)).header(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken)
                .retrieve().body(byte[].class);
        if (content == null) throw new IllegalStateException("Media download returned no content");
        if (content.length > maximumBytes) throw new MediaTooLargeException("Media is " + content.length + " bytes");
        return new Media(content, meta.path("mime_type").asText(null), content.length);
    }
}
