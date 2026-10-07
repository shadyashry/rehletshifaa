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
        fixture.command("AUTO",0,null);
        Command retry=new Command("same-race",1,"AUTO",null,null,null,"RACE");var replay=race(()->engine.execute(fixture.caseId,retry),()->engine.execute(fixture.caseId,retry));assertThat(replay).allMatch(x->x instanceof Decision);assertThat(((Decision)replay.get(0)).id()).isEqualTo(((Decision)replay.get(1)).id());
        long revision=repo.facts(fixture.caseId).revision();var competing=race(()->engine.execute(fixture.caseId,new Command("one",revision,"AUTO",null,null,null,"RACE")),()->engine.execute(fixture.caseId,new Command("two",revision,"AUTO",null,null,null,"RACE")));oneWinner(competing);
        long next=repo.facts(fixture.caseId).revision();var manual=race(()->engine.execute(fixture.caseId,new Command("automatic",next,"AUTO",null,null,null,"RACE")),()->engine.execute(fixture.caseId,new Command("manual",next,"REASSIGN","routing-b",null,"Manager decision","RACE")));oneWinner(manual);
        assertThat(fixture.count("SELECT COUNT(*) FROM case_assignments WHERE case_id=? AND assignee_role='COORDINATOR' AND status='ACTIVE'",fixture.caseId)).isEqualTo(1);
        // Two different cases compete for the same final global capacity slot.
        fixture.capacity("routing-a",0,true);fixture.capacity("routing-b",0,true);
        UUID first=new TransactionTemplate(transactions).execute(s->fixture.medicalCase(fixture.consultant));UUID second=new TransactionTemplate(transactions).execute(s->fixture.medicalCase(fixture.consultant));
        for(UUID id:List.of(first,second))engine.execute(id,new Command("queue",0,"AUTO",null,null,null,"RACE"));
        int current=(int)repo.workload("routing-a",UUID.randomUUID());fixture.capacity("routing-a",current+1,true);
        var capacity=race(()->engine.execute(first,new Command("route",1,"AUTO",null,null,null,"RACE")),()->engine.execute(second,new Command("route",1,"AUTO",null,null,null,"RACE")));
        assertThat(capacity).allMatch(x->x instanceof Decision);assertThat(capacity.stream().map(x->(Decision)x).filter(d->d.selectedOwner()!=null)).hasSize(1);
        assertThat(repo.workload("routing-a",UUID.randomUUID())).isEqualTo(current+1);
    }
    /** CL2+CL3 review R4: authority is checked before the case and routing locks are taken, and again under them. */
    @Test void callersWithoutAuthorityAreRefusedWithoutWaitingForTheCaseOrRoutingLock()throws Exception{
        CoordinationIntegrationTest fixture=new CoordinationIntegrationTest();fixture.jdbc=jdbc;fixture.crypto=crypto;
        TransactionTemplate tx=new TransactionTemplate(transactions);
        UUID caseId=tx.execute(s->fixture.medicalCase(fixture.consultant()));
        com.rehletshifaa.authority.TestPrincipals.grant(jdbc,crypto,"r4-coordinator",com.rehletshifaa.authority.domain.Role.COORDINATOR);
        CountDownLatch held=new CountDownLatch(1),release=new CountDownLatch(1);
        try(var pool=Executors.newFixedThreadPool(2)){
            Future<?> holder=pool.submit(()->tx.executeWithoutResult(s->{repo.lockCase(caseId);repo.lock();held.countDown();
                try{release.await(30,TimeUnit.SECONDS);}catch(InterruptedException e){Thread.currentThread().interrupt();}}));
            try{
                assertThat(held.await(10,TimeUnit.SECONDS)).isTrue();
                // While another transaction holds both locks, an outsider is refused at once instead of queueing behind them.
                assertThat(pool.submit(()->as("r4-outsider",()->engine.claimCoordinatorCase(caseId))).get(5,TimeUnit.SECONDS)).isEqualTo("PERMISSION_NOT_HELD");
                assertThat(pool.submit(()->as("r4-outsider",()->engine.reassignCoordinator(caseId,"r4-coordinator","Take over"))).get(5,TimeUnit.SECONDS)).isEqualTo("PERMISSION_NOT_HELD");
            }finally{release.countDown();holder.get(30,TimeUnit.SECONDS);}
            // An unknown case is refused like any other case outside the caller's scope, not reported as missing.
            assertThat(pool.submit(()->as("r4-coordinator",()->engine.claimCoordinatorCase(UUID.randomUUID()))).get(10,TimeUnit.SECONDS)).isEqualTo("OUT_OF_SCOPE");
        }
    }
    private static String as(String subject,Callable<UUID> action){
        CoordinationIntegrationTest.signIn(subject);
        try{action.call();return "ALLOWED";}catch(ApiException e){return e.code();}catch(Exception e){throw new IllegalStateException(e);}
        finally{org.springframework.security.core.context.SecurityContextHolder.clearContext();}
    }
    private void oneWinner(List<Object> results){assertThat(results.stream().filter(x->x instanceof Decision)).hasSize(1);assertThat(results.stream().filter(x->x instanceof ApiException)).hasSize(1);assertThat(results.stream().filter(x->x instanceof ApiException).findFirst().orElseThrow()).isInstanceOf(ApiException.class);}
    private List<Object> race(Callable<Decision> first,Callable<Decision> second)throws Exception{CountDownLatch ready=new CountDownLatch(2),start=new CountDownLatch(1);try(var pool=Executors.newFixedThreadPool(2)){List<Future<Object>> futures=new ArrayList<>();for(Callable<Decision> action:List.of(first,second))futures.add(pool.submit(()->{CoordinationIntegrationTest.signIn("routing-manager");ready.countDown();if(!start.await(10,TimeUnit.SECONDS))throw new IllegalStateException("Race start timeout");try{return action.call();}catch(ApiException e){return e;}finally{org.springframework.security.core.context.SecurityContextHolder.clearContext();}}));assertThat(ready.await(10,TimeUnit.SECONDS)).isTrue();start.countDown();return List.of(futures.get(0).get(20,TimeUnit.SECONDS),futures.get(1).get(20,TimeUnit.SECONDS));}}
}
