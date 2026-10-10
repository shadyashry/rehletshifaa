package com.rehletshifaa.conversation.application;

import com.rehletshifaa.casemanagement.api.CaseDtos.CreateCaseRequest;
import com.rehletshifaa.casemanagement.api.CaseDtos.RepresentativeContact;
import com.rehletshifaa.casemanagement.application.CaseService;
import com.rehletshifaa.document.application.DocumentInspectionPort;
import com.rehletshifaa.document.application.DocumentInspectionPort.InspectionResult;
import com.rehletshifaa.notification.application.WhatsAppInboundStore;
import com.rehletshifaa.notification.application.WhatsAppMediaPort;
import com.rehletshifaa.shared.crypto.CryptoService;
import com.rehletshifaa.shared.crypto.EncryptedText;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.when;

/**
 * S1: a WhatsApp message from someone with an open case lands in that case's patient thread exactly once, with any file
 * inspected and kept as a case document; anything else is kept for later rather than lost.
 */
@SpringBootTest(properties = "spring.task.scheduling.enabled=false")
@Transactional
class WhatsAppInboundProcessorTest {
    @Autowired WhatsAppInboundProcessor processor;
    @Autowired WhatsAppInboundStore store;
    @Autowired CaseService cases;
    @Autowired JdbcTemplate jdbc;
    @Autowired CryptoService crypto;
    @Autowired EntityManager em;
    @MockitoBean WhatsAppMediaPort media;
    @MockitoBean DocumentInspectionPort inspector;

    UUID submittedCase(String phone) {
        var created = cases.create(new CreateCaseRequest("Inbound", "Patient", "Kenya", phone, "Reports", "en", true, null));
        cases.submit(created.caseId());
        em.flush();
        return created.caseId();
    }

    void receive(String id, String from, String messageJson) {
        store.record(id, from, "x", "{\"message\":" + messageJson + ",\"profileName\":\"Test\"}", Instant.now());
        em.flush();
    }

    void receiveText(String id, String from, String text) {
        receive(id, from, "{\"id\":\"" + id + "\",\"from\":\"" + from + "\",\"type\":\"text\",\"text\":{\"body\":\"" + text + "\"}}");
    }

    Map<String, Object> message(String externalId) {
        return jdbc.queryForMap("SELECT * FROM case_messages WHERE external_message_id=?", externalId);
    }

    Map<String, Object> inbound(String providerId) {
        return jdbc.queryForMap("SELECT * FROM whatsapp_inbound_messages WHERE provider_message_id=?", providerId);
    }

    @Test void aPatientsTextLandsInTheirCasePatientThread() {
        UUID caseId = submittedCase("+254 700 000 301");
        receiveText("wamid.text1", "254700000301", "I have new reports");

        processor.dispatch();

        var m = message("wamid.text1");
        assertThat(m.get("case_id")).isEqualTo(caseId);
        assertThat(m.get("thread_type")).isEqualTo("PATIENT_COORDINATOR");
        assertThat(m.get("channel")).isEqualTo("WHATSAPP");
        assertThat(m.get("sender_role")).isEqualTo("PATIENT");
        assertThat(m.get("internal_only")).isEqualTo(false);
        assertThat(EncryptedText.decode(crypto, (String) m.get("body"))).isEqualTo("I have new reports");
        var row = inbound("wamid.text1");
        assertThat(row.get("status")).isEqualTo("PROCESSED");
        assertThat(row.get("case_id")).isEqualTo(caseId);
        assertThat(row.get("payload")).isEqualTo(""); // nothing kept once filed
    }

    @Test void aRedeliveredMessageIsFiledOnce() {
        submittedCase("+254700000302");
        receiveText("wamid.dup", "254700000302", "hello");
        assertThat(store.record("wamid.dup", "254700000302", "text", "{}", Instant.now())).isFalse();

        processor.dispatch();
        processor.dispatch();

        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM case_messages WHERE external_message_id='wamid.dup'", Integer.class)).isEqualTo(1);
    }

    @Test void aSenderWithNoOpenCaseIsKeptForIntake() {
        receiveText("wamid.unknown", "254799999999", "Can you help me?");

        processor.dispatch();

        var row = inbound("wamid.unknown");
        assertThat(row.get("status")).isEqualTo("UNMATCHED");
        assertThat((String) row.get("payload")).startsWith("enc:");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM case_messages WHERE external_message_id='wamid.unknown'", Integer.class)).isZero();
    }

    @Test void aRepresentativeWritesAsTheRepresentative() {
        var created = cases.create(new CreateCaseRequest("SOMEONE_ELSE", "Layla", "Hassan", null, new RepresentativeContact("Omar Hassan", "PARENT"),
                "Kenya", "+254700000303", "Reports", "en", true, null, null, null, null, null));
        cases.submit(created.caseId());
        em.flush();
        receiveText("wamid.rep", "254700000303", "Writing for my daughter");

        processor.dispatch();

        var m = message("wamid.rep");
        assertThat(m.get("case_id")).isEqualTo(created.caseId());
        assertThat(m.get("sender_role")).isEqualTo("PATIENT_REPRESENTATIVE");
    }

    @Test void anArabicMessageIsMarkedArabic() {
        submittedCase("+254700000304");
        receiveText("wamid.ar", "254700000304", "لدي تقارير جديدة");

        processor.dispatch();

        assertThat(message("wamid.ar").get("language")).isEqualTo("ar");
    }

    @Test void aCleanFileBecomesACaseDocument() {
        UUID caseId = submittedCase("+254700000305");
        byte[] pdf = "%PDF-1.4 test".getBytes(StandardCharsets.US_ASCII);
        when(media.fetch(eq("media-1"), anyLong())).thenReturn(new WhatsAppMediaPort.Media(pdf, "application/pdf", pdf.length));
        when(inspector.inspect(any(), anyString())).thenReturn(new InspectionResult(true, null));
        receive("wamid.doc", "254700000305", "{\"id\":\"wamid.doc\",\"from\":\"254700000305\",\"type\":\"document\","
                + "\"document\":{\"id\":\"media-1\",\"mime_type\":\"application/pdf\",\"filename\":\"scan.pdf\",\"caption\":\"My MRI\"}}");

        processor.dispatch();

        var m = message("wamid.doc");
        assertThat(m.get("attachment_status")).isEqualTo("CLEAN");
        assertThat(EncryptedText.decode(crypto, (String) m.get("body"))).isEqualTo("My MRI");
        var doc = jdbc.queryForMap("SELECT * FROM medical_documents WHERE id=?", m.get("attachment_document_id"));
        assertThat(doc.get("case_id")).isEqualTo(caseId);
        assertThat(doc.get("status")).isEqualTo("CLEAN");
        assertThat(doc.get("original_file_name")).isEqualTo("scan.pdf");
    }

    @Test void noScannerVerdictRetriesTheWholeMessageLater() {
        submittedCase("+254700000306");
        byte[] pdf = "%PDF-1.4 test".getBytes(StandardCharsets.US_ASCII);
        when(media.fetch(anyString(), anyLong())).thenReturn(new WhatsAppMediaPort.Media(pdf, "application/pdf", pdf.length));
        when(inspector.inspect(any(), anyString())).thenReturn(InspectionResult.unavailable("CLAMAV_DOWN"));
        receive("wamid.retry", "254700000306", "{\"id\":\"wamid.retry\",\"from\":\"254700000306\",\"type\":\"image\","
                + "\"image\":{\"id\":\"media-2\",\"mime_type\":\"image/jpeg\"}}");

        processor.dispatch();

        var row = inbound("wamid.retry");
        assertThat(row.get("status")).isEqualTo("RETRY");
        assertThat(row.get("outcome")).isEqualTo("SCAN_UNAVAILABLE");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM case_messages WHERE external_message_id='wamid.retry'", Integer.class)).isZero();
    }

    @Test void kindsThatAreNotKeptAreNotedForTheCoordinator() {
        submittedCase("+254700000307");
        receive("wamid.voice", "254700000307", "{\"id\":\"wamid.voice\",\"from\":\"254700000307\",\"type\":\"audio\",\"audio\":{\"id\":\"media-3\"}}");
        when(media.fetch(anyString(), anyLong())).thenThrow(new WhatsAppMediaPort.MediaGoneException("gone"));
        receive("wamid.gone", "254700000307", "{\"id\":\"wamid.gone\",\"from\":\"254700000307\",\"type\":\"image\",\"image\":{\"id\":\"media-4\"}}");

        processor.dispatch();

        assertThat(message("wamid.voice").get("attachment_status")).isEqualTo("UNSUPPORTED_TYPE");
        assertThat(message("wamid.gone").get("attachment_status")).isEqualTo("EXPIRED");
    }

    @Test void aReactionIsNotFiled() {
        submittedCase("+254700000308");
        receive("wamid.react", "254700000308", "{\"id\":\"wamid.react\",\"from\":\"254700000308\",\"type\":\"reaction\",\"reaction\":{\"emoji\":\"👍\"}}");

        processor.dispatch();

        assertThat(inbound("wamid.react").get("outcome")).isEqualTo("IGNORED_REACTION");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM case_messages WHERE external_message_id='wamid.react'", Integer.class)).isZero();
    }
}
