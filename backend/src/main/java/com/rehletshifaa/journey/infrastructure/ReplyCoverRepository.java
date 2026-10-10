package com.rehletshifaa.journey.infrastructure;

import com.rehletshifaa.journey.domain.ReplyCover;
import com.rehletshifaa.shared.persistence.BaseRepository;
import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.UUID;

public interface ReplyCoverRepository extends BaseRepository<ReplyCover, UUID> {
    /** The owner's active cover; when covers overlap, the earliest created wins, so exactly one person replies. */
    @Query("""
            select c from ReplyCover c
            where c.ownerSubject = :owner and c.revokedAt is null and c.startsAt <= :now and c.endsAt > :now
            order by c.createdAt, c.id""")
    List<ReplyCover> findActive(@Param("owner") String owner, @Param("now") Instant now, Limit limit);

    /** Owners whose active cover is this person. */
    @Query("""
            select distinct c.ownerSubject from ReplyCover c
            where c.coverSubject = :cover and c.revokedAt is null and c.startsAt <= :now and c.endsAt > :now""")
    List<String> findOwnersCoveredBy(@Param("cover") String cover, @Param("now") Instant now);

    /** Live covers (not revoked, not yet over) that touch [from, to) for any of these people, as owner or as cover. */
    @Query("""
            select c from ReplyCover c
            where c.revokedAt is null and c.startsAt < :to and c.endsAt > :from
              and (c.ownerSubject in :people or c.coverSubject in :people)""")
    List<ReplyCover> findOverlapping(@Param("people") Collection<String> people, @Param("from") Instant from, @Param("to") Instant to);

    /** Covers not yet over that involve one of these people, soonest first. */
    @Query("""
            select c from ReplyCover c
            where c.revokedAt is null and c.endsAt > :now and (c.ownerSubject in :people or c.coverSubject in :people)
            order by c.startsAt, c.createdAt""")
    List<ReplyCover> findCurrentFor(@Param("people") Collection<String> people, @Param("now") Instant now);

    /** Every cover not yet over, soonest first (managers). */
    @Query("select c from ReplyCover c where c.revokedAt is null and c.endsAt > :now order by c.startsAt, c.createdAt")
    List<ReplyCover> findCurrent(@Param("now") Instant now);
}
