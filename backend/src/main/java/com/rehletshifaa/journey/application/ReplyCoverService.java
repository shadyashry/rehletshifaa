package com.rehletshifaa.journey.application;

import com.rehletshifaa.authority.application.Authority;
import com.rehletshifaa.authority.application.Principal;
import com.rehletshifaa.authority.application.Resource;
import com.rehletshifaa.authority.domain.Permission;
import com.rehletshifaa.journey.api.WorkDtos.WorkCopy;
import com.rehletshifaa.journey.domain.ReplyCover;
import com.rehletshifaa.journey.infrastructure.ReplyCoverRepository;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.audit.AuditTrail;
import com.rehletshifaa.workforce.application.WorkforceDirectory;
import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/**
 * Reply covers (docs/patient-communication-whatsapp-routing.md R8): while a coordinator is away, one other coordinator
 * answers their patients and the owner reads only. Set by the coordinator themselves, their lead, or a Care Coordination
 * Manager. A long absence is a reassignment, not a cover. Covers never chain: the cover may not be away, and the owner
 * may not be covering someone else, during the period.
 */
@Service
public class ReplyCoverService {
    static final Duration MAX_PERIOD = Duration.ofDays(30);
    /** A cover "from now" typed a moment ago is still accepted. */
    static final Duration START_TOLERANCE = Duration.ofMinutes(5);
    private static final String COORDINATOR = "COORDINATOR";
    private static final String FUNCTION = "CARE_COORDINATION";

    private final ReplyCoverRepository covers;
    private final Authority authority;
    private final WorkforceDirectory workforce;
    private final StaffWorkService work;
    private final AuditTrail auditTrail;
    private final Clock clock;

    public ReplyCoverService(ReplyCoverRepository covers, Authority authority, WorkforceDirectory workforce, StaffWorkService work,
                             AuditTrail auditTrail, Clock clock) {
        this.covers = covers; this.authority = authority; this.workforce = workforce; this.work = work;
        this.auditTrail = auditTrail; this.clock = clock;
    }

    public record ReplyCoverView(UUID id, String ownerSubject, String ownerName, String coverSubject, String coverName,
                                 Instant startsAt, Instant endsAt, String reason, boolean active, boolean canRevoke) {}
    public record NewReplyCover(String ownerSubject, String coverSubject, Instant startsAt, Instant endsAt, String reason) {}

    /** Covers not yet over: a coordinator sees their own (as owner or cover) and their team's; a manager sees all. */
    @Transactional(readOnly = true)
    public List<ReplyCoverView> current() {
        String me = Principal.current().subject();
        authority.authorize(Permission.REPLY_COVER_MANAGE, Resource.ofSubject(me));
        Instant now = micros(clock.instant());
        List<ReplyCover> rows;
        if (authority.allowed(Permission.REPLY_COVER_MANAGE, Resource.platform())) rows = covers.findCurrent(now);
        else {
            Set<String> people = new HashSet<>(workforce.supervised(me, FUNCTION));
            people.add(me);
            rows = covers.findCurrentFor(people, now);
        }
        return rows.stream().map(c -> view(c, now)).toList();
    }

    @Transactional
    public ReplyCoverView create(NewReplyCover request) {
        String me = Principal.current().subject();
        String owner = request.ownerSubject() == null || request.ownerSubject().isBlank() ? me : request.ownerSubject().trim();
        authority.authorize(Permission.REPLY_COVER_MANAGE, Resource.ofSubject(owner));
        String cover = request.coverSubject() == null ? "" : request.coverSubject().trim();
        Instant now = micros(clock.instant());
        if (cover.isBlank() || cover.equals(owner)) throw new ApiException(422, "COVER_INVALID", "Choose another coordinator to cover");
        if (!workforce.holds(owner, COORDINATOR) || !workforce.holds(cover, COORDINATOR))
            throw new ApiException(422, "COVER_NOT_COORDINATOR", "Both people must be active coordinators");
        Instant from = request.startsAt(), to = request.endsAt();
        if (from == null || to == null || !to.isAfter(from)) throw new ApiException(422, "COVER_PERIOD_INVALID", "The cover must end after it starts");
        if (from.isBefore(now.minus(START_TOLERANCE))) throw new ApiException(422, "COVER_IN_PAST", "A cover cannot start in the past");
        if (to.isBefore(now)) throw new ApiException(422, "COVER_IN_PAST", "A cover cannot end in the past");
        if (Duration.between(from, to).compareTo(MAX_PERIOD) > 0)
            throw new ApiException(422, "COVER_TOO_LONG", "Covers last at most 30 days; reassign the cases for a longer absence");
        for (ReplyCover existing : covers.findOverlapping(List.of(owner, cover), micros(from), micros(to))) {
            if (existing.getOwnerSubject().equals(owner))
                throw new ApiException(409, "COVER_OVERLAPS", "This coordinator already has a cover during that period");
            if (existing.getOwnerSubject().equals(cover))
                throw new ApiException(409, "COVER_UNAVAILABLE", "The chosen cover is away during that period");
            if (existing.getCoverSubject().equals(owner))
                throw new ApiException(409, "OWNER_IS_COVERING", "This coordinator is covering someone else during that period");
        }
        String reason = request.reason() == null || request.reason().isBlank() ? null : request.reason().trim();
        if (reason != null && reason.length() > 500) throw new ApiException(422, "COVER_REASON_TOO_LONG", "Keep the reason under 500 characters");
        ReplyCover saved = covers.saveAndFlush(new ReplyCover(UUID.randomUUID(), owner, cover, from, to, reason, me, now));
        work.notifyStaff(cover, null, null, "REPLY_COVER_ASSIGNED", "You are covering a colleague's patient conversations",
                "Their cases appear in your case list while the cover lasts; only you can reply to their patients meanwhile.",
                "reply-cover:" + saved.getId(), true, WorkCopy.of("REPLY_COVER_ASSIGNED", "owner", name(owner)));
        auditTrail.event("REPLY_COVER_CREATED").actor(me, "COORDINATION").entity("ReplyCover", saved.getId().toString())
                .action("CREATE").record();
        return view(saved, now);
    }

    @Transactional
    public ReplyCoverView revoke(UUID id) {
        ReplyCover cover = covers.lockById(id).orElseThrow(() -> new ApiException(404, "COVER_NOT_FOUND", "Cover was not found"));
        String me = Principal.current().subject();
        authority.authorize(Permission.REPLY_COVER_MANAGE, Resource.ofSubject(cover.getOwnerSubject()));
        Instant now = micros(clock.instant());
        cover.revoke(me, now);
        covers.saveAndFlush(cover);
        auditTrail.event("REPLY_COVER_REVOKED").actor(me, "COORDINATION").entity("ReplyCover", id.toString()).action("REVOKE").record();
        return view(cover, now);
    }

    /** Who answers this coordinator's patients right now, and until when, when someone covers them. */
    @Transactional(readOnly = true)
    public Optional<ReplyCover> activeCoverOf(String owner) {
        return covers.findActive(owner, micros(clock.instant()), Limit.of(1)).stream().findFirst();
    }

    /** Coordinators whose patients this person is answering right now. */
    @Transactional(readOnly = true)
    public List<String> ownersCoveredBy(String cover) {
        return covers.findOwnersCoveredBy(cover, micros(clock.instant()));
    }

    String name(String subject) {
        return workforce.contact(subject).map(WorkforceDirectory.Contact::displayName).orElse(null);
    }

    private ReplyCoverView view(ReplyCover c, Instant now) {
        boolean active = c.getRevokedAt() == null && !c.getStartsAt().isAfter(now) && c.getEndsAt().isAfter(now);
        return new ReplyCoverView(c.getId(), c.getOwnerSubject(), name(c.getOwnerSubject()), c.getCoverSubject(), name(c.getCoverSubject()),
                c.getStartsAt(), c.getEndsAt(), c.getReason(), active,
                c.getRevokedAt() == null && authority.allowed(Permission.REPLY_COVER_MANAGE, Resource.ofSubject(c.getOwnerSubject())));
    }
}
