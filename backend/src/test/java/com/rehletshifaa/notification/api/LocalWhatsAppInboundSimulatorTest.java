package com.rehletshifaa.notification.api;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.rehletshifaa.conversation.application.WhatsAppInboundProcessor;
import com.rehletshifaa.notification.application.WhatsAppInboundStore;
import com.rehletshifaa.security.LocalDevEndpointsSecurity;
import com.rehletshifaa.shared.api.ApiException;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * QA W-31: on dev a simulated text is filed exactly like a real WhatsApp message (here: a sender with no case starts an
 * intake conversation); outside the local profile neither the endpoint nor its open security chain exists.
 */
@SpringBootTest(properties = "spring.task.scheduling.enabled=false")
@Transactional
class LocalWhatsAppInboundSimulatorTest {
    @Autowired WhatsAppInboundStore store;
    @Autowired WhatsAppInboundProcessor processor;
    @Autowired ObjectMapper json;
    @Autowired Clock clock;
    @Autowired JdbcTemplate jdbc;
    @Autowired EntityManager em;
    @Autowired ApplicationContext context;

    @Test void aSimulatedTextFromSomeoneWithoutACaseStartsAnIntakeConversation() {
        var simulator = new LocalWhatsAppInboundSimulatorController(store, json, clock);
        var recorded = simulator.inbound(new LocalWhatsAppInboundSimulatorController.SimulatedText("+254 799 000 031", "QA Sender", "Hello, I need a knee consultation"));
        em.flush();
        assertThat(recorded.sender()).isEqualTo("254799000031");

        processor.dispatch();

        var row = jdbc.queryForMap("SELECT status, outcome FROM whatsapp_inbound_messages WHERE provider_message_id=?", recorded.messageId());
        assertThat(row.get("status")).isEqualTo("PROCESSED");
        assertThat(row.get("outcome")).isEqualTo("INTAKE");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM intake_messages WHERE external_message_id=?", Integer.class, recorded.messageId())).isEqualTo(1);
    }

    @Test void aSenderWithoutAPhoneNumberIsRefused() {
        var simulator = new LocalWhatsAppInboundSimulatorController(store, json, clock);
        assertThatThrownBy(() -> simulator.inbound(new LocalWhatsAppInboundSimulatorController.SimulatedText("not a phone", null, "Hi")))
                .isInstanceOf(ApiException.class).hasMessageContaining("country code");
    }

    @Test void outsideTheLocalProfileTheSimulatorAndItsOpenChainDoNotExist() {
        assertThat(context.getBeanNamesForType(LocalWhatsAppInboundSimulatorController.class)).isEmpty();
        assertThat(context.getBeanNamesForType(LocalDevEndpointsSecurity.class)).isEmpty();
    }
}
