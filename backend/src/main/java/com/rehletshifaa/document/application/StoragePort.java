package com.rehletshifaa.document.application;
import java.util.Map;
public interface StoragePort {
    PresignedUpload presign(String objectKey, String contentType, long sizeBytes);
    StoredObject verify(String objectKey);
    record PresignedUpload(String url, Map<String,String> requiredHeaders, long expiresInSeconds) {}
    record StoredObject(String contentType, long sizeBytes) {}
}

