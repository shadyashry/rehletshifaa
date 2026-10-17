package com.rehletshifaa.clinic.application;

import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.rehletshifaa.authority.application.*;
import com.rehletshifaa.authority.domain.Permission;
import com.rehletshifaa.clinic.domain.*;
import com.rehletshifaa.clinic.infrastructure.*;
import com.rehletshifaa.directory.domain.PractitionerProfile;
import com.rehletshifaa.directory.infrastructure.PractitionerProfileRepository;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.audit.AuditTrail;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.Clock;
import java.util.*;

@Service
public class ConsultantPublicProfileService {
    private final ConsultantDirectoryRepository profiles;
    private final PractitionerProfileRepository practitioners;
    private final CareCategoryRepository categories;
    private final Authority authority;
    private final AuditTrail audit;
    private final ConsultantDirectoryChanges changes;
    private final ObjectMapper json;
    private final Clock clock;
    public ConsultantPublicProfileService(ConsultantDirectoryRepository profiles, PractitionerProfileRepository practitioners,
            CareCategoryRepository categories, Authority authority, AuditTrail audit, ConsultantDirectoryChanges changes, ObjectMapper json, Clock clock) {
        this.profiles=profiles; this.practitioners=practitioners; this.categories=categories; this.authority=authority;
        this.audit=audit; this.changes=changes; this.json=json; this.clock=clock;
    }
    public record Edit(Long version, String slug, ConsultantPublicContent contentEn, ConsultantPublicContent contentAr) {
        @JsonAnySetter public void unknown(String key,Object value) { throw new IllegalArgumentException("Unknown profile field"); }
    }
    public record Revision(Long version) {
        @JsonAnySetter public void unknown(String key,Object value) { throw new IllegalArgumentException("Unknown profile field"); }
    }
    public record OrderItem(UUID practitionerId, Long version, int sortOrder) {
        @JsonAnySetter public void unknown(String key,Object value) { throw new IllegalArgumentException("Unknown profile field"); }
    }
    public record ReorderRequest(List<OrderItem> items) {
        @JsonAnySetter public void unknown(String key,Object value) { throw new IllegalArgumentException("Unknown profile field"); }
    }
    public record View(UUID practitionerId, String slug, boolean published, boolean everPublished, int sortOrder,
            long version, String careArea, ConsultantPublicContent contentEn, ConsultantPublicContent contentAr) {}

    public record Summary(UUID practitionerId, String slug, boolean published, int sortOrder, long version, boolean affiliationReady, boolean priceListReady) {}
    @Transactional(readOnly=true)
    public List<Summary> list() {
        authority.authorize(authority.allowed(Permission.CONSULTANT_PROFILE_MANAGE, Resource.platform())
                ? Permission.CONSULTANT_PROFILE_MANAGE : Permission.CREDENTIAL_READ);
        return profiles.findSummaries(clock.instant(),java.time.LocalDate.now(clock)).stream().map(p -> new Summary(
                p.getPractitionerId(),p.getSlug(),Boolean.TRUE.equals(p.getPublished()),p.getSortOrder()==null ? 0 : p.getSortOrder(),
                p.getVersion()==null ? -1 : p.getVersion(),p.getAffiliationReady(),p.getPriceListReady())).toList();
    }
    @Transactional(readOnly=true)
    public View get(UUID id) {
        authority.authorize(authority.allowed(Permission.CONSULTANT_PROFILE_MANAGE, Resource.platform())
                ? Permission.CONSULTANT_PROFILE_MANAGE : Permission.CREDENTIAL_READ);
        PractitionerProfile practitioner = consultant(id, false);
        return profiles.findById(id).map(p -> view(p, practitioner)).orElse(new View(id, "", false, false, 0, -1, practitioner.getCareCategory(), null, null));
    }
    @Transactional
    public View save(UUID id, Edit request) {
        Actor actor = authority.authorize(Permission.CONSULTANT_PROFILE_MANAGE);
        PractitionerProfile practitioner = consultant(id, true);
        if (request.slug() == null || !request.slug().matches("[a-z0-9]+(?:-[a-z0-9]+)*") || request.slug().length()>80)
            throw new ApiException(400,"INVALID_PROFILE_SLUG","Use a lowercase URL slug of at most 80 characters");
        if (request.contentEn()==null || request.contentAr()==null) throw new ApiException(400,"PROFILE_CONTENT_REQUIRED","English and Arabic content are required");
        if (profiles.existsBySlugAndPractitionerIdNot(request.slug(),id)) throw new ApiException(409,"PROFILE_SLUG_EXISTS","This URL slug is already in use");
        var profile=profiles.findById(id).orElse(null);
        boolean created = profile == null;
        if (profile==null) {
            checkVersion(-1,request.version());
            profile=ConsultantDirectoryProfile.create(id,request.slug(),encode(request.contentEn()),encode(request.contentAr()),clock.instant());
        } else {
            checkVersion(profile.getVersion(), request.version());
            if (profile.isEverPublished() && !profile.getSlug().equals(request.slug())) {
                throw new ApiException(409, "PROFILE_SLUG_IMMUTABLE", "A previously published profile keeps its URL");
            }
            profile.editContent(request.slug(), encode(request.contentEn()), encode(request.contentAr()), clock.instant());
        }
        persist(profile);
        changes.enqueue(profile, created ? "profile-create" : "profile-edit");
        record(actor, profile, created ? "CREATE" : "EDIT", "slug,contentEn,contentAr");
        return view(profile,practitioner);
    }
    @Transactional
    public View publish(UUID id, Revision request) { return publication(id,request,true); }
    @Transactional
    public View unpublish(UUID id, Revision request) { return publication(id,request,false); }
    private View publication(UUID id,Revision request,boolean publish) {
        Actor actor=authority.authorize(Permission.CONSULTANT_PROFILE_MANAGE);
        PractitionerProfile practitioner=consultant(id,true);
        var profile=profile(id); checkVersion(profile.getVersion(),request.version());
        if (publish) {
            if (!practitioner.isAccountEnabled() || Set.of("SUSPENDED","OFFBOARDING","OFFBOARDED").contains(practitioner.getConsultantLifecycleStatus()))
                throw new ApiException(409,"PROFILE_NOT_PUBLISHABLE","The consultant account must be enabled and active");
            if (practitioner.getCareCategory()==null || !categories.existsBySlug(practitioner.getCareCategory()))
                throw new ApiException(409,"PROFILE_CARE_AREA_REQUIRED","The consultant needs a managed care area");
            decode(profile.getContentEn()); decode(profile.getContentAr()); profile.publish(clock.instant());
        } else profile.unpublish(clock.instant());
        persist(profile); changes.enqueue(profile,publish ? "profile-publish" : "profile-unpublish"); record(actor,profile,publish ? "PUBLISH" : "UNPUBLISH","published"); return view(profile,practitioner);
    }
    @Transactional
    public List<View> reorder(ReorderRequest request) {
        Actor actor=authority.authorize(Permission.CONSULTANT_PROFILE_MANAGE);
        if (request.items()==null || request.items().isEmpty() || request.items().size()>200
                || request.items().stream().anyMatch(i -> i==null || i.practitionerId()==null || i.sortOrder()<0 || i.sortOrder()>100000)
                || request.items().stream().map(OrderItem::practitionerId).distinct().count()!=request.items().size())
            throw new ApiException(400,"INVALID_PROFILE_ORDER","Provide unique profiles and nonnegative display positions");
        List<View> result=new ArrayList<>();
        for (OrderItem item:request.items().stream().sorted(Comparator.comparing(OrderItem::practitionerId)).toList()) {
            var practitioner=consultant(item.practitionerId(),true); var profile=profile(item.practitionerId());
            checkVersion(profile.getVersion(),item.version()); profile.reorder(item.sortOrder(),clock.instant());
            persist(profile); changes.enqueue(profile,"profile-reorder"); record(actor,profile,"REORDER","sortOrder"); result.add(view(profile,practitioner));
        }
        return result;
    }
    private PractitionerProfile consultant(UUID id,boolean lock) {
        return (lock ? practitioners.lockById(id) : practitioners.findById(id)).filter(p -> "CONSULTANT".equals(p.getPractitionerType()))
                .orElseThrow(() -> new ApiException(404,"CONSULTANT_NOT_FOUND","Consultant was not found"));
    }
    private ConsultantDirectoryProfile profile(UUID id) { return profiles.findById(id).orElseThrow(() -> new ApiException(404,"PUBLIC_PROFILE_NOT_FOUND","Public profile was not found")); }
    private void persist(ConsultantDirectoryProfile profile) {
        try { profiles.saveAndFlush(profile); }
        catch (DataIntegrityViolationException | OptimisticLockingFailureException e) { throw new ApiException(409,"PROFILE_CONFLICT","The profile changed or its URL slug is already in use"); }
    }
    private View view(ConsultantDirectoryProfile p,PractitionerProfile practitioner) { return new View(p.getPractitionerId(),p.getSlug(),p.isPublished(),p.isEverPublished(),p.getSortOrder(),p.getVersion(),practitioner.getCareCategory(),decode(p.getContentEn()),decode(p.getContentAr())); }
    private String encode(ConsultantPublicContent content) { try { return json.writeValueAsString(content); } catch (Exception e) { throw new ApiException(400,"INVALID_PROFILE_CONTENT","Invalid public profile content"); } }
    private ConsultantPublicContent decode(String value) { try { return json.readerFor(ConsultantPublicContent.class).with(com.fasterxml.jackson.databind.DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES).readValue(value); } catch (Exception e) { throw new ApiException(400,"INVALID_PROFILE_CONTENT","Complete the English and Arabic public profile content"); } }
    private void record(Actor actor,ConsultantDirectoryProfile p,String action,String fields) { audit.event("CONSULTANT_PUBLIC_PROFILE_"+action).actor(actor.subject(),actor.label()).entity("Practitioner",p.getPractitionerId()).action(action).reason("fields="+fields+" version="+p.getVersion()).record(); }
    private static void checkVersion(long actual,Long expected) { if (expected==null) throw new ApiException(400,"PROFILE_VERSION_REQUIRED","Provide the profile version"); if (actual!=expected) throw new ApiException(409,"PROFILE_VERSION_CONFLICT","The profile changed; reload before saving"); }
}
