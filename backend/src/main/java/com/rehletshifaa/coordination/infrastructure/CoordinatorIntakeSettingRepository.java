package com.rehletshifaa.coordination.infrastructure;

import com.rehletshifaa.coordination.domain.CoordinatorIntakeSetting;
import com.rehletshifaa.shared.persistence.BaseRepository;

import java.util.List;

public interface CoordinatorIntakeSettingRepository extends BaseRepository<CoordinatorIntakeSetting, String> {
    List<CoordinatorIntakeSetting> findByIntakeEligibleTrue();
}
