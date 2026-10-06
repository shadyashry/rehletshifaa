package com.rehletshifaa.workforce.infrastructure;

import com.rehletshifaa.workforce.domain.WorkforcePerson;
import com.rehletshifaa.shared.persistence.BaseRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface WorkforcePersonRepository extends BaseRepository<WorkforcePerson, String> {
    List<WorkforcePerson> findAllByOrderBySubjectAsc();

    Optional<WorkforcePerson> findByEmailHash(String emailHash);

    /** IAM-16: ACTIVE people whose last sign-in (or activation, or creation) is before {@code cutoff}. */
    @Query("select p.subject from WorkforcePerson p where p.lifecycleStatus = 'ACTIVE' and coalesce(p.lastSignInAt, p.activatedAt, p.createdAt) < :cutoff order by p.subject")
    List<String> findDormant(@Param("cutoff") Instant cutoff, org.springframework.data.domain.Limit limit);

    /** Re-invitation of a closed person (STF-02); guarded by the revision the caller read. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update WorkforcePerson p set p.displayNameEncrypted = :name, p.locale = :locale, p.lifecycleStatus = 'INVITED',
                p.lifecycleReason = :reason, p.lifecycleChangedAt = :now, p.activatedAt = null, p.mfaEnrolled = false,
                p.phishingResistantMfaEnrolled = false, p.updatedAt = :now, p.revision = p.revision + 1
            where p.subject = :subject and p.revision = :revision""")
    int reopen(@Param("subject") String subject, @Param("revision") long revision, @Param("name") String name,
               @Param("locale") String locale, @Param("reason") String reason, @Param("now") Instant now);

    /** MFA evidence observed during access hygiene; not a record change, so the revision is left alone. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update WorkforcePerson p set p.mfaEnrolled = :mfa, p.phishingResistantMfaEnrolled = :phishingResistant where p.subject = :subject")
    int recordMfaEvidence(@Param("subject") String subject, @Param("mfa") boolean mfa, @Param("phishingResistant") boolean phishingResistant);

    /** MFA state synchronised from the identity provider (bootstrap, reconciliation): a revisioned record change. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update WorkforcePerson p set p.mfaEnrolled = :mfa, p.phishingResistantMfaEnrolled = :phishingResistant,
                p.updatedAt = :now, p.revision = p.revision + 1
            where p.subject = :subject""")
    int synchroniseMfa(@Param("subject") String subject, @Param("mfa") boolean mfa,
                       @Param("phishingResistant") boolean phishingResistant, @Param("now") Instant now);

    /** Monotonic: an older sign-in report never moves the timestamp backwards. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update WorkforcePerson p set p.lastSignInAt = :at
            where p.subject = :subject and (p.lastSignInAt is null or p.lastSignInAt < :at)""")
    int recordSignIn(@Param("subject") String subject, @Param("at") Instant at);
}
