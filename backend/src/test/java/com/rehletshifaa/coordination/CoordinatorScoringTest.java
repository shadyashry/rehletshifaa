package com.rehletshifaa.coordination;
import com.rehletshifaa.coordination.application.CoordinatorScoringService;
import com.rehletshifaa.coordination.domain.Routing.*;
import org.junit.jupiter.api.Test;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
class CoordinatorScoringTest {
    CoordinatorScoringService service=new CoordinatorScoringService();UUID team=UUID.randomUUID(),other=UUID.randomUUID();
    PolicyConfig config=new PolicyConfig(80,20,true,false,Map.of(),null,null,24);
    Candidate c(String subject,long load,boolean language,Instant last){return new Candidate(subject,List.of(team),10,load,true,language,last,List.of());}
    @Test void weightedScoreIsTransparentAndIneligibleNeverWins(){Candidate a=c("a",8,true,null),b=c("b",1,false,null),excluded=new Candidate("excluded",List.of(team),10,0,true,true,null,List.of("ACCESS_DENIED"));List<Scored> scored=service.score(List.of(a,excluded,b),config);assertThat(scored).extracting(s->s.candidate().subject()).containsExactly("b","a");assertThat(scored.getFirst().score()).isEqualByComparingTo(new BigDecimal("72"));assertThat(scored.get(1).score()).isEqualByComparingTo(new BigDecimal("36"));}
    @Test void equalScoreUsesNormalizedWorkloadThenOldestThenStableSubject(){PolicyConfig zeroCapacity=new PolicyConfig(0,100,true,false,Map.of(),null,null,24);Candidate busy=c("a",5,true,Instant.EPOCH),newer=c("b",2,true,Instant.now()),older=c("c",2,true,null),stable=c("d",2,true,null);List<String> expected=List.of("c","d","b","a");for(int i=0;i<20;i++){List<Candidate> candidates=new ArrayList<>(List.of(busy,newer,older,stable));Collections.shuffle(candidates,new Random(i));assertThat(service.score(candidates,zeroCapacity)).extracting(s->s.candidate().subject()).containsExactlyElementsOf(expected);}}
    @Test void precedenceUsesCareAreaThenDefaultThenScoredPool(){CaseFacts facts=new CaseFacts(UUID.randomUUID(),UUID.randomUUID(),"cardiology","en",null,0,"RECEIVED");Candidate a=c("a",9,false,null),b=new Candidate("b",List.of(other),10,0,true,true,null,List.of());
        assertThat(select(facts,new PolicyConfig(80,20,true,false,Map.of("cardiology",team),other,null,24),List.of(a,b)).path()).isEqualTo("CARE_AREA_TEAM");
        assertThat(select(facts,new PolicyConfig(80,20,true,false,Map.of(),team,null,24),List.of(a,b)).path()).isEqualTo("DEFAULT_TEAM");
        Selection scored=select(facts,config,List.of(a,b));assertThat(scored.path()).isEqualTo("SCORED_POOL");assertThat(scored.subject()).isEqualTo("b");
    }
    private Selection select(CaseFacts c,PolicyConfig config,List<Candidate> candidates){return service.select(c,new Policy(UUID.randomUUID(),1,Instant.EPOCH,null,config),null,candidates);}
}
