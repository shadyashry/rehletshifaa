package com.rehletshifaa.directory.infrastructure;

import com.rehletshifaa.directory.domain.ConsultantCurrentOwner;
import com.rehletshifaa.shared.persistence.BaseRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.UUID;

public interface ConsultantCurrentOwnerRepository extends BaseRepository<ConsultantCurrentOwner, UUID> {
    boolean existsByOwnerSubject(String ownerSubject);

    long countByOwnerSubject(String ownerSubject);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from ConsultantCurrentOwner c where c.practitionerId = :practitionerId and c.ownershipId = :ownershipId")
    int deletePointer(@Param("practitionerId") UUID practitionerId, @Param("ownershipId") UUID ownershipId);
}
