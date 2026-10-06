package com.rehletshifaa.journey.application;

import com.rehletshifaa.clinic.domain.CatalogEntry;
import com.rehletshifaa.clinic.infrastructure.CatalogEntryRepository;
import com.rehletshifaa.directory.domain.PractitionerProfile;
import com.rehletshifaa.directory.infrastructure.PractitionerProfileRepository;
import com.rehletshifaa.journey.api.JourneyDtos.*;
import com.rehletshifaa.journey.domain.ServiceTemplate;
import com.rehletshifaa.journey.domain.ServiceTemplateItem;
import com.rehletshifaa.journey.infrastructure.ServiceTemplateItemRepository;
import com.rehletshifaa.journey.infrastructure.ServiceTemplateRepository;
import com.rehletshifaa.authority.application.Actor;
import com.rehletshifaa.authority.application.Authority;
import com.rehletshifaa.authority.domain.Permission;
import com.rehletshifaa.authority.domain.Role;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.audit.AuditTrail;
import com.rehletshifaa.shared.currency.CurrencyService;
import com.rehletshifaa.shared.crypto.CryptoService;
import com.rehletshifaa.identity.KeycloakStaffIdentityService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * Per-consultant price catalog, specialty templates and exchange-rate administration.
 * Catalog prices are held in EGP; the admin who manages a consultant maintains them,
 * so a price change reflects on the doctor's page immediately.
 */
@Service
public class PricingCatalogService {
    private final CatalogEntryRepository catalog;
    private final ServiceTemplateRepository templates;
    private final ServiceTemplateItemRepository templateItems;
    private final PractitionerProfileRepository practitioners;
    private final AuditTrail auditTrail;
    private final Authority authority;
    private final Clock clock;
    private final CurrencyService currency;
    private final CryptoService crypto;
    private final KeycloakStaffIdentityService identity;

    public PricingCatalogService(CatalogEntryRepository catalog, ServiceTemplateRepository templates, ServiceTemplateItemRepository templateItems,
                                 PractitionerProfileRepository practitioners, Authority authority, Clock clock, CurrencyService currency,
                                 CryptoService crypto, KeycloakStaffIdentityService identity, AuditTrail auditTrail) {
        this.catalog = catalog; this.templates = templates; this.templateItems = templateItems; this.practitioners = practitioners;
        this.authority = authority; this.clock = clock; this.currency = currency; this.crypto = crypto; this.identity = identity;
        this.auditTrail = auditTrail;
    }

    // ---- Specialty templates (admin) ----
    public List<ServiceTemplateView> templates(String careCategory) {
        authority.authorize(Permission.CONSULTANT_CATALOG_MANAGE);
        var found = careCategory == null || careCategory.isBlank()
                ? templates.findByActiveTrueOrderByCareCategory() : templates.findByCareCategoryAndActiveTrueOrderByCareCategory(careCategory.trim());
        return found.stream().map(PricingCatalogService::view).toList();
    }

    public List<ServiceTemplateItemView> templateItems(UUID templateId) {
        authority.authorize(Permission.CONSULTANT_CATALOG_MANAGE);
        return templateItems.findByTemplateIdOrderByActiveDescSortOrderAscServiceNameAsc(templateId).stream().map(PricingCatalogService::view).toList();
    }

    @Transactional
    public ServiceTemplateView updateTemplate(UUID id, ServiceTemplateUpdateRequest request) {
        var actor = authority.authorize(Permission.CONSULTANT_CATALOG_MANAGE);
        ServiceTemplate template = activeTemplate(id);
        template.describe(request.name().trim(), request.referenceStandard(), request.guidanceNote(), clock.instant());
        templates.saveAndFlush(template);
        audit(actor, "SERVICE_TEMPLATE_UPDATED", id.toString());
        return view(template);
    }

    @Transactional
    public ServiceTemplateItemView addTemplateItem(UUID templateId, ServiceTemplateItemRequest request) {
        var actor = authority.authorize(Permission.CONSULTANT_CATALOG_MANAGE);
        activeTemplate(templateId);
        String code = request.serviceCode().trim();
        if (templateItems.existsByTemplateIdAndServiceCode(templateId, code))
            throw new ApiException(409, "TEMPLATE_CODE_EXISTS", "This service code already exists in the template");
        ServiceTemplateItem item = templateItems.saveAndFlush(new ServiceTemplateItem(templateId, code, request.serviceName().trim(), request.category(),
                request.suggestedPriceEgp(), request.sortOrder() == null ? 0 : request.sortOrder(), request.active() == null || request.active()));
        audit(actor, "SERVICE_TEMPLATE_ITEM_CREATED", templateId.toString());
        return view(item);
    }

    @Transactional
    public ServiceTemplateItemView updateTemplateItem(UUID templateId, String code, ServiceTemplateItemRequest request) {
        var actor = authority.authorize(Permission.CONSULTANT_CATALOG_MANAGE);
        ServiceTemplateItem item = templateItems.findByTemplateIdAndServiceCode(templateId, code)
                .orElseThrow(() -> new ApiException(404, "TEMPLATE_ITEM_NOT_FOUND", "The template service was not found"));
        item.update(request.serviceName().trim(), request.category(), request.suggestedPriceEgp(), request.sortOrder() == null ? 0 : request.sortOrder(),
                request.active() == null || request.active());
        templateItems.saveAndFlush(item);
        audit(actor, "SERVICE_TEMPLATE_ITEM_UPDATED", templateId + ":" + code);
        return view(item);
    }

    // ---- Consultant catalog (admin managed) ----
    public List<PractitionerSummaryView> practitioners() {
        authority.authorize(Permission.CREDENTIAL_READ);
        return practitioners.findByPractitionerTypeOrderByDisplayName("CONSULTANT").stream()
                .map(p -> new PractitionerSummaryView(p.getId(), p.getDisplayName(), p.getSpecialty(), p.getSubspecialty(), p.getCareCategory(),
                        p.getCredentialingStatus(), p.getAvailabilityStatus(), crypto.decrypt(p.getEmailEncrypted()),
                        identity.status(p.getExternalSubject(), p.getAccountStatus()), p.getInvitedAt()))
                .toList();
    }

    public List<CatalogServiceView> practitionerCatalog(UUID practitionerId) {
        authority.authorize(Permission.CONSULTANT_CATALOG_MANAGE);
        requirePractitioner(practitionerId);
        return catalog.findByPractitionerIdOrderByActiveDescCategoryAscServiceNameAsc(practitionerId).stream().map(PricingCatalogService::view).toList();
    }

    @Transactional
    public CatalogServiceView addCatalogService(UUID practitionerId, CatalogServiceRequest request) {
        var actor = authority.authorize(Permission.CONSULTANT_CATALOG_MANAGE);
        requirePractitioner(practitionerId);
        String code = request.serviceCode().trim();
        if (catalog.existsByPractitionerIdAndServiceCode(practitionerId, code))
            throw new ApiException(409, "SERVICE_CODE_EXISTS", "A service with this code already exists for the consultant");
        CatalogEntry entry = catalog.saveAndFlush(CatalogEntry.platformManaged(practitionerId, code, request.serviceName().trim(), request.category(),
                request.priceEgp(), request.active() == null || request.active(), request.validUntil(), actor.subject(), clock.instant()));
        audit(actor, "CATALOG_SERVICE_CREATED", entry.getId().toString());
        return view(entry);
    }

    @Transactional
    public CatalogServiceView updateCatalogService(UUID practitionerId, UUID serviceId, CatalogServiceRequest request) {
        var actor = authority.authorize(Permission.CONSULTANT_CATALOG_MANAGE);
        CatalogEntry entry = lockedEntry(practitionerId, serviceId);
        entry.edit(request.serviceName().trim(), request.category(), request.priceEgp(), request.active() == null || request.active(),
                request.validUntil(), clock.instant());
        catalog.saveAndFlush(entry);
        audit(actor, "CATALOG_SERVICE_UPDATED", serviceId.toString());
        return view(entry);
    }

    @Transactional
    public void deactivateCatalogService(UUID practitionerId, UUID serviceId) {
        var actor = authority.authorize(Permission.CONSULTANT_CATALOG_MANAGE);
        CatalogEntry entry = lockedEntry(practitionerId, serviceId);
        entry.deactivate(clock.instant());
        catalog.saveAndFlush(entry);
        audit(actor, "CATALOG_SERVICE_DEACTIVATED", serviceId.toString());
    }

    /**
     * Seed a consultant's catalog from a specialty template. The template's care area
     * must match the consultant's — a consultant's price list only ever derives from
     * their own care-area template. Existing service codes are left untouched.
     */
    @Transactional
    public IdResponse seedFromTemplate(UUID practitionerId, UUID templateId) {
        var actor = authority.authorize(Permission.CONSULTANT_CATALOG_MANAGE);
        String careArea = requirePractitionerCareArea(practitionerId);
        ServiceTemplate template = templates.findByIdAndActiveTrue(templateId)
                .orElseThrow(() -> new ApiException(404, "TEMPLATE_NOT_FOUND", "The service template was not found"));
        if (!template.getCareCategory().equals(careArea))
            throw new ApiException(409, "TEMPLATE_CARE_AREA_MISMATCH", "The template care area does not match the consultant's care area");
        int added = copyTemplateToCatalog(practitionerId, templateId, actor.subject());
        audit(actor, "CATALOG_SEEDED_FROM_TEMPLATE", practitionerId.toString());
        return new IdResponse(practitionerId, added + " added");
    }

    /** Derive a consultant's catalog from the template of their own care area. */
    @Transactional
    public IdResponse deriveFromCareArea(UUID practitionerId) {
        var actor = authority.authorize(Permission.CONSULTANT_CATALOG_MANAGE);
        String careArea = requirePractitionerCareArea(practitionerId);
        ServiceTemplate template = templates.findFirstByCareCategoryAndActiveTrue(careArea)
                .orElseThrow(() -> new ApiException(409, "NO_TEMPLATE_FOR_CARE_AREA", "No service template exists yet for the care area: " + careArea));
        int added = copyTemplateToCatalog(practitionerId, template.getId(), actor.subject());
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
        templates.findFirstByCareCategoryAndActiveTrue(careArea).ifPresent(t -> copyTemplateToCatalog(practitionerId, t.getId(), bySubject));
    }

    /** Copies the template's active services; codes already on the consultant's list are left untouched. */
    private int copyTemplateToCatalog(UUID practitionerId, UUID templateId, String bySubject) {
        int added = 0;
        for (ServiceTemplateItem item : templateItems.findByTemplateIdAndActiveTrueOrderBySortOrderAscServiceNameAsc(templateId)) {
            if (catalog.existsByPractitionerIdAndServiceCode(practitionerId, item.getServiceCode())) continue;
            boolean priced = item.getSuggestedPriceEgp() != null && item.getSuggestedPriceEgp().signum() > 0;
            catalog.saveAndFlush(CatalogEntry.platformManaged(practitionerId, item.getServiceCode(), item.getServiceName(), item.getCategory(),
                    priced ? item.getSuggestedPriceEgp() : BigDecimal.ZERO, priced, null, bySubject, clock.instant()));
            added++;
        }
        return added;
    }

    private ServiceTemplate activeTemplate(UUID id) {
        return templates.findByIdAndActiveTrue(id).orElseThrow(() -> new ApiException(404, "TEMPLATE_NOT_FOUND", "The care-area template was not found"));
    }

    private static ServiceTemplateView view(ServiceTemplate t) {
        return new ServiceTemplateView(t.getId(), t.getCareCategory(), t.getName(), t.getReferenceStandard(), t.getGuidanceNote());
    }

    private static ServiceTemplateItemView view(ServiceTemplateItem i) {
        return new ServiceTemplateItemView(i.getServiceCode(), i.getServiceName(), i.getCategory(), i.getSuggestedPriceEgp(), i.getSortOrder(), i.isActive());
    }

    // ---- Bulk import (CSV; Excel via "Save As CSV") ----
    /**
     * Parse a CSV price list and upsert it against the consultant's catalog by service_code.
     * With commit=false it returns a preview (no writes); with commit=true it applies the changes.
     * Header row required: service_code, service_name, price_egp (category, active, valid_until optional).
     */
    @Transactional
    public CatalogImportResult importCatalog(UUID practitionerId, byte[] content, boolean commit) {
        var actor = authority.authorize(Permission.CONSULTANT_CATALOG_MANAGE);
        requirePractitioner(practitionerId);
        List<String[]> table = parseCsv(new String(content, java.nio.charset.StandardCharsets.UTF_8));
        if (table.isEmpty()) throw new ApiException(400, "IMPORT_EMPTY", "The file is empty");
        java.util.Map<String, Integer> col = new java.util.HashMap<>();
        String[] header = table.get(0);
        for (int i = 0; i < header.length; i++) col.put(header[i].trim().toLowerCase().replace(' ', '_'), i);
        for (String required : new String[]{"service_code", "service_name", "price_egp"})
            if (!col.containsKey(required)) throw new ApiException(400, "IMPORT_HEADER_MISSING", "Missing required column: " + required);
        List<CatalogImportRow> rows = new java.util.ArrayList<>();
        int added = 0, updated = 0, unchanged = 0, errors = 0;
        java.util.Set<String> seen = new java.util.HashSet<>();
        for (int i = 1; i < table.size(); i++) {
            String[] r = table.get(i);
            String code = cell(r, col, "service_code"), name = cell(r, col, "service_name"), category = cell(r, col, "category");
            String priceStr = cell(r, col, "price_egp");
            if (code.isBlank() && name.isBlank() && priceStr.isBlank()) continue; // blank line
            String error = null;
            BigDecimal price = null;
            try { price = new BigDecimal(priceStr.trim()); } catch (Exception e) { error = "Invalid price"; }
            if (code.isBlank() || name.isBlank()) error = "service_code and service_name are required";
            else if (code.length() > 60) error = "service_code is too long (max 60)";
            else if (price != null && price.signum() < 0) error = "Price cannot be negative";
            else if (!seen.add(code)) error = "Duplicate service_code in file";
            if (error != null) { errors++; rows.add(new CatalogImportRow(i + 1, code, name, category, price, "ERROR", error)); continue; }
            boolean active = parseActive(cell(r, col, "active"));
            CatalogEntry existing = catalog.findByPractitionerIdAndServiceCode(practitionerId, code).orElse(null);
            String action;
            if (existing == null) {
                action = "NEW"; added++;
                if (commit) catalog.saveAndFlush(CatalogEntry.platformManaged(practitionerId, code, name.trim(), blankToNull(category), price, active,
                        null, actor.subject(), clock.instant()));
            } else if (name.trim().equals(existing.getServiceName()) && java.util.Objects.equals(blankToNull(category), existing.getCategory())
                    && price.compareTo(existing.getPriceEgp()) == 0 && active == existing.isActive()) {
                action = "UNCHANGED"; unchanged++;
            } else {
                action = "UPDATE"; updated++;
                if (commit) {
                    CatalogEntry entry = lockedEntry(practitionerId, existing.getId());
                    entry.importValues(name.trim(), blankToNull(category), price, active, clock.instant());
                    catalog.saveAndFlush(entry);
                }
            }
            rows.add(new CatalogImportRow(i + 1, code, name, category, price, action, null));
        }
        if (commit) audit(actor, "CATALOG_IMPORTED", practitionerId + " +" + added + " ~" + updated);
        return new CatalogImportResult(commit, added, updated, unchanged, errors, rows);
    }

    private static boolean parseActive(String v) { if (v == null || v.isBlank()) return true; String s = v.trim().toLowerCase(); return !(s.equals("false") || s.equals("no") || s.equals("0") || s.equals("inactive")); }
    private static String blankToNull(String v) { return v == null || v.isBlank() ? null : v.trim(); }
    private static String cell(String[] row, java.util.Map<String, Integer> col, String name) { Integer i = col.get(name); return i == null || i >= row.length || row[i] == null ? "" : row[i]; }
    /** Minimal RFC-4180-ish CSV parser: handles quoted fields, embedded commas/newlines, and "" escapes. */
    static List<String[]> parseCsv(String text) {
        List<String[]> out = new java.util.ArrayList<>();
        List<String> field = new java.util.ArrayList<>();
        StringBuilder cur = new StringBuilder();
        boolean inQuotes = false;
        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
            if (inQuotes) {
                if (c == '"') { if (i + 1 < text.length() && text.charAt(i + 1) == '"') { cur.append('"'); i++; } else inQuotes = false; }
                else cur.append(c);
            } else if (c == '"') inQuotes = true;
            else if (c == ',') { field.add(cur.toString()); cur.setLength(0); }
            else if (c == '\r') { /* ignore, handled by \n */ }
            else if (c == '\n') { field.add(cur.toString()); cur.setLength(0); out.add(field.toArray(new String[0])); field = new java.util.ArrayList<>(); }
            else cur.append(c);
        }
        if (cur.length() > 0 || !field.isEmpty()) { field.add(cur.toString()); out.add(field.toArray(new String[0])); }
        return out;
    }

    // ---- Doctor's own catalog (read) ----
    public List<CatalogServiceView> myCatalog() {
        var actor = authority.authorize(Permission.WORK_QUEUE_VIEW);
        if (!actor.has(Role.CONSULTANT)) throw new ApiException(403, "PERMISSION_NOT_HELD", "Only consultants have a catalog");
        UUID practitionerId = practitioners.findFirstByExternalSubjectAndCredentialingStatus(actor.subject(), "VERIFIED").map(PractitionerProfile::getId)
                .orElseThrow(() -> new ApiException(403, "DOCTOR_NOT_VERIFIED", "The doctor account is not linked to a verified practitioner profile"));
        return catalog.findOffered(practitionerId, LocalDate.now(clock)).stream().map(PricingCatalogService::view).toList();
    }

    // ---- Exchange rates ----
    /** Effective rates for the currency switcher. Readable by any authenticated staff role. */
    public List<FxRateView> fxRates(LocalDate date) {
        authority.authorize(Permission.REFERENCE_DATA_READ);
        LocalDate on = date == null ? LocalDate.now(clock) : date;
        return currency.effectiveRates(on).stream().map(r -> new FxRateView(r.currency(), r.rate(), r.rateDate(), r.source())).toList();
    }

    @Transactional
    public void setFxOverride(String currency, FxOverrideRequest request) {
        var actor = authority.authorize(Permission.COMMERCIAL_POLICY_MANAGE);
        LocalDate date = request.date() == null ? LocalDate.now(clock) : request.date();
        this.currency.setOverride(currency, request.rate(), date, actor.subject());
        audit(actor, "FX_RATE_OVERRIDDEN", currency + "@" + date);
    }

    // ---- helpers ----
    private void requirePractitioner(UUID practitionerId) {
        if (!practitioners.existsById(practitionerId)) throw new ApiException(404, "PRACTITIONER_NOT_FOUND", "The consultant profile was not found");
    }

    private String requirePractitionerCareArea(UUID practitionerId) {
        String careArea = practitioners.findById(practitionerId)
                .orElseThrow(() -> new ApiException(404, "PRACTITIONER_NOT_FOUND", "The consultant profile was not found")).getCareCategory();
        if (careArea == null || careArea.isBlank())
            throw new ApiException(409, "CONSULTANT_CARE_AREA_REQUIRED", "Set the consultant's care area before building their price list");
        return careArea;
    }

    private CatalogEntry lockedEntry(UUID practitionerId, UUID serviceId) {
        return catalog.lockById(serviceId).filter(e -> e.getPractitionerId().equals(practitionerId))
                .orElseThrow(() -> new ApiException(404, "CATALOG_SERVICE_NOT_FOUND", "The catalog service was not found for this consultant"));
    }

    private static CatalogServiceView view(CatalogEntry e) {
        return new CatalogServiceView(e.getId(), e.getServiceCode(), e.getServiceName(), e.getCategory(), e.getPriceEgp(), e.isActive(), e.getValidUntil());
    }

    private void audit(Actor actor, String type, String entityId) {
        auditTrail.event(type).actor(actor.subject(), actor.label()).entity("PricingCatalog", entityId).action("MANAGE").record();
    }
}
