package com.rehletshifaa.authority.application;

import java.util.UUID;

/**
 * What a permission is exercised on, resolved by the server from its own records — never bound from the request as
 * trusted evidence (IAM-00). {@code subject} is the affected person (a task owner, a reassignment target, an account).
 */
public record Resource(Kind kind, UUID id, String subject) {
    public enum Kind { PLATFORM, CASE, SUBJECT, CLINIC, CONVERSATION }

    public static Resource platform() { return new Resource(Kind.PLATFORM, null, null); }
    public static Resource ofCase(UUID caseId) { return new Resource(Kind.CASE, caseId, null); }
    /** A case action that affects a named person (for example the owner of a task being reassigned). */
    public static Resource ofCase(UUID caseId, String affectedSubject) { return new Resource(Kind.CASE, caseId, affectedSubject); }
    public static Resource ofSubject(String subject) { return new Resource(Kind.SUBJECT, null, subject); }
    public static Resource ofClinic(UUID practitionerId) { return new Resource(Kind.CLINIC, practitionerId, null); }
    /** An intake conversation; {@code owner} (null while it waits in the queue) is who supervision is judged against. */
    public static Resource ofConversation(UUID conversationId, String owner) { return new Resource(Kind.CONVERSATION, conversationId, owner); }
}
