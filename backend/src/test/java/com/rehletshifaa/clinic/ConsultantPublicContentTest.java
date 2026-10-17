package com.rehletshifaa.clinic;

import com.rehletshifaa.clinic.domain.ConsultantPublicContent;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ConsultantPublicContentTest {
    @Test void requiresThePublicCardFieldsAndExpertiseAnchor() {
        assertThatThrownBy(() -> content("", "Cardiology", List.of()))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> content("Dr Synthetic", "", List.of()))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test void boundsListsAndRejectsUnsafeProfessionalLinks() {
        assertThatThrownBy(() -> content("Dr Synthetic", "Cardiology", java.util.Collections.nCopies(21, "Area")))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new ConsultantPublicContent.ExternalLink("Profile", "http://example.test/profile"))
                .isInstanceOf(IllegalArgumentException.class);
    }

    private static ConsultantPublicContent content(String name, String anchor, List<String> expertiseAreas) {
        return new ConsultantPublicContent("DS", name, "MD", List.of(), "Cardiology", "Consultant", "Cairo",
                "Summary", "Card summary", new ConsultantPublicContent.Expertise(anchor, expertiseAreas), null,
                List.of(), List.of(), List.of(), List.of(), List.of(), "CV supplied", List.of(), List.of(), null, null);
    }
}
