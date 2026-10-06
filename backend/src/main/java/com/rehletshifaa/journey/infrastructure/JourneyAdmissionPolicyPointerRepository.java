package com.rehletshifaa.journey.infrastructure;

import com.rehletshifaa.journey.domain.JourneyAdmissionPolicyPointer;
import com.rehletshifaa.shared.persistence.BaseRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface JourneyAdmissionPolicyPointerRepository extends BaseRepository<JourneyAdmissionPolicyPointer, Integer> {
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from JourneyAdmissionPolicyPointer p")
    int clear();
}
