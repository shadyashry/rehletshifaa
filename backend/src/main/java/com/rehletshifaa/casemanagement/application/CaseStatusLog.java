package com.rehletshifaa.casemanagement.application;

import com.rehletshifaa.casemanagement.domain.CaseStatusChange;
import com.rehletshifaa.casemanagement.infrastructure.CaseStatusChangeRepository;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.UUID;

/** The single writer of case status history. */
@Component
public class CaseStatusLog {
    private final CaseStatusChangeRepository changes;

    public CaseStatusLog(CaseStatusChangeRepository changes) { this.changes = changes; }

    public void record(UUID caseId, String from, String to, String actorSubject, String actorRole, String reason, Instant at) {
        changes.saveAndFlush(new CaseStatusChange(caseId, from, to, actorSubject, actorRole, reason, at));
    }
}
