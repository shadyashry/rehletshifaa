package com.rehletshifaa.journey.application;

import com.rehletshifaa.authority.application.Authority;
import com.rehletshifaa.authority.domain.Permission;
import com.rehletshifaa.journey.api.JourneyDtos.*;
import com.rehletshifaa.journey.domain.CommercialPolicy;
import com.rehletshifaa.journey.infrastructure.CommercialPolicyRepository;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.audit.AuditTrail;
import com.rehletshifaa.shared.cache.CacheNames;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * Central commercial policy: the internal coordinated-care margin. Configured
 * centrally by a senior FINANCE user (never a per-case slider); selected and
 * snapshotted by the backend when a proposal is prepared. The intended standard
 * band is ~10-15% but the value is a centrally approved formula, not per-case.
 */
@Service
public class CommercialPolicyService {
    private static final BigDecimal MAX_MARGIN = new BigDecimal("0.5");
    private final CommercialPolicyRepository policies;
    private final Authority authority;
    private final AuditTrail audit;
    private final Clock clock;

    public record Policy(UUID id, String name, String careCategory, BigDecimal marginRate, int version) {}

    public CommercialPolicyService(CommercialPolicyRepository policies, Authority authority, AuditTrail audit, Clock clock) {
        this.policies = policies; this.authority = authority; this.audit = audit; this.clock = clock;
    }

    /**
     * Most specific active policy for a care area (care-area override, else platform default).
     * Cached because every proposal build reads it and only Finance changes it — which evicts.
     * A missing policy is not cached: it means "not configured yet", which must stay live.
     */
    @Cacheable(cacheNames = CacheNames.COMMERCIAL_POLICY, key = "#careCategory == null ? 'platform-default' : #careCategory", unless = "#result == null")
    public Policy activePolicyFor(String careCategory) {
        return (careCategory == null ? java.util.Optional.<CommercialPolicy>empty()
                : policies.findFirstByActiveTrueAndCareCategoryOrderByVersionDesc(careCategory))
                .or(policies::findFirstByActiveTrueAndCareCategoryIsNullOrderByVersionDesc)
                .map(p -> new Policy(p.getId(), p.getName(), p.getCareCategory(), p.getMarginRate(), p.getVersion()))
                .orElse(null);
    }

    public List<CommercialPolicyView> list() {
        authority.authorize(Permission.COMMERCIAL_POLICY_READ);
        return policies.findAllForAdministration().stream().map(CommercialPolicyService::view).toList();
    }

    /** Configure a new active policy version. Senior Finance only, with recent authentication. */
    @CacheEvict(cacheNames = CacheNames.COMMERCIAL_POLICY, allEntries = true)
    @Transactional
    public CommercialPolicyView configure(CommercialPolicyRequest request) {
        var actor = authority.authorize(Permission.COMMERCIAL_POLICY_MANAGE);
        BigDecimal rate = request.marginRate();
        if (rate == null || rate.signum() < 0 || rate.compareTo(MAX_MARGIN) > 0)
            throw new ApiException(400, "MARGIN_RATE_INVALID", "The margin rate must be between 0 and 0.5");
        String careCategory = request.careCategory() == null || request.careCategory().isBlank() ? null : request.careCategory().trim();
        int previous = (careCategory == null ? policies.findFirstByCareCategoryIsNullOrderByVersionDesc()
                : policies.findFirstByCareCategoryOrderByVersionDesc(careCategory)).map(CommercialPolicy::getVersion).orElse(0);
        List<CommercialPolicy> active = careCategory == null ? policies.findByActiveTrueAndCareCategoryIsNull()
                : policies.findByActiveTrueAndCareCategory(careCategory);
        active.forEach(CommercialPolicy::retire);
        policies.saveAllAndFlush(active);
        String name = request.name() == null || request.name().isBlank() ? "Coordinated-care margin" : request.name().trim();
        CommercialPolicy policy = policies.saveAndFlush(new CommercialPolicy(name, careCategory, rate, previous + 1, actor.subject(),
                LocalDate.now(clock), clock.instant()));
        audit.event("COMMERCIAL_POLICY_CONFIGURED").actor(actor.subject(), actor.label()).entity("CommercialPolicy", policy.getId())
                .action("CONFIGURE").reason("rate=" + rate + " careCategory=" + careCategory).record();
        return view(policy);
    }

    private static CommercialPolicyView view(CommercialPolicy p) {
        return new CommercialPolicyView(p.getId(), p.getName(), p.getCareCategory(), p.getMarginRate(), p.isActive(), p.getVersion(),
                p.getCreatedBy(), p.getValidFrom());
    }
}
