package com.rehletshifaa.document.application;

public interface DocumentInspectionPort {
    InspectionResult inspect(byte[] content, String declaredContentType);
    record InspectionResult(boolean clean, String reasonCode) {}
}
