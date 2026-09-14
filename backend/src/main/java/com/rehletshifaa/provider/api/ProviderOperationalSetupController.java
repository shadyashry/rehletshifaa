package com.rehletshifaa.provider.api;

import com.rehletshifaa.provider.application.ProviderOperationalSetupService;
import org.springframework.web.bind.annotation.*;
import java.time.Instant;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/admin/providers/{organizationId}/clinicians/{practitionerId}")
public class ProviderOperationalSetupController {
    private final ProviderOperationalSetupService setup;
    public ProviderOperationalSetupController(ProviderOperationalSetupService setup){this.setup=setup;}
    @GetMapping("/prices") public Object prices(@PathVariable UUID organizationId,@PathVariable UUID practitionerId){return setup.prices(organizationId,practitionerId);}
    @PostMapping("/prices") public Object createPrice(@PathVariable UUID organizationId,@PathVariable UUID practitionerId,@RequestBody ProviderOperationalSetupService.PriceCommand command){return setup.createPrice(organizationId,practitionerId,command);}
    @PutMapping("/prices/{priceId}") public Object updatePrice(@PathVariable UUID organizationId,@PathVariable UUID practitionerId,@PathVariable UUID priceId,@RequestParam long revision,@RequestBody ProviderOperationalSetupService.PriceCommand command){return setup.updateDraft(organizationId,practitionerId,priceId,revision,command);}
    @PostMapping("/prices/{priceId}/approve") public Object approvePrice(@PathVariable UUID organizationId,@PathVariable UUID practitionerId,@PathVariable UUID priceId,@RequestParam long revision){return setup.approve(organizationId,practitionerId,priceId,revision);}
    @PostMapping("/prices/{priceId}/publish") public Object publishPrice(@PathVariable UUID organizationId,@PathVariable UUID practitionerId,@PathVariable UUID priceId,@RequestParam long revision){return setup.publish(organizationId,practitionerId,priceId,revision);}
    @PostMapping("/prices/{priceId}/retire") public Object retirePrice(@PathVariable UUID organizationId,@PathVariable UUID practitionerId,@PathVariable UUID priceId,@RequestParam long revision){return setup.retire(organizationId,practitionerId,priceId,revision);}
    @GetMapping("/prices/effective") public Object effectivePrice(@PathVariable UUID organizationId,@PathVariable UUID practitionerId,@RequestParam String serviceCode,@RequestParam(required=false) Instant at){return setup.resolve(organizationId,practitionerId,serviceCode,at);}
    @GetMapping("/availability") public Object schedule(@PathVariable UUID organizationId,@PathVariable UUID practitionerId){return setup.schedule(organizationId,practitionerId);}
    @PostMapping("/availability/slots") public Object createSlot(@PathVariable UUID organizationId,@PathVariable UUID practitionerId,@RequestBody ProviderOperationalSetupService.SlotCommand command){return setup.saveSlot(organizationId,practitionerId,null,command);}
    @PutMapping("/availability/slots/{slotId}") public Object updateSlot(@PathVariable UUID organizationId,@PathVariable UUID practitionerId,@PathVariable UUID slotId,@RequestBody ProviderOperationalSetupService.SlotCommand command){return setup.saveSlot(organizationId,practitionerId,slotId,command);}
    @PostMapping("/availability/exceptions") public Object addException(@PathVariable UUID organizationId,@PathVariable UUID practitionerId,@RequestBody ProviderOperationalSetupService.ExceptionCommand command){return setup.addException(organizationId,practitionerId,command);}
    @PutMapping("/availability/exceptions/{exceptionId}") public Object updateException(@PathVariable UUID organizationId,@PathVariable UUID practitionerId,@PathVariable UUID exceptionId,@RequestParam long revision,@RequestBody ProviderOperationalSetupService.ExceptionCommand command){return setup.updateException(organizationId,practitionerId,exceptionId,revision,command);}
    @DeleteMapping("/availability/exceptions/{exceptionId}") public void removeException(@PathVariable UUID organizationId,@PathVariable UUID practitionerId,@PathVariable UUID exceptionId,@RequestParam long revision){setup.removeException(organizationId,practitionerId,exceptionId,revision);}
    @GetMapping("/availability/effective") public Object effectiveAvailability(@PathVariable UUID organizationId,@PathVariable UUID practitionerId,@RequestParam(required=false) Instant at){return setup.effective(organizationId,practitionerId,at);}
}
