package com.rehletshifaa.casemanagement.api;

import jakarta.validation.constraints.*;
import java.util.UUID;

public final class CaseDtos {
    private CaseDtos() {}
    public record CreateCaseRequest(
        @NotBlank @Size(min=2,max=120) String fullName,
        @NotBlank @Size(min=2,max=80) String country,
        @NotBlank @Pattern(regexp="^\\+?[0-9][0-9\\s()\\-]{6,24}$") String whatsappNumber,
        @Size(max=2000) String conditionDescription,
        @NotBlank @Pattern(regexp="en|ar") String preferredLanguage,
        @AssertTrue Boolean consent,
        @Size(max=2048) String turnstileToken
    ) {}
    public record CreateCaseResponse(UUID caseId, String caseNumber, String status) {}
    public record SubmitCaseResponse(String caseNumber, String status) {}
}
