package com.rehletshifaa.journey.application;

import com.rehletshifaa.journey.domain.PortalPreference;
import com.rehletshifaa.journey.infrastructure.PortalPreferenceRepository;
import com.rehletshifaa.shared.crypto.CryptoService;
import com.rehletshifaa.workforce.application.WorkforceDirectory;

import jakarta.validation.constraints.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.*;
import java.util.*;

/** Personal presentation preferences and team-scoped supervision from the workforce model. */
@Service
public class PortalExperienceService {
    private final PortalPreferenceRepository portalPreferences;
    private final CryptoService crypto;
    private final Clock clock;
    private final WorkforceDirectory workforce;
    public PortalExperienceService(CryptoService crypto, Clock clock, WorkforceDirectory workforce, PortalPreferenceRepository portalPreferences) { this.portalPreferences = portalPreferences;
        this.crypto=crypto; this.clock=clock; this.workforce=workforce;
    }
    public record Preferences(String displayName, String locale) {}
    public record PreferencesRequest(@Size(max=160) String displayName, @NotNull @Pattern(regexp="en|ar") String locale) {}

    public Preferences preferences() {
        String subject=com.rehletshifaa.authority.application.Principal.current().subject();
        return portalPreferences.findById(subject).map(p->new Preferences(crypto.decrypt(p.getDisplayNameEncrypted()),p.getLocale()))
            .orElse(new Preferences(null,null));
    }
    @Transactional
    public Preferences savePreferences(PreferencesRequest request) {
        var actor=com.rehletshifaa.authority.application.Principal.current();
        String name=request.displayName()==null||request.displayName().isBlank()?null:request.displayName().trim();
        // This is a display preference, never a legal name or credential update.
        String encrypted=name==null?null:crypto.encrypt(name);
        PortalPreference preference=portalPreferences.findById(actor.subject()).orElseGet(()->new PortalPreference(actor.subject())); preference.change(encrypted,request.locale(),clock.instant()); portalPreferences.saveAndFlush(preference);
        return new Preferences(name,request.locale());
    }
    /**
     * WF-07/WF-08/INV-28 with the OD-09 fail-safe: a lead supervises the members of coordination teams they
     * currently lead plus their direct reports — no transitive depth, no role-wide bypass.
     */
    public Set<String> reports(String lead) {
        return reports(lead, "CARE_COORDINATION");
    }
    public Set<String> reports(String lead, String function) {
        return workforce.supervised(lead, function);
    }
}
