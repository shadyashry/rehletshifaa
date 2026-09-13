package com.rehletshifaa.access;

import com.rehletshifaa.access.application.*;
import com.rehletshifaa.access.domain.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import static org.assertj.core.api.Assertions.*;

@SpringBootTest(properties={"spring.task.scheduling.enabled=false","spring.datasource.url=jdbc:h2:mem:access-concurrency;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1"})
@DirtiesContext
class AccessConcurrencyTest {
    @Autowired AccessBootstrapService bootstrap;
    @Autowired RoleAssignmentService assignments;
    @Autowired RoleTemplateService roles;
    @Autowired JdbcTemplate jdbc;
    @Autowired Clock clock;
    void authenticate() { SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(
            Jwt.withTokenValue("test").header("alg","none").subject("owner-concurrency").claim("auth_time",clock.instant()).build(),List.of())); }
    @Test void concurrentDuplicateGrantAndDraftEditsSerializeAndFailedMutationRollsBack() throws Exception {
        bootstrap.initialize("owner-concurrency");
        jdbc.update("UPDATE role_template_versions SET effective_from=? WHERE created_by='ENGINEERING'",clock.instant().minusSeconds(60));
        var command=new RoleAssignmentService.Grant("concurrent-member",UUID.fromString("31000001-0000-0000-0000-000000000001"),
                ResourceContext.PLATFORM,ScopeType.PLATFORM,null,null,clock.instant(),null,"Concurrent test grant");
        var results=race(()->assignments.grant(command));
        assertThat(results).contains("SUCCESS");
        assertThat(results.stream().filter("SUCCESS"::equals)).hasSize(1);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM role_assignments WHERE subject='concurrent-member'",Integer.class)).isEqualTo(1);
        authenticate();
        var role=roles.create(new RoleTemplateService.Create("Concurrent role","Concurrency test","Review access",ActorType.GOVERNANCE,ChannelEntitlement.ADMIN_WEB));
        var version=role.versions().getFirst().version();
        var edits=race(()->roles.edit(role.role().id(),version.id(),new RoleTemplateService.Edit(0,
                List.of(new RolePermissionGrant("access.role.view",ScopeType.PLATFORM,null)),"Concurrent draft edit")));
        assertThat(edits.stream().filter("SUCCESS"::equals)).hasSize(1);
        authenticate();
        assertThatThrownBy(()->assignments.grant(new RoleAssignmentService.Grant("rollback-subject",UUID.randomUUID(),ResourceContext.PLATFORM,
                ScopeType.PLATFORM,null,null,clock.instant(),null,"Invalid version"))).isInstanceOf(RuntimeException.class);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM access_subjects WHERE subject='rollback-subject'",Integer.class)).isZero();
        var token=Jwt.withTokenValue("denied").header("alg","none").subject("denied-mutation").build();
        SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(token,List.of()));
        assertThatThrownBy(()->roles.create(new RoleTemplateService.Create("Denied","Denied","Denied",ActorType.GOVERNANCE,ChannelEntitlement.ADMIN_WEB)))
                .hasMessageContaining("not allowed");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM audit_events WHERE actor_subject='denied-mutation' AND action='ACCESS_DENIED'",Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM role_templates WHERE display_name='Denied'",Integer.class)).isZero();
        SecurityContextHolder.clearContext();
    }
    List<String> race(Callable<?> action) throws Exception {
        try(var pool=Executors.newFixedThreadPool(2)) {
            var ready=new CountDownLatch(2);var start=new CountDownLatch(1);
            Callable<String> run=()->{authenticate();ready.countDown();start.await(10,TimeUnit.SECONDS);
                try { action.call();return "SUCCESS"; } catch(com.rehletshifaa.shared.api.ApiException e) { return e.code(); }
                finally { SecurityContextHolder.clearContext(); }};
            var first=pool.submit(run);var second=pool.submit(run);assertThat(ready.await(10,TimeUnit.SECONDS)).isTrue();start.countDown();
            return List.of(first.get(30,TimeUnit.SECONDS),second.get(30,TimeUnit.SECONDS));
        }
    }
}
