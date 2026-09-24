package com.rehletshifaa.journey.api;

import com.rehletshifaa.journey.application.ProviderCaseSummaryService;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/** V-3: the caller's own assigned cases as a summary. No case id, subject or organization parameter; never cached. */
@RestController
@RequestMapping("/api/v1/provider-workspace")
public class ProviderCaseController {
    private final ProviderCaseSummaryService cases;
    public ProviderCaseController(ProviderCaseSummaryService cases){this.cases=cases;}
    @GetMapping("/cases") public ResponseEntity<ProviderCaseSummaryService.CasePage> mine(@RequestParam(defaultValue="0") int page){return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(cases.mine(page));}
}
