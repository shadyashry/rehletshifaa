package com.rehletshifaa.clinic.domain;

import com.fasterxml.jackson.annotation.JsonAnySetter;
import java.net.URI;
import java.util.List;

/** The public CV schema. All text is plain text; care-area labels always come from managed reference data. */
public record ConsultantPublicContent(String initials, String name, String credentials, List<String> achievementBadges,
        String specialty, String role, String location, String summary, String cardSummary, Expertise expertise,
        String distinction, List<String> signals, List<String> focusAreas, List<String> qualifications,
        List<String> appointments, List<String> professionalStanding, String verification, List<ExternalLink> externalLinks, List<String> achievements, String sourceFile, Portrait portrait) {
    public ConsultantPublicContent {
        required(initials, 12); required(name, 160); required(specialty, 300); required(role, 500);
        required(summary, 4000); required(cardSummary, 600);
        if (expertise == null) throw invalid();
        bounded(credentials, 500); bounded(location, 200); bounded(distinction, 500); bounded(verification, 1000);
        achievementBadges = strings(achievementBadges, 12, 160); signals = strings(signals, 12, 160);
        focusAreas = strings(focusAreas, 30, 1000); qualifications = strings(qualifications, 30, 1000);
        appointments = strings(appointments, 30, 1000); professionalStanding = strings(professionalStanding, 30, 1000);
        externalLinks = externalLinks == null ? List.of() : List.copyOf(externalLinks);
        achievements = strings(achievements, 30, 1000); bounded(sourceFile, 300);
        if (externalLinks.size() > 10) throw invalid();
    }
    public record Portrait(String src, String alt) {
        public Portrait {
            required(src, 2048); required(alt, 300);
            if (src.startsWith("/") && !src.startsWith("//")) {
                if (src.contains("..") || src.contains("\\") || src.contains("%")) throw invalid();
            } else {
                URI uri = URI.create(src);
                if (!"https".equals(uri.getScheme()) || uri.getHost() == null || uri.getUserInfo() != null) throw invalid();
            }
        }
        @JsonAnySetter public void unknown(String key, Object value) { throw invalid(); }
    }
    public record Expertise(String anchor, List<String> areas) {
        public Expertise { required(anchor, 300); areas = strings(areas, 20, 300); }
        @JsonAnySetter public void unknown(String key, Object value) { throw invalid(); }
    }
    public record ExternalLink(String label, String href) {
        public ExternalLink {
            required(label, 160); required(href, 2048);
            try { URI uri = URI.create(href); if (!"https".equals(uri.getScheme()) || uri.getHost() == null || uri.getUserInfo() != null) throw invalid(); }
            catch (IllegalArgumentException e) { throw invalid(); }
        }
        @JsonAnySetter public void unknown(String key, Object value) { throw invalid(); }
    }
    @JsonAnySetter public void unknown(String key, Object value) { throw invalid(); }
    private static List<String> strings(List<String> values, int count, int length) {
        if (values == null) return List.of();
        if (values.size() > count) throw invalid();
        values.forEach(value -> required(value, length));
        return List.copyOf(values);
    }
    private static void required(String value, int max) { if (value == null || value.isBlank()) throw invalid(); bounded(value, max); }
    private static void bounded(String value, int max) {
        if (value != null && (value.length() > max || value.indexOf('<') >= 0 || value.indexOf('>') >= 0
                || value.chars().anyMatch(c -> Character.isISOControl(c) && c != '\n' && c != '\r' && c != '\t'))) throw invalid();
    }
    private static IllegalArgumentException invalid() { return new IllegalArgumentException("Invalid public profile content"); }
}
