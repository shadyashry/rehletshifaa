package com.rehletshifaa.journey.application;

import com.rehletshifaa.journey.api.JourneyDtos.*;
import com.rehletshifaa.security.ActorContext;
import com.rehletshifaa.security.ActorRole;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.currency.CurrencyService;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.timestamp;

/**
 * Per-consultant price catalog, specialty templates and exchange-rate administration.
 * Catalog prices are held in EGP; the admin who manages a consultant maintains them,
 * so a price change reflects on the doctor's page immediately.
 */
@Service
public class PricingCatalogService {
    private final JdbcClient jdbc;
    private final ActorContext actors;
    private final Clock clock;
    private final CurrencyService currency;

    public PricingCatalogService(JdbcClient jdbc, ActorContext actors, Clock clock, CurrencyService currency) {
        this.jdbc = jdbc; this.actors = actors; this.clock = clock; this.currency = currency;
    }

    // ---- Specialty templates (admin) ----
    public List<ServiceTemplateView> templates(String careCategory) {
        actors.require(ActorRole.CREDENTIALING_ADMIN, ActorRole.SYSTEM_ADMIN);
        String sql = "SELECT id,care_category,name FROM service_templates WHERE active" +
                (careCategory == null || careCategory.isBlank() ? "" : " AND care_category=?") + " ORDER BY care_category";
        var spec = (careCategory == null || careCategory.isBlank())
                ? jdbc.sql(sql) : jdbc.sql(sql).param(careCategory.trim());
        return spec.query((rs, n) -> new ServiceTemplateView(rs.getObject("id", UUID.class), rs.getString("care_category"), rs.getString("name"))).list();
    }

    public List<ServiceTemplateItemView> templateItems(UUID templateId) {
        actors.require(ActorRole.CREDENTIALING_ADMIN, ActorRole.SYSTEM_ADMIN);
        return jdbc.sql("SELECT service_code,service_name,category,suggested_price_egp,sort_order FROM service_template_items WHERE template_id=? ORDER BY sort_order,service_name")
                .param(templateId)
                .query((rs, n) -> new ServiceTemplateItemView(rs.getString("service_code"), rs.getString("service_name"), rs.getString("category"), rs.getBigDecimal("suggested_price_egp"), rs.getInt("sort_order"))).list();
    }

    // ---- Consultant catalog (admin managed) ----
    public List<PractitionerSummaryView> practitioners() {
        actors.require(ActorRole.CREDENTIALING_ADMIN, ActorRole.SYSTEM_ADMIN);
        return jdbc.sql("SELECT id,display_name,specialty,subspecialty,care_category,credentialing_status,availability_status FROM practitioner_profiles WHERE practitioner_type='CONSULTANT' ORDER BY display_name")
                .query((rs, n) -> new PractitionerSummaryView(rs.getObject("id", UUID.class), rs.getString("display_name"), rs.getString("specialty"), rs.getString("subspecialty"), rs.getString("care_category"), rs.getString("credentialing_status"), rs.getString("availability_status"))).list();
    }

    public List<CatalogServiceView> practitionerCatalog(UUID practitionerId) {
        actors.require(ActorRole.CREDENTIALING_ADMIN, ActorRole.SYSTEM_ADMIN);
        requirePractitioner(practitionerId);
        return catalogRows("SELECT * FROM consultant_service_catalog WHERE practitioner_id=? ORDER BY active DESC,category,service_name", practitionerId);
    }

    @Transactional
    public CatalogServiceView addCatalogService(UUID practitionerId, CatalogServiceRequest request) {
        var actor = actors.require(ActorRole.CREDENTIALING_ADMIN, ActorRole.SYSTEM_ADMIN);
        requirePractitioner(practitionerId);
        Integer exists = jdbc.sql("SELECT count(*) FROM consultant_service_catalog WHERE practitioner_id=? AND service_code=?")
                .params(practitionerId, request.serviceCode().trim()).query(Integer.class).single();
        if (exists != null && exists > 0) throw new ApiException(409, "SERVICE_CODE_EXISTS", "A service with this code already exists for the consultant");
        UUID id = UUID.randomUUID();
        jdbc.sql("INSERT INTO consultant_service_catalog(id,practitioner_id,service_code,service_name,category,price_egp,active,valid_until,created_by,created_at,updated_at,version) VALUES(?,?,?,?,?,?,?,?,?,?,?,0)")
                .params(id, practitionerId, request.serviceCode().trim(), request.serviceName().trim(), request.category(), request.priceEgp(),
                        request.active() == null || request.active(), request.validUntil(), actor.subject(), timestamp(clock.instant()), timestamp(clock.instant())).update();
        audit(actor, "CATALOG_SERVICE_CREATED", id.toString());
        return catalogById(id);
    }

    @Transactional
    public CatalogServiceView updateCatalogService(UUID practitionerId, UUID serviceId, CatalogServiceRequest request) {
        var actor = actors.require(ActorRole.CREDENTIALING_ADMIN, ActorRole.SYSTEM_ADMIN);
        int changed = jdbc.sql("UPDATE consultant_service_catalog SET service_name=?,category=?,price_egp=?,active=?,valid_until=?,updated_at=?,version=version+1 WHERE id=? AND practitioner_id=?")
                .params(request.serviceName().trim(), request.category(), request.priceEgp(),
                        request.active() == null || request.active(), request.validUntil(), timestamp(clock.instant()), serviceId, practitionerId).update();
        if (changed != 1) throw new ApiException(404, "CATALOG_SERVICE_NOT_FOUND", "The catalog service was not found for this consultant");
        audit(actor, "CATALOG_SERVICE_UPDATED", serviceId.toString());
        return catalogById(serviceId);
    }

    @Transactional
    public void deactivateCatalogService(UUID practitionerId, UUID serviceId) {
        var actor = actors.require(ActorRole.CREDENTIALING_ADMIN, ActorRole.SYSTEM_ADMIN);
        int changed = jdbc.sql("UPDATE consultant_service_catalog SET active=FALSE,updated_at=?,version=version+1 WHERE id=? AND practitioner_id=?")
                .params(timestamp(clock.instant()), serviceId, practitionerId).update();
        if (changed != 1) throw new ApiException(404, "CATALOG_SERVICE_NOT_FOUND", "The catalog service was not found for this consultant");
        audit(actor, "CATALOG_SERVICE_DEACTIVATED", serviceId.toString());
    }

    /**
     * Seed a consultant's catalog from a specialty template. The template's care area
     * must match the consultant's — a consultant's price list only ever derives from
     * their own care-area template. Existing service codes are left untouched.
     */
    @Transactional
    public IdResponse seedFromTemplate(UUID practitionerId, UUID templateId) {
        var actor = actors.require(ActorRole.CREDENTIALING_ADMIN, ActorRole.SYSTEM_ADMIN);
        String careArea = requirePractitionerCareArea(practitionerId);
        String templateArea = jdbc.sql("SELECT care_category FROM service_templates WHERE id=? AND active").param(templateId).query(String.class).optional()
                .orElseThrow(() -> new ApiException(404, "TEMPLATE_NOT_FOUND", "The service template was not found"));
        if (!templateArea.equals(careArea))
            throw new ApiException(409, "TEMPLATE_CARE_AREA_MISMATCH", "The template care area does not match the consultant's care area");
        int added = copyTemplateToCatalog(practitionerId, templateId, actor.subject());
        audit(actor, "CATALOG_SEEDED_FROM_TEMPLATE", practitionerId.toString());
        return new IdResponse(practitionerId, added + " added");
    }

    /** Derive a consultant's catalog from the template of their own care area. */
    @Transactional
    public IdResponse deriveFromCareArea(UUID practitionerId) {
        var actor = actors.require(ActorRole.CREDENTIALING_ADMIN, ActorRole.SYSTEM_ADMIN);
        String careArea = requirePractitionerCareArea(practitionerId);
        UUID templateId = jdbc.sql("SELECT id FROM service_templates WHERE care_category=? AND active").param(careArea).query(UUID.class).optional()
                .orElseThrow(() -> new ApiException(409, "NO_TEMPLATE_FOR_CARE_AREA", "No service template exists yet for the care area: " + careArea));
        int added = copyTemplateToCatalog(practitionerId, templateId, actor.subject());
        audit(actor, "CATALOG_DERIVED_FROM_CARE_AREA", practitionerId.toString());
        return new IdResponse(practitionerId, added + " added");
    }

    /**
     * Best-effort derivation used when a consultant is created, so every consultant starts
     * with their own price list from their care-area template. No-op if the care area has no
     * template; never blocks creation. The caller is responsible for authorization.
     */
    void autoDeriveOnCreate(UUID practitionerId, String careArea, String bySubject) {
        if (careArea == null || careArea.isBlank()) return;
        UUID templateId = jdbc.sql("SELECT id FROM service_templates WHERE care_category=? AND active").param(careArea).query(UUID.class).optional().orElse(null);
        if (templateId == null) return;
        copyTemplateToCatalog(practitionerId, templateId, bySubject);
    }

    private int copyTemplateToCatalog(UUID practitionerId, UUID templateId, String bySubject) {
        List<ServiceTemplateItemView> items = jdbc.sql("SELECT service_code,service_name,category,suggested_price_egp,sort_order FROM service_template_items WHERE template_id=? ORDER BY sort_order,service_name")
                .param(templateId)
                .query((rs, n) -> new ServiceTemplateItemView(rs.getString("service_code"), rs.getString("service_name"), rs.getString("category"), rs.getBigDecimal("suggested_price_egp"), rs.getInt("sort_order"))).list();
        int added = 0;
        for (ServiceTemplateItemView item : items) {
            added += jdbc.sql("INSERT INTO consultant_service_catalog(id,practitioner_id,service_code,service_name,category,price_egp,active,created_by,created_at,updated_at,version) " +
                            "SELECT ?,?,?,?,?,?,TRUE,?,?,?,0 WHERE NOT EXISTS(SELECT 1 FROM consultant_service_catalog c WHERE c.practitioner_id=? AND c.service_code=?)")
                    .params(UUID.randomUUID(), practitionerId, item.serviceCode(), item.serviceName(), item.category(),
                            item.suggestedPriceEgp() == null ? java.math.BigDecimal.ZERO : item.suggestedPriceEgp(),
                            bySubject, timestamp(clock.instant()), timestamp(clock.instant()), practitionerId, item.serviceCode()).update();
        }
        return added;
    }

    // ---- Doctor's own catalog (read) ----
    public List<CatalogServiceView> myCatalog() {
        var actor = actors.require(ActorRole.DOCTOR);
        UUID practitionerId = jdbc.sql("SELECT id FROM practitioner_profiles WHERE external_subject=? AND credentialing_status='VERIFIED'")
                .param(actor.subject()).query(UUID.class).optional()
                .orElseThrow(() -> new ApiException(403, "DOCTOR_NOT_VERIFIED", "The doctor account is not linked to a verified practitioner profile"));
        LocalDate today = LocalDate.now(clock);
        return catalogRows("SELECT * FROM consultant_service_catalog WHERE practitioner_id=? AND active AND (valid_until IS NULL OR valid_until>=?) ORDER BY category,service_name", practitionerId, today);
    }

    // ---- Exchange rates ----
    /** Effective rates for the currency switcher. Readable by any authenticated staff role. */
    public List<FxRateView> fxRates(LocalDate date) {
        actors.require(ActorRole.DOCTOR, ActorRole.COORDINATOR, ActorRole.COORDINATOR_LEAD, ActorRole.OPERATIONS, ActorRole.FINANCE, ActorRole.CREDENTIALING_ADMIN, ActorRole.SYSTEM_ADMIN);
        LocalDate on = date == null ? LocalDate.now(clock) : date;
        return currency.effectiveRates(on).stream().map(r -> new FxRateView(r.currency(), r.rate(), r.rateDate(), r.source())).toList();
    }

    @Transactional
    public void setFxOverride(String currency, FxOverrideRequest request) {
        var actor = actors.require(ActorRole.CREDENTIALING_ADMIN, ActorRole.SYSTEM_ADMIN);
        LocalDate date = request.date() == null ? LocalDate.now(clock) : request.date();
        this.currency.setOverride(currency, request.rate(), date, actor.subject());
        audit(actor, "FX_RATE_OVERRIDDEN", currency + "@" + date);
    }

    // ---- helpers ----
    private void requirePractitioner(UUID practitionerId) {
        Integer found = jdbc.sql("SELECT count(*) FROM practitioner_profiles WHERE id=?").param(practitionerId).query(Integer.class).single();
        if (found == null || found == 0) throw new ApiException(404, "PRACTITIONER_NOT_FOUND", "The consultant profile was not found");
    }
    private String requirePractitionerCareArea(UUID practitionerId) {
        String careArea = jdbc.sql("SELECT care_category FROM practitioner_profiles WHERE id=?").param(practitionerId).query(String.class).optional()
                .orElseThrow(() -> new ApiException(404, "PRACTITIONER_NOT_FOUND", "The consultant profile was not found"));
        if (careArea == null || careArea.isBlank())
            throw new ApiException(409, "CONSULTANT_CARE_AREA_REQUIRED", "Set the consultant's care area before building their price list");
        return careArea;
    }
    private List<CatalogServiceView> catalogRows(String sql, Object... params) {
        return jdbc.sql(sql).params(params).query((rs, n) -> new CatalogServiceView(
                rs.getObject("id", UUID.class), rs.getString("service_code"), rs.getString("service_name"), rs.getString("category"),
                rs.getBigDecimal("price_egp"), rs.getBoolean("active"), rs.getObject("valid_until", LocalDate.class))).list();
    }
    private CatalogServiceView catalogById(UUID id) {
        return catalogRows("SELECT * FROM consultant_service_catalog WHERE id=?", id).stream().findFirst()
                .orElseThrow(() -> new ApiException(404, "CATALOG_SERVICE_NOT_FOUND", "The catalog service was not found"));
    }
    private void audit(ActorContext.Actor actor, String type, String entityId) {
        jdbc.sql("INSERT INTO audit_events(id,event_type,actor_subject,actor_role,case_id,entity_type,entity_id,action,outcome,reason,occurred_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)")
                .params(UUID.randomUUID(), type, actor.subject(), actor.primaryRole(), null, "PricingCatalog", entityId, "MANAGE", "SUCCESS", null, timestamp(clock.instant())).update();
    }
}
