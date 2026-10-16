package com.rehletshifaa.retention.infrastructure;

import com.rehletshifaa.retention.domain.RecordClass;
import com.rehletshifaa.retention.domain.RetentionPolicy;
import com.rehletshifaa.shared.persistence.BaseRepository;

import java.util.List;

public interface RetentionPolicyRepository extends BaseRepository<RetentionPolicy, RecordClass> {
    List<RetentionPolicy> findAllByOrderByRecordClassAsc();
}
