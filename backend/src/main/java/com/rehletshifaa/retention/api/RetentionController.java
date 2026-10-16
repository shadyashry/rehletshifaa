package com.rehletshifaa.retention.api;

import com.rehletshifaa.retention.api.RetentionDtos.ErasurePreview;
import com.rehletshifaa.retention.api.RetentionDtos.ErasureRequest;
import com.rehletshifaa.retention.api.RetentionDtos.ErasureResult;
import com.rehletshifaa.retention.api.RetentionDtos.PolicyView;
import com.rehletshifaa.retention.api.RetentionDtos.PurgeLogView;
import com.rehletshifaa.retention.application.RetentionQueryService;
import com.rehletshifaa.retention.application.SubjectErasureService;
import jakarta.validation.Valid;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.List;

/**
 * P1-7 (review E-03): retention. Read-only for Compliance (policies and the purge log, {@code RETENTION_READ}); the erasure of a
 * person on request is a Care Coordination Manager's ({@code SUBJECT_ERASE}, fresh sign-in).
 */
@RestController
@RequestMapping("/api/v1/compliance/retention")
public class RetentionController {
    private final RetentionQueryService queries;
    private final SubjectErasureService erasures;

    public RetentionController(RetentionQueryService queries, SubjectErasureService erasures) { this.queries = queries; this.erasures = erasures; }

    @GetMapping("/policies") public List<PolicyView> policies() { return queries.policies(); }

    @GetMapping("/purges")
    public PurgeLogView purges(@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant from,
                               @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant to,
                               @RequestParam(required = false) String recordClass, @RequestParam(required = false) Integer limit) {
        return queries.purges(from, to, recordClass, limit);
    }

    @GetMapping("/erasures/preview") public ErasurePreview preview(@RequestParam String caseNumber) { return erasures.preview(caseNumber); }

    @PostMapping("/erasures") public ErasureResult erase(@Valid @RequestBody ErasureRequest request) { return erasures.erase(request); }
}
