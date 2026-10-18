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
 * Central commercial policy: the coordination and guarantee fee rate (shown to the patient as its own line since P1-10), the
 * pre-approved manual band, the final-quote validity, the FX tolerance band and the change-order band (P1-16, D-E). Configured
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
    private final CareCategoryCatalog careAreas;

    private static final int MAX_QUOTE_VALIDITY_DAYS = 90;

    /**
     * The active version as the journey reads it. {@code finalQuoteValidityDays} and {@code fxToleranceRate} (P1-10) are boxed so a
     * cached entry written before they existed reads back as the defaults.
     */
    public record Policy(UUID id, String name, String careCategory, BigDecimal marginRate, BigDecimal manualBandEgp, int version,
                         Integer finalQuoteValidityDays, BigDecimal fxToleranceRate, BigDecimal changeOrderBandRate, BigDecimal changeOrderBandEgp,
                         Integer fitToFlyHours, Integer followUpFreeDays, BigDecimal minimumCoordinationFeeEgp) {
        public Policy(UUID id, String name, String careCategory, BigDecimal marginRate, BigDecimal manualBandEgp, int version) {
            this(id, name, careCategory, marginRate, manualBandEgp, version, null, null, null, null, null, null, null);
        }
        public int quoteValidityDays() { return finalQuoteValidityDays == null ? CommercialPolicy.DEFAULT_FINAL_QUOTE_VALIDITY_DAYS : finalQuoteValidityDays; }
        public BigDecimal fxTolerance() { return fxToleranceRate == null ? CommercialPolicy.DEFAULT_FX_TOLERANCE_RATE : fxToleranceRate; }
        /** P1-16 (D-E): the band rate and cap; boxed so a cached entry written before they existed reads back as the defaults. */
        public BigDecimal bandRate() { return changeOrderBandRate == null ? CommercialPolicy.DEFAULT_CHANGE_ORDER_BAND_RATE : changeOrderBandRate; }
        public BigDecimal bandCapEgp() { return changeOrderBandEgp == null ? CommercialPolicy.DEFAULT_CHANGE_ORDER_BAND_EGP : changeOrderBandEgp; }
        /** The change-order band for a facility package: the lower of the rate of the package and the cap (D-E). */
        public BigDecimal changeOrderBand(BigDecimal packageEgp) {
            BigDecimal byRate = (packageEgp == null ? BigDecimal.ZERO : packageEgp).multiply(bandRate()).setScale(2, java.math.RoundingMode.HALF_UP);
            return byRate.min(bandCapEgp());
        }
        /** P1-17 (D-F): the fit-to-fly window in hours; boxed for the same cache reason. */
        public int fitToFlyWindowHours() { return fitToFlyHours == null ? CommercialPolicy.DEFAULT_FIT_TO_FLY_HOURS : fitToFlyHours; }
        /** P1-18 (D-G): the free follow-up window in days; boxed for the same cache reason. */
        public int followUpDays() { return followUpFreeDays == null ? CommercialPolicy.DEFAULT_FOLLOW_UP_FREE_DAYS : followUpFreeDays; }
        public BigDecimal minimumFee() {
            return minimumCoordinationFeeEgp == null ? CommercialPolicy.DEFAULT_MINIMUM_COORDINATION_FEE_EGP : minimumCoordinationFeeEgp;
        }
    }

    /** The band with no policy configured: the D-E defaults. */
    public static BigDecimal defaultChangeOrderBand(BigDecimal packageEgp) {
        return new Policy(null, null, null, null, null, 0).changeOrderBand(packageEgp);
    }

    public CommercialPolicyService(CommercialPolicyRepository policies, Authority authority, AuditTrail audit, Clock clock, CareCategoryCatalog careAreas) {
        this.policies = policies; this.authority = authority; this.audit = audit; this.clock = clock; this.careAreas = careAreas;
    }

    /** QA #22: the care areas a margin or deposit policy can be set for — every managed one, named as the platform names it. */
    public List<com.rehletshifaa.journey.api.JourneyDtos.CareCategoryView> careAreas() {
        authority.authorize(Permission.COMMERCIAL_POLICY_READ);
        return careAreas.all();
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
                .map(p -> new Policy(p.getId(), p.getName(), p.getCareCategory(), p.getMarginRate(), p.getManualBandEgp(), p.getVersion(),
                        p.getFinalQuoteValidityDays(), p.getFxToleranceRate(), p.getChangeOrderBandRate(), p.getChangeOrderBandEgp(), p.getFitToFlyHours(),
                        p.getFollowUpFreeDays(), p.getMinimumCoordinationFeeEgp()))
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
        // P0-5 (A-07): the pre-approved manual band; null keeps the Finance gate on every manual line.
        BigDecimal band = request.manualBandEgp() == null ? null : request.manualBandEgp().setScale(2, java.math.RoundingMode.HALF_UP);
        if (band != null && band.signum() < 0) throw new ApiException(400, "MANUAL_BAND_INVALID", "The pre-approved manual band must be zero or more EGP");
        String careCategory = request.careCategory() == null || request.careCategory().isBlank() ? null : request.careCategory().trim();
        // QA #22: any managed care area, never a misspelt one that no case would ever match.
        if (careCategory != null && !careAreas.exists(careCategory)) throw new ApiException(400, "CARE_AREA_UNKNOWN", "This care area does not exist");
        int previous = (careCategory == null ? policies.findFirstByCareCategoryIsNullOrderByVersionDesc()
                : policies.findFirstByCareCategoryOrderByVersionDesc(careCategory)).map(CommercialPolicy::getVersion).orElse(0);
        List<CommercialPolicy> active = careCategory == null ? policies.findByActiveTrueAndCareCategoryIsNull()
                : policies.findByActiveTrueAndCareCategory(careCategory);
        // P1-10 (B-05): left out, the validity and the FX band carry over from the version being replaced, so revising a rate never resets them.
        CommercialPolicy current = active.stream().findFirst().orElse(null);
        int validityDays = request.finalQuoteValidityDays() != null ? request.finalQuoteValidityDays()
                : current != null ? current.getFinalQuoteValidityDays() : CommercialPolicy.DEFAULT_FINAL_QUOTE_VALIDITY_DAYS;
        if (validityDays < 1 || validityDays > MAX_QUOTE_VALIDITY_DAYS)
            throw new ApiException(400, "QUOTE_VALIDITY_INVALID", "A final quote must stay open between 1 and " + MAX_QUOTE_VALIDITY_DAYS + " days");
        BigDecimal fxTolerance = request.fxToleranceRate() != null ? request.fxToleranceRate().setScale(4, java.math.RoundingMode.HALF_UP)
                : current != null ? current.getFxToleranceRate() : CommercialPolicy.DEFAULT_FX_TOLERANCE_RATE;
        if (fxTolerance.signum() < 0 || fxTolerance.compareTo(MAX_MARGIN) > 0)
            throw new ApiException(400, "FX_TOLERANCE_INVALID", "The exchange-rate band must be between 0 and 0.5");
        // P1-16 (D-E): the change-order band carries over the same way.
        BigDecimal bandRate = request.changeOrderBandRate() != null ? request.changeOrderBandRate().setScale(4, java.math.RoundingMode.HALF_UP)
                : current != null ? current.getChangeOrderBandRate() : CommercialPolicy.DEFAULT_CHANGE_ORDER_BAND_RATE;
        if (bandRate.signum() < 0 || bandRate.compareTo(MAX_MARGIN) > 0)
            throw new ApiException(400, "CHANGE_ORDER_BAND_INVALID", "The change-order band rate must be between 0 and 0.5");
        BigDecimal bandEgp = request.changeOrderBandEgp() != null ? request.changeOrderBandEgp().setScale(2, java.math.RoundingMode.HALF_UP)
                : current != null ? current.getChangeOrderBandEgp() : CommercialPolicy.DEFAULT_CHANGE_ORDER_BAND_EGP;
        if (bandEgp.signum() < 0) throw new ApiException(400, "CHANGE_ORDER_BAND_INVALID", "The change-order band cap must be zero or more EGP");
        // P1-17 (D-F): the fit-to-fly window carries over the same way.
        int fitToFly = request.fitToFlyHours() != null ? request.fitToFlyHours() : current != null ? current.getFitToFlyHours() : CommercialPolicy.DEFAULT_FIT_TO_FLY_HOURS;
        if (fitToFly < 24 || fitToFly > 168) throw new ApiException(400, "FIT_TO_FLY_WINDOW_INVALID", "The fit-to-fly window must be between 24 and 168 hours");
        // P1-18 (D-G): the free follow-up window carries over the same way.
        int followUpDays = request.followUpFreeDays() != null ? request.followUpFreeDays() : current != null ? current.getFollowUpFreeDays() : CommercialPolicy.DEFAULT_FOLLOW_UP_FREE_DAYS;
        if (followUpDays < 7 || followUpDays > 90) throw new ApiException(400, "FOLLOW_UP_WINDOW_INVALID", "The free follow-up window must be between 7 and 90 days");
        BigDecimal minimumFee = request.minimumCoordinationFeeEgp() != null
                ? request.minimumCoordinationFeeEgp().setScale(2, java.math.RoundingMode.HALF_UP)
                : current != null ? current.getMinimumCoordinationFeeEgp() : CommercialPolicy.DEFAULT_MINIMUM_COORDINATION_FEE_EGP;
        if (minimumFee.signum() < 0)
            throw new ApiException(400, "MINIMUM_COORDINATION_FEE_INVALID", "The minimum coordination fee must be zero or more EGP");
        active.forEach(CommercialPolicy::retire);
        policies.saveAllAndFlush(active);
        String name = request.name() == null || request.name().isBlank() ? "Coordinated-care margin" : request.name().trim();
        CommercialPolicy policy = policies.saveAndFlush(new CommercialPolicy(name, careCategory, rate, band, previous + 1, actor.subject(),
                LocalDate.now(clock), clock.instant()).withQuoteRules(validityDays, fxTolerance).withChangeOrderBand(bandRate, bandEgp).withFitToFlyHours(fitToFly)
                .withFollowUpFreeDays(followUpDays).withMinimumCoordinationFee(minimumFee));
        audit.event("COMMERCIAL_POLICY_CONFIGURED").actor(actor.subject(), actor.label()).entity("CommercialPolicy", policy.getId())
                .action("CONFIGURE").reason("rate=" + rate + " careCategory=" + careCategory + " manualBandEgp=" + band
                        + " finalQuoteValidityDays=" + validityDays + " fxToleranceRate=" + fxTolerance
                        + " changeOrderBandRate=" + bandRate + " changeOrderBandEgp=" + bandEgp + " fitToFlyHours=" + fitToFly
                        + " followUpFreeDays=" + followUpDays + " minimumCoordinationFeeEgp=" + minimumFee).record();
        return view(policy);
    }

    private static CommercialPolicyView view(CommercialPolicy p) {
        return new CommercialPolicyView(p.getId(), p.getName(), p.getCareCategory(), p.getMarginRate(), p.getManualBandEgp(), p.isActive(), p.getVersion(),
                p.getCreatedBy(), p.getValidFrom(), p.getFinalQuoteValidityDays(), p.getFxToleranceRate(),
                p.getChangeOrderBandRate(), p.getChangeOrderBandEgp(), p.getFitToFlyHours(), p.getFollowUpFreeDays(),
                p.getMinimumCoordinationFeeEgp());
    }
}
