package com.rehletshifaa.retention.domain;

/**
 * P1-7 (review E-03): the retention class of a stored record. Every table belongs to exactly one class
 * ({@code RecordCatalogue}); the policy per class is a row of {@code retention_policies}.
 */
public enum RecordClass {
    /** A case started and never sent, with its files and submission contact: purged about 7 days after it was started (design §7.13). */
    DRAFT_INTAKE,
    /** Transport copies of messages (the WhatsApp inbound queue with plaintext sender digits): purged after processing. */
    TRANSPORT_LOG,
    /** A WhatsApp intake conversation before it became a case (reply address, profile name, messages, media). */
    INTAKE_CONVERSATION,
    /** Links, one-time codes, challenges and grants: no use after they expire. */
    ACCESS_SECRET,
    /** Who the patient is and how to reach them: pseudonymised on an erasure request. */
    PERSONAL_IDENTITY,
    /** The medical record of a sent case: the case, its documents, clinical review, treatment, outcomes and follow-up. */
    CLINICAL_RECORD,
    /** Work, routing and journey runtime state that follow the case. */
    CASE_OPERATIONS,
    /** Staff, Consultants, clinics, credentials and access administration. */
    WORKFORCE_RECORD,
    /** The evidence ledger, statements, money, consent, decisions, audit and the purge log: never purged. */
    LEGAL_RECORD,
    /** Reference data and policies: no personal data. */
    CONFIGURATION,
    /** Locks, leases and current-value pointers: no personal data. */
    SYSTEM_STATE
}
