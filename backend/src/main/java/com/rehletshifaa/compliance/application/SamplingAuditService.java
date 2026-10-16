package com.rehletshifaa.compliance.application;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.rehletshifaa.authority.application.Actor;
import com.rehletshifaa.authority.application.Authority;
import com.rehletshifaa.authority.domain.Permission;
import com.rehletshifaa.casemanagement.infrastructure.MedicalCaseRepository;
import com.rehletshifaa.compliance.api.ComplianceDtos.SampleCaseView;
import com.rehletshifaa.compliance.api.ComplianceDtos.SampleRequest;
import com.rehletshifaa.compliance.api.ComplianceDtos.SampleReviewRequest;
import com.rehletshifaa.compliance.api.ComplianceDtos.SampleSummary;
import com.rehletshifaa.compliance.api.ComplianceDtos.SampleView;
import com.rehletshifaa.compliance.domain.AuditSample;
import com.rehletshifaa.compliance.domain.AuditSampleCase;
import com.rehletshifaa.compliance.infrastructure.AuditSampleCaseRepository;
import com.rehletshifaa.compliance.infrastructure.AuditSampleRepository;
import com.rehletshifaa.compliance.infrastructure.SampleSourceRepository;
import com.rehletshifaa.compliance.infrastructure.SampleSourceRepository.Closed;
import com.rehletshifaa.directory.domain.PractitionerProfile;
import com.rehletshifaa.directory.infrastructure.PractitionerProfileRepository;
import com.rehletshifaa.facility.application.FacilityDirectory;
import com.rehletshifaa.journey.application.EvidenceLedger;
import com.rehletshifaa.journey.application.IncidentService;
import com.rehletshifaa.journey.application.SettlementBasis;
import com.rehletshifaa.journey.domain.CaseEvidence;
import com.rehletshifaa.journey.domain.CaseIncident;
import com.rehletshifaa.settlement.domain.Reconciliation;
import com.rehletshifaa.settlement.domain.Statement;
import com.rehletshifaa.settlement.infrastructure.ReconciliationRepository;
import com.rehletshifaa.settlement.infrastructure.StatementRepository;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.audit.AuditTrail;
import com.rehletshifaa.shared.scheduling.application.LeasedJob;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Limit;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.time.YearMonth;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * The monthly sampling audit (P1-19, design §7.8, architecture §5.7). On the first of each month the scheduler samples the cases
 * closed in the month before (one MONTHLY sample per month); Compliance can draw more at any time ({@code COMPLIANCE_REVIEW}). Only
 * cases that went to a facility are sampled. For each case the money record is assembled once, when drawn: the latest statement,
 * the hospital's final invoice, the countersigned cashier receipts, the accepted final quote's lines by payee and the
 * reconciliation; then the mismatches between them are named ({@link Mismatch}). Compliance reviews each sampled case: no finding,
 * or a finding with a note, which becomes a case incident (P1-13, a {@code DISPUTE} a Care Coordination Manager owns).
 *
 * <p>Read-only over the other modules: amounts, references and ids only, never clinical content (AUD-05) or free text; the finding
 * note is encrypted and never in audit.
 */
@Service
public class SamplingAuditService {
    /** What can disagree in a sampled case's money record. */
    public enum Mismatch {
        STATEMENT_MISSING, FINAL_INVOICE_MISSING, RECONCILIATION_NOT_SETTLED, CHARGED_NOT_ON_STATEMENT, PAID_AT_FACILITY_ABOVE_RECEIPTS,
        FINAL_QUOTE_NOT_SEPARATED, UNAPPROVED_EXTRA, UNDECLARED_FACILITY, FACILITY_DISPUTE_OPEN
    }

    static final String ORIGIN = "AUDIT_SAMPLE";
    private static final ZoneId CAIRO = ZoneId.of("Africa/Cairo");

    private final Authority authority;
    private final Clock clock;
    private final AuditTrail auditTrail;
    private final AuditSampleRepository samples;
    private final AuditSampleCaseRepository sampleCases;
    private final SampleSourceRepository sources;
    private final StatementRepository statements;
    private final ReconciliationRepository reconciliations;
    private final EvidenceLedger ledger;
    private final SettlementBasis basis;
    private final IncidentService incidents;
    private final MedicalCaseRepository cases;
    private final PractitionerProfileRepository practitioners;
    private final FacilityDirectory facilities;
    private final ObjectMapper json;
    private final int monthlySize;
    private final SecureRandom random = new SecureRandom();

    public SamplingAuditService(Authority authority, Clock clock, AuditTrail auditTrail, AuditSampleRepository samples, AuditSampleCaseRepository sampleCases,
                                SampleSourceRepository sources, StatementRepository statements, ReconciliationRepository reconciliations,
                                EvidenceLedger ledger, SettlementBasis basis, IncidentService incidents, MedicalCaseRepository cases,
                                PractitionerProfileRepository practitioners, FacilityDirectory facilities, ObjectMapper json,
                                @Value("${app.compliance.monthly-sample-size:5}") int monthlySize) {
        this.authority = authority; this.clock = clock; this.auditTrail = auditTrail; this.samples = samples; this.sampleCases = sampleCases;
        this.sources = sources; this.statements = statements; this.reconciliations = reconciliations; this.ledger = ledger; this.basis = basis;
        this.incidents = incidents; this.cases = cases; this.practitioners = practitioners; this.facilities = facilities; this.json = json;
        this.monthlySize = Math.max(1, Math.min(50, monthlySize));
    }

    // ---- drawing ----

    /** On the first of the month (Cairo): the MONTHLY sample of the month before, once. Returns the cases sampled. */
    @LeasedJob(maxHold = LeasedJob.DAILY)
    @Scheduled(cron = "${app.compliance.sample-cron:0 30 5 1 * *}", zone = "Africa/Cairo")
    @Transactional
    public int drawMonthly() {
        YearMonth month = YearMonth.from(clock.instant().atZone(CAIRO)).minusMonths(1);
        if (samples.existsByMonthlyOf(month.toString())) return 0;
        return draw(month, monthlySize, AuditSample.Kind.MONTHLY, "SYSTEM").cases().size();
    }

    /** Compliance draws an extra sample of a month that has ended or is under way. */
    @Transactional
    public SampleView drawOnDemand(SampleRequest request) {
        Actor actor = authority.authorize(Permission.COMPLIANCE_REVIEW);
        YearMonth month = YearMonth.parse(request.month());
        if (month.isAfter(YearMonth.from(clock.instant().atZone(CAIRO))))
            throw new ApiException(400, "SAMPLE_MONTH_INVALID", "Choose a month that has started");
        SampleView view = draw(month, request.size(), AuditSample.Kind.ON_DEMAND, actor.subject());
        auditTrail.event("AUDIT_SAMPLE_DRAWN").actor(actor.subject(), actor.label()).entity("AuditSample", view.sample().id()).action("DRAW")
                .reason("month=" + month + "; size=" + request.size() + "; sampled=" + view.cases().size()).record();
        return view;
    }

    private SampleView draw(YearMonth month, int size, AuditSample.Kind kind, String by) {
        Instant now = clock.instant();
        Instant from = month.atDay(1).atStartOfDay(CAIRO).toInstant(), to = month.plusMonths(1).atDay(1).atStartOfDay(CAIRO).toInstant();
        List<Closed> candidates = new ArrayList<>(sources.closedBetween(from, to).stream().filter(c -> basis.facilityId(c.getCaseId()).isPresent()).toList());
        Collections.shuffle(candidates, random);
        List<Closed> picked = candidates.subList(0, Math.min(size, candidates.size()));
        AuditSample sample = samples.saveAndFlush(new AuditSample(month.toString(), kind, size, candidates.size(), by, now));
        for (Closed c : picked) sampleCases.save(assemble(sample.getId(), c));
        sampleCases.flush();
        if (kind == AuditSample.Kind.MONTHLY)
            auditTrail.event("AUDIT_SAMPLE_DRAWN").actor("SYSTEM", "SYSTEM").entity("AuditSample", sample.getId()).action("DRAW")
                    .reason("month=" + month + "; size=" + size + "; sampled=" + picked.size()).at(now).record();
        return view(sample);
    }

    /** The case's money record and its mismatches, as they stand now. */
    private AuditSampleCase assemble(UUID sampleId, Closed closed) {
        UUID caseId = closed.getCaseId();
        UUID facilityId = basis.facilityId(caseId).orElse(null);
        UUID practitionerId = sources.primaryConsultant(caseId, Limit.of(1)).stream().findFirst().orElse(null);
        Map<String, String> record = new LinkedHashMap<>();
        List<Mismatch> found = new ArrayList<>();

        Optional<Statement> statement = statements.findByCaseIdOrderByIssuedAtDescRevisionDesc(caseId).stream().findFirst();
        Statement.Totals st = statement.map(Statement::totals).orElse(null);
        statement.ifPresent(s -> {
            put(record, "statementNumber", s.getStatementNumber());
            put(record, "statementKind", s.getKind().name());
            put(record, "statementRevision", String.valueOf(s.getRevision()));
            put(record, "statementMedicalChargedEgp", st.medicalChargedEgp());
            put(record, "statementPlatformFeeEgp", st.platformFeeEgp());
            put(record, "statementTotalChargedEgp", st.totalChargedEgp());
            put(record, "statementDepositPaidEgp", st.depositPaidEgp());
            put(record, "statementPaidAtFacilityEgp", st.paidAtFacilityEgp());
            put(record, "statementRefundedEgp", st.refundedEgp());
            put(record, "statementBalanceDueEgp", st.balanceDueEgp());
            put(record, "statementCreditDueEgp", st.creditDueEgp());
        });
        if (statement.isEmpty()) found.add(Mismatch.STATEMENT_MISSING);

        Optional<CaseEvidence> invoice = ledger.latest(caseId, CaseEvidence.Kind.FINAL_INVOICE);
        invoice.ifPresent(i -> { put(record, "finalInvoiceNumber", i.getReference()); put(record, "finalInvoiceEgp", i.getAmountEgp()); });
        if (invoice.isEmpty()) found.add(Mismatch.FINAL_INVOICE_MISSING);

        BigDecimal receipts = basis.money(caseId).admissionReceiptsEgp();
        put(record, "receiptsEgp", receipts);

        Optional<UUID> finalQuote = sources.acceptedFinalQuote(caseId, Limit.of(1)).stream().findFirst();
        Map<String, BigDecimal> payees = new LinkedHashMap<>();
        finalQuote.ifPresent(v -> sources.payeeTotals(v).forEach(p -> payees.merge(p.getPayee(), p.getTotalEgp(), BigDecimal::add)));
        payees.forEach((payee, total) -> put(record, "finalQuote" + payee + "Egp", total));
        if (finalQuote.isEmpty() || !payees.containsKey("CONSULTANT") || !payees.containsKey("FACILITY")) found.add(Mismatch.FINAL_QUOTE_NOT_SEPARATED);

        Optional<Reconciliation> reconciliation = reconciliations.findByCaseId(caseId).filter(Reconciliation::settled);
        reconciliation.ifPresent(r -> {
            put(record, "reconciliationStatus", r.getStatus().name());
            put(record, "reconciliationInvoiceEgp", r.getInvoiceTotalEgp());
            put(record, "reconciliationAuthorisedEgp", r.getAuthorisedEgp());
            put(record, "reconciliationChargedEgp", r.getChargedEgp());
            put(record, "reconciliationVarianceEgp", r.getVarianceEgp());
            put(record, "reconciliationDisputedEgp", r.getDisputedEgp());
            put(record, "reconciliationPaidAtFacilityEgp", r.getPaidAtFacilityEgp());
            if (r.getStatus() == Reconciliation.Status.DISPUTED) found.add(Mismatch.FACILITY_DISPUTE_OPEN);
            if (st != null && r.getChargedEgp() != null && st.medicalChargedEgp() != null && r.getChargedEgp().compareTo(st.medicalChargedEgp()) != 0)
                found.add(Mismatch.CHARGED_NOT_ON_STATEMENT);
        });
        if (reconciliation.isEmpty()) found.add(Mismatch.RECONCILIATION_NOT_SETTLED);
        if (st != null && st.paidAtFacilityEgp() != null && receipts != null && st.paidAtFacilityEgp().compareTo(receipts) > 0)
            found.add(Mismatch.PAID_AT_FACILITY_ABOVE_RECEIPTS);

        long extras = sources.unapprovedExtraLines(caseId);
        put(record, "unapprovedExtraLines", String.valueOf(extras));
        if (extras > 0) found.add(Mismatch.UNAPPROVED_EXTRA);
        long flags = sources.undeclaredFlags(caseId);
        put(record, "undeclaredFacilityFlags", String.valueOf(flags));
        if (flags > 0) found.add(Mismatch.UNDECLARED_FACILITY);

        return new AuditSampleCase(sampleId, caseId, closed.getClosedAt(), practitionerId, facilityId, write(record),
                found.stream().map(Enum::name).collect(Collectors.joining(",")));
    }

    // ---- reviewing ----

    /** Compliance's review of one sampled case (once): no finding, or a finding that becomes a case incident. */
    @Transactional
    public SampleView review(UUID sampleId, UUID caseId, SampleReviewRequest request) {
        Actor actor = authority.authorize(Permission.COMPLIANCE_REVIEW);
        AuditSample sample = samples.findById(sampleId).orElseThrow(() -> new ApiException(404, "SAMPLE_NOT_FOUND", "This sample does not exist"));
        AuditSampleCase row = sampleCases.findBySampleIdAndCaseId(sampleId, caseId).flatMap(r -> sampleCases.lockById(r.getId()))
                .orElseThrow(() -> new ApiException(404, "SAMPLE_CASE_NOT_FOUND", "This case is not in the sample"));
        if (row.getReviewStatus() != AuditSampleCase.ReviewStatus.PENDING)
            throw new ApiException(409, "SAMPLE_CASE_ALREADY_REVIEWED", "This sampled case is already reviewed");
        Instant now = clock.instant();
        if ("FINDING".equals(request.outcome())) {
            String note = request.note() == null ? "" : request.note().trim();
            if (note.isEmpty()) throw new ApiException(400, "FINDING_NOTE_REQUIRED", "Say what was found");
            UUID incident = incidents.raiseFromSystem(caseId, CaseIncident.Type.DISPUTE, CaseIncident.Severity.MEDIUM, note, ORIGIN);
            row.finding(note, incident, actor.subject(), now);
        } else row.noFinding(actor.subject(), now);
        sampleCases.saveAndFlush(row);
        auditTrail.event("AUDIT_SAMPLE_CASE_REVIEWED").actor(actor.subject(), actor.label()).caseId(caseId).entity("AuditSampleCase", row.getId())
                .action("REVIEW").reason(request.outcome()).record();
        return view(sample);
    }

    // ---- reading ----

    @Transactional(readOnly = true)
    public List<SampleSummary> samples() {
        authority.authorize(Permission.AUDIT_SAMPLE_READ);
        List<AuditSample> found = samples.findNewest(Limit.of(60));
        if (found.isEmpty()) return List.of();
        Map<UUID, AuditSampleCaseRepository.Progress> progress = sampleCases.progressOf(found.stream().map(AuditSample::getId).toList()).stream()
                .collect(Collectors.toMap(AuditSampleCaseRepository.Progress::getSampleId, Function.identity()));
        return found.stream().map(s -> summary(s, progress.get(s.getId()))).toList();
    }

    @Transactional(readOnly = true)
    public SampleView sample(UUID sampleId) {
        authority.authorize(Permission.AUDIT_SAMPLE_READ);
        return view(samples.findById(sampleId).orElseThrow(() -> new ApiException(404, "SAMPLE_NOT_FOUND", "This sample does not exist")));
    }

    private SampleView view(AuditSample s) {
        List<AuditSampleCase> rows = sampleCases.findBySampleIdOrderByClosedAtAsc(s.getId());
        Map<UUID, String> consultants = practitioners.findAllById(rows.stream().map(AuditSampleCase::getPractitionerId).filter(java.util.Objects::nonNull).distinct().toList())
                .stream().collect(Collectors.toMap(PractitionerProfile::getId, PractitionerProfile::getDisplayName, (a, b) -> a));
        Map<UUID, String> facilityNames = facilities.names(rows.stream().map(AuditSampleCase::getFacilityId).filter(java.util.Objects::nonNull).collect(Collectors.toSet()));
        List<SampleCaseView> views = rows.stream().map(r -> new SampleCaseView(r.getCaseId(), cases.findCaseNumber(r.getCaseId()).orElse(null), r.getClosedAt(),
                r.getPractitionerId(), consultants.get(r.getPractitionerId()), r.getFacilityId(), facilityNames.get(r.getFacilityId()), read(r.getRecord()),
                r.getMismatches().isEmpty() ? List.of() : Arrays.asList(r.getMismatches().split(",")), r.getReviewStatus().name(), r.getReviewedAt(),
                r.getFindingNote(), r.getIncidentId())).toList();
        int pending = (int) rows.stream().filter(r -> r.getReviewStatus() == AuditSampleCase.ReviewStatus.PENDING).count();
        return new SampleView(new SampleSummary(s.getId(), s.getSampleMonth(), s.getKind().name(), s.getRequestedSize(), s.getCandidates(), rows.size(),
                pending, s.getDrawnBy(), s.getDrawnAt()), views);
    }

    private static SampleSummary summary(AuditSample s, AuditSampleCaseRepository.Progress p) {
        return new SampleSummary(s.getId(), s.getSampleMonth(), s.getKind().name(), s.getRequestedSize(), s.getCandidates(),
                p == null ? 0 : p.getTotal().intValue(), p == null || p.getPending() == null ? 0 : p.getPending().intValue(), s.getDrawnBy(), s.getDrawnAt());
    }

    private static void put(Map<String, String> record, String key, Object value) { if (value != null) record.put(key, value instanceof BigDecimal b ? b.toPlainString() : value.toString()); }

    private String write(Map<String, String> record) {
        try { return json.writeValueAsString(record); } catch (Exception e) { throw new IllegalStateException("Cannot write the sample record", e); }
    }

    private Map<String, String> read(String stored) {
        try { return json.readValue(stored, new TypeReference<LinkedHashMap<String, String>>() {}); } catch (Exception e) { throw new IllegalStateException("Cannot read the sample record", e); }
    }
}
