package com.rehletshifaa.casemanagement.application;
import com.rehletshifaa.casemanagement.api.CaseDtos.CreateCaseRequest;
import com.rehletshifaa.casemanagement.domain.MedicalCase;
import com.rehletshifaa.casemanagement.infrastructure.MedicalCaseRepository;
import com.rehletshifaa.shared.api.ApiException;
import org.junit.jupiter.api.*; import org.mockito.*;
import java.time.*; import java.util.*;
import static org.assertj.core.api.Assertions.*; import static org.mockito.Mockito.*;
class CaseServiceTest {
    private MedicalCaseRepository repository; private IntakeLifecycleService intake; private CaseService service; private final Instant now=Instant.parse("2026-08-27T08:00:00Z");
    @BeforeEach void setUp(){repository=mock(MedicalCaseRepository.class);intake=mock(IntakeLifecycleService.class);var numbers=mock(CaseNumberGenerator.class);when(numbers.next()).thenReturn("RS-2026-000001");service=new CaseService(repository,numbers,intake,Clock.fixed(now,ZoneOffset.UTC));}
    @Test void createsADraftWithClientSafeResponse(){var response=service.create(new CreateCaseRequest("Jane Doe","Kenya","+254700000000","Reports available","en",true,null));assertThat(response.caseNumber()).isEqualTo("RS-2026-000001");assertThat(response.status()).isEqualTo("DRAFT");verify(repository).saveAndFlush(any(MedicalCase.class));}
    @Test void submitsDraftAndCreatesReliableWorkflowEvents(){UUID id=UUID.randomUUID();var medicalCase=new MedicalCase(id,"RS-2026-000001","Jane Doe","Kenya","+254700000000",null,"en",now);when(repository.findById(id)).thenReturn(Optional.of(medicalCase));var response=service.submit(id);assertThat(response.status()).isEqualTo("RECEIVED");verify(intake).validateSubmittable(id);verify(intake).onSubmitted(medicalCase);}
    @Test void preventsRepeatedSubmission(){UUID id=UUID.randomUUID();var medicalCase=new MedicalCase(id,"RS-2026-000001","Jane Doe","Kenya","+254700000000",null,"en",now);medicalCase.submit(now);when(repository.findById(id)).thenReturn(Optional.of(medicalCase));assertThatThrownBy(()->service.submit(id)).isInstanceOf(ApiException.class).hasMessageContaining("current state");}
}
