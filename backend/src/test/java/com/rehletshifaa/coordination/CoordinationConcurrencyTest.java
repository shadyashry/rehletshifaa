package com.rehletshifaa.coordination;

import com.rehletshifaa.coordination.application.*;
import com.rehletshifaa.coordination.domain.Routing.*;
import com.rehletshifaa.coordination.infrastructure.CoordinationRepository;
import com.rehletshifaa.shared.crypto.CryptoService;
import com.rehletshifaa.shared.api.ApiException;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import java.util.*;
import java.util.concurrent.*;
import static org.assertj.core.api.Assertions.*;

@SpringBootTest(properties={"spring.task.scheduling.enabled=false","spring.datasource.url=jdbc:h2:mem:coordination-races;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1;LOCK_TIMEOUT=15000"})
class CoordinationConcurrencyTest {
    @Autowired AssignmentEngine engine;@Autowired CoordinationConfigurationService config;@Autowired CoordinationRepository repo;
    @Autowired JdbcTemplate jdbc;@Autowired CryptoService crypto;@Autowired PlatformTransactionManager transactions;
    @Test void duplicateDeliveryStaleWritersManualAutomaticAndCapacityRacesAreDatabaseSerialized()throws Exception{
        CoordinationIntegrationTest fixture=new CoordinationIntegrationTest();fixture.engine=engine;fixture.config=config;fixture.repo=repo;fixture.jdbc=jdbc;fixture.crypto=crypto;
        new TransactionTemplate(transactions).executeWithoutResult(s->fixture.seed());
        fixture.command("SHADOW",0,null);fixture.command("ACTIVATE",1,null);
        Command retry=new Command("same-race",2,"AUTO",null,null,null,"RACE");var replay=race(()->engine.execute(fixture.org,fixture.caseId,retry),()->engine.execute(fixture.org,fixture.caseId,retry));assertThat(replay).allMatch(x->x instanceof Decision);assertThat(((Decision)replay.get(0)).id()).isEqualTo(((Decision)replay.get(1)).id());
        long revision=repo.facts(fixture.caseId).revision();var competing=race(()->engine.execute(fixture.org,fixture.caseId,new Command("one",revision,"AUTO",null,null,null,"RACE")),()->engine.execute(fixture.org,fixture.caseId,new Command("two",revision,"AUTO",null,null,null,"RACE")));oneWinner(competing);
        long next=repo.facts(fixture.caseId).revision();var manual=race(()->engine.execute(fixture.org,fixture.caseId,new Command("automatic",next,"AUTO",null,null,null,"RACE")),()->engine.execute(fixture.org,fixture.caseId,new Command("manual",next,"REASSIGN","routing-b",null,"Manager decision","RACE")));oneWinner(manual);
        assertThat(fixture.count("SELECT COUNT(*) FROM case_assignments WHERE case_id=? AND assignee_role='COORDINATOR' AND status='ACTIVE'",fixture.caseId)).isEqualTo(1);
        // Two different cases compete for the same final global capacity slot.
        fixture.capacity("routing-a",0,true);fixture.capacity("routing-b",0,true);
        UUID first=new TransactionTemplate(transactions).execute(s->fixture.medicalCase(fixture.consultant));UUID second=new TransactionTemplate(transactions).execute(s->fixture.medicalCase(fixture.consultant));
        for(UUID id:List.of(first,second)){engine.execute(fixture.org,id,new Command("shadow",0,"SHADOW",null,null,null,"RACE"));engine.execute(fixture.org,id,new Command("adopt",1,"ACTIVATE",null,null,"Reviewed queue","RACE"));}
        int current=(int)repo.workload("routing-a",UUID.randomUUID());fixture.capacity("routing-a",current+1,true);
        var capacity=race(()->engine.execute(fixture.org,first,new Command("route",2,"AUTO",null,null,null,"RACE")),()->engine.execute(fixture.org,second,new Command("route",2,"AUTO",null,null,null,"RACE")));
        assertThat(capacity).allMatch(x->x instanceof Decision);assertThat(capacity.stream().map(x->(Decision)x).filter(d->d.selectedOwner()!=null)).hasSize(1);
        assertThat(repo.workload("routing-a",UUID.randomUUID())).isEqualTo(current+1);
    }
    private void oneWinner(List<Object> results){assertThat(results.stream().filter(x->x instanceof Decision)).hasSize(1);assertThat(results.stream().filter(x->x instanceof ApiException)).hasSize(1);assertThat(results.stream().filter(x->x instanceof ApiException).findFirst().orElseThrow()).isInstanceOf(ApiException.class);}
    private List<Object> race(Callable<Decision> first,Callable<Decision> second)throws Exception{CountDownLatch ready=new CountDownLatch(2),start=new CountDownLatch(1);try(var pool=Executors.newFixedThreadPool(2)){List<Future<Object>> futures=new ArrayList<>();for(Callable<Decision> action:List.of(first,second))futures.add(pool.submit(()->{CoordinationIntegrationTest.signIn("routing-manager");ready.countDown();if(!start.await(10,TimeUnit.SECONDS))throw new IllegalStateException("Race start timeout");try{return action.call();}catch(ApiException e){return e;}finally{org.springframework.security.core.context.SecurityContextHolder.clearContext();}}));assertThat(ready.await(10,TimeUnit.SECONDS)).isTrue();start.countDown();return List.of(futures.get(0).get(20,TimeUnit.SECONDS),futures.get(1).get(20,TimeUnit.SECONDS));}}
}
