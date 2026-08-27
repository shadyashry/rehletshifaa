package com.rehletshifaa.casemanagement.api;
import com.rehletshifaa.casemanagement.application.CaseService; import com.rehletshifaa.security.BotProtectionPort; import com.rehletshifaa.shared.api.GlobalExceptionHandler;
import org.junit.jupiter.api.*; import org.springframework.http.MediaType; import org.springframework.test.web.servlet.MockMvc; import java.util.UUID;
import static org.mockito.ArgumentMatchers.*; import static org.mockito.Mockito.*; import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post; import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
class CaseControllerTest {
    private MockMvc mvc; private CaseService service;
    @BeforeEach void setup(){service=mock(CaseService.class);var bot=mock(BotProtectionPort.class);mvc=org.springframework.test.web.servlet.setup.MockMvcBuilders.standaloneSetup(new CaseController(service,bot)).setControllerAdvice(new GlobalExceptionHandler()).build();}
    @Test void createsCaseFromMinimalValidPayload()throws Exception{UUID id=UUID.randomUUID();when(service.create(any())).thenReturn(new CaseDtos.CreateCaseResponse(id,"RS-2026-000001","DRAFT"));mvc.perform(post("/api/v1/cases").contentType(MediaType.APPLICATION_JSON).content("{\"fullName\":\"Jane Doe\",\"country\":\"Kenya\",\"whatsappNumber\":\"+254700000000\",\"preferredLanguage\":\"en\",\"consent\":true}")).andExpect(status().isCreated()).andExpect(jsonPath("$.caseId").value(id.toString())).andExpect(jsonPath("$.status").value("DRAFT"));}
    @Test void rejectsMissingConsent()throws Exception{mvc.perform(post("/api/v1/cases").contentType(MediaType.APPLICATION_JSON).content("{\"fullName\":\"Jane Doe\",\"country\":\"Kenya\",\"whatsappNumber\":\"+254700000000\",\"preferredLanguage\":\"en\",\"consent\":false}")).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));verifyNoInteractions(service);}
}
