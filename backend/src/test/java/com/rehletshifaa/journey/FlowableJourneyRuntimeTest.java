package com.rehletshifaa.journey;

import com.rehletshifaa.journey.application.*;
import com.rehletshifaa.journey.infrastructure.FlowableJourneyRuntimeAdapter;
import com.rehletshifaa.journey.domain.*;
import org.flowable.engine.ProcessEngine;
import org.flowable.spring.SpringProcessEngineConfiguration;
import org.junit.jupiter.api.*;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionTemplate;
import java.util.*;
import static com.rehletshifaa.journey.domain.JourneyModel.*;
import static org.assertj.core.api.Assertions.*;

class FlowableJourneyRuntimeTest {
    ProcessEngine engine;
    FlowableJourneyRuntimeAdapter runtime;
    JourneyCompiler compiler=JourneyCompilerTest.compiler();
    DriverManagerDataSource source;
    DataSourceTransactionManager manager;
    TransactionTemplate tx;
    @BeforeEach void open() {
        source=new DriverManagerDataSource("jdbc:h2:mem:runtime_"+UUID.randomUUID()+";DB_CLOSE_DELAY=-1","sa","");
        manager=new DataSourceTransactionManager(source); tx=new TransactionTemplate(manager);
        build();
    }
    void build() {
        var config=new SpringProcessEngineConfiguration();
        config.setDataSource(source); config.setTransactionManager(manager); config.setDatabaseSchemaUpdate("true");
        config.setDisableIdmEngine(true); config.setDisableEventRegistry(true); config.setEnableConfiguratorServiceLoader(false);
        config.setAsyncExecutorActivate(false); config.setBeans(Map.of());
        engine=config.buildProcessEngine(); runtime=new FlowableJourneyRuntimeAdapter(engine);
    }
    @AfterEach void close() { engine.close(); new JdbcTemplate(source).execute("SHUTDOWN"); }
    JourneyRuntimePort.Deployment deploy(Graph graph) { return tx.execute(s->runtime.deploy(compiler.compile(UUID.randomUUID(),graph))); }
    @Test void humanWorkPersistsAcrossRestartAndCompletesOnlyOnce() {
        var deployment=deploy(JourneyGraphTest.linear());
        var instance=tx.execute(s->runtime.start(deployment,"synthetic",Map.of()));
        assertThat(instance.activities()).extracting(JourneyRuntimePort.Activity::nodeKey).containsExactly("n_review");
        engine.close(); build();
        assertThat(runtime.inspect(instance.reference()).completed()).isFalse();
        assertThat(tx.execute(s->runtime.complete(instance.reference(),"review",Map.of())).completed()).isTrue();
        assertThatThrownBy(()->tx.execute(s->runtime.complete(instance.reference(),"review",Map.of()))).hasMessageContaining("not currently available");
        assertThatThrownBy(()->runtime.inspect("unknown")).hasMessageContaining("not found");
    }
    @Test void conditionalDecisionNeedsKnownFact() {
        var deployment=deploy(JourneyGraphTest.branch());
        for (boolean value:List.of(true,false)) assertThat(tx.execute(s->runtime.start(deployment,"branch-"+value,Map.of("PROPOSAL_ACCEPTED",value))).completed()).isTrue();
        assertThatThrownBy(()->tx.execute(s->runtime.start(deployment,"missing",Map.of()))).isInstanceOf(RuntimeException.class);
    }
    @Test void domainAndEngineRollbackTogether() {
        var jdbc=new JdbcTemplate(source); jdbc.execute("CREATE TABLE domain_effect(id INT PRIMARY KEY)");
        var deployment=deploy(JourneyGraphTest.linear());
        var instance=tx.execute(s->runtime.start(deployment,"rollback",Map.of()));
        assertThatThrownBy(()->tx.execute(s->{ jdbc.update("INSERT INTO domain_effect VALUES(1)"); runtime.complete(instance.reference(),"review",Map.of()); throw new IllegalStateException("handler failed"); })).hasMessage("handler failed");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM domain_effect",Integer.class)).isZero();
        assertThat(runtime.inspect(instance.reference()).activities()).hasSize(1);
        long count=engine.getRepositoryService().createDeploymentQuery().count();
        tx.executeWithoutResult(s->{runtime.deploy(compiler.compile(UUID.randomUUID(),JourneyGraphTest.linear())); s.setRollbackOnly();});
        assertThat(engine.getRepositoryService().createDeploymentQuery().count()).isEqualTo(count);
    }
    @Test void waitRejectsMissingOrFalseFactsAndAdvancesWhenSatisfied() {
        var original=JourneyGraphTest.linear();
        var wait=new Node("review","Profile",StageType.WAIT,"SYSTEM",null,null,new Condition("PROFILE_COMPLETE",true),null,null,true);
        var graph=new Graph(original.nodes().stream().map(n->n.key().equals("review")?wait:n).toList(),original.edges());
        var instance=tx.execute(s->runtime.start(deploy(graph),"wait",Map.of()));
        assertThat(instance.completed()).isFalse();
        assertThat(tx.execute(s->runtime.signal(instance.reference(),"review",Map.of("PROFILE_COMPLETE",false))).completed()).isFalse();
        assertThat(tx.execute(s->runtime.signal(instance.reference(),"review",Map.of("PROFILE_COMPLETE",true))).completed()).isTrue();
    }
    @Test void timerPersistsAcrossRestartAndCompletesThroughEngineJob() {
        var original=JourneyGraphTest.linear();
        var timer=new Node("review","Timer",StageType.TIMER,"SYSTEM",null,null,null,null,1L,true);
        var graph=new Graph(original.nodes().stream().map(n->n.key().equals("review")?timer:n).toList(),original.edges());
        var instance=tx.execute(s->runtime.start(deploy(graph),"timer",Map.of()));
        engine.close(); build();
        var job=engine.getManagementService().createTimerJobQuery().processInstanceId(instance.reference()).singleResult();
        assertThat(job).isNotNull();
        var executable=engine.getManagementService().moveTimerToExecutableJob(job.getId());
        engine.getManagementService().executeJob(executable.getId());
        assertThat(runtime.inspect(instance.reference()).completed()).isTrue();
    }
}
