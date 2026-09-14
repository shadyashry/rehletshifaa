package com.rehletshifaa.coordination.application;

import com.rehletshifaa.access.application.*;
import com.rehletshifaa.access.domain.*;
import com.rehletshifaa.access.infrastructure.*;
import com.rehletshifaa.coordination.domain.Routing.*;
import com.rehletshifaa.coordination.infrastructure.CoordinationRepository;
import com.rehletshifaa.shared.api.ApiException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.*;
import java.util.*;

@Service
public class CoordinationConfigurationService {
    private final CoordinationRepository repo; private final AuthorizationService auth;
    private final RoleAssignmentRepository access; private final AccessAuditRepository audit; private final Clock clock;
    public CoordinationConfigurationService(CoordinationRepository repo,AuthorizationService auth,RoleAssignmentRepository access,AccessAuditRepository audit,Clock clock){this.repo=repo;this.auth=auth;this.access=access;this.audit=audit;this.clock=clock;}
    public AccessIdentity.Identity authorize(UUID org,String permission){if(!repo.organization(org,false))throw new ApiException(404,"PROVIDER_NOT_FOUND","Provider was not found or is suspended");return auth.require(permission,context(org),ChannelEntitlement.ADMIN_WEB,ChannelEntitlement.API);}
    public static ResourceContext context(UUID org){return new ResourceContext(org,true,"ORGANIZATION",org.toString(),null,false);}
    private AccessIdentity.Identity begin(UUID org,String permission){repo.lock();if(!repo.organization(org,true))bad("Provider was not found or is suspended");return authorize(org,permission);}
    public List<Team> teams(UUID org){authorize(org,"assignment.team.view");return repo.teams(org);}
    public Team team(UUID org,UUID id){return repo.teams(org).stream().filter(t->t.id().equals(id)).findFirst().orElseThrow(()->new ApiException(404,"TEAM_NOT_FOUND","Team was not found in this provider"));}
    @Transactional public Team saveTeam(UUID org,UUID id,String name,TeamConfig c,long revision,String reason){var actor=begin(org,"assignment.team.manage");text(name,150);text(reason,500);if(c==null)bad("Team configuration is required");text(c.purpose(),500);values(c.careAreas());values(c.languages());try{ZoneId.of(c.timeZone());}catch(Exception e){bad("Choose an IANA time zone");}validTeam(org,c.fallbackTeam());if(id!=null&&id.equals(c.fallbackTeam()))bad("A team cannot fall back to itself");if(id!=null)team(org,id);Team t=new Team(id==null?UUID.randomUUID():id,org,name,c,revision);repo.team(t,id==null);audit.record(actor.subject(),t.id().toString(),"COORDINATOR_TEAM_CHANGED","SUCCESS","organization="+org+"; "+reason);return team(org,t.id());}
    public List<Member> members(UUID org,UUID id){authorize(org,"assignment.team.view");team(org,id);return repo.members(id);}
    @Transactional public List<Member> saveMember(UUID org,UUID id,Member m,String reason){var actor=begin(org,"assignment.team.manage");team(org,id);text(reason,500);text(m.subject(),255);period(m.effectiveFrom(),m.effectiveTo(),false);if(m.active())member(org,m.subject());repo.member(id,m);audit.record(actor.subject(),id.toString(),"COORDINATOR_MEMBERSHIP_CHANGED","SUCCESS","organization="+org+"; subject="+m.subject()+"; active="+m.active()+"; "+reason);return repo.members(id);}
    public List<Capacity> capacities(UUID org){authorize(org,"assignment.team.view");return repo.capacities(org);}
    @Transactional public List<Capacity> saveCapacity(UUID org,Capacity c,String reason){var actor=begin(org,"assignment.team.manage");text(reason,500);member(org,c.subject());if(c.maximum()<0||c.maximum()>10000)bad("Capacity must be between 0 and 10000");values(c.languages());values(c.careAreas());repo.capacity(org,c);audit.record(actor.subject(),org.toString(),"COORDINATOR_CAPACITY_CHANGED","SUCCESS","subject="+c.subject()+"; maximum="+c.maximum()+"; onDuty="+c.onDuty()+"; "+reason);return repo.capacities(org);}
    public List<Policy> policies(UUID org){authorize(org,"assignment.policy.view");return repo.policies(org);}
    @Transactional public Policy savePolicy(UUID org,int expected,Instant fromInput,Instant toInput,PolicyConfig c,String reason){Instant from=precise(fromInput),to=precise(toInput);var actor=begin(org,"assignment.policy.manage");text(reason,500);period(from,to,true);if(c==null||c.capacityWeight()<0||c.languageWeight()<0||c.capacityWeight()+c.languageWeight()!=100||c.queueHours()<1||c.queueHours()>720||c.careAreaTeams()==null||c.careAreaTeams().size()>100)bad("Choose valid normalized weights, team mappings and queue deadline");validTeam(org,c.providerTeam());validTeam(org,c.defaultTeam());validTeam(org,c.fallbackTeam());c.careAreaTeams().forEach((k,v)->{text(k,80);validTeam(org,v);});var previous=repo.policies(org);if((previous.isEmpty()?0:previous.getFirst().version())!=expected)stale();if(previous.stream().anyMatch(p->overlap(from,to,p.effectiveFrom(),p.effectiveTo())))bad("Policy effective periods cannot overlap; publish the next interval");Policy p=new Policy(UUID.randomUUID(),org,expected+1,from,to,c);repo.policy(p,actor.subject(),clock.instant());audit.record(actor.subject(),p.id().toString(),"ROUTING_POLICY_PUBLISHED","SUCCESS","organization="+org+"; version="+p.version()+"; "+reason);return p;}
    public List<Preference> preferences(UUID org,UUID consultant){authorize(org,"assignment.policy.view");consultant(org,consultant);return repo.preferences(org,consultant);}
    @Transactional public Preference savePreference(UUID org,UUID consultant,int expected,Instant fromInput,Instant toInput,String subject,UUID team,UUID fallback,String reason){Instant from=precise(fromInput),to=precise(toInput);var actor=begin(org,"assignment.preference.manage");consultant(org,consultant);text(reason,500);period(from,to,true);if(subject!=null)member(org,subject);validTeam(org,team);validTeam(org,fallback);var previous=repo.preferences(org,consultant);if((previous.isEmpty()?0:previous.getFirst().version())!=expected)stale();if(previous.stream().anyMatch(p->overlap(from,to,p.effectiveFrom(),p.effectiveTo())))bad("Preference effective periods cannot overlap");Preference p=new Preference(UUID.randomUUID(),org,consultant,expected+1,from,to,subject,team,fallback);repo.preference(p,actor.subject());audit.record(actor.subject(),p.id().toString(),"ROUTING_PREFERENCE_PUBLISHED","SUCCESS","organization="+org+"; version="+p.version()+"; "+reason);return p;}
    public Policy effectivePolicy(UUID org,Instant at){return repo.policies(org).stream().filter(p->effective(p.effectiveFrom(),p.effectiveTo(),at)).findFirst().orElseThrow(()->new ApiException(409,"ROUTING_POLICY_MISSING","An effective routing policy is required"));}
    public Preference effectivePreference(UUID org,UUID consultant,Instant at){return repo.preferences(org,consultant).stream().filter(p->effective(p.effectiveFrom(),p.effectiveTo(),at)).findFirst().orElse(null);}
    public void validTeam(UUID org,UUID id){if(id!=null)team(org,id);}
    private void member(UUID org,String subject){text(subject,255);if(!access.activeMember(subject,org,clock.instant()))throw new ApiException(403,"COORDINATOR_SCOPE_DENIED","Target requires active membership in this provider");}
    private void consultant(UUID org,UUID id){if(!repo.consultant(org,id))throw new ApiException(404,"CONSULTANT_NOT_FOUND","Consultant was not found in this provider");}
    public static boolean effective(Instant from,Instant to,Instant at){return !from.isAfter(at)&&(to==null||to.isAfter(at));}
    private static boolean overlap(Instant a,Instant b,Instant c,Instant d){return (d==null||a.isBefore(d))&&(b==null||c.isBefore(b));}
    private static Instant precise(Instant at){return at==null?null:at.truncatedTo(java.time.temporal.ChronoUnit.MICROS);}
    private static void period(Instant from,Instant to,boolean finite){if(from==null||finite&&to==null||to!=null&&!to.isAfter(from))bad("Choose a valid effective period with a finite end for versioned configuration");}
    public static void text(String value,int max){if(value==null||value.isBlank()||value.length()>max)bad("A bounded non-empty value or reason is required");}
    private static void values(Set<String> values){if(values==null||values.size()>30)bad("Choose at most 30 metadata values");for(String s:values){text(s,30);if(s.contains(",")||!s.equals(s.trim()))bad("Use trimmed metadata values without commas");}}
    public static void bad(String message){throw new ApiException(400,"INVALID_ROUTING_CONFIGURATION",message);}
    public static void stale(){throw new ApiException(409,"STALE_ROUTING","Routing changed; reload and retry");}
}
