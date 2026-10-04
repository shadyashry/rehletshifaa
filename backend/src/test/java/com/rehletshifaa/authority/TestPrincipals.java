package com.rehletshifaa.authority;

import com.rehletshifaa.authority.domain.Role;
import com.rehletshifaa.shared.crypto.CryptoService;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Test sign-in in the platform's own vocabulary. The token proves identity only (no authorities, as in production);
 * the roles a test needs are recorded as the database facts the authority core reads. Patient and representative
 * roles come from the test's own linking flow, exactly as in production, so they record nothing here.
 */
public final class TestPrincipals {
    private TestPrincipals() {}

    public static void signIn(String subject) {
        signIn(subject, Instant.now());
    }

    public static void signIn(String subject, Instant authenticatedAt) {
        signIn(subject, authenticatedAt, "2");
    }

    public static void signIn(String subject, Instant authenticatedAt, String acr) {
        var token = Jwt.withTokenValue("test").header("alg", "none").subject(subject)
                .claim("auth_time", authenticatedAt).claim("acr", acr).build();
        SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(token, List.of(), subject));
    }

    /** Records the facts for {@code roles} (idempotently) and signs in as {@code subject}. */
    public static void signIn(JdbcTemplate jdbc, CryptoService crypto, String subject, Role... roles) {
        for (Role role : roles) grant(jdbc, crypto, subject, role);
        signIn(subject, Instant.now(), java.util.Arrays.asList(roles).contains(Role.SYSTEM_ADMINISTRATOR) ? "3" : "2");
    }

    public static void grant(JdbcTemplate jdbc, CryptoService crypto, String subject, Role role) {
        Instant now = Instant.now();
        switch (role) {
            case PATIENT, PATIENT_REPRESENTATIVE, ACCOUNT_HOLDER, PRACTICE_MANAGER -> { }
            case CONSULTANT -> {
                if (count(jdbc, "SELECT COUNT(*) FROM practitioner_profiles WHERE external_subject=?", subject) == 0)
                    jdbc.update("INSERT INTO practitioner_profiles(id,external_subject,legal_name,display_name,credentialing_status,practitioner_type,"
                                    + "availability_status,created_at,updated_at,version) VALUES(?,?,?,?,'VERIFIED','CONSULTANT','AVAILABLE',?,?,0)",
                            UUID.randomUUID(), subject, subject, subject, now, now);
            }
            case SYSTEM_ADMINISTRATOR -> {
                person(jdbc, crypto, subject, now);
                jdbc.update("UPDATE workforce_people SET mfa_enrolled=TRUE WHERE subject=?", subject);
                if (count(jdbc, "SELECT COUNT(*) FROM platform_role_assignments WHERE subject=? AND status='ACTIVE'", subject) == 0)
                    jdbc.update("INSERT INTO platform_role_assignments(id,subject,role_key,effective_from,status,assigned_by,reason,created_at,revision) "
                            + "VALUES(?,?,'SYSTEM_ADMINISTRATOR',?,'ACTIVE','TEST','Test administrator',?,0)", UUID.randomUUID(), subject, now.minusSeconds(60), now);
            }
            default -> {
                person(jdbc, crypto, subject, now);
                if (count(jdbc, "SELECT COUNT(*) FROM workforce_role_assignments WHERE subject=? AND role_key=? AND status='ACTIVE'", subject, role.name()) == 0)
                    jdbc.update("INSERT INTO workforce_role_assignments(id,subject,role_key,effective_from,status,source,assigned_by,reason,created_at,revision) "
                                    + "VALUES(?,?,?,?,'ACTIVE','GRANT','TEST','Test role',?,0)",
                            UUID.randomUUID(), subject, role.name(), now.minusSeconds(60), now);
            }
        }
    }

    private static void person(JdbcTemplate jdbc, CryptoService crypto, String subject, Instant now) {
        jdbc.update("INSERT INTO access_subjects(subject,active,revision) SELECT ?,TRUE,0 WHERE NOT EXISTS(SELECT 1 FROM access_subjects WHERE subject=?)",
                subject, subject);
        if (count(jdbc, "SELECT COUNT(*) FROM workforce_people WHERE subject=?", subject) == 0)
            jdbc.update("INSERT INTO workforce_people(subject,display_name_encrypted,lifecycle_status,created_at,updated_at,revision) "
                    + "VALUES(?,?,'ACTIVE',?,?,0)", subject, crypto.encrypt(subject), now, now);
    }

    private static long count(JdbcTemplate jdbc, String sql, Object... params) {
        return jdbc.queryForObject(sql, Long.class, params);
    }
}
