package com.rehletshifaa.facility.api;

import com.rehletshifaa.facility.api.FacilityDtos.AccreditationRequest;
import com.rehletshifaa.facility.api.FacilityDtos.CareAreaView;
import com.rehletshifaa.facility.api.FacilityDtos.DecisionRequest;
import com.rehletshifaa.facility.api.FacilityDtos.FacilityRequest;
import com.rehletshifaa.facility.api.FacilityDtos.FacilityStatusRequest;
import com.rehletshifaa.facility.api.FacilityDtos.FacilityView;
import com.rehletshifaa.facility.api.FacilityDtos.PackageRequest;
import com.rehletshifaa.facility.api.FacilityDtos.PackageView;
import com.rehletshifaa.facility.application.FacilityCatalogService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

/** Control Center: facilities and their package catalogue. Every call is decided by the authority core inside the service. */
@RestController
@RequestMapping("/api/v1/admin/facilities")
public class FacilityAdminController {
    private final FacilityCatalogService catalog;

    public FacilityAdminController(FacilityCatalogService catalog) { this.catalog = catalog; }

    @GetMapping public List<FacilityView> list() { return catalog.list(); }
    @GetMapping("/pending-packages") public List<PackageView> pendingPackages() { return catalog.pendingPackages(); }
    @GetMapping("/care-areas") public List<CareAreaView> careAreas() { return catalog.careAreas(); }
    @PostMapping public FacilityView create(@Valid @RequestBody FacilityRequest request) { return catalog.create(request); }
    @GetMapping("/{facilityId}") public FacilityView get(@PathVariable UUID facilityId) { return catalog.get(facilityId); }
    @PutMapping("/{facilityId}") public FacilityView update(@PathVariable UUID facilityId, @Valid @RequestBody FacilityRequest request) { return catalog.update(facilityId, request); }
    @PutMapping("/{facilityId}/status") public FacilityView status(@PathVariable UUID facilityId, @Valid @RequestBody FacilityStatusRequest request) { return catalog.setStatus(facilityId, request); }
    @PostMapping("/{facilityId}/accreditations") public FacilityView recordAccreditation(@PathVariable UUID facilityId, @Valid @RequestBody AccreditationRequest request) { return catalog.recordAccreditation(facilityId, request); }
    @PostMapping("/{facilityId}/accreditations/{accreditationId}/withdraw") public FacilityView withdrawAccreditation(@PathVariable UUID facilityId, @PathVariable UUID accreditationId) { return catalog.withdrawAccreditation(facilityId, accreditationId); }
    @PostMapping("/{facilityId}/packages") public PackageView propose(@PathVariable UUID facilityId, @Valid @RequestBody PackageRequest request) { return catalog.propose(facilityId, request); }
    @PostMapping("/{facilityId}/packages/{packageId}/approve") public PackageView approve(@PathVariable UUID facilityId, @PathVariable UUID packageId, @RequestBody(required = false) @Valid DecisionRequest request) { return catalog.approve(facilityId, packageId, request); }
    @PostMapping("/{facilityId}/packages/{packageId}/reject") public PackageView reject(@PathVariable UUID facilityId, @PathVariable UUID packageId, @RequestBody(required = false) @Valid DecisionRequest request) { return catalog.reject(facilityId, packageId, request); }
    @PostMapping("/{facilityId}/packages/{packageId}/retire") public PackageView retire(@PathVariable UUID facilityId, @PathVariable UUID packageId, @RequestBody(required = false) @Valid DecisionRequest request) { return catalog.retire(facilityId, packageId, request); }
}
