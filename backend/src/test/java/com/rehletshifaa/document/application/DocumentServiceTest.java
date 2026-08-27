package com.rehletshifaa.document.application;
import com.rehletshifaa.casemanagement.application.CaseService; import com.rehletshifaa.casemanagement.domain.MedicalCase; import com.rehletshifaa.document.api.DocumentDtos.PresignRequest; import com.rehletshifaa.document.infrastructure.MedicalDocumentRepository; import com.rehletshifaa.shared.api.ApiException;
import org.junit.jupiter.api.*; import java.time.*; import java.util.*; import static org.assertj.core.api.Assertions.*; import static org.mockito.Mockito.*;
class DocumentServiceTest {
    private DocumentService service; private CaseService cases;
    @BeforeEach void setup(){var documents=mock(MedicalDocumentRepository.class);cases=mock(CaseService.class);var storage=mock(StoragePort.class);when(storage.presign(anyString(),anyString(),anyLong())).thenReturn(new StoragePort.PresignedUpload("https://upload.invalid",Map.of(),300));service=new DocumentService(documents,cases,storage,Clock.fixed(Instant.parse("2026-08-27T00:00:00Z"),ZoneOffset.UTC),15*1024*1024,"application/pdf,image/jpeg,image/png");when(cases.findDraft(any())).thenReturn(new MedicalCase(UUID.randomUUID(),"RS-2026-000001","Jane Doe","Kenya","+254700000000",null,"en",Instant.now()));}
    @Test void rejectsMimeSpoofingMetadata(){assertThatThrownBy(()->service.presign(UUID.randomUUID(),new PresignRequest("report.pdf","application/octet-stream",100L))).isInstanceOf(ApiException.class).hasMessageContaining("not allowed");}
    @Test void rejectsOversizedUploads(){assertThatThrownBy(()->service.presign(UUID.randomUUID(),new PresignRequest("report.pdf","application/pdf",16L*1024*1024))).isInstanceOf(ApiException.class).hasMessageContaining("size");}
    @Test void stripsPathsFromOriginalNames(){assertThat(DocumentService.sanitizeFileName("../../private/report.pdf")).isEqualTo("report.pdf");}
}

