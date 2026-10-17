package com.rehletshifaa.notification.infrastructure;
import com.rehletshifaa.notification.application.NotificationChannelPort;
import io.micrometer.core.instrument.MeterRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import java.net.URI;
import java.net.http.*;
import java.time.Duration;

/** Fixed internal destination; no caller-supplied paths, tags, URLs, or redirects. The outbox owns retry/backoff. */
@Component
public class ConsultantRevalidationChannel implements NotificationChannelPort {
    private static final Logger log=LoggerFactory.getLogger(ConsultantRevalidationChannel.class);
    private final HttpClient client=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).followRedirects(HttpClient.Redirect.NEVER).build();
    private final String url;
    private final String secret;
    private final MeterRegistry metrics;
    public ConsultantRevalidationChannel(@Value("${app.web.revalidate-url:}") String url,@Value("${app.web.revalidate-secret:}") String secret,MeterRegistry metrics) {
        this.url=url; this.secret=secret; this.metrics=metrics;
    }
    @Override public boolean supports(String channel) { return "REVALIDATION".equals(channel); }
    @Override public String deliver(String slug,String reasonText,String body,String idempotencyKey) {
        String reason="REQUEST_FAILED";
        try {
            if (url.isBlank() || secret.isBlank()) { reason="NOT_CONFIGURED"; throw new IllegalStateException(); }
            if (!slug.matches("[a-z0-9]+(?:-[a-z0-9]+)*") || slug.length()>80) { reason="INVALID_SLUG"; throw new IllegalStateException(); }
            var request=HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofSeconds(10)).header("Content-Type","application/json")
                    .header("X-Revalidate-Secret",secret).header("Idempotency-Key",idempotencyKey)
                    .POST(HttpRequest.BodyPublishers.ofString("{\"slug\":\""+slug+"\"}")).build();
            int status=client.send(request,HttpResponse.BodyHandlers.discarding()).statusCode();
            if (status<200 || status>=300) { reason="HTTP_"+status; throw new IllegalStateException(); }
            metrics.counter("consultant.revalidation","outcome","success").increment(); return "revalidated";
        } catch (Exception e) {
            if (e instanceof InterruptedException) Thread.currentThread().interrupt();
            metrics.counter("consultant.revalidation","outcome","failure").increment();
            log.warn("Consultant revalidation failed: slug={} change={} reason={}",slug,reasonText,reason);
            throw new IllegalStateException("Consultant revalidation failed");
        }
    }
}
