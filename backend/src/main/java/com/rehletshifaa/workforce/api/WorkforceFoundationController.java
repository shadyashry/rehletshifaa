package com.rehletshifaa.workforce.api;

import com.rehletshifaa.workforce.application.WorkforceFoundationService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/admin/workforce")
public class WorkforceFoundationController {
    private final WorkforceFoundationService workforce;

    public WorkforceFoundationController(WorkforceFoundationService workforce) {
        this.workforce = workforce;
    }

    @GetMapping("/catalogue") public Object catalogue() { return workforce.catalogue(); }
    @GetMapping("/people") public Object people() { return workforce.people(); }
    @GetMapping("/teams") public Object teams() { return workforce.teams(); }
}
