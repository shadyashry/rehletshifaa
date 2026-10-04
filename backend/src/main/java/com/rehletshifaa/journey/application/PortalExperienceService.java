package com.rehletshifaa.journey.application;

import com.rehletshifaa.workforce.application.WorkforceDirectory;
import com.rehletshifaa.shared.crypto.CryptoService;
import jakarta.validation.constraints.*;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.*;
import java.util.*;
import static com.rehletshifaa.shared.persistence.SqlValues.timestamp;

/** Personal presentation preferences and team-scoped supervision from the workforce model. */
@Service
public class PortalExperienceService {
    private final JdbcClient jdbc;
    private final CryptoService crypto;
    private final Clock clock;
    private final WorkforceDirectory workforce;
    public PortalExperienceService(JdbcClient jdbc, CryptoService crypto, Clock clock, WorkforceDirectory workforce) {
        this.jdbc=jdbc; this.crypto=crypto; this.clock=clock; this.workforce=workforce;
    }
    public record Preferences(String displayName, String locale) {}
    public record PreferencesRequest(@Size(max=160) String displayName, @NotNull @Pattern(regexp="en|ar") String locale) {}

    public Preferences preferences() {
        String subject=com.rehletshifaa.authority.application.Principal.current().subject();
        return jdbc.sql("SELECT * FROM portal_preferences WHERE subject=?").param(subject)
            .query((rs,n)->new Preferences(crypto.decrypt(rs.getString("display_name_encrypted")),rs.getString("locale")))
            .optional().orElse(new Preferences(null,null));
    }
    @Transactional
    public Preferences savePreferences(PreferencesRequest request) {
        var actor=com.rehletshifaa.authority.application.Principal.current();
        String name=request.displayName()==null||request.displayName().isBlank()?null:request.displayName().trim();
        // This is a display preference, never a legal name or credential update.
        String encrypted=name==null?null:crypto.encrypt(name);
        int changed=jdbc.sql("UPDATE portal_preferences SET display_name_encrypted=?,locale=?,updated_at=? WHERE subject=?")
            .params(encrypted,request.locale(),timestamp(clock.instant()),actor.subject()).update();
        if(changed==0)jdbc.sql("INSERT INTO portal_preferences(subject,display_name_encrypted,locale,updated_at) VALUES(?,?,?,?)")
            .params(actor.subject(),encrypted,request.locale(),timestamp(clock.instant())).update();
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
