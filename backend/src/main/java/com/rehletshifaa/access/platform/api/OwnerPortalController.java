package com.rehletshifaa.access.platform.api;

import com.rehletshifaa.access.platform.application.OwnerPortalService;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.function.BiFunction;

@RestController
@RequestMapping("/api/v1/owner")
public class OwnerPortalController {
    private final OwnerPortalService owner;
    public OwnerPortalController(OwnerPortalService owner) { this.owner = owner; }

    @GetMapping("/overview") public ResponseEntity<?> overview(@RequestParam(required=false) @DateTimeFormat(iso=DateTimeFormat.ISO.DATE_TIME) Instant from,
            @RequestParam(required=false) @DateTimeFormat(iso=DateTimeFormat.ISO.DATE_TIME) Instant to) { return metric(owner::overview, from, to); }
    @GetMapping("/analytics/revenue") public ResponseEntity<?> revenue(@RequestParam(required=false) Instant from,@RequestParam(required=false) Instant to){return metric(owner::revenue,from,to);}
    @GetMapping("/analytics/journeys") public ResponseEntity<?> journeys(@RequestParam(required=false) Instant from,@RequestParam(required=false) Instant to){return metric(owner::journeys,from,to);}
    @GetMapping("/analytics/consultants") public ResponseEntity<?> consultants(@RequestParam(required=false) Instant from,@RequestParam(required=false) Instant to){return metric(owner::consultants,from,to);}
    @GetMapping("/analytics/operations") public ResponseEntity<?> operations(@RequestParam(required=false) Instant from,@RequestParam(required=false) Instant to){return metric(owner::operations,from,to);}
    @GetMapping("/analytics/workforce") public ResponseEntity<?> workforce(@RequestParam(required=false) Instant from,@RequestParam(required=false) Instant to){return metric(owner::workforce,from,to);}
    @GetMapping("/analytics/patient-experience") public ResponseEntity<?> patients(@RequestParam(required=false) Instant from,@RequestParam(required=false) Instant to){return metric(owner::patientExperience,from,to);}
    @GetMapping("/analytics/risk-compliance") public ResponseEntity<?> risk(@RequestParam(required=false) Instant from,@RequestParam(required=false) Instant to){return metric(owner::riskCompliance,from,to);}
    @GetMapping("/governance") public ResponseEntity<?> governance(){return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(owner.governance());}

    private ResponseEntity<?> metric(BiFunction<Instant,Instant,?> query, Instant from, Instant to) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(query.apply(from,to));
    }
}
