package com.rehletshifaa.coordination.application;

import com.rehletshifaa.coordination.domain.Routing.*;
import org.springframework.stereotype.Service;
import java.math.*;
import java.util.*;

@Service
public class CoordinatorScoringService {
    public static final String ALGORITHM="coordination-v1";
    public List<Scored> score(List<Candidate> candidates,PolicyConfig p){return candidates.stream().filter(c->c.exclusions().isEmpty()).map(c->{BigDecimal capacity=BigDecimal.valueOf(c.maximum()-c.workload()).divide(BigDecimal.valueOf(c.maximum()),8,RoundingMode.HALF_UP);BigDecimal language=c.languageMatch()?BigDecimal.ONE:BigDecimal.ZERO;return new Scored(c,capacity,language,capacity.multiply(BigDecimal.valueOf(p.capacityWeight())).add(language.multiply(BigDecimal.valueOf(p.languageWeight()))));}).sorted(Comparator.comparing(Scored::score).reversed().thenComparing(s->ratio(s.candidate())).thenComparing(s->s.candidate().lastAssignment(),Comparator.nullsFirst(Comparator.naturalOrder())).thenComparing(s->s.candidate().subject())).toList();}
    private BigDecimal ratio(Candidate c){return BigDecimal.valueOf(c.workload()).divide(BigDecimal.valueOf(c.maximum()),8,RoundingMode.HALF_UP);}
    public Selection select(CaseFacts c,Policy p,Preference preference,List<Candidate> candidates){return select(c,p,preference,candidates,Map.of());}
    public Selection select(CaseFacts c,Policy p,Preference preference,List<Candidate> candidates,Map<UUID,UUID> teamFallbacks){List<Scored> scored=score(candidates,p.configuration());
        for(String path:List.of("CONTINUITY","PREFERRED_COORDINATOR")){String subject=path.equals("CONTINUITY")?c.owner():preference==null?null:preference.coordinator();if(subject!=null)for(Scored s:scored)if(s.candidate().subject().equals(subject))return new Selection(subject,s.candidate().teams().getFirst(),path,scored);}
        List<UUID> pools=new ArrayList<>();List<String> paths=new ArrayList<>();add(pools,paths,preference==null?null:preference.team(),"PREFERRED_TEAM");add(pools,paths,c.careArea()==null?null:p.configuration().careAreaTeams().get(c.careArea()),"CARE_AREA_TEAM");add(pools,paths,p.configuration().defaultTeam(),"DEFAULT_TEAM");add(pools,paths,preference==null?null:preference.fallbackTeam(),"CONSULTANT_FALLBACK_TEAM");add(pools,paths,p.configuration().fallbackTeam(),"FALLBACK_TEAM");
        for(UUID pool:List.copyOf(pools))add(pools,paths,teamFallbacks.get(pool),"TEAM_FALLBACK");
        for(int i=0;i<pools.size();i++)for(Scored s:scored)if(s.candidate().teams().contains(pools.get(i)))return new Selection(s.candidate().subject(),pools.get(i),paths.get(i),scored);
        if(!scored.isEmpty()){Candidate winner=scored.getFirst().candidate();return new Selection(winner.subject(),winner.teams().getFirst(),"SCORED_POOL",scored);}
        return new Selection(null,pools.isEmpty()?null:pools.getFirst(),"NO_ELIGIBLE_COORDINATOR",scored);
    }
    private void add(List<UUID> pools,List<String> paths,UUID team,String path){if(team!=null){pools.add(team);paths.add(path);}}
}
