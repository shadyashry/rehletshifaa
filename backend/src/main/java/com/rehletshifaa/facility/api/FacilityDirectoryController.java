package com.rehletshifaa.facility.api;

import com.rehletshifaa.facility.api.FacilityDtos.DirectoryFacility;
import com.rehletshifaa.facility.application.FacilityDirectory;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** The facility picker's data for consultants, coordinators and Operations: active facilities and their approved packages. */
@RestController
@RequestMapping("/api/v1/facilities")
public class FacilityDirectoryController {
    private final FacilityDirectory directory;

    public FacilityDirectoryController(FacilityDirectory directory) { this.directory = directory; }

    @GetMapping("/directory")
    public List<DirectoryFacility> directory(@RequestParam(required = false) String careArea) { return directory.directory(careArea); }
}
