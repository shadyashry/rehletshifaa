package com.rehletshifaa.access.platform.api;

import com.rehletshifaa.authority.application.Authority;
import com.rehletshifaa.authority.domain.Permission;
import com.rehletshifaa.shared.audit.GovernanceAuditLog;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.List;

/** The governance audit trail for administrators and the Compliance and Audit Reviewer (AUDIT_READ). */
@Validated
@RestController
public class GovernanceAuditController {
    private final Authority authority;
    private final GovernanceAuditLog audit;

    public GovernanceAuditController(Authority authority, GovernanceAuditLog audit) {
        this.authority = authority;
        this.audit = audit;
    }

    @GetMapping("/api/v1/admin/platform-access/audit")
    public List<GovernanceAuditLog.Entry> audit(@RequestParam(defaultValue = "0") @Min(0) @Max(100000) int offset,
                                                @RequestParam(required = false) @Size(max = 255) String actor,
                                                @RequestParam(required = false) @Size(max = 80) String action,
                                                @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant from,
                                                @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant to) {
        authority.require(Permission.AUDIT_READ);
        return audit.list(offset, blank(actor), blank(action), from, to);
    }

    private static String blank(String value) { return value == null || value.isBlank() ? null : value.trim(); }
}
