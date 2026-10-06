package com.rehletshifaa.document.application;
import com.rehletshifaa.casemanagement.application.CaseService; import com.rehletshifaa.casemanagement.application.CaseIntakeGrantService; import com.rehletshifaa.casemanagement.domain.MedicalCase; import com.rehletshifaa.document.api.DocumentDtos.ConfirmRequest; import com.rehletshifaa.document.api.DocumentDtos.PresignRequest; import com.rehletshifaa.document.domain.DocumentStatus; import com.rehletshifaa.document.domain.MedicalDocument; import com.rehletshifaa.document.infrastructure.MedicalDocumentRepository; import com.rehletshifaa.shared.api.ApiException;
import org.junit.jupiter.api.*; import java.time.*; import java.util.*; import static org.assertj.core.api.Assertions.*; import static org.mockito.Mockito.*;
class DocumentServiceTest {
    private DocumentService service; private CaseService cases; private MedicalDocumentRepository documents; private StoragePort storage; private DocumentInspectionPort inspector; private MedicalCase draft;
    @BeforeEach void setup(){documents=mock(MedicalDocumentRepository.class);cases=mock(CaseService.class);storage=mock(StoragePort.class);inspector=mock(DocumentInspectionPort.class);when(storage.presign(anyString(),anyString(),anyLong())).thenReturn(new StoragePort.PresignedUpload("https://upload.invalid",Map.of(),300));service=new DocumentService(documents,cases,mock(CaseIntakeGrantService.class),storage,inspector,Clock.fixed(Instant.parse("2026-08-27T00:00:00Z"),ZoneOffset.UTC),15*1024*1024,100*1024*1024,25,"application/pdf,image/jpeg,image/png");draft=new MedicalCase(UUID.randomUUID(),"RS-2026-000001",UUID.randomUUID(),"Kenya",null,"en",null,Instant.now());when(cases.findDraft(any())).thenReturn(draft);}
    @Test void rejectsMimeSpoofingMetadata(){assertThatThrownBy(()->service.presign(UUID.randomUUID(),new PresignRequest("report.pdf","application/octet-stream",100L))).isInstanceOf(ApiException.class).hasMessageContaining("not allowed");}
    @Test void rejectsOversizedUploads(){assertThatThrownBy(()->service.presign(UUID.randomUUID(),new PresignRequest("report.pdf","application/pdf",16L*1024*1024))).isInstanceOf(ApiException.class).hasMessageContaining("size");}
    @Test void stripsPathsFromOriginalNames(){assertThat(DocumentService.sanitizeFileName("../../private/report.pdf")).isEqualTo("report.pdf");}

    private MedicalDocument uploaded(){var document=new MedicalDocument(UUID.randomUUID(),draft,"medical/2026/08/key","report.pdf","x.pdf","application/pdf",8,Instant.now());when(documents.findByIdAndMedicalCaseId(document.getId(),draft.getId())).thenReturn(Optional.of(document));when(storage.verify("medical/2026/08/key")).thenReturn(new StoragePort.StoredObject("application/pdf",8));when(storage.read(eq("medical/2026/08/key"),anyLong())).thenReturn("%PDF-1.7".getBytes());return document;}

    @Test void aScannerOutageLeavesTheUploadUnusableButRecoverableNeverCleanOrCondemned(){
        var document=uploaded();
        when(inspector.inspect(any(),eq("application/pdf"))).thenReturn(DocumentInspectionPort.InspectionResult.unavailable("SCANNER_UNAVAILABLE"));
        assertThatThrownBy(()->service.confirm(draft.getId(),new ConfirmRequest(document.getId()))).isInstanceOfSatisfying(ApiException.class,e->{assertThat(e.status()).isEqualTo(503);assertThat(e.code()).isEqualTo("DOCUMENT_SCAN_UNAVAILABLE");});
        assertThat(document.getStatus()).isEqualTo(DocumentStatus.PENDING); // still blocks submission and download; not SCAN_FAILED
        verify(storage,never()).delete(anyString());
        verify(storage,never()).markClean(anyString());

        // The scanner recovers: the very same confirm now completes.
        when(inspector.inspect(any(),eq("application/pdf"))).thenReturn(new DocumentInspectionPort.InspectionResult(true,"CLEAN"));
        assertThat(service.confirm(draft.getId(),new ConfirmRequest(document.getId())).status()).isEqualTo("CLEAN");
        verify(storage).markClean("medical/2026/08/key");
    }
    @Test void aMalwareVerdictStillCondemnsAndDeletesTheUpload(){
        var document=uploaded();
        when(inspector.inspect(any(),eq("application/pdf"))).thenReturn(new DocumentInspectionPort.InspectionResult(false,"MALWARE_FOUND"));
        assertThatThrownBy(()->service.confirm(draft.getId(),new ConfirmRequest(document.getId()))).isInstanceOfSatisfying(ApiException.class,e->assertThat(e.status()).isEqualTo(422));
        assertThat(document.getStatus()).isEqualTo(DocumentStatus.SCAN_FAILED);
        verify(storage).delete("medical/2026/08/key");
    }
    @Test void confirmingAnAlreadyCleanDocumentAgainReturnsTheSameResultWithoutRescanning(){
        var document=uploaded();
        when(inspector.inspect(any(),eq("application/pdf"))).thenReturn(new DocumentInspectionPort.InspectionResult(true,"CLEAN"));
        service.confirm(draft.getId(),new ConfirmRequest(document.getId()));
        assertThat(service.confirm(draft.getId(),new ConfirmRequest(document.getId())).status()).isEqualTo("CLEAN"); // lost-response retry
        verify(inspector,times(1)).inspect(any(),any());
    }
}
