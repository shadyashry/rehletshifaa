package com.rehletshifaa.identity.operations;

import java.util.Map;
import java.util.UUID;

/** Published synchronously inside the business transaction; the recorder persists it in that same transaction. */
public record IdentityOperationRequested(UUID id, String idempotencyKey, String targetSubject, Type type,
                                         String requestedBy, String reason, String correlationId,
                                         String targetType, UUID targetId, Map<String,String> payload) {
    public enum Type { CREATE_STAFF, CREATE_PRACTITIONER, RESEND_INVITE, ENABLE_USER, DISABLE_USER_AND_LOGOUT, RESET_PASSWORD, RESET_MFA }

    /** SUP-02/SUP-03: a password-reset email or an MFA reset (credentials removed, sessions ended). */
    public static IdentityOperationRequested reset(UUID id, String key, String subject, Type type, String requestedBy,
            String reason, String locale) {
        if (type != Type.RESET_PASSWORD && type != Type.RESET_MFA) throw new IllegalArgumentException("Not a reset operation");
        return new IdentityOperationRequested(id, key, subject, type, requestedBy, reason, id.toString(),
                null, null, Map.of("locale", "ar".equals(locale) ? "ar" : "en"));
    }

    public static IdentityOperationRequested state(UUID id, String key, String subject, boolean enabled,
            String requestedBy, String reason) {
        return new IdentityOperationRequested(id, key, subject,
                enabled ? Type.ENABLE_USER : Type.DISABLE_USER_AND_LOGOUT, requestedBy, reason, id.toString(),
                null, null, null);
    }

    public static IdentityOperationRequested resend(UUID id, String key, String subject, String requestedBy,
            String reason, String locale) {
        return new IdentityOperationRequested(id, key, subject, Type.RESEND_INVITE, requestedBy, reason, id.toString(),
                null, null, Map.of("locale", "ar".equals(locale) ? "ar" : "en"));
    }

    public static IdentityOperationRequested create(UUID id, String key, Type type, String requestedBy,
            String reason, String targetType, UUID targetId, Map<String,String> payload) {
        if (type != Type.CREATE_STAFF && type != Type.CREATE_PRACTITIONER) throw new IllegalArgumentException("Not a create operation");
        return new IdentityOperationRequested(id, key, null, type, requestedBy, reason, id.toString(), targetType, targetId, payload);
    }
}
