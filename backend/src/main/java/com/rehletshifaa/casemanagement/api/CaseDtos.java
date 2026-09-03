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
        @Size(max=2048) String turnstileToken,
        @Email @Size(max=254) String email,
        @Size(max=80) String timeZone,
        @Pattern(regexp="cardiology|rheumatology-rehabilitation|orthopedics") String careArea
    ) {
        public CreateCaseRequest(String fullName,String country,String whatsappNumber,String conditionDescription,String preferredLanguage,Boolean consent,String turnstileToken){this(fullName,country,whatsappNumber,conditionDescription,preferredLanguage,consent,turnstileToken,null,null,null);}
        public CreateCaseRequest(String fullName,String country,String whatsappNumber,String conditionDescription,String preferredLanguage,Boolean consent,String turnstileToken,String email,String timeZone){this(fullName,country,whatsappNumber,conditionDescription,preferredLanguage,consent,turnstileToken,email,timeZone,null);}
    }
    public record CreateCaseResponse(UUID caseId, String caseNumber, String status) {}
    public record SubmitCaseResponse(String caseNumber, String status, String statusToken) {}
}
