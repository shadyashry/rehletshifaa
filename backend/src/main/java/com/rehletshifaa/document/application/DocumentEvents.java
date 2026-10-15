package com.rehletshifaa.document.application;

import java.util.UUID;

/** What the document module tells the rest of the platform; listeners live in the modules that act on it. */
public final class DocumentEvents {
    private DocumentEvents() {}

    /**
     * An upload nobody could confirm at the time (the scanner was down, or the page was closed) passed the scan later, in
     * the sweep: it is now a usable document of the case, and whoever uploaded it was not there to see it.
     */
    public record UploadCleared(UUID caseId, UUID documentId) {}
}
