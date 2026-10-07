package com.rehletshifaa.journey.application;

import com.rehletshifaa.directory.infrastructure.PractitionerProfileRepository;
import com.rehletshifaa.journey.api.ReferralDtos.ReferralView;
import com.rehletshifaa.journey.infrastructure.ConsultantReferralRepository;
import com.rehletshifaa.journey.infrastructure.ConsultantReferralRepository.Row;
import com.rehletshifaa.shared.crypto.CryptoService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * The reads behind {@link ConsultantReferralService}: referrals as the referring, receiving or coordinating person sees
 * them. A list costs two queries whatever its length (the rows, then every consultant named on them at once).
 * Authorization stays with the caller.
 */
@Service
public class ReferralQueryService {
    /** Shown for a consultant profile that no longer exists. */
    private static final String UNKNOWN_CONSULTANT = "The consultant";

    private final ConsultantReferralRepository referrals;
    private final PractitionerProfileRepository practitioners;
    private final CryptoService crypto;

    public ReferralQueryService(ConsultantReferralRepository referrals, PractitionerProfileRepository practitioners, CryptoService crypto) {
        this.referrals = referrals; this.practitioners = practitioners; this.crypto = crypto;
    }

    /** One referral, for the person in {@code relation} (REFERRER, RECEIVER or COORDINATOR). */
    @Transactional(readOnly = true)
    public ReferralView view(UUID id, String relation) {
        Row row = referrals.findRow(id).orElseThrow();
        return toView(row, relation, names(List.of(row)));
    }

    /** Every referral on the case, newest first, as the coordinator sees it. */
    @Transactional(readOnly = true)
    public List<ReferralView> onCase(UUID caseId) {
        List<Row> rows = referrals.findRowsOf(caseId);
        Map<UUID, String> names = names(rows);
        return rows.stream().map(r -> toView(r, "COORDINATOR", names)).toList();
    }

    /** The referrals on the case the consultant made (REFERRER) or is currently offered (RECEIVER), newest first. */
    @Transactional(readOnly = true)
    public List<ReferralView> seenBy(UUID caseId, String subject) {
        List<Row> rows = referrals.findRowsSeenBy(caseId, subject);
        Map<UUID, String> names = names(rows);
        return rows.stream().map(r -> toView(r, subject.equals(r.getFromSubject()) ? "REFERRER" : "RECEIVER", names)).toList();
    }

    /** A consultant's display name; null for no consultant. */
    @Transactional(readOnly = true)
    public String consultantName(UUID practitionerId) {
        if (practitionerId == null) return null;
        return name(practitionerId, namesOf(Set.of(practitionerId)));
    }

    private ReferralView toView(Row r, String relation, Map<UUID, String> names) {
        String opinion = r.getOpinionEncrypted();
        return new ReferralView(r.getId(), r.getType(), r.getStatus(), name(r.getFromPractitionerId(), names),
                crypto.decrypt(r.getClinicalReasonEncrypted()), r.getSuggestedCareCategory(), r.getSuggestedCapability(),
                r.getSuggestedPractitionerId(), name(r.getSuggestedPractitionerId(), names), r.getTargetCareCategory(),
                name(r.getTargetPractitionerId(), names), r.getCoordinatorNote(), r.getReceiverReason(),
                opinion == null ? null : crypto.decrypt(opinion), r.getOpinionSubmittedAt(), r.getCreatedAt(), r.getUpdatedAt(),
                r.getVersion(), relation);
    }

    /** Every consultant named on the rows (referrer, suggested, target), in one read. */
    private Map<UUID, String> names(Collection<Row> rows) {
        Set<UUID> ids = new HashSet<>();
        for (Row r : rows) {
            ids.add(r.getFromPractitionerId());
            if (r.getSuggestedPractitionerId() != null) ids.add(r.getSuggestedPractitionerId());
            if (r.getTargetPractitionerId() != null) ids.add(r.getTargetPractitionerId());
        }
        return ids.isEmpty() ? Map.of() : namesOf(ids);
    }

    private Map<UUID, String> namesOf(Collection<UUID> ids) {
        Map<UUID, String> names = new HashMap<>();
        for (var p : practitioners.findDisplayNamesByIds(ids))
            if (p.getDisplayName() != null) names.put(p.getId(), p.getDisplayName());
        return names;
    }

    private static String name(UUID practitionerId, Map<UUID, String> names) {
        return practitionerId == null ? null : names.getOrDefault(practitionerId, UNKNOWN_CONSULTANT);
    }
}
