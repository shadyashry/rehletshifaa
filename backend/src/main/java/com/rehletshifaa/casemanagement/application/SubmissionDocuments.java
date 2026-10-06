package com.rehletshifaa.casemanagement.application;

import java.util.UUID;

/** Port to the document module: how many of a case's documents still block its submission. */
public interface SubmissionDocuments {
    /** Documents that are not yet verified clean (pending, quarantined, rejected or failed scanning). */
    long notReadyFor(UUID caseId);
}
