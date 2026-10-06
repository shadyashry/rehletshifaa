package com.rehletshifaa.shared.audit;

import org.springframework.data.domain.Pageable;
import com.rehletshifaa.shared.persistence.BaseRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

import java.util.List;
import java.util.UUID;

public interface AuditEventRepository extends BaseRepository<AuditEvent, UUID>, JpaSpecificationExecutor<AuditEvent> {
    long countByCaseIdAndEventType(UUID caseId, String eventType);

    long countByAction(String action);

    List<AuditEvent> findByEntityIdAndActionOrderByOccurredAtDesc(String entityId, String action, Pageable page);

    List<AuditEvent> findByEntityTypeAndEntityIdOrderByOccurredAtDesc(String entityType, String entityId, Pageable page);
}
