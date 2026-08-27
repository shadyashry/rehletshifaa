package com.rehletshifaa.casemanagement.application;
import com.rehletshifaa.casemanagement.api.CaseDtos.CreateCaseRequest;
import com.rehletshifaa.casemanagement.domain.MedicalCase;
import com.rehletshifaa.casemanagement.infrastructure.MedicalCaseRepository;
import com.rehletshifaa.notification.application.NotificationPort;
import com.rehletshifaa.shared.api.ApiException;
import org.junit.jupiter.api.*; import org.mockito.*;
import java.time.*; import java.util.*;
import static org.assertj.core.api.Assertions.*; import static org.mockito.Mockito.*;
class CaseServiceTest {
    private MedicalCaseRepository repository; private NotificationPort notifications; private CaseService service; private final Instant now=Instant.parse("2026-08-27T08:00:00Z");
    @BeforeEach void setUp(){repository=mock(MedicalCaseRepository.class);notifications=mock(NotificationPort.class);var numbers=mock(CaseNumberGenerator.class);when(numbers.next()).thenReturn("RS-2026-000001");service=new CaseService(repository,numbers,notifications,Clock.fixed(now,ZoneOffset.UTC));}
    @Test void createsADraftWithClientSafeResponse(){var response=service.create(new CreateCaseRequest("Jane Doe","Kenya","+254700000000","Reports available","en",true,null));assertThat(response.caseNumber()).isEqualTo("RS-2026-000001");assertThat(response.status()).isEqualTo("DRAFT");verify(repository).save(any(MedicalCase.class));}
    @Test void submitsDraftAndNotifiesCoordinator(){UUID id=UUID.randomUUID();var medicalCase=new MedicalCase(id,"RS-2026-000001","Jane Doe","Kenya","+254700000000",null,"en",now);when(repository.findById(id)).thenReturn(Optional.of(medicalCase));var response=service.submit(id);assertThat(response.status()).isEqualTo("NEW");verify(notifications).notifyNewCase(any());}
    @Test void preventsRepeatedSubmission(){UUID id=UUID.randomUUID();var medicalCase=new MedicalCase(id,"RS-2026-000001","Jane Doe","Kenya","+254700000000",null,"en",now);medicalCase.submit(now);when(repository.findById(id)).thenReturn(Optional.of(medicalCase));assertThatThrownBy(()->service.submit(id)).isInstanceOf(ApiException.class).hasMessageContaining("current state");}
}

