package com.rehletshifaa.journey;

import com.rehletshifaa.access.application.*;
import com.rehletshifaa.journey.application.*;
import com.rehletshifaa.journey.domain.JourneyModel.*;
import com.rehletshifaa.journey.infrastructure.JourneyDeploymentRepository;
import org.flowable.engine.ProcessEngine;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import java.time.Clock;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static com.rehletshifaa.journey.application.JourneyDefinitionService.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties={"spring.task.scheduling.enabled=false","app.journey.runtime.enabled=true",
        "app.journey.runtime.schema-update=true",
        "spring.datasource.url=jdbc:h2:mem:journey-deployment;MODE=LEGACY;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1"})
@AutoConfigureMockMvc
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class JourneyDeploymentIntegrationTest {
    @Autowired JourneyDefinitionService service;
    @Autowired JourneyDeploymentService deployments;
    @Autowired JourneyDeploymentRepository repository;
    @Autowired AccessBootstrapService bootstrap;
    @Autowired RoleAssignmentService assignments;
    @Autowired JdbcTemplate jdbc;
    @Autowired Clock clock;
    @Autowired PlatformTransactionManager manager;
    @Autowired ProcessEngine engine;
    @Autowired JourneyRuntimePort runtime;
    @Autowired MockMvc mvc;
    @Autowired JourneyShadowService shadows;

    @Test @Order(1) void atomicPublicationAndImmutableDeploymentWithIndependentRunningVersions() throws Exception {
        var f=new JourneyDefinitionIntegrationTest();
        f.service=service;f.bootstrap=bootstrap;f.assignments=assignments;f.jdbc=jdbc;f.clock=clock;
        var tx=new TransactionTemplate(manager);
        try {
            tx.executeWithoutResult(s->f.setup());
            var pending=f.prepare();
            f.signIn("checker");
            long before=engine.getRepositoryService().createDeploymentQuery().count();
            tx.executeWithoutResult(s->{service.publish(pending.definitionId(),pending.id(),f.change(pending.revision()));s.setRollbackOnly();});
            assertThat(service.version(pending.definitionId(),pending.id()).status()).isEqualTo(Status.PENDING_APPROVAL);
            assertThat(repository.find(pending.id())).isEmpty();
            assertThat(engine.getRepositoryService().createDeploymentQuery().count()).isEqualTo(before);
            var published=service.publish(pending.definitionId(),pending.id(),f.change(pending.revision()));
            assertThat(published.runtimeDeployment()).isEqualTo("DEPLOYED");
            var deployment=repository.find(published.id()).orElseThrow();
            var original=runtime.start(deployment.engine(),"synthetic-old",Map.of());
            deployments.deployPublished(published.definitionId(),published.id(),f.change(published.revision()));
            assertThat(engine.getRepositoryService().createDeploymentQuery().count()).isEqualTo(before+1);
            assertThat(jdbc.queryForObject("SELECT count(*) FROM audit_events WHERE action='JOURNEY_DEPLOYED' AND entity_id=?",Integer.class,published.id().toString())).isEqualTo(1);
            f.signIn("maker");
            var next=service.cloneVersion(published.definitionId(),published.id(),f.change(published.revision()));
            next=service.edit(next.definitionId(),next.id(),new Edit(next.revision(),"Next independent version",JourneyGraphTest.branch()));
            next=service.simulate(next.definitionId(),next.id(),new Simulate(next.revision(),"True branch",Map.of("PROPOSAL_ACCEPTED",true))).version();
            next=service.submit(next.definitionId(),next.id(),f.change(next.revision()));
            f.signIn("checker");
            var newer=service.publish(next.definitionId(),next.id(),f.change(next.revision()));
            assertThat(runtime.start(repository.find(newer.id()).orElseThrow().engine(),"synthetic-new",Map.of("PROPOSAL_ACCEPTED",true)).completed()).isTrue();
            assertThat(runtime.inspect(original.reference()).completed()).isFalse();
            assertThat(runtime.complete(original.reference(),"review",Map.of()).completed()).isTrue();
            String path="/api/v1/admin/journeys/"+published.definitionId()+"/versions/"+published.id()+"/runtime";
            mvc.perform(get(path).with(jwt().jwt(j->j.subject("unassigned")))).andExpect(status().isForbidden());
            mvc.perform(get(path).with(jwt().jwt(j->j.subject("maker")))).andExpect(status().isOk())
                    .andExpect(jsonPath("$.status").value("DEPLOYED"))
                    .andExpect(jsonPath("$.engine").doesNotExist());
            f.signIn("maker");
            assertThatThrownBy(()->deployments.deployPublished(published.definitionId(),published.id(),f.change(published.revision()))).hasMessageContaining("not allowed");
        } finally { f.clear(); }
    }

    @Test @Order(2) void finalRegisteredPatientHandlerCanBecomeRuntimePublished() {
        // All eleven catalog actions now have concrete handlers; prove the former fail-closed fixture publishes.
        new TransactionTemplate(manager).executeWithoutResult(s->{
            var f=new JourneyDefinitionIntegrationTest(); f.service=service;f.bootstrap=bootstrap;f.assignments=assignments;f.jdbc=jdbc;f.clock=clock;
            try {
                f.signIn("maker");
                var definition=service.list().getFirst().id();
                var latest=service.detail(definition).versions().getFirst();
                var draft=service.cloneVersion(definition,latest.id(),f.change(latest.revision()));
                UUID version=draft.id();
                var graph=JourneyGraphTest.linear();
                var nodes=graph.nodes().stream().map(n->n.key().equals("review")?new Node(n.key(),n.label(),StageType.PATIENT_ACTION,"PATIENT","REVIEW_PROPOSAL",null,null,null,null,false):n).toList();
                draft=service.edit(definition,version,new Edit(draft.revision(),"Registered patient action",new Graph(nodes,graph.edges())));
                draft=service.simulate(definition,version,new Simulate(draft.revision(),"Domain simulation",Map.of())).version();
                var pending=service.submit(definition,version,f.change(draft.revision()));
                f.signIn("checker");
                var published=service.publish(definition,version,f.change(pending.revision()));
                assertThat(repository.find(version)).isPresent();
                assertThat(published.status().name()).isEqualTo("PUBLISHED");
            } finally {s.setRollbackOnly();f.clear();}
        });
    }

    @Test @Order(3) void syntheticRunsPinVersionAndReplayWithoutProductionSideEffects() {
        var f=new JourneyDefinitionIntegrationTest();f.clock=clock;f.jdbc=jdbc;
        try {
            f.signIn("maker");
            var definition=service.list().getFirst().id();
            var versions=service.detail(definition).versions();
            var first=versions.getLast();
            var counts=f.counts();
            var start=new JourneyShadowService.Start("synthetic-start",Map.of());
            var run=shadows.start(definition,first.id(),start);
            assertThat(run.journeyVersionId()).isEqualTo(first.id());
            assertThat(run.activities()).extracting(JourneyShadowService.Activity::action).containsExactly("RECORD_CLINICAL_DECISION");
            assertThat(shadows.start(definition,first.id(),start)).isEqualTo(run);
            assertThatThrownBy(()->shadows.start(definition,versions.getFirst().id(),start)).hasMessageContaining("different start");
            assertThatThrownBy(()->shadows.read(definition,versions.getFirst().id(),run.id())).hasMessageContaining("not found");
            assertThatThrownBy(()->shadows.step(definition,first.id(),run.id(),new JourneyShadowService.Step("wrong",0,"other",false,Map.of()))).hasMessageContaining("not currently available");
            f.signIn("checker");
            assertThatThrownBy(()->shadows.step(definition,first.id(),run.id(),new JourneyShadowService.Step("permission",0,"review",false,Map.of()))).hasMessageContaining("not allowed");
            service.retire(definition,first.id(),f.change(first.revision()));
            f.signIn("maker");
            assertThatThrownBy(()->shadows.start(definition,first.id(),new JourneyShadowService.Start("retired-start",Map.of()))).hasMessageContaining("published");
            var step=new JourneyShadowService.Step("synthetic-step",0,"review",false,Map.of());
            new TransactionTemplate(manager).executeWithoutResult(s->{shadows.step(definition,first.id(),run.id(),step);s.setRollbackOnly();});
            assertThat(shadows.read(definition,first.id(),run.id()).revision()).isZero();
            assertThat(shadows.read(definition,first.id(),run.id()).completed()).isFalse();
            assertThat(jdbc.queryForObject("SELECT count(*) FROM journey_shadow_commands WHERE run_id=?",Integer.class,run.id())).isZero();
            var result=shadows.step(definition,first.id(),run.id(),step);
            assertThat(result.completed()).isTrue();
            assertThat(shadows.step(definition,first.id(),run.id(),step)).isEqualTo(result);
            assertThatThrownBy(()->shadows.step(definition,first.id(),run.id(),new JourneyShadowService.Step("synthetic-step",0,"review",true,Map.of()))).hasMessageContaining("different action");
            assertThatThrownBy(()->shadows.step(definition,first.id(),run.id(),new JourneyShadowService.Step("stale",0,"review",false,Map.of()))).hasMessageContaining("changed");
            assertThat(f.counts()).isEqualTo(counts);
            assertThat(jdbc.queryForObject("SELECT count(*) FROM journey_shadow_commands WHERE run_id=?",Integer.class,run.id())).isEqualTo(1);
            f.signIn("unassigned");
            assertThatThrownBy(()->shadows.step(definition,first.id(),run.id(),step)).hasMessageContaining("not allowed");
            assertThatThrownBy(()->shadows.read(definition,first.id(),run.id())).hasMessageContaining("not allowed");
        } finally {f.clear();}
    }

    @Test @Order(4) void concurrentSyntheticStartAndCompletionDeduplicate() throws Exception {
        var f=new JourneyDefinitionIntegrationTest();f.clock=clock;
        try {
            f.signIn("maker");
            var definition=service.list().getFirst().id();
            var latest=service.detail(definition).versions().getFirst();
            var draft=service.cloneVersion(definition,latest.id(),f.change(latest.revision()));
            draft=service.edit(definition,draft.id(),new Edit(draft.revision(),"Concurrency fixture",JourneyGraphTest.linear()));
            draft=service.simulate(definition,draft.id(),new Simulate(draft.revision(),"Synthetic",Map.of())).version();
            draft=service.submit(definition,draft.id(),f.change(draft.revision()));
            f.signIn("checker");
            var published=service.publish(definition,draft.id(),f.change(draft.revision()));
            var start=new JourneyShadowService.Start("concurrent-start",Map.of());
            var starts=race(f,()->shadows.start(definition,published.id(),start));
            assertThat(starts.getFirst()).isEqualTo(starts.getLast());
            var run=starts.getFirst();
            var step=new JourneyShadowService.Step("concurrent-step",0,"review",false,Map.of());
            var results=race(f,()->shadows.step(definition,published.id(),run.id(),step));
            assertThat(results.getFirst()).isEqualTo(results.getLast());
            assertThat(results.getFirst().completed()).isTrue();
            assertThat(jdbc.queryForObject("SELECT count(*) FROM journey_shadow_runs WHERE command_key='concurrent-start'",Integer.class)).isEqualTo(1);
            assertThat(jdbc.queryForObject("SELECT count(*) FROM journey_shadow_commands WHERE run_id=?",Integer.class,run.id())).isEqualTo(1);
        } finally {f.clear();}
    }
    private List<JourneyShadowService.View> race(JourneyDefinitionIntegrationTest fixture,java.util.concurrent.Callable<JourneyShadowService.View> operation)throws Exception {
        var ready=new java.util.concurrent.CountDownLatch(2);
        var start=new java.util.concurrent.CountDownLatch(1);
        try(var pool=java.util.concurrent.Executors.newFixedThreadPool(2)) {
            var futures=new ArrayList<java.util.concurrent.Future<JourneyShadowService.View>>();
            for(int i=0;i<2;i++)futures.add(pool.submit(()->{
                fixture.signIn("maker");ready.countDown();
                try {if(!start.await(10,java.util.concurrent.TimeUnit.SECONDS))throw new IllegalStateException("Barrier timed out");return operation.call();}
                finally {fixture.clear();}
            }));
            assertThat(ready.await(10,java.util.concurrent.TimeUnit.SECONDS)).isTrue();start.countDown();
            return List.of(futures.getFirst().get(20,java.util.concurrent.TimeUnit.SECONDS),futures.getLast().get(20,java.util.concurrent.TimeUnit.SECONDS));
        }
    }
}
