package com.rehletshifaa.document.application;
import java.util.Map;
public interface StoragePort {
    PresignedUpload presign(String objectKey, String contentType, long sizeBytes);
    StoredObject verify(String objectKey);
    byte[] read(String objectKey, long maximumBytes);
    PresignedDownload presignDownload(String objectKey, String safeFileName);
    PresignedDownload presignView(String objectKey, String safeFileName);
    void markClean(String objectKey);
    void delete(String objectKey);
    record PresignedUpload(String url, Map<String,String> requiredHeaders, long expiresInSeconds) {}
    record StoredObject(String contentType, long sizeBytes) {}
    record PresignedDownload(String url, long expiresInSeconds) {}
}
