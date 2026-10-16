package com.rehletshifaa.compliance.application;

import com.rehletshifaa.authority.application.Authority;
import com.rehletshifaa.authority.domain.Permission;
import com.rehletshifaa.compliance.api.ComplianceDtos.ChangeOrderFigures;
import com.rehletshifaa.compliance.api.ComplianceDtos.FollowUpFigures;
import com.rehletshifaa.compliance.api.ComplianceDtos.OutcomeFigures;
import com.rehletshifaa.compliance.api.ComplianceDtos.QuoteFigures;
import com.rehletshifaa.compliance.api.ComplianceDtos.ReconciliationFigures;
import com.rehletshifaa.compliance.api.ComplianceDtos.SafetyFigures;
import com.rehletshifaa.compliance.api.ComplianceDtos.ScorecardView;
import com.rehletshifaa.compliance.infrastructure.ScorecardRepository;
import com.rehletshifaa.compliance.infrastructure.ScorecardRepository.QuoteRow;
import com.rehletshifaa.directory.domain.PractitionerProfile;
import com.rehletshifaa.directory.infrastructure.PractitionerProfileRepository;
import com.rehletshifaa.facility.application.FacilityCatalogService;
import com.rehletshifaa.facility.application.FacilityDirectory;
import com.rehletshifaa.shared.api.ApiException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static com.rehletshifaa.compliance.api.ComplianceDtos.MIN_ANSWERS;
import static com.rehletshifaa.compliance.api.ComplianceDtos.SMALL_COHORT;

/**
 * Scorecards per Consultant and per facility (P1-19, design §7.6, architecture §5.7), for Compliance and Consultant Operations
 * ({@code SCORECARD_READ}). Read-only. The cohort is the cases discharged in the period (Cairo dates, both inclusive); a Consultant's
 * are those where they are the case's active primary Consultant, a facility's those admitted there. Figures: the final quote against
 * the accepted estimate's maximum, change orders, unapproved extras and variances from the P1-17 reconciliation, complications,
 * adverse events, reopenings and patient concerns, follow-up contacts held, and the day-30/90 outcome aggregates.
 *
 * <p><b>Privacy (PDPL).</b> Outcome answers are read as aggregates only, never a row or any free text; the answers a representative
 * gave are counted apart ({@code byRepresentative}); averages are withheld below {@code MIN_ANSWERS} answers and a cohort under
 * {@code SMALL_COHORT} cases says so. Not cached: AGENTS.md keeps the cache for reference data, and a scorecard is computed from
 * live workflow tables on demand (the architecture's 10-minute cache is not taken up).
 */
@Service
public class ScorecardService {
    static final int DEFAULT_DAYS = 90, MAX_DAYS = 366;
    private static final ZoneId CAIRO = ZoneId.of("Africa/Cairo");

    private final Authority authority;
    private final Clock clock;
    private final ScorecardRepository scores;
    private final PractitionerProfileRepository practitioners;
    private final FacilityDirectory facilities;
    private final FacilityCatalogService catalog;

    public ScorecardService(Authority authority, Clock clock, ScorecardRepository scores, PractitionerProfileRepository practitioners,
                            FacilityDirectory facilities, FacilityCatalogService catalog) {
        this.authority = authority; this.clock = clock; this.scores = scores; this.practitioners = practitioners;
        this.facilities = facilities; this.catalog = catalog;
    }

    private record Period(LocalDate from, LocalDate to, Instant start, Instant end) {}

    @Transactional(readOnly = true)
    public ScorecardView consultant(UUID practitionerId, LocalDate from, LocalDate to) {
        authority.authorize(Permission.SCORECARD_READ);
        PractitionerProfile p = practitioners.findById(practitionerId).filter(x -> "CONSULTANT".equals(x.getPractitionerType()))
                .orElseThrow(() -> new ApiException(404, "CONSULTANT_NOT_FOUND", "This consultant does not exist"));
        Period period = period(from, to);
        List<UUID> cases = scores.consultantCohort(practitionerId, period.start(), period.end());
        int flags = cases.isEmpty() ? 0 : (int) scores.undeclaredFlagsOfConsultant(cases, practitionerId);
        return card("CONSULTANT", practitionerId, p.getDisplayName(), period, cases, flags, null);
    }

    @Transactional(readOnly = true)
    public ScorecardView facility(UUID facilityId, LocalDate from, LocalDate to) {
        authority.authorize(Permission.SCORECARD_READ);
        String name = facilities.names(List.of(facilityId)).get(facilityId);
        if (name == null) throw new ApiException(404, "FACILITY_NOT_FOUND", "This facility does not exist");
        Period period = period(from, to);
        List<UUID> cases = scores.facilityCohort(facilityId, period.start(), period.end());
        int flags = cases.isEmpty() ? 0 : (int) scores.undeclaredFlagsAtFacility(cases, facilityId);
        return card("FACILITY", facilityId, name, period, cases, flags, catalog.packagesSuspended(facilityId));
    }

    private ScorecardView card(String subject, UUID id, String name, Period period, List<UUID> cases, int flags, Boolean suspended) {
        boolean small = cases.size() < SMALL_COHORT;
        if (cases.isEmpty())
            return new ScorecardView(subject, id, name, period.from(), period.to(), 0, true, new QuoteFigures(0, 0, null, 0),
                    new ChangeOrderFigures(0, 0, 0), new ReconciliationFigures(0, 0, 0, 0, 0, BigDecimal.ZERO, 0),
                    new SafetyFigures(0, 0, 0, 0, 0), new FollowUpFigures(0, 0, null), List.of(), flags, suspended, "NOT_COLLECTED");
        var co = scores.changeOrders(cases);
        var rec = scores.reconciliations(cases);
        var extras = scores.lines(cases, "UNAPPROVED_EXTRA");
        var errors = scores.lines(cases, "BILLING_ERROR");
        var concerns = scores.patientConcerns(cases);
        var contacts = scores.contacts(cases);
        List<OutcomeFigures> outcomes = scores.outcomes(cases).stream().map(o -> {
            int answered = n(o.getAnswered());
            boolean suppressed = answered < MIN_ANSWERS;
            return new OutcomeFigures(o.getPoint(), n(o.getAsked()), answered, n(o.getByRepresentative()), n(o.getComplications()), suppressed,
                    suppressed ? null : avg(o.getPain()), suppressed ? null : avg(o.getFunctionScore()), suppressed ? null : avg(o.getSatisfaction()));
        }).toList();
        int complications = outcomes.stream().mapToInt(OutcomeFigures::complications).sum();
        int held = n(contacts.getHeld()), missed = n(contacts.getMissed());
        return new ScorecardView(subject, id, name, period.from(), period.to(), cases.size(), small, quotes(cases),
                new ChangeOrderFigures(n(co.getCases()), n(co.getOrders()), n(co.getEmergency())),
                new ReconciliationFigures(n(rec.getReconciled()), n(rec.getWithVariance()), n(rec.getDisputed()), n(extras.getCases()), n(extras.getLines()),
                        extras.getAmountEgp() == null ? BigDecimal.ZERO : extras.getAmountEgp(), n(errors.getLines())),
                new SafetyFigures(complications, (int) scores.casesWithIncident(cases, "ADVERSE_EVENT"), (int) scores.reopenedCases(cases),
                        n(concerns.getConcerns()), n(concerns.getDisputes())),
                new FollowUpFigures(held, missed, held + missed == 0 ? null : BigDecimal.valueOf(held).divide(BigDecimal.valueOf(held + missed), 4, RoundingMode.HALF_UP)),
                outcomes, flags, suspended, "NOT_COLLECTED");
    }

    /** Per case, the newest accepted final quote's expected total over the newest accepted estimate's maximum. */
    private QuoteFigures quotes(List<UUID> cases) {
        Map<UUID, QuoteRow> estimate = new HashMap<>(), quote = new HashMap<>();
        for (QuoteRow r : scores.acceptedQuotes(cases)) ("FINAL_TREATMENT_QUOTE".equals(r.getDocumentType()) ? quote : estimate).put(r.getCaseId(), r);
        BigDecimal sum = BigDecimal.ZERO;
        int comparable = 0, above = 0;
        for (Map.Entry<UUID, QuoteRow> e : quote.entrySet()) {
            if (Boolean.TRUE.equals(e.getValue().getAboveMaximum())) above++;
            QuoteRow est = estimate.get(e.getKey());
            if (est == null || est.getMaxEgp() == null || est.getMaxEgp().signum() <= 0 || e.getValue().getExpectedEgp() == null) continue;
            sum = sum.add(e.getValue().getExpectedEgp().divide(est.getMaxEgp(), 6, RoundingMode.HALF_UP));
            comparable++;
        }
        return new QuoteFigures(quote.size(), comparable, comparable == 0 ? null : sum.divide(BigDecimal.valueOf(comparable), 4, RoundingMode.HALF_UP), above);
    }

    /** Cairo dates, both inclusive; by default the last 90 days. At most a year. */
    private Period period(LocalDate from, LocalDate to) {
        LocalDate today = LocalDate.ofInstant(clock.instant(), CAIRO);
        LocalDate end = to == null ? today : to;
        LocalDate start = from == null ? end.minusDays(DEFAULT_DAYS - 1) : from;
        if (start.isAfter(end) || ChronoUnit.DAYS.between(start, end) >= MAX_DAYS)
            throw new ApiException(400, "PERIOD_INVALID", "Choose a period of at most a year, starting on or before its end");
        return new Period(start, end, start.atStartOfDay(CAIRO).toInstant(), end.plusDays(1).atStartOfDay(CAIRO).toInstant());
    }

    private static int n(Long v) { return v == null ? 0 : v.intValue(); }

    private static BigDecimal avg(Double v) { return v == null ? null : BigDecimal.valueOf(v).setScale(1, RoundingMode.HALF_UP); }
}
