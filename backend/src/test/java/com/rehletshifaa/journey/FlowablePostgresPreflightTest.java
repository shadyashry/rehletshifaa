package com.rehletshifaa.journey;

import com.rehletshifaa.journey.application.*;
import com.rehletshifaa.journey.domain.*;
import com.rehletshifaa.journey.infrastructure.FlowableJourneyRuntimeAdapter;
import org.flowable.spring.SpringProcessEngineConfiguration;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionTemplate;
import java.util.*;
import static org.assertj.core.api.Assertions.*;

/** Run only against an explicitly supplied disposable database; never reads application credentials. */
@EnabledIfSystemProperty(named="journey.postgres.test-url",matches="jdbc:postgresql://127[.]0[.]0[.]1:55438/journey_runtime_test")
class FlowablePostgresPreflightTest {
    @Test void supportedSchemaAndAtomicEngineDomainRollback() {
        var source=new DriverManagerDataSource(System.getProperty("journey.postgres.test-url"),"postgres","");
        var jdbc=new JdbcTemplate(source);
        String schema="phase4b_"+UUID.randomUUID().toString().replace("-","");
        jdbc.execute("CREATE SCHEMA "+schema);
        var isolated=new DriverManagerDataSource(System.getProperty("journey.postgres.test-url")+"?currentSchema="+schema,"postgres","");
        var manager=new DataSourceTransactionManager(isolated);
        var tx=new TransactionTemplate(manager);
        var config=new SpringProcessEngineConfiguration();
        config.setDataSource(isolated);config.setTransactionManager(manager);config.setDatabaseSchemaUpdate("true");
        config.setDatabaseSchema(schema);
        config.setDisableIdmEngine(true);config.setDisableEventRegistry(true);config.setEnableConfiguratorServiceLoader(false);
        config.setAsyncExecutorActivate(false);config.setBeans(Map.of());
        org.flowable.engine.ProcessEngine engine=null;
        try {
            engine=config.buildProcessEngine();
            var runtime=new FlowableJourneyRuntimeAdapter(engine);
            var compiler=JourneyCompilerTest.compiler();
            var deployment=tx.execute(s->runtime.deploy(compiler.compile(UUID.randomUUID(),JourneyGraphTest.linear())));
            var instance=tx.execute(s->runtime.start(deployment,"postgres-fixture",Map.of()));
            var domain=new JdbcTemplate(isolated);domain.execute("CREATE TABLE domain_effect(id INT PRIMARY KEY)");
            assertThatThrownBy(()->tx.execute(s->{domain.update("INSERT INTO domain_effect VALUES(1)");runtime.complete(instance.reference(),"review",Map.of());throw new IllegalStateException("rollback");})).hasMessage("rollback");
            assertThat(domain.queryForObject("SELECT count(*) FROM domain_effect",Integer.class)).isZero();
            assertThat(runtime.inspect(instance.reference()).completed()).isFalse();
            assertThat(tx.execute(s->runtime.complete(instance.reference(),"review",Map.of())).completed()).isTrue();
            long count=engine.getRepositoryService().createDeploymentQuery().count();
            tx.executeWithoutResult(s->{runtime.deploy(compiler.compile(UUID.randomUUID(),JourneyGraphTest.linear()));s.setRollbackOnly();});
            assertThat(engine.getRepositoryService().createDeploymentQuery().count()).isEqualTo(count);
        } finally {if(engine!=null)engine.close();jdbc.execute("DROP SCHEMA "+schema+" CASCADE");}
    }
}
