package com.rehletshifaa.notification.infrastructure;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.Map;

/**
 * Which approved Meta template carries each outbox template key ({@code app.whatsapp.meta.templates}), and the Meta
 * language code for each site language ({@code app.whatsapp.meta.languages}). Outside the 24-hour customer-service
 * window Meta delivers only approved templates, so a key without a binding is never sent as free text.
 */
@ConfigurationProperties(prefix = "app.whatsapp.meta")
public record MetaWhatsAppTemplates(Map<String, String> templates, Map<String, String> languages) {
    public MetaWhatsAppTemplates {
        templates = templates == null ? Map.of() : Map.copyOf(templates);
        languages = languages == null ? Map.of() : Map.copyOf(languages);
    }

    /** The bound template name, or null when the key has none. */
    public String template(String key) {
        String name = key == null ? null : templates.get(key);
        return name == null || name.isBlank() ? null : name;
    }

    /** Meta's code for a site language ({@code en}, {@code ar}), or null when unknown. */
    public String language(String siteLanguage) {
        return siteLanguage == null ? null : languages.get(siteLanguage);
    }
}
