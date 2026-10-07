package com.rehletshifaa.journey.infrastructure;

import com.rehletshifaa.journey.domain.CoordinationDepositPolicy;
import com.rehletshifaa.shared.persistence.BaseRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface CoordinationDepositPolicyRepository extends BaseRepository<CoordinationDepositPolicy, UUID> {
    interface Row {
        UUID getId(); String getName(); String getCareCategory(); BigDecimal getCoordinationDepositEgp(); Boolean getActive(); Integer getVersion();
        String getCreatedBy(); LocalDate getValidFrom();
    }

    /**
     * Every revision: the default (no care area) first, then by care area, newest revision first. The default-first rule
     * is a CASE rather than {@code nulls first}: Hibernate's H2 dialect omits {@code nulls first} as its assumed default,
     * which the PostgreSQL-ordered test database ({@code DEFAULT_NULL_ORDERING=HIGH}) does not share.
     */
    @Query("""
            select p.id as id, p.name as name, p.careCategory as careCategory, p.coordinationDepositEgp as coordinationDepositEgp,
                p.active as active, p.version as version, p.createdBy as createdBy, p.validFrom as validFrom
            from CoordinationDepositPolicy p
            order by case when p.careCategory is null then 0 else 1 end, p.careCategory, p.version desc""")
    List<Row> findAllRows();

    @Query("""
            select p.id as id, p.name as name, p.careCategory as careCategory, p.coordinationDepositEgp as coordinationDepositEgp,
                p.active as active, p.version as version, p.createdBy as createdBy, p.validFrom as validFrom
            from CoordinationDepositPolicy p where p.id = :id""")
    Optional<Row> findRow(@Param("id") UUID id);

    /** The care area's active revisions, newest first (pass {@code Limit.of(1)}). */
    @Query("""
            select p.id as id, p.name as name, p.careCategory as careCategory, p.coordinationDepositEgp as coordinationDepositEgp,
                p.active as active, p.version as version, p.createdBy as createdBy, p.validFrom as validFrom
            from CoordinationDepositPolicy p where p.active = true and p.careCategory = :careCategory order by p.version desc""")
    List<Row> findActiveFor(@Param("careCategory") String careCategory, org.springframework.data.domain.Limit limit);

    /** The default policy's active revisions, newest first (pass {@code Limit.of(1)}). */
    @Query("""
            select p.id as id, p.name as name, p.careCategory as careCategory, p.coordinationDepositEgp as coordinationDepositEgp,
                p.active as active, p.version as version, p.createdBy as createdBy, p.validFrom as validFrom
            from CoordinationDepositPolicy p where p.active = true and p.careCategory is null order by p.version desc""")
    List<Row> findActiveDefault(org.springframework.data.domain.Limit limit);

    @Query("select max(p.version) from CoordinationDepositPolicy p where p.careCategory = :careCategory")
    Optional<Integer> findLatestVersionFor(@Param("careCategory") String careCategory);

    @Query("select max(p.version) from CoordinationDepositPolicy p where p.careCategory is null")
    Optional<Integer> findLatestDefaultVersion();

    /** Deactivates the active default policy (the one without a care area). */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update CoordinationDepositPolicy p set p.active = false where p.careCategory is null and p.active = true")
    int retireDefault();

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update CoordinationDepositPolicy p set p.active = false where p.careCategory = :careCategory and p.active = true")
    int retireFor(@Param("careCategory") String careCategory);
}
