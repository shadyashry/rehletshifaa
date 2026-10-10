package com.rehletshifaa.conversation.infrastructure;

import com.rehletshifaa.conversation.domain.IntakeConversation;
import com.rehletshifaa.shared.persistence.BaseRepository;
import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.UUID;

public interface IntakeConversationRepository extends BaseRepository<IntakeConversation, UUID> {
    /** The sender's open conversation, else their most recently closed one since {@code since} (to reopen). */
    @Query("""
            select c from IntakeConversation c
            where c.waDigits = :digits and (c.status = 'OPEN' or (c.status = 'CLOSED' and c.closedAt >= :since))
            order by case when c.status = 'OPEN' then 0 else 1 end, c.openedAt desc""")
    List<IntakeConversation> findCurrentFor(@Param("digits") String digits, @Param("since") Instant since, Limit limit);

    long countByOwnerSubjectAndStatus(String ownerSubject, String status);

    @Query("select c from IntakeConversation c where c.status = 'OPEN' and c.ownerSubject in :owners order by c.lastInboundAt desc")
    List<IntakeConversation> findOpenOwnedBy(@Param("owners") Collection<String> owners);

    @Query("select c from IntakeConversation c where c.status = 'OPEN' and c.ownerSubject is null order by c.lastInboundAt")
    List<IntakeConversation> findQueue();

    @Query("select c from IntakeConversation c where c.status = 'OPEN' order by c.lastInboundAt desc")
    List<IntakeConversation> findAllOpen();
}
