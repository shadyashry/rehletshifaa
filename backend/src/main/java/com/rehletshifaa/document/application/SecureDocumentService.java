package com.rehletshifaa.document.application;

import com.rehletshifaa.document.domain.DocumentStatus;
import com.rehletshifaa.document.infrastructure.MedicalDocumentRepository;
import com.rehletshifaa.journey.application.JourneyService;
import com.rehletshifaa.security.ActorContext;
import com.rehletshifaa.shared.api.ApiException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.timestamp;

@Service
public class SecureDocumentService {
    private final MedicalDocumentRepository documents; private final StoragePort storage; private final JourneyService journey; private final ActorContext actors; private final JdbcClient jdbc; private final Clock clock;
    public SecureDocumentService(MedicalDocumentRepository documents,StoragePort storage,JourneyService journey,ActorContext actors,JdbcClient jdbc,Clock clock){this.documents=documents;this.storage=storage;this.journey=journey;this.actors=actors;this.jdbc=jdbc;this.clock=clock;}
    @Transactional public DownloadResponse download(UUID documentId){var document=documents.findById(documentId).orElseThrow(()->new ApiException(404,"DOCUMENT_NOT_FOUND","Document was not found"));UUID caseId=document.getMedicalCase().getId();journey.assertCanRead(caseId);if(document.getStatus()!=DocumentStatus.CLEAN)throw new ApiException(409,"DOCUMENT_NOT_CLEAN","Document is not available until security inspection succeeds");var actor=actors.current();var signed=storage.presignDownload(document.getObjectKey(),document.getSafeFileName());jdbc.sql("INSERT INTO audit_events(id,event_type,actor_subject,actor_role,case_id,entity_type,entity_id,action,outcome,occurred_at) VALUES(?,?,?,?,?,?,?,?,?,?)").params(UUID.randomUUID(),"DOCUMENT_DOWNLOADED",actor.subject(),actor.primaryRole(),caseId,"MedicalDocument",documentId.toString(),"DOWNLOAD","SUCCESS",timestamp(clock.instant())).update();return new DownloadResponse(signed.url(),signed.expiresInSeconds(),document.getOriginalFileName(),document.getContentType());}
    public List<DocumentSummary> list(UUID caseId){journey.assertCanRead(caseId);return jdbc.sql("SELECT id,original_file_name,content_type,size_bytes,status,created_at,confirmed_at FROM medical_documents WHERE case_id=? ORDER BY created_at DESC").param(caseId).query((rs,n)->new DocumentSummary(rs.getObject("id",UUID.class),rs.getString("original_file_name"),rs.getString("content_type"),rs.getLong("size_bytes"),rs.getString("status"),toInstant(rs.getObject("created_at",OffsetDateTime.class)),toInstant(rs.getObject("confirmed_at",OffsetDateTime.class)))).list();}
    private static Instant toInstant(OffsetDateTime value){return value==null?null:value.toInstant();}
    public record DownloadResponse(String downloadUrl,long expiresInSeconds,String fileName,String contentType){}
    public record DocumentSummary(UUID documentId,String fileName,String contentType,long sizeBytes,String status,Instant createdAt,Instant confirmedAt){}
}
