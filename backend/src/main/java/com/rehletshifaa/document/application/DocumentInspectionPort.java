package com.rehletshifaa.document.application;

public interface DocumentInspectionPort {
    InspectionResult inspect(byte[] content, String declaredContentType);
    /**
     * {@code retryable} means no verdict was reached (scanner unreachable or erroring): the content is neither
     * clean nor rejected, so callers keep it unusable but must not condemn it either.
     */
    record InspectionResult(boolean clean, String reasonCode, boolean retryable) {
        public InspectionResult(boolean clean, String reasonCode) { this(clean, reasonCode, false); }
        public static InspectionResult unavailable(String reasonCode) { return new InspectionResult(false, reasonCode, true); }
    }
}
