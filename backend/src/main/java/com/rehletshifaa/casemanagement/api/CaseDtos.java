package com.rehletshifaa.casemanagement.api;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.UUID;

public final class CaseDtos {
    private CaseDtos() {}

    /**
     * Send My Case. Names are structured (given + family) — never a single "full name" — and the contact
     * channels belong to the SUBMITTER: the patient when {@code caseFor} is MYSELF, the representative
     * when it is SOMEONE_ELSE. Email is optional here; it becomes mandatory (and verified) only when the
     * patient completes their profile. Nothing in this payload is unique or used to match another patient.
     */
    public record CreateCaseRequest(
        @Pattern(regexp="MYSELF|SOMEONE_ELSE") String caseFor,
        @NotBlank @Size(min=1,max=80) String givenName,
        @Size(max=80) String familyName,
        /** Explicit opt-in for people with one legal name; otherwise a family name is expected. */
        Boolean singleLegalName,
        @Valid RepresentativeContact representative,
        @NotBlank @Size(min=2,max=80) String country,
        @NotBlank @Pattern(regexp="^\\+?[0-9][0-9\\s()\\-]{6,24}$") String whatsappNumber,
        @Size(max=2000) String conditionDescription,
        @NotBlank @Pattern(regexp="en|ar") String preferredLanguage,
        @AssertTrue Boolean consent,
        @Size(max=2048) String turnstileToken,
        @Email @Size(max=254) String email,
        @Size(max=80) String timeZone,
        @Size(max=80) String careArea,
        Boolean travelPackageRequested,
        /** P1-13 (A-05): the patient's age band; optional on the wire until the form sends it (null = not stated, recorded in intake review). */
        @Pattern(regexp="UNDER_12|AGE_12_17|AGE_18_64|AGE_65_PLUS") String ageBand
    ) {
        public CreateCaseRequest(String caseFor,String givenName,String familyName,Boolean singleLegalName,RepresentativeContact representative,String country,String whatsappNumber,String conditionDescription,String preferredLanguage,Boolean consent,String turnstileToken,String email,String timeZone,String careArea,Boolean travelPackageRequested){this(caseFor,givenName,familyName,singleLegalName,representative,country,whatsappNumber,conditionDescription,preferredLanguage,consent,turnstileToken,email,timeZone,careArea,travelPackageRequested,null);}
        public CreateCaseRequest(String givenName,String familyName,String country,String whatsappNumber,String conditionDescription,String preferredLanguage,Boolean consent,String turnstileToken){this("MYSELF",givenName,familyName,null,null,country,whatsappNumber,conditionDescription,preferredLanguage,consent,turnstileToken,null,null,null,null,null);}
        public CreateCaseRequest(String givenName,String familyName,String country,String whatsappNumber,String conditionDescription,String preferredLanguage,Boolean consent,String turnstileToken,String email,String timeZone){this("MYSELF",givenName,familyName,null,null,country,whatsappNumber,conditionDescription,preferredLanguage,consent,turnstileToken,email,timeZone,null,null,null);}
        public CreateCaseRequest(String givenName,String familyName,String country,String whatsappNumber,String conditionDescription,String preferredLanguage,Boolean consent,String turnstileToken,String email,String timeZone,String careArea){this("MYSELF",givenName,familyName,null,null,country,whatsappNumber,conditionDescription,preferredLanguage,consent,turnstileToken,email,timeZone,careArea,null,null);}
        public boolean forSomeoneElse(){return "SOMEONE_ELSE".equals(caseFor);}
    }

    /** Who is submitting on the patient's behalf. Their channels are the request's top-level email/WhatsApp. */
    public record RepresentativeContact(
        @NotBlank @Size(min=1,max=160) String name,
        @NotBlank @Pattern(regexp="PARENT|CHILD|SPOUSE|SIBLING|RELATIVE|GUARDIAN|OTHER") String relationship
    ) {}

    /**
     * A signed-in patient's next case. For themselves (the default): only case information, never identity — that comes
     * from the canonical patient. For someone else ({@code caseFor=SOMEONE_ELSE}): the person's name and country and the
     * account holder's relationship to them; the account holder's own saved details are the contact.
     */
    public record NewCaseForPatientRequest(
        @Size(max=2000) String conditionDescription,
        @Size(max=80) String careArea,
        Boolean travelPackageRequested,
        @AssertTrue Boolean consent,
        @Pattern(regexp="MYSELF|SOMEONE_ELSE") String caseFor,
        @Valid SomeoneElse someoneElse,
        /** P1-13 (A-05): the age band of whoever the case is for; optional (null = not stated). */
        @Pattern(regexp="UNDER_12|AGE_12_17|AGE_18_64|AGE_65_PLUS") String ageBand
    ) {
        public NewCaseForPatientRequest(String conditionDescription,String careArea,Boolean travelPackageRequested,Boolean consent,String caseFor,SomeoneElse someoneElse){this(conditionDescription,careArea,travelPackageRequested,consent,caseFor,someoneElse,null);}
        public NewCaseForPatientRequest(String conditionDescription,String careArea,Boolean travelPackageRequested,Boolean consent){this(conditionDescription,careArea,travelPackageRequested,consent,null,null,null);}
        public boolean forSomeoneElse(){return "SOMEONE_ELSE".equals(caseFor);}
    }

    /** The person a signed-in account sends a case for, and how the account holder is related to them. */
    public record SomeoneElse(
        @NotBlank @Size(min=1,max=80) String givenName,
        @Size(max=80) String familyName,
        Boolean singleLegalName,
        @NotBlank @Size(min=2,max=80) String country,
        @NotBlank @Pattern(regexp="PARENT|CHILD|SPOUSE|SIBLING|RELATIVE|GUARDIAN|OTHER") String relationship
    ) {}

    /** Opaque short-lived bearer used only to finish this anonymous draft intake. */
    public record CreateCaseResponse(UUID caseId, String caseNumber, String status, String intakeGrant) {}
    public record SubmitCaseResponse(String caseNumber, String status, String statusToken) {}
}
