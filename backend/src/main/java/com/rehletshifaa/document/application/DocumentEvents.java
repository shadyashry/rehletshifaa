package com.rehletshifaa.document.application;

import java.util.UUID;

/** What the document module tells the rest of the platform; listeners live in the modules that act on it. */
public final class DocumentEvents {
    private DocumentEvents() {}

    /**
     * An upload nobody could confirm at the time (the scanner was down, or the page was closed) passed the scan later, in
     * the sweep: it is now a usable document of the case, and whoever uploaded it was not there to see it. {@code uploadedBy}
     * is the uploading account's subject or the channel ({@link DocumentService#INTAKE}, {@code SECURE_LINK}), null when unknown.
     */
    public record UploadCleared(UUID caseId, UUID documentId, String uploadedBy) {}
}
