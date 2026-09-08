package com.rehletshifaa.journey.api;
import com.rehletshifaa.journey.application.JourneyService;import com.rehletshifaa.journey.application.PricingCatalogService;import jakarta.validation.Valid;import org.springframework.format.annotation.DateTimeFormat;import org.springframework.http.HttpStatus;import org.springframework.http.MediaType;import org.springframework.web.bind.annotation.*;import org.springframework.web.multipart.MultipartFile;import java.io.IOException;import java.time.LocalDate;import java.util.*;
import static com.rehletshifaa.journey.api.JourneyDtos.*;
@RestController @RequestMapping("/api/v1/admin") public class AdminJourneyController{
 private final JourneyService service;private final PricingCatalogService pricing;public AdminJourneyController(JourneyService service,PricingCatalogService pricing){this.service=service;this.pricing=pricing;}
 @PostMapping("/coordinators")public IdResponse createCoordinator(@Valid @RequestBody StaffInviteRequest request){return service.inviteStaff(request);}
 @PostMapping("/staff")public IdResponse createStaff(@Valid @RequestBody StaffInviteRequest request){return service.inviteStaff(request);}
 @PostMapping("/staff/{subject}/resend-invite")public IdResponse resendStaffInvite(@PathVariable String subject,@RequestParam(defaultValue="en")String locale){return service.resendStaffInvite(subject,locale);}
 @PostMapping("/staff/{subject}/disable")public IdResponse disableStaff(@PathVariable String subject){return service.setStaffEnabled(subject,false);}
 @PostMapping("/staff/{subject}/enable")public IdResponse enableStaff(@PathVariable String subject){return service.setStaffEnabled(subject,true);}
 @PostMapping("/practitioners")public IdResponse create(@Valid @RequestBody PractitionerRequest request){return service.createPractitioner(request);}
 @PostMapping("/practitioners/{id}/credentials")public IdResponse credential(@PathVariable UUID id,@Valid @RequestBody CredentialRequest request){return service.addCredential(id,request);}
 @PostMapping("/practitioners/{id}/decision")public IdResponse decision(@PathVariable UUID id,@RequestParam boolean approved,@RequestParam(required=false)String reason){return service.verifyPractitioner(id,approved,reason);}
 @PostMapping("/practitioners/{id}/resend-invite")public IdResponse resendPractitionerInvite(@PathVariable UUID id,@RequestParam(defaultValue="en")String locale){return service.resendPractitionerInvite(id,locale);}
 @PostMapping("/practitioners/{id}/disable")public IdResponse disablePractitioner(@PathVariable UUID id){return service.setPractitionerEnabled(id,false);}
 @PostMapping("/practitioners/{id}/enable")public IdResponse enablePractitioner(@PathVariable UUID id){return service.setPractitionerEnabled(id,true);}
 // --- Price catalog, specialty templates and exchange rates ---
 @GetMapping("/practitioners")public List<PractitionerSummaryView>practitioners(){return pricing.practitioners();}
 @GetMapping("/service-templates")public List<ServiceTemplateView>templates(@RequestParam(required=false)String careCategory){return pricing.templates(careCategory);}
 @GetMapping("/service-templates/{templateId}/items")public List<ServiceTemplateItemView>templateItems(@PathVariable UUID templateId){return pricing.templateItems(templateId);}
 @PutMapping("/service-templates/{templateId}")public ServiceTemplateView updateTemplate(@PathVariable UUID templateId,@Valid @RequestBody ServiceTemplateUpdateRequest request){return pricing.updateTemplate(templateId,request);}
 @PostMapping("/service-templates/{templateId}/items")public ServiceTemplateItemView addTemplateItem(@PathVariable UUID templateId,@Valid @RequestBody ServiceTemplateItemRequest request){return pricing.addTemplateItem(templateId,request);}
 @PutMapping("/service-templates/{templateId}/items/{serviceCode}")public ServiceTemplateItemView updateTemplateItem(@PathVariable UUID templateId,@PathVariable String serviceCode,@Valid @RequestBody ServiceTemplateItemRequest request){return pricing.updateTemplateItem(templateId,serviceCode,request);}
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
