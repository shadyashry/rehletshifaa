package com.rehletshifaa.clinic.api;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.rehletshifaa.clinic.infrastructure.ConsultantDirectoryRepository;
import com.rehletshifaa.clinic.infrastructure.ConsultantDirectoryRepository.Listed;
import com.rehletshifaa.shared.api.ApiException;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.Duration;
import java.util.List;

/**
 * The public Consultant directory, read from the platform's Consultant profiles (V105) — the site has no profile data
 * of its own. Each profile carries its slug, the care area from the profile's own care category and that area's label
 * from the {@code care_categories} lookup, merged into the localised CV content.
 */
@RestController
@RequestMapping("/api/v1/public/consultants")
public class PublicConsultantController {
    private static final CacheControl CACHE = CacheControl.maxAge(Duration.ofMinutes(5)).cachePublic();
    private final ConsultantDirectoryRepository directory;
    private final ObjectMapper json;

    public PublicConsultantController(ConsultantDirectoryRepository directory, ObjectMapper json) {
        this.directory = directory;
        this.json = json;
    }

    @GetMapping
    @Transactional(readOnly = true)
    public ResponseEntity<List<JsonNode>> list(@RequestParam(defaultValue = "en") String locale) {
        boolean ar = "ar".equals(locale);
        return ResponseEntity.ok().cacheControl(CACHE).body(directory.findListed().stream().map(row -> view(row, ar)).toList());
    }

    @GetMapping("/{slug}")
    @Transactional(readOnly = true)
    public ResponseEntity<JsonNode> one(@PathVariable String slug, @RequestParam(defaultValue = "en") String locale) {
        Listed row = directory.findListed(slug).orElseThrow(() -> new ApiException(404, "CONSULTANT_NOT_FOUND", "No such Consultant"));
        return ResponseEntity.ok().cacheControl(CACHE).body(view(row, "ar".equals(locale)));
    }

    private JsonNode view(Listed row, boolean ar) {
        try {
            ObjectNode node = (ObjectNode) json.readTree(ar ? row.getContentAr() : row.getContentEn());
            node.put("slug", row.getSlug());
            node.put("careAreaHref", row.getCareArea());
            node.put("careAreaLabel", ar ? row.getCareAreaAr() : row.getCareAreaEn());
            return node;
        } catch (Exception e) {
            throw new IllegalStateException("Unreadable directory content for " + row.getSlug(), e);
        }
    }
}
