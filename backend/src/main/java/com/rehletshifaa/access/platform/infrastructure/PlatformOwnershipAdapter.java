package com.rehletshifaa.access.platform.infrastructure;

import com.rehletshifaa.authority.application.PlatformOwnership;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

import java.time.Instant;

import static com.rehletshifaa.shared.persistence.SqlValues.timestamp;

/** Current owner fact used by the single request-time authority resolver. */
@Component
public class PlatformOwnershipAdapter implements PlatformOwnership {
    private final JdbcClient jdbc;

    public PlatformOwnershipAdapter(JdbcClient jdbc) { this.jdbc = jdbc; }

    @Override
    public boolean isCurrentOwner(String subject, Instant at) {
        if (subject == null) return false;
        return jdbc.sql("SELECT COUNT(*) FROM platform_account_owner_current c "
                        + "JOIN platform_account_owner_relationships r ON r.id=c.relationship_id "
                        + "JOIN access_subjects s ON s.subject=r.subject "
                        + "WHERE c.id=1 AND r.subject=? AND r.status='ACTIVE' AND r.effective_from<=? "
                        + "AND r.effective_to IS NULL AND s.active=TRUE")
                .params(subject, timestamp(at)).query(Long.class).single() == 1;
    }
}
