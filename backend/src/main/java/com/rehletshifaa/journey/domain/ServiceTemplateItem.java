package com.rehletshifaa.journey.domain;

import com.rehletshifaa.shared.persistence.AssignedIdEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.util.UUID;

/** One suggested service of a care-area template, unique by service code within the template. */
@Entity
@Table(name = "service_template_items")
public class ServiceTemplateItem extends AssignedIdEntity {
    @Column(name = "template_id", nullable = false) private UUID templateId;
    @Column(name = "service_code", nullable = false, length = 60) private String serviceCode;
    @Column(name = "service_name", nullable = false, length = 500) private String serviceName;
    @Column(length = 120) private String category;
    @Column(name = "suggested_price_egp") private BigDecimal suggestedPriceEgp;
    @Column(name = "sort_order", nullable = false) private int sortOrder;
    @Column(nullable = false) private boolean active;

    protected ServiceTemplateItem() {}

    public ServiceTemplateItem(UUID templateId, String serviceCode, String serviceName, String category, BigDecimal suggestedPriceEgp,
                               int sortOrder, boolean active) {
        super(UUID.randomUUID());
        this.templateId = templateId; this.serviceCode = serviceCode;
        update(serviceName, category, suggestedPriceEgp, sortOrder, active);
    }

    public void update(String serviceName, String category, BigDecimal suggestedPriceEgp, int sortOrder, boolean active) {
        this.serviceName = serviceName; this.category = category; this.suggestedPriceEgp = suggestedPriceEgp;
        this.sortOrder = sortOrder; this.active = active;
    }

    public String getServiceCode() { return serviceCode; }
    public String getServiceName() { return serviceName; }
    public String getCategory() { return category; }
    public BigDecimal getSuggestedPriceEgp() { return suggestedPriceEgp; }
    public int getSortOrder() { return sortOrder; }
    public boolean isActive() { return active; }
}
