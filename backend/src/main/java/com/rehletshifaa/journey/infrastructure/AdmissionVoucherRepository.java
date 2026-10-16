package com.rehletshifaa.journey.infrastructure;

import com.rehletshifaa.journey.domain.AdmissionVoucher;
import com.rehletshifaa.shared.persistence.BaseRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface AdmissionVoucherRepository extends BaseRepository<AdmissionVoucher, UUID> {
    /** The voucher the hospital holds now (at most one is ISSUED per case). */
    Optional<AdmissionVoucher> findFirstByCaseIdAndStatusOrderByRevisionDesc(UUID caseId, String status);

    /** The newest voucher of the case of any status: the next revision follows it. */
    Optional<AdmissionVoucher> findFirstByCaseIdOrderByRevisionDesc(UUID caseId);

    List<AdmissionVoucher> findByCaseIdOrderByRevisionAsc(UUID caseId);
}
