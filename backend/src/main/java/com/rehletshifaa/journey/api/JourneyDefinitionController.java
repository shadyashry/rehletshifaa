package com.rehletshifaa.journey.api;

import com.rehletshifaa.journey.application.JourneyDefinitionService;
import com.rehletshifaa.journey.domain.JourneyStageRegistry;
import org.springframework.web.bind.annotation.*;
import java.util.*;
import static com.rehletshifaa.journey.domain.JourneyModel.*;
import static com.rehletshifaa.journey.application.JourneyDefinitionService.*;

@RestController
@RequestMapping("/api/v1/admin/journeys")
public class JourneyDefinitionController {
    private final JourneyDefinitionService service;
    public JourneyDefinitionController(JourneyDefinitionService service){this.service=service;}
    @GetMapping("/{definition}/history") public List<HistoryEntry> history(@PathVariable UUID definition,@RequestParam(defaultValue="0") int offset){return service.history(definition,offset);}
    @GetMapping public List<Definition> list(){return service.list();}
    @GetMapping("/summaries") public List<Summary> summaries(){return service.summaries();}
    @GetMapping("/registry/metadata") public RegistryMetadata registryMetadata(){return service.registryMetadata();}
    @GetMapping("/registry") public List<JourneyStageRegistry.Capability> registry(){return service.registry();}
    @PostMapping public Detail create(){return service.create();}
    @GetMapping("/{definition}") public Detail detail(@PathVariable UUID definition){return service.detail(definition);}
    @GetMapping("/{definition}/versions/{version}") public Version version(@PathVariable UUID definition,@PathVariable UUID version){return service.version(definition,version);}
    @PostMapping("/{definition}/versions/{version}/clone") public Version cloneVersion(@PathVariable UUID definition,@PathVariable UUID version,@RequestBody Change command){return service.cloneVersion(definition,version,command);}
    @PutMapping("/{definition}/versions/{version}") public Version edit(@PathVariable UUID definition,@PathVariable UUID version,@RequestBody Edit command){return service.edit(definition,version,command);}
    @PostMapping("/{definition}/versions/{version}/validate") public ValidationResult validate(@PathVariable UUID definition,@PathVariable UUID version,@RequestBody Change command){return service.validate(definition,version,command);}
    @PostMapping("/{definition}/versions/{version}/simulate") public SimulationResult simulate(@PathVariable UUID definition,@PathVariable UUID version,@RequestBody Simulate command){return service.simulate(definition,version,command);}
    @PostMapping("/{definition}/versions/{version}/submit") public Version submit(@PathVariable UUID definition,@PathVariable UUID version,@RequestBody Change command){return service.submit(definition,version,command);}
    @PostMapping("/{definition}/versions/{version}/return-to-draft") public Version returnToDraft(@PathVariable UUID definition,@PathVariable UUID version,@RequestBody Change command){return service.returnToDraft(definition,version,command);}
    @PostMapping("/{definition}/versions/{version}/publish") public Version publish(@PathVariable UUID definition,@PathVariable UUID version,@RequestBody Change command){return service.publish(definition,version,command);}
    @PostMapping("/{definition}/versions/{version}/retire") public Version retire(@PathVariable UUID definition,@PathVariable UUID version,@RequestBody Change command){return service.retire(definition,version,command);}
}
