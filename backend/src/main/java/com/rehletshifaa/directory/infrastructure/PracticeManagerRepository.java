package com.rehletshifaa.directory.infrastructure;

import com.rehletshifaa.directory.domain.PracticeManager;
import com.rehletshifaa.shared.persistence.BaseRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.UUID;

public interface PracticeManagerRepository extends BaseRepository<PracticeManager, UUID> {
    boolean existsByEmailHash(String emailHash);

    boolean existsByManagerSubject(String managerSubject);

    boolean existsByManagerSubjectAndStatus(String managerSubject, String status);

    boolean existsByPractitionerIdAndManagerSubjectAndStatus(UUID practitionerId, String managerSubject, String status);

    boolean existsByPractitionerIdAndEmailHash(UUID practitionerId, String emailHash);

    java.util.Optional<PracticeManager> findByPractitionerIdAndManagerSubjectAndStatus(UUID practitionerId, String managerSubject, String status);

    java.util.Optional<PracticeManager> findFirstByPractitionerIdAndManagerSubject(UUID practitionerId, String managerSubject);

    java.util.List<PracticeManager> findByManagerSubjectAndStatus(String managerSubject, String status);

    java.util.List<PracticeManager> findByPractitionerIdOrderByStatusAscInvitedAtAsc(UUID practitionerId);

    /** Permission and status change of one delegation, guarded by the version the consultant saw. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update PracticeManager m set m.canManageSchedule = :schedule, m.canManageProfile = :profile, m.canManageServices = :services,
                m.status = :status, m.revokedBy = :revokedBy, m.revokedAt = :revokedAt, m.updatedAt = :now, m.version = m.version + 1
            where m.id = :id and m.practitionerId = :practitionerId and m.version = :version""")
    int update(@Param("id") UUID id, @Param("practitionerId") UUID practitionerId, @Param("version") long version,
               @Param("schedule") boolean schedule, @Param("profile") boolean profile, @Param("services") boolean services,
               @Param("status") String status, @Param("revokedBy") String revokedBy, @Param("revokedAt") Instant revokedAt,
               @Param("now") Instant now);
}
