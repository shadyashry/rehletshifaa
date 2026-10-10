package com.rehletshifaa.notification.infrastructure;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.rehletshifaa.notification.application.OutgoingNotification;
import com.rehletshifaa.notification.application.UndeliverableNotificationException;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

/** Patient notifications reach Meta only as approved templates, never as free text that Meta would reject. */
class MetaWhatsAppChannelTest {
    static final String URL = "https://graph.test/v23.0/PNID/messages";
    static final String OK = "{\"messages\":[{\"id\":\"wamid.1\"}]}";
    MockRestServiceServer server;
    MetaWhatsAppChannel channel;

    @BeforeEach void setup() {
        var builder = RestClient.builder();
        server = MockRestServiceServer.bindTo(builder).build();
        var templates = new MetaWhatsAppTemplates(
                Map.of("final-quote-ready", "rs_final_quote_ready", "proposal-decision-recorded", "rs_decision_recorded"),
                Map.of("en", "en", "ar", "ar"));
        channel = new MetaWhatsAppChannel(builder, new ObjectMapper(), templates, "https://graph.test", "v23.0", "PNID",
                "test-token", "rs_code", "en_US");
    }
    @AfterEach void verify() { server.verify(); }

    static OutgoingNotification notification(String key, String language, List<String> parameters, String linkPath) {
        return new OutgoingNotification("+20 100 000 0000", "subject", "body text", key, language, parameters, linkPath, "key-1");
    }

    @Test void aLinkNoticeIsSentAsItsTemplateInThePatientsLanguageWithTheLinkInTheButton() {
        server.expect(requestTo(URL)).andExpect(method(HttpMethod.POST))
                .andExpect(header("Authorization", "Bearer test-token"))
                .andExpect(jsonPath("$.to").value("201000000000"))
                .andExpect(jsonPath("$.type").value("template"))
                .andExpect(jsonPath("$.text").doesNotExist())
                .andExpect(jsonPath("$.template.name").value("rs_final_quote_ready"))
                .andExpect(jsonPath("$.template.language.code").value("ar"))
                .andExpect(jsonPath("$.template.components.length()").value(1))
                .andExpect(jsonPath("$.template.components[0].type").value("button"))
                .andExpect(jsonPath("$.template.components[0].parameters[0].text").value("ar/proposal/tok123"))
                .andRespond(withSuccess(OK, MediaType.APPLICATION_JSON));

        assertThat(channel.deliver(notification("final-quote-ready", "ar", List.of(), "ar/proposal/tok123"))).isEqualTo("wamid.1");
    }

    @Test void bodyParametersAreSentInOrder() {
        server.expect(requestTo(URL))
                .andExpect(jsonPath("$.template.name").value("rs_decision_recorded"))
                .andExpect(jsonPath("$.template.language.code").value("en"))
                .andExpect(jsonPath("$.template.components[0].type").value("body"))
                .andExpect(jsonPath("$.template.components[0].parameters[0].text").value("you accepted the final quote"))
                .andExpect(jsonPath("$.template.components[0].parameters[1].text").value("you"))
                .andExpect(jsonPath("$.template.components[0].parameters[2].text").value("8 October 2026"))
                .andRespond(withSuccess(OK, MediaType.APPLICATION_JSON));

        channel.deliver(notification("proposal-decision-recorded", "en",
                List.of("you accepted the final quote", "you", "8 October 2026"), null));
    }

    @Test void aOneTimeCodeUsesTheAuthenticationTemplate() {
        server.expect(requestTo(URL))
                .andExpect(jsonPath("$.template.name").value("rs_code"))
                .andExpect(jsonPath("$.template.language.code").value("en_US"))
                .andExpect(jsonPath("$.template.components[0].parameters[0].text").value("123456"))
                .andExpect(jsonPath("$.template.components[1].sub_type").value("url"))
                .andRespond(withSuccess(OK, MediaType.APPLICATION_JSON));

        channel.deliver(notification("case-access-code", null, List.of("123456"), null));
    }

    @Test void aKeyWithoutAnApprovedTemplateIsUndeliverableAndNothingIsSent() {
        assertThatThrownBy(() -> channel.deliver(notification("secure-message", "en", List.of(), "en/status/t")))
                .isInstanceOf(UndeliverableNotificationException.class)
                .extracting(e -> ((UndeliverableNotificationException) e).code()).isEqualTo("WHATSAPP_TEMPLATE_NOT_BOUND");
    }

    @Test void freeTextIsNeverSent() {
        assertThatThrownBy(() -> channel.deliver("+201000000000", "s", "free text", "k"))
                .isInstanceOf(UndeliverableNotificationException.class)
                .extracting(e -> ((UndeliverableNotificationException) e).code()).isEqualTo("WHATSAPP_TEMPLATE_REQUIRED");
    }
}
