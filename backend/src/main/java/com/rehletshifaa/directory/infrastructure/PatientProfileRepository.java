package com.rehletshifaa.directory.infrastructure;

import com.rehletshifaa.directory.domain.PatientProfile;
import com.rehletshifaa.shared.persistence.BaseRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Optional;
import java.util.UUID;

public interface PatientProfileRepository extends BaseRepository<PatientProfile, UUID> {
    boolean existsByExternalSubject(String externalSubject);

    /** The profile as the patient's onboarding pages show and validate it. */
    interface OnboardingProfile {
        UUID getId(); String getStatus(); String getSubject(); String getGivenName(); String getFamilyName(); String getPreferredName();
        String getEmail(); String getPhone(); String getCountry(); String getNationality(); LocalDate getDateOfBirth(); String getSex();
        String getLanguage(); Instant getEmailVerifiedAt(); Instant getPhoneVerifiedAt();
    }

    @Query("""
            select p.id as id, p.profileStatus as status, p.externalSubject as subject, p.givenName as givenName, p.familyName as familyName,
                p.preferredName as preferredName, p.email as email, p.whatsappNumber as phone, p.country as country, p.nationality as nationality,
                p.dateOfBirth as dateOfBirth, p.sex as sex, p.preferredLanguage as language, p.emailVerifiedAt as emailVerifiedAt,
                p.phoneVerifiedAt as phoneVerifiedAt
            from PatientProfile p where p.id = :id""")
    Optional<OnboardingProfile> findOnboardingProfile(@Param("id") UUID id);

    /** The number is the verified personal mobile of another patient who already has an account. */
    @Query("""
            select count(p) > 0 from PatientProfile p where p.id <> :id and p.whatsappNumber = :phone and p.phoneVerifiedAt is not null
            and p.externalSubject is not null""")
    boolean isVerifiedMobileOfAnotherAccount(@Param("id") UUID id, @Param("phone") String phone);
}
