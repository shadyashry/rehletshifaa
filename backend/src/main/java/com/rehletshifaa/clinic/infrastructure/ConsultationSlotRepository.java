package com.rehletshifaa.clinic.infrastructure;

import com.rehletshifaa.clinic.domain.ConsultationSlot;
import com.rehletshifaa.shared.persistence.BaseRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ConsultationSlotRepository extends BaseRepository<ConsultationSlot, UUID> {
    List<ConsultationSlot> findTop200ByPractitionerIdAndEndsAtAfterOrderByStartsAt(UUID practitionerId, Instant after);

    Optional<ConsultationSlot> findByIdAndPractitionerId(UUID id, UUID practitionerId);

    /** Open slots of the consultant overlapping [startsAt, endsAt), other than {@code exclude}. */
    @Query("""
            select count(s) > 0 from ConsultationSlot s where s.practitionerId = :practitionerId and s.status = 'OPEN'
            and s.startsAt < :endsAt and s.endsAt > :startsAt and s.id <> :exclude""")
    boolean overlaps(@Param("practitionerId") UUID practitionerId, @Param("startsAt") Instant startsAt, @Param("endsAt") Instant endsAt,
                     @Param("exclude") UUID exclude);
}
