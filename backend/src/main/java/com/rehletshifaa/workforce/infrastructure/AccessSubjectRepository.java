package com.rehletshifaa.workforce.infrastructure;

import com.rehletshifaa.workforce.domain.AccessSubject;
import com.rehletshifaa.shared.persistence.BaseRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface AccessSubjectRepository extends BaseRepository<AccessSubject, String> {
    /** Creates the subject with the given access state unless it already exists (an existing state is never changed). */
    default void ensureExists(String subject, boolean active) {
        if (!existsById(subject)) saveAndFlush(new AccessSubject(subject, active));
    }

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update AccessSubject s set s.active = :active, s.revision = s.revision + 1 where s.subject = :subject")
    int setActive(@Param("subject") String subject, @Param("active") boolean active);
}
