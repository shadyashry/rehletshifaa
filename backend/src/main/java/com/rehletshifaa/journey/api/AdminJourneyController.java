package com.rehletshifaa.journey.api;
import com.rehletshifaa.journey.application.JourneyService;import jakarta.validation.Valid;import org.springframework.web.bind.annotation.*;import java.util.UUID;
import static com.rehletshifaa.journey.api.JourneyDtos.*;
@RestController @RequestMapping("/api/v1/admin") public class AdminJourneyController{
 private final JourneyService service;public AdminJourneyController(JourneyService service){this.service=service;}
 @PostMapping("/coordinators")public IdResponse createCoordinator(@Valid @RequestBody StaffRequest request){return service.createCoordinator(request);}
 @PostMapping("/practitioners")public IdResponse create(@Valid @RequestBody PractitionerRequest request){return service.createPractitioner(request);}
 @PostMapping("/practitioners/{id}/credentials")public IdResponse credential(@PathVariable UUID id,@Valid @RequestBody CredentialRequest request){return service.addCredential(id,request);}
 @PostMapping("/practitioners/{id}/decision")public IdResponse decision(@PathVariable UUID id,@RequestParam boolean approved,@RequestParam(required=false)String reason){return service.verifyPractitioner(id,approved,reason);}
}
