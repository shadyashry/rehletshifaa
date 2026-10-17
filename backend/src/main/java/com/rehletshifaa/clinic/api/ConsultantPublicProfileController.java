package com.rehletshifaa.clinic.api;
import com.rehletshifaa.clinic.application.ConsultantPublicProfileService;
import com.rehletshifaa.clinic.application.ConsultantPublicProfileService.*;
import org.springframework.web.bind.annotation.*;
import java.util.*;
@RestController
@RequestMapping("/api/v1/control-center/consultants")
public class ConsultantPublicProfileController {
    private final ConsultantPublicProfileService profiles;
    public ConsultantPublicProfileController(ConsultantPublicProfileService profiles) { this.profiles=profiles; }
    @GetMapping("/public-profiles") public List<Summary> list() { return profiles.list(); }
    @GetMapping("/{practitionerId}/public-profile") public View get(@PathVariable UUID practitionerId) { return profiles.get(practitionerId); }
    @PutMapping("/{practitionerId}/public-profile") public View save(@PathVariable UUID practitionerId,@RequestBody Edit request) { return profiles.save(practitionerId,request); }
    @PostMapping("/{practitionerId}/public-profile/publish") public View publish(@PathVariable UUID practitionerId,@RequestBody Revision request) { return profiles.publish(practitionerId,request); }
    @PostMapping("/{practitionerId}/public-profile/unpublish") public View unpublish(@PathVariable UUID practitionerId,@RequestBody Revision request) { return profiles.unpublish(practitionerId,request); }
    @PatchMapping("/public-profiles/order") public List<View> reorder(@RequestBody ReorderRequest request) { return profiles.reorder(request); }
}
