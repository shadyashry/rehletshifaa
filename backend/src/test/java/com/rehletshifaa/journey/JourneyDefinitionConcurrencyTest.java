package com.rehletshifaa.journey;

import com.rehletshifaa.journey.application.JourneyDefinitionService;
import com.rehletshifaa.journey.domain.JourneyModel.Version;
import com.rehletshifaa.shared.api.ApiException;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import java.time.Clock;
import java.util.*;
import java.util.concurrent.*;
import static org.assertj.core.api.Assertions.*;
import static com.rehletshifaa.journey.application.JourneyDefinitionService.*;

@SpringBootTest(properties={"spring.task.scheduling.enabled=false","spring.datasource.url=jdbc:h2:mem:journey-races;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1;LOCK_TIMEOUT=15000"})
class JourneyDefinitionConcurrencyTest {
 @Autowired JourneyDefinitionService service;@Autowired com.rehletshifaa.shared.crypto.CryptoService crypto;@Autowired JdbcTemplate jdbc;@Autowired Clock clock;@Autowired PlatformTransactionManager transactions;
 @Test void concurrentEditsAndCloneAndAuditRollback()throws Exception{
  var f=new JourneyDefinitionIntegrationTest();f.service=service;f.crypto=crypto;f.jdbc=jdbc;f.clock=clock;
  var tx=new TransactionTemplate(transactions);tx.executeWithoutResult(s->f.setup());
  var d=service.create();var v=d.versions().getFirst();
  var edits=race(f,()->service.edit(d.definition().id(),v.id(),new Edit(0,"Concurrent edit",JourneyGraphTest.linear())));
  winner(edits);assertThat(service.version(d.definition().id(),v.id()).revision()).isEqualTo(1);
  long before=jdbc.queryForObject("SELECT COUNT(*) FROM audit_events WHERE action='JOURNEY_DRAFT_UPDATED'",Long.class);
  tx.executeWithoutResult(s->{service.edit(d.definition().id(),v.id(),new Edit(1,"Rolled back",JourneyGraphTest.branch()));s.setRollbackOnly();});
  assertThat(service.version(d.definition().id(),v.id()).revision()).isEqualTo(1);
  assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM audit_events WHERE action='JOURNEY_DRAFT_UPDATED'",Long.class)).isEqualTo(before);
  var simulated=service.simulate(d.definition().id(),v.id(),new Simulate(1,"Dry run",Map.of())).version();
  var pending=service.submit(d.definition().id(),v.id(),new Change(simulated.revision(),"Review"));
  f.signIn("checker");var published=service.publish(d.definition().id(),v.id(),new Change(pending.revision(),"Approved"));f.signIn("maker");
  winner(race(f,()->service.cloneVersion(d.definition().id(),v.id(),new Change(published.revision(),"Next version"))));
  assertThat(service.detail(d.definition().id()).versions()).hasSize(2);f.clear();
 }
 void winner(List<Object> results){assertThat(results.stream().filter(x->x instanceof Version)).hasSize(1);assertThat(results.stream().filter(x->x instanceof ApiException)).hasSize(1);}
 List<Object> race(JourneyDefinitionIntegrationTest fixture,Callable<Version> action)throws Exception{
  CountDownLatch ready=new CountDownLatch(2),start=new CountDownLatch(1);
  try(var pool=Executors.newFixedThreadPool(2)){
   List<Future<Object>> futures=new ArrayList<>();for(int i=0;i<2;i++)futures.add(pool.submit(()->{fixture.signIn("maker");ready.countDown();if(!start.await(10,TimeUnit.SECONDS))throw new IllegalStateException();try{return action.call();}catch(ApiException e){return e;}finally{fixture.clear();}}));
   assertThat(ready.await(10,TimeUnit.SECONDS)).isTrue();start.countDown();return List.of(futures.get(0).get(20,TimeUnit.SECONDS),futures.get(1).get(20,TimeUnit.SECONDS));
  }
 }
}
