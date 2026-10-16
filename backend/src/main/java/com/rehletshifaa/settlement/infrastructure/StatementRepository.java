package com.rehletshifaa.settlement.infrastructure;

import com.rehletshifaa.settlement.domain.Statement;
import com.rehletshifaa.shared.persistence.BaseRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** Statements (P1-17): immutable revisions per case and kind. */
public interface StatementRepository extends BaseRepository<Statement, UUID> {
    /** The case's statements, newest revision first. */
    List<Statement> findByCaseIdOrderByIssuedAtDescRevisionDesc(UUID caseId);

    Optional<Statement> findFirstByCaseIdAndKindOrderByRevisionDesc(UUID caseId, String kind);

    Optional<Statement> findByIdAndCaseId(UUID id, UUID caseId);
}
