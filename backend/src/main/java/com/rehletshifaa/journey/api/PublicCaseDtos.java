package com.rehletshifaa.journey.api;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.time.Instant;

public final class PublicCaseDtos {
    private PublicCaseDtos() {}
    public record CaseAccessSummary(String caseNumber,String purpose,String channel,String destinationHint) {}
    public record CaseAccessVerifyRequest(@NotBlank @Pattern(regexp="[0-9]{6}")String code) {}
    public record CaseAccessGrant(String grant,Instant expiresAt) {}
    public record CaseAccessRequest(@NotBlank @Size(max=256)String grant) {}
    public record PublicCaseStatus(String caseNumber,String statusEn,String statusAr,boolean actionRequired) {}
    public record InformationResponseRequest(@NotBlank @Size(max=256)String grant,@NotBlank @Size(max=10000)String message,@Pattern(regexp="en|ar")String language) {}
}
