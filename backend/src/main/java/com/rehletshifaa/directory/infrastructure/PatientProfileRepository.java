package com.rehletshifaa.directory.infrastructure;

import com.rehletshifaa.directory.domain.PatientProfile;
import com.rehletshifaa.shared.persistence.BaseRepository;

import java.util.UUID;

public interface PatientProfileRepository extends BaseRepository<PatientProfile, UUID> {
    boolean existsByExternalSubject(String externalSubject);
}
