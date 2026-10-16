package com.rehletshifaa.journey.domain;

import com.rehletshifaa.shared.persistence.AssignedIdEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.UUID;

/**
 * One line of a change order (architecture §4.3; P1-16): what the Consultant adds (kind, description, quantity) and, once Finance
 * prices it, the EGP unit price and the line total. The description is what the patient reads when they decide.
 */
@Entity
@Table(name = "change_order_lines")
public class ChangeOrderLine extends AssignedIdEntity {
    public enum Kind { PROCEDURE, IMPLANT, EXTRA_NIGHT, MEDICATION, OTHER }

    @Column(name = "change_order_id", nullable = false) private UUID changeOrderId;
    @Column(name = "line_no", nullable = false) private int lineNo;
    @Column(nullable = false, length = 20) private String kind;
    @Column(nullable = false, length = 500) private String description;
    @Column(nullable = false) private BigDecimal quantity;
    @Column(name = "unit_egp") private BigDecimal unitEgp;
    @Column(name = "line_egp") private BigDecimal lineEgp;
    @Column(nullable = false) private long version;

    protected ChangeOrderLine() {}

    public ChangeOrderLine(UUID changeOrderId, int lineNo, Kind kind, String description, BigDecimal quantity) {
        super(UUID.randomUUID());
        this.changeOrderId = changeOrderId; this.lineNo = lineNo; this.kind = kind.name(); this.description = description; this.quantity = quantity;
    }

    /** Finance's unit price; the line total is quantity x unit, to the piastre. */
    public BigDecimal price(BigDecimal unit) {
        this.unitEgp = unit.setScale(2, RoundingMode.HALF_UP);
        this.lineEgp = quantity.multiply(unitEgp).setScale(2, RoundingMode.HALF_UP);
        version++;
        return lineEgp;
    }

    public UUID getChangeOrderId() { return changeOrderId; }
    public int getLineNo() { return lineNo; }
    public Kind getKind() { return Kind.valueOf(kind); }
    public String getDescription() { return description; }
    public BigDecimal getQuantity() { return quantity; }
    public BigDecimal getUnitEgp() { return unitEgp; }
    public BigDecimal getLineEgp() { return lineEgp; }
}
