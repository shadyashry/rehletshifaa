package com.rehletshifaa.document.api;
import jakarta.validation.constraints.*;
import java.util.Map; import java.util.UUID;
public final class DocumentDtos {
    private DocumentDtos() {}
    public record PresignRequest(@NotBlank @Size(max=255) String originalFileName, @NotBlank @Size(max=100) String contentType, @NotNull @Positive Long sizeBytes) {}
    public record PresignResponse(UUID documentId, String uploadUrl, Map<String,String> requiredHeaders, long expiresInSeconds) {}
    public record ConfirmRequest(@NotNull UUID documentId) {}
    public record ConfirmResponse(UUID documentId, String status) {}
}

