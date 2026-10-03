package com.rehletshifaa.access.platform.application;

import com.rehletshifaa.access.platform.infrastructure.PlatformGovernanceBootstrapStore;
import com.rehletshifaa.identity.IdentityProvisioningPort;
import com.rehletshifaa.shared.api.ApiException;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.util.List;

@Service
public class PlatformGovernanceBootstrapService {
    private final IdentityProvisioningPort identities;
    private final PlatformGovernanceBootstrapStore store;
    private final Clock clock;

    public PlatformGovernanceBootstrapService(IdentityProvisioningPort identities, PlatformGovernanceBootstrapStore store, Clock clock) {
        this.identities=identities;this.store=store;this.clock=clock;
    }

    public PlatformGovernanceBootstrapStore.Result initialize(String ownerSubject,List<String> administratorSubjects){
        String owner=subject(ownerSubject);
        List<String> administrators=administratorSubjects==null?List.of():administratorSubjects.stream().map(PlatformGovernanceBootstrapService::subject).distinct().sorted().toList();
        if(administrators.size()!=2)throw new ApiException(400,"INITIAL_ADMINISTRATORS_REQUIRED","Configure exactly two distinct initial System Administrators");
        if(administrators.contains(owner))throw new ApiException(400,"OWNER_ADMINISTRATOR_SEPARATION_REQUIRED","The Platform Account Owner must be distinct from the initial System Administrators");
        var completed=store.completed();
        if(completed.isPresent()){
            var result=completed.get();
            if(result.owner().equals(owner)&&result.administrators().equals(administrators))return result;
            throw new ApiException(409,"GOVERNANCE_ALREADY_BOOTSTRAPPED","Platform governance was already bootstrapped with different subjects");
        }
        verifyPhishingResistant(owner,"Platform Account Owner");
        for(String administrator:administrators)verifyPhishingResistant(administrator,"initial System Administrator");
        return store.initialize(owner,administrators,clock.instant());
    }

    private void verifyPhishingResistant(String subject,String label){
        var state=identities.identityState(subject);
        if(!state.available())throw new ApiException(503,"IDENTITY_EVIDENCE_UNAVAILABLE","Keycloak credential evidence is unavailable for the "+label);
        if(!state.exists()||!state.enabled())throw new ApiException(409,"GOVERNANCE_IDENTITY_INELIGIBLE","The "+label+" identity must exist and be enabled");
        if(!state.phishingResistantMfaEnrolled())throw new ApiException(409,"PHISHING_RESISTANT_MFA_REQUIRED","The "+label+" must enroll a WebAuthn/passkey credential before bootstrap");
    }

    private static String subject(String value){if(value==null||value.isBlank()||value.trim().length()>255)throw new ApiException(400,"INVALID_GOVERNANCE_SUBJECT","Configure a valid governance identity subject");return value.trim();}
}
