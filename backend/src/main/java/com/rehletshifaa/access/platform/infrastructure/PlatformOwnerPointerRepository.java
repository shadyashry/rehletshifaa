package com.rehletshifaa.access.platform.infrastructure;

import com.rehletshifaa.access.platform.domain.PlatformOwnerPointer;
import com.rehletshifaa.shared.persistence.BaseRepository;

/** The singleton current-owner pointer (id=1). */
public interface PlatformOwnerPointerRepository extends BaseRepository<PlatformOwnerPointer, Integer> {
}
