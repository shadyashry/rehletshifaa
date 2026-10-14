package com.rehletshifaa.journey.domain;

import com.rehletshifaa.shared.persistence.AssignedIdEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.util.UUID;

/** A priced line of a proposal version: EGP figures, and the display unit price fixed at release. */
@Entity
@Table(name = "proposal_items")
public class ProposalItem extends AssignedIdEntity {
    @Column(name = "proposal_version_id", nullable = false) private UUID proposalVersionId;
    @Column(nullable = false, length = 40) private String category;
    @Column(nullable = false, length = 500) private String description;
    @Column(nullable = false) private BigDecimal quantity;
    @Column(name = "unit_price", nullable = false) private BigDecimal unitPrice;
    @Column(nullable = false) private boolean optional;
    @Column(name = "sort_order", nullable = false) private int sortOrder;
    @Column(nullable = false, length = 20) private String source;
    @Column(name = "unit_price_egp") private BigDecimal unitPriceEgp;
    @Column(name = "catalog_service_id") private UUID catalogServiceId;
    @Column(name = "facility_package_id") private UUID facilityPackageId;
    @Column(name = "provider_price_egp") private BigDecimal providerPriceEgp;
    @Column(name = "unit_price_min_egp") private BigDecimal unitPriceMinEgp;
    @Column(name = "unit_price_max_egp") private BigDecimal unitPriceMaxEgp;
    @Column(name = "item_assumptions", columnDefinition = "text") private String itemAssumptions;
    @Column(nullable = false) private boolean conditional;

    protected ProposalItem() {}

    /** The EGP prices of a line: patient price range and expected price, and what the provider is paid. */
    public record Prices(BigDecimal unitPriceEgp, BigDecimal providerPriceEgp, BigDecimal unitPriceMinEgp, BigDecimal unitPriceMaxEgp) {}

    /** A mandatory medical line of one unit. */
    public static ProposalItem medical(UUID proposalVersionId, String description, BigDecimal displayUnitPrice, int sortOrder, String source,
                                       Prices prices, UUID catalogServiceId) {
        return medical(proposalVersionId, description, displayUnitPrice, sortOrder, source, prices, catalogServiceId, null);
    }

    /** A mandatory medical line whose price source may be a catalogue service or a Finance-approved facility package (P0-5). */
    public static ProposalItem medical(UUID proposalVersionId, String description, BigDecimal displayUnitPrice, int sortOrder, String source,
                                       Prices prices, UUID catalogServiceId, UUID facilityPackageId) {
        ProposalItem i = new ProposalItem(UUID.randomUUID());
        i.proposalVersionId = proposalVersionId; i.category = "MEDICAL"; i.description = description; i.quantity = BigDecimal.ONE;
        i.unitPrice = displayUnitPrice; i.sortOrder = sortOrder; i.source = source; i.unitPriceEgp = prices.unitPriceEgp();
        i.providerPriceEgp = prices.providerPriceEgp(); i.unitPriceMinEgp = prices.unitPriceMinEgp(); i.unitPriceMaxEgp = prices.unitPriceMaxEgp();
        i.catalogServiceId = catalogServiceId; i.facilityPackageId = facilityPackageId;
        return i;
    }

    private ProposalItem(UUID id) { super(id); }
}
