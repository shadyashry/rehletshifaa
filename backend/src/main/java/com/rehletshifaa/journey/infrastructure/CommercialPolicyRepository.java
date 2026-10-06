package com.rehletshifaa.journey.infrastructure;

import com.rehletshifaa.journey.domain.CommercialPolicy;
import com.rehletshifaa.shared.persistence.BaseRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface CommercialPolicyRepository extends BaseRepository<CommercialPolicy, UUID> {
    Optional<CommercialPolicy> findFirstByActiveTrueAndCareCategoryOrderByVersionDesc(String careCategory);

    Optional<CommercialPolicy> findFirstByActiveTrueAndCareCategoryIsNullOrderByVersionDesc();

    List<CommercialPolicy> findByActiveTrueAndCareCategory(String careCategory);

    List<CommercialPolicy> findByActiveTrueAndCareCategoryIsNull();

    Optional<CommercialPolicy> findFirstByCareCategoryOrderByVersionDesc(String careCategory);

    Optional<CommercialPolicy> findFirstByCareCategoryIsNullOrderByVersionDesc();

    /** Platform default first, then each care area, newest version first. */
    @Query("select p from CommercialPolicy p order by p.careCategory asc nulls first, p.version desc")
    List<CommercialPolicy> findAllForAdministration();
}
