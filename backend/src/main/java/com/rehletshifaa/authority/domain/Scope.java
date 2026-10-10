package com.rehletshifaa.authority.domain;

/** How a grant relates the principal to the resource. Evaluated on every request against database relationships. */
public enum Scope {
    /** No resource relationship. */
    PLATFORM,
    /** The principal is on the case team: a live (ACTIVE) assignment under the role's case-assignment role, not a second opinion. */
    CASE_ASSIGNED,
    /** The principal holds a live second-opinion assignment: read and opinion only, ending with the opinion. */
    CASE_CONSULTED,
    /** The principal holds a live or offered (PENDING or ACTIVE) assignment — for accepting or declining offered work. */
    CASE_OFFERED,
    /** The principal is the case's active primary coordinator. */
    CASE_OWNER,
    /**
     * The principal answers the case's patient now: its primary coordinator, or that coordinator's active reply cover
     * instead of them. Exactly one person at a time.
     */
    CASE_REPLIER,
    /** The principal is the active reply cover of the case's primary coordinator. */
    CASE_COVERING,
    /** The principal answers this intake conversation now: its owner, or the owner's active reply cover instead of them. */
    CONVERSATION_REPLIER,
    /** The intake conversation is open and unowned (in the intake queue). */
    CONVERSATION_UNCLAIMED,
    /** The case is in intake and no primary coordinator holds it. */
    CASE_UNCLAIMED,
    /** A live assignee of the case (or the affected subject) is in a team the principal leads, or reports to them. */
    SUPERVISED,
    /** The case belongs to the principal's own patient record or one they represent. */
    OWN_PATIENT,
    /** The resource is the principal's own account or record. */
    SELF,
    /** The clinic is the principal's own (Consultant). */
    OWN_CLINIC,
    /** The principal holds an accepted delegation for the clinic. */
    DELEGATED_CLINIC
}
