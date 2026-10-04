package com.rehletshifaa.authority.application;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** Port implemented by the case module: the relationship facts scope rules need. Keeps authority free of journey. */
public interface CaseRelationships {
    /**
     * With {@code offered=false}: the subject is on the case team (an ACTIVE assignment under this role that is not a
     * second opinion). With {@code offered=true}: any PENDING or ACTIVE assignment under this role.
     */
    boolean assigned(UUID caseId, String subject, String assigneeRole, boolean offered);

    /** The subject holds an ACTIVE second-opinion assignment on the case. */
    boolean consulted(UUID caseId, String subject);

    /** The active primary coordinator of the case, if any. */
    Optional<String> primaryCoordinator(UUID caseId);

    /** The case is in intake and no primary coordinator holds it. */
    boolean unclaimedIntake(UUID caseId);

    /** The case belongs to the subject's own patient record or to a patient they currently represent. */
    boolean ownPatientCase(UUID caseId, String subject);

    /** Subjects holding an ACTIVE assignment on the case under this assignee role. */
    List<String> activeAssignees(UUID caseId, String assigneeRole);
}
