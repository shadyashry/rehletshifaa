package com.rehletshifaa.journey.application;

import com.rehletshifaa.journey.api.JourneyDtos.*;
import com.rehletshifaa.shared.api.ApiException;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;

@SpringBootTest(properties = "spring.task.scheduling.enabled=false")
@Transactional
class PricingCatalogServiceTest {
    @Autowired PricingCatalogService pricing;
    @Autowired JourneyService journey;
    @Autowired JdbcTemplate jdbc;
    @AfterEach void clear() { SecurityContextHolder.clearContext(); }

    private UUID seedVerifiedCardiologist() { return seedConsultant("doctor-subject", "cardiology"); }
    private UUID seedConsultant(String subject, String careArea) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO practitioner_profiles(id,external_subject,legal_name,display_name,credentialing_status,practitioner_type,availability_status,care_category,created_at,updated_at,version) VALUES(?,?,?,?,?,?,?,?,?,?,0)",
                id, subject, "Dr X", "Dr X", "VERIFIED", "CONSULTANT", "AVAILABLE", careArea, Instant.now(), Instant.now());
        return id;
    }

    @Test void seedsFromTemplateThenAdminEditReflectsOnDoctorPage() {
        UUID practitionerId = seedVerifiedCardiologist();

        authenticate("admin-subject", "CREDENTIALING_ADMIN");
        ServiceTemplateView template = pricing.templates("cardiology").stream().findFirst().orElseThrow();
        assertThat(pricing.templateItems(template.id())).hasSize(11);

        IdResponse seeded = pricing.seedFromTemplate(practitionerId, template.id());
        assertThat(seeded.status()).contains("11");
        List<CatalogServiceView> catalog = pricing.practitionerCatalog(practitionerId);
        assertThat(catalog).hasSize(11).allSatisfy(s -> assertThat(s.active()).isTrue());
        // Re-seeding is idempotent by service_code.
        assertThat(pricing.seedFromTemplate(practitionerId, template.id()).status()).contains("0");

        // Admin changes a price; the doctor's live catalog reflects it immediately.
        CatalogServiceView angio = catalog.stream().filter(s -> s.serviceCode().equals("CARD-ANGIO")).findFirst().orElseThrow();
        pricing.updateCatalogService(practitionerId, angio.id(),
                new CatalogServiceRequest("CARD-ANGIO", "Diagnostic coronary angiography", "Procedures", new BigDecimal("90000.00"), true, null));

        authenticate("doctor-subject", "DOCTOR");
        assertThat(pricing.myCatalog()).filteredOn(s -> s.serviceCode().equals("CARD-ANGIO"))
                .singleElement().satisfies(s -> assertThat(s.priceEgp()).isEqualByComparingTo("90000.00"));
    }

    @Test void rejectsDuplicateServiceCode() {
        UUID practitionerId = seedVerifiedCardiologist();
        authenticate("admin-subject", "CREDENTIALING_ADMIN");
        CatalogServiceRequest req = new CatalogServiceRequest("CUSTOM-1", "Custom service", "Procedures", new BigDecimal("1000.00"), true, null);
        pricing.addCatalogService(practitionerId, req);
        assertThatThrownBy(() -> pricing.addCatalogService(practitionerId, req))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("already exists");
    }

    @Test void adminFxOverrideWinsAndShowsInEffectiveRates() {
        authenticate("admin-subject", "CREDENTIALING_ADMIN");
        pricing.setFxOverride("USD", new FxOverrideRequest(new BigDecimal("0.02000000"), null));
        assertThat(pricing.fxRates(null))
                .anySatisfy(r -> { assertThat(r.currency()).isEqualTo("EGP"); assertThat(r.rate()).isEqualByComparingTo("1"); })
                .anySatisfy(r -> { assertThat(r.currency()).isEqualTo("USD"); assertThat(r.source()).isEqualTo("MANUAL"); assertThat(r.rate()).isEqualByComparingTo("0.02"); });
    }

    @Test void derivesFromOwnCareAreaTemplate() {
        UUID practitionerId = seedVerifiedCardiologist();
        authenticate("admin-subject", "CREDENTIALING_ADMIN");
        assertThat(pricing.deriveFromCareArea(practitionerId).status()).contains("11");
        assertThat(pricing.practitionerCatalog(practitionerId)).hasSize(11);
    }

    @Test void rejectsTemplateFromDifferentCareArea() {
        UUID rheumaConsultant = seedConsultant("rheuma-subject", "rheumatology-rehabilitation");
        authenticate("admin-subject", "CREDENTIALING_ADMIN");
        UUID cardiologyTemplate = pricing.templates("cardiology").stream().findFirst().orElseThrow().id();
        assertThatThrownBy(() -> pricing.seedFromTemplate(rheumaConsultant, cardiologyTemplate))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("does not match");
    }

    @Test void newConsultantAutomaticallyGetsOwnDerivedPriceList() {
        authenticate("admin-subject", "CREDENTIALING_ADMIN");
        var created = journey.createPractitioner(new PractitionerRequest("Dr New", "Dr New", "doc-new-subject", null, "Cardiology", null, null, null, null, null, null, null, null, "AVAILABLE", null, "CONSULTANT", "cardiology"));
        // Each consultant starts with their own list, isolated from any other consultant's.
        assertThat(pricing.practitionerCatalog(created.id())).hasSize(11).allSatisfy(s -> assertThat(s.priceEgp()).isNotNull());
    }

    @Test void doctorCannotManageCatalog() {
        UUID practitionerId = seedVerifiedCardiologist();
        authenticate("doctor-subject", "DOCTOR");
        assertThatThrownBy(() -> pricing.practitionerCatalog(practitionerId)).isInstanceOf(ApiException.class);
    }

    private void authenticate(String subject, String role) {
        Jwt jwt = Jwt.withTokenValue("test").header("alg", "none").subject(subject)
                .claim("auth_time", Instant.now().getEpochSecond()).issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(3600)).build();
        SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(jwt, List.of(new SimpleGrantedAuthority("ROLE_" + role)), subject));
    }
}
