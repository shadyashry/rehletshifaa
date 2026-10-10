package com.rehletshifaa.conversation.infrastructure;

import com.rehletshifaa.conversation.domain.ReplyObligation;
import com.rehletshifaa.shared.persistence.BaseRepository;
import jakarta.persistence.LockModeType;
import jakarta.persistence.QueryHint;
import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.jpa.repository.QueryHints;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ReplyObligationRepository extends BaseRepository<ReplyObligation, UUID> {
    Optional<ReplyObligation> findByTargetTypeAndTargetId(String targetType, UUID targetId);

    /** Open obligations with a reminder or an escalation due. Lock timeout -2 is SKIP LOCKED: instances take different rows. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @QueryHints(@QueryHint(name = "jakarta.persistence.lock.timeout", value = "-2"))
    @Query("""
            select o from ReplyObligation o
            where o.resolvedAt is null
              and ((o.remindedAt is null and o.remindAt <= :now) or (o.escalatedAt is null and o.escalateAt <= :now))
            order by o.awaitingSince""")
    List<ReplyObligation> lockDue(@Param("now") Instant now, Limit limit);
}
