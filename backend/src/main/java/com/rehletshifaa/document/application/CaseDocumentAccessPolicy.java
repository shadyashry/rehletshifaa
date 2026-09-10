package com.rehletshifaa.document.application;

import java.util.UUID;

/**
 * Whether the current actor may see the documents on a case.
 *
 * <p>The rule belongs to the case/journey module, which knows about ownership, assignments and the
 * intake queue; the decision is needed here. This port is the contract between the two, owned by the
 * consumer so the dependency points one way only — documents never reach into journey internals, and
 * the day either side moves behind an API this is the single seam that changes.
 *
 * <p>Implementations must throw rather than return false: denial is an authorization failure, not a
 * query result.
 */
public interface CaseDocumentAccessPolicy {
    void assertCanReadDocument(UUID caseId);
}
