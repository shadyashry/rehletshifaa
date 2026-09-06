package com.rehletshifaa.journey.api;
import com.rehletshifaa.journey.application.JourneyService;import com.rehletshifaa.journey.application.PricingCatalogService;import jakarta.validation.Valid;import org.springframework.format.annotation.DateTimeFormat;import org.springframework.http.HttpStatus;import org.springframework.http.MediaType;import org.springframework.web.bind.annotation.*;import org.springframework.web.multipart.MultipartFile;import java.io.IOException;import java.time.LocalDate;import java.util.*;
import static com.rehletshifaa.journey.api.JourneyDtos.*;
@RestController @RequestMapping("/api/v1/admin") public class AdminJourneyController{
 private final JourneyService service;private final PricingCatalogService pricing;public AdminJourneyController(JourneyService service,PricingCatalogService pricing){this.service=service;this.pricing=pricing;}
 @PostMapping("/coordinators")public IdResponse createCoordinator(@Valid @RequestBody StaffRequest request){return service.createCoordinator(request);}
 @PostMapping("/staff")public IdResponse createStaff(@Valid @RequestBody StaffRequest request){return service.createCoordinator(request);}
 @PostMapping("/practitioners")public IdResponse create(@Valid @RequestBody PractitionerRequest request){return service.createPractitioner(request);}
 @PostMapping("/practitioners/{id}/credentials")public IdResponse credential(@PathVariable UUID id,@Valid @RequestBody CredentialRequest request){return service.addCredential(id,request);}
 @PostMapping("/practitioners/{id}/decision")public IdResponse decision(@PathVariable UUID id,@RequestParam boolean approved,@RequestParam(required=false)String reason){return service.verifyPractitioner(id,approved,reason);}
 // --- Price catalog, specialty templates and exchange rates ---
 @GetMapping("/practitioners")public List<PractitionerSummaryView>practitioners(){return pricing.practitioners();}
 @GetMapping("/service-templates")public List<ServiceTemplateView>templates(@RequestParam(required=false)String careCategory){return pricing.templates(careCategory);}
 @GetMapping("/service-templates/{templateId}/items")public List<ServiceTemplateItemView>templateItems(@PathVariable UUID templateId){return pricing.templateItems(templateId);}
 @GetMapping("/practitioners/{id}/catalog")public List<CatalogServiceView>catalog(@PathVariable UUID id){return pricing.practitionerCatalog(id);}
 @PostMapping("/practitioners/{id}/catalog")public CatalogServiceView addService(@PathVariable UUID id,@Valid @RequestBody CatalogServiceRequest request){return pricing.addCatalogService(id,request);}
 @PutMapping("/practitioners/{id}/catalog/{serviceId}")public CatalogServiceView updateService(@PathVariable UUID id,@PathVariable UUID serviceId,@Valid @RequestBody CatalogServiceRequest request){return pricing.updateCatalogService(id,serviceId,request);}
 @DeleteMapping("/practitioners/{id}/catalog/{serviceId}")@ResponseStatus(HttpStatus.NO_CONTENT)public void deactivateService(@PathVariable UUID id,@PathVariable UUID serviceId){pricing.deactivateCatalogService(id,serviceId);}
 @PostMapping("/practitioners/{id}/catalog/from-template/{templateId}")public IdResponse seedFromTemplate(@PathVariable UUID id,@PathVariable UUID templateId){return pricing.seedFromTemplate(id,templateId);}
 @PostMapping(value="/practitioners/{id}/catalog/import",consumes=MediaType.MULTIPART_FORM_DATA_VALUE)public CatalogImportResult importCatalog(@PathVariable UUID id,@RequestParam("file")MultipartFile file,@RequestParam(defaultValue="false")boolean commit)throws IOException{return pricing.importCatalog(id,file.getBytes(),commit);}
 @PostMapping("/practitioners/{id}/catalog/derive")public IdResponse deriveFromCareArea(@PathVariable UUID id){return pricing.deriveFromCareArea(id);}
 @GetMapping("/fx-rates")public List<FxRateView>fxRates(@RequestParam(required=false)@DateTimeFormat(iso=DateTimeFormat.ISO.DATE)LocalDate date){return pricing.fxRates(date);}
 @PutMapping("/fx-rates/{currency}")@ResponseStatus(HttpStatus.NO_CONTENT)public void setFxOverride(@PathVariable String currency,@Valid @RequestBody FxOverrideRequest request){pricing.setFxOverride(currency,request);}
}
