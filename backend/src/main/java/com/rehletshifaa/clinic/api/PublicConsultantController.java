package com.rehletshifaa.clinic.api;
import com.fasterxml.jackson.databind.JsonNode;
import com.rehletshifaa.clinic.application.PublicConsultantQueryService;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.time.Duration;
import java.util.List;
/** The public directory retains its JSON contract; short browser freshness complements server invalidation. */
@RestController
@RequestMapping("/api/v1/public/consultants")
public class PublicConsultantController {
    private static final CacheControl CACHE=CacheControl.maxAge(Duration.ofSeconds(30)).cachePublic();
    private final PublicConsultantQueryService directory;
    public PublicConsultantController(PublicConsultantQueryService directory) { this.directory=directory; }
    @GetMapping public ResponseEntity<List<JsonNode>> list(@RequestParam(defaultValue="en") String locale) {
        return ResponseEntity.ok().cacheControl(CACHE).body(directory.list(locale));
    }
    @GetMapping("/{slug}") public ResponseEntity<JsonNode> one(@PathVariable String slug,@RequestParam(defaultValue="en") String locale) {
        return ResponseEntity.ok().cacheControl(CACHE).body(directory.one(slug,locale));
    }
}
