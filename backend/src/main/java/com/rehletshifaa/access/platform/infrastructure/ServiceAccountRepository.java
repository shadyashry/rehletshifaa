package com.rehletshifaa.access.platform.infrastructure;

import com.rehletshifaa.access.platform.domain.ServiceAccount;
import com.rehletshifaa.shared.persistence.BaseRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;

public interface ServiceAccountRepository extends BaseRepository<ServiceAccount, String> {
    List<ServiceAccount> findAllByOrderByIdAsc();

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update ServiceAccount s set s.secretRotatedAt = :rotatedAt, s.status = :status, s.revision = s.revision + 1
            where s.clientId = :clientId and s.revision = :revision""")
    int update(@Param("clientId") String clientId, @Param("revision") long revision, @Param("rotatedAt") Instant rotatedAt,
               @Param("status") String status);
}
