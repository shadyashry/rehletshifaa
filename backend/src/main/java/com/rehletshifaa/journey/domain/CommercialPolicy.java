package com.rehletshifaa.journey.domain;

import com.rehletshifaa.shared.persistence.AssignedIdEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/**
 * One version of the coordinated-care margin for a care area ({@code careCategory} null = platform default).
 * Versions are append-only; configuring a new one retires the active one. {@code version} is the business
 * policy version shown to Finance, not an optimistic-lock counter.
 */
@Entity
@Table(name = "commercial_policies")
public class CommercialPolicy extends AssignedIdEntity {
    @Column(nullable = false, length = 160) private String name;
    @Column(name = "care_category", length = 60) private String careCategory;
    @Column(name = "margin_rate", nullable = false, precision = 6, scale = 4) private BigDecimal marginRate;
    /** P0-5 (A-07): a manual line priced at or below this EGP figure needs no Finance approval; null means every manual line does. */
    @Column(name = "manual_band_egp", precision = 14, scale = 2) private BigDecimal manualBandEgp;
    /** P1-10 (B-05): days a released final quote stays open; the coordinator may shorten it, never lengthen it. */
    @Column(name = "final_quote_validity_days", nullable = false) private int finalQuoteValidityDays = DEFAULT_FINAL_QUOTE_VALIDITY_DAYS;
    /** P1-10 (B-05): how far the day's rate may move a non-EGP final quote's total before acceptance waits for Finance. */
    @Column(name = "fx_tolerance_rate", nullable = false, precision = 6, scale = 4) private BigDecimal fxToleranceRate = DEFAULT_FX_TOLERANCE_RATE;
    /** P1-16 (D-E): the change-order band is the lower of this rate of the facility package and {@link #changeOrderBandEgp}. */
    @Column(name = "change_order_band_rate", nullable = false, precision = 6, scale = 4) private BigDecimal changeOrderBandRate = DEFAULT_CHANGE_ORDER_BAND_RATE;
    @Column(name = "change_order_band_egp", nullable = false, precision = 14, scale = 2) private BigDecimal changeOrderBandEgp = DEFAULT_CHANGE_ORDER_BAND_EGP;
    /** P1-17 (D-F): a fit-to-fly certificate is valid for a flight within this many hours of its examination. */
    @Column(name = "fit_to_fly_hours", nullable = false) private int fitToFlyHours = DEFAULT_FIT_TO_FLY_HOURS;
    /** P1-18 (D-G): the follow-up included in the package lasts this many days from discharge. */
    @Column(name = "follow_up_free_days", nullable = false) private int followUpFreeDays = DEFAULT_FOLLOW_UP_FREE_DAYS;
    @Column(nullable = false) private boolean active;
    @Column(nullable = false) private int version;
    @Column(name = "created_by", length = 120) private String createdBy;
    @Column(name = "valid_from") private LocalDate validFrom;
    @Column(name = "created_at", nullable = false) private Instant createdAt;

    public static final int DEFAULT_FINAL_QUOTE_VALIDITY_DAYS = 14;
    public static final BigDecimal DEFAULT_FX_TOLERANCE_RATE = new BigDecimal("0.0300");
    /** D-E as recommended (design §12): 10% of the facility package or EGP 15,000, whichever is lower. */
    public static final BigDecimal DEFAULT_CHANGE_ORDER_BAND_RATE = new BigDecimal("0.1000"), DEFAULT_CHANGE_ORDER_BAND_EGP = new BigDecimal("15000.00");
    /** D-F as recommended (design §12): 72 hours before the flight. */
    public static final int DEFAULT_FIT_TO_FLY_HOURS = 72;
    /** D-G as recommended (design §12): 30 days of follow-up included in the package; paid teleconsultation after it (P2-25). */
    public static final int DEFAULT_FOLLOW_UP_FREE_DAYS = 30;

    protected CommercialPolicy() {}

    public CommercialPolicy(String name, String careCategory, BigDecimal marginRate, BigDecimal manualBandEgp, int version, String createdBy, LocalDate validFrom, Instant createdAt) {
        super(UUID.randomUUID());
        this.name = name; this.careCategory = careCategory; this.marginRate = marginRate; this.manualBandEgp = manualBandEgp; this.active = true;
        this.version = version; this.createdBy = createdBy; this.validFrom = validFrom; this.createdAt = micros(createdAt);
    }

    /** P1-10: the final-quote validity and FX band this version carries. */
    public CommercialPolicy withQuoteRules(int finalQuoteValidityDays, BigDecimal fxToleranceRate) {
        this.finalQuoteValidityDays = finalQuoteValidityDays; this.fxToleranceRate = fxToleranceRate; return this;
    }

    /** P1-16: the change-order band this version carries. */
    public CommercialPolicy withChangeOrderBand(BigDecimal rate, BigDecimal egp) {
        this.changeOrderBandRate = rate; this.changeOrderBandEgp = egp; return this;
    }

    /** P1-17: the fit-to-fly window this version carries. */
    public CommercialPolicy withFitToFlyHours(int hours) { this.fitToFlyHours = hours; return this; }

    /** P1-18: the free follow-up window this version carries. */
    public CommercialPolicy withFollowUpFreeDays(int days) { this.followUpFreeDays = days; return this; }

    public void retire() { this.active = false; }

    public String getName() { return name; }
    public String getCareCategory() { return careCategory; }
    public BigDecimal getMarginRate() { return marginRate; }
    public BigDecimal getManualBandEgp() { return manualBandEgp; }
    public int getFinalQuoteValidityDays() { return finalQuoteValidityDays; }
    public BigDecimal getFxToleranceRate() { return fxToleranceRate; }
    public BigDecimal getChangeOrderBandRate() { return changeOrderBandRate; }
    public BigDecimal getChangeOrderBandEgp() { return changeOrderBandEgp; }
    public int getFitToFlyHours() { return fitToFlyHours; }
    public int getFollowUpFreeDays() { return followUpFreeDays; }
    public boolean isActive() { return active; }
    public int getVersion() { return version; }
    public String getCreatedBy() { return createdBy; }
    public LocalDate getValidFrom() { return validFrom; }
}
