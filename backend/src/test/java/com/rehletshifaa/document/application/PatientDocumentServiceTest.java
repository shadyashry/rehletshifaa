package com.rehletshifaa.document.application;
import com.rehletshifaa.authority.application.Actor; import com.rehletshifaa.authority.application.Authority; import com.rehletshifaa.authority.domain.Permission; import com.rehletshifaa.authority.domain.Role; import com.rehletshifaa.casemanagement.application.CaseIntakeGrantService; import com.rehletshifaa.casemanagement.application.CaseService; import com.rehletshifaa.casemanagement.domain.MedicalCase; import com.rehletshifaa.casemanagement.infrastructure.MedicalCaseRepository; import com.rehletshifaa.document.api.DocumentDtos.ConfirmRequest; import com.rehletshifaa.document.api.DocumentDtos.PresignRequest; import com.rehletshifaa.document.domain.DocumentStatus; import com.rehletshifaa.document.domain.MedicalDocument; import com.rehletshifaa.document.infrastructure.MedicalDocumentRepository; import com.rehletshifaa.shared.api.ApiException; import com.rehletshifaa.shared.audit.AuditTrail;
import org.junit.jupiter.api.*; import java.time.*; import java.util.*; import static org.assertj.core.api.Assertions.*; import static org.mockito.Mockito.*;
/** Uploads from My Care: only the patient or someone acting for them, only a submitted case, and the same scan as every channel. */
class PatientDocumentServiceTest {
    private PatientDocumentService service; private MedicalCaseRepository caseRepository; private CaseService cases; private MedicalDocumentRepository documents; private StoragePort storage; private DocumentInspectionPort inspector; private AuditTrail audit; private MedicalCase submitted;
    @BeforeEach void setup(){Clock clock=Clock.fixed(Instant.parse("2026-10-15T00:00:00Z"),ZoneOffset.UTC);documents=mock(MedicalDocumentRepository.class);cases=mock(CaseService.class);caseRepository=mock(MedicalCaseRepository.class);storage=mock(StoragePort.class);inspector=mock(DocumentInspectionPort.class);audit=mock(AuditTrail.class,RETURNS_DEEP_STUBS);var authority=mock(Authority.class);
        when(authority.authorize(Permission.PATIENT_SELF_SERVICE)).thenReturn(new Actor("guardian",Instant.now(),Role.PATIENT_REPRESENTATIVE,Set.of(Role.PATIENT_REPRESENTATIVE)));
        when(storage.presign(anyString(),anyString(),anyLong())).thenReturn(new StoragePort.PresignedUpload("https://upload.invalid",Map.of(),300));
        var documentService=new DocumentService(documents,cases,mock(CaseIntakeGrantService.class),storage,inspector,clock,15*1024*1024,100*1024*1024,25,"application/pdf,image/jpeg,image/png");
        service=new PatientDocumentService(authority,caseRepository,documentService,audit,clock,documents);
        submitted=new MedicalCase(UUID.randomUUID(),"RS-2026-000001",UUID.randomUUID(),"Kenya",null,"en",null,Instant.now());submitted.submit(Instant.now());
        when(cases.findById(submitted.getId())).thenReturn(submitted);
        when(caseRepository.findPatientIdAccessibleTo(eq(submitted.getId()),eq("guardian"),any())).thenReturn(Optional.of(submitted.getPatientId()));}

    @Test void anAccountThatNeitherIsNorActsForThePatientCannotAddToTheCase(){
        when(caseRepository.findPatientIdAccessibleTo(any(),any(),any())).thenReturn(Optional.empty());
        assertThatThrownBy(()->service.presign(submitted.getId(),new PresignRequest("id.pdf","application/pdf",8L))).isInstanceOfSatisfying(ApiException.class,e->{assertThat(e.status()).isEqualTo(403);assertThat(e.code()).isEqualTo("CASE_ACCESS_DENIED");});
        assertThatThrownBy(()->service.confirm(submitted.getId(),new ConfirmRequest(UUID.randomUUID()))).isInstanceOfSatisfying(ApiException.class,e->assertThat(e.code()).isEqualTo("CASE_ACCESS_DENIED"));
        verifyNoInteractions(storage,documents,inspector);
    }
    @Test void theUploadRulesOfEveryChannelApply(){
        assertThatThrownBy(()->service.presign(submitted.getId(),new PresignRequest("id.exe","application/octet-stream",8L))).isInstanceOfSatisfying(ApiException.class,e->assertThat(e.code()).isEqualTo("UNSUPPORTED_FILE_TYPE"));
        var draft=new MedicalCase(UUID.randomUUID(),"RS-2026-000002",UUID.randomUUID(),"Kenya",null,"en",null,Instant.now());
        when(cases.findById(draft.getId())).thenReturn(draft);when(caseRepository.findPatientIdAccessibleTo(eq(draft.getId()),any(),any())).thenReturn(Optional.of(draft.getPatientId()));
        assertThatThrownBy(()->service.presign(draft.getId(),new PresignRequest("id.pdf","application/pdf",8L))).isInstanceOfSatisfying(ApiException.class,e->assertThat(e.code()).isEqualTo("CASE_NOT_SUBMITTED"));
        assertThat(service.presign(submitted.getId(),new PresignRequest("id.pdf","application/pdf",8L)).uploadUrl()).isEqualTo("https://upload.invalid");
    }
    @Test void aScannerOutageKeepsTheUploadPendingAndUnauditedUntilTheSameConfirmSucceeds(){
        var document=new MedicalDocument(UUID.randomUUID(),submitted,"medical/2026/10/key","id.pdf","x.pdf","application/pdf",8,Instant.now());
        when(documents.findByIdAndMedicalCaseId(document.getId(),submitted.getId())).thenReturn(Optional.of(document));when(storage.verify("medical/2026/10/key")).thenReturn(new StoragePort.StoredObject("application/pdf",8));when(storage.read(eq("medical/2026/10/key"),anyLong())).thenReturn("%PDF-1.7".getBytes());
        when(inspector.inspect(any(),eq("application/pdf"))).thenReturn(DocumentInspectionPort.InspectionResult.unavailable("SCANNER_UNAVAILABLE"));
        assertThatThrownBy(()->service.confirm(submitted.getId(),new ConfirmRequest(document.getId()))).isInstanceOfSatisfying(ApiException.class,e->assertThat(e.code()).isEqualTo("DOCUMENT_SCAN_UNAVAILABLE"));
        assertThat(document.getStatus()).isEqualTo(DocumentStatus.PENDING);
        verify(audit,never()).event(anyString());
        when(inspector.inspect(any(),eq("application/pdf"))).thenReturn(new DocumentInspectionPort.InspectionResult(true,"CLEAN"));
        assertThat(service.confirm(submitted.getId(),new ConfirmRequest(document.getId())).status()).isEqualTo("CLEAN");
        verify(audit).event("PATIENT_DOCUMENT_UPLOADED");
    }
    /** D-10 review: an upload is confirmed by the account that started it, not by someone else acting on the case. */
    @Test void anotherAccountsUploadIsNotConfirmedHere(){
        var other=new MedicalDocument(UUID.randomUUID(),submitted,"medical/2026/10/k","x.pdf","x.pdf","application/pdf",8,Instant.now()).uploadedBy("operations-subject");
        when(documents.findByIdAndMedicalCaseId(other.getId(),submitted.getId())).thenReturn(Optional.of(other));
        assertThatThrownBy(()->service.confirm(submitted.getId(),new ConfirmRequest(other.getId()))).isInstanceOfSatisfying(ApiException.class,e->assertThat(e.code()).isEqualTo("NOT_YOUR_UPLOAD"));
        verifyNoInteractions(storage,inspector);
    }
}
