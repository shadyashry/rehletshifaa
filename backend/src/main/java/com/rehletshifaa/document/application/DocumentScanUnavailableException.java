package com.rehletshifaa.document.application;

/** The scanner gave no verdict on server-held bytes; nothing was stored, and the caller should try again later. */
public class DocumentScanUnavailableException extends RuntimeException {
    public DocumentScanUnavailableException(String reasonCode) { super("Document inspection unavailable: " + reasonCode); }
}
