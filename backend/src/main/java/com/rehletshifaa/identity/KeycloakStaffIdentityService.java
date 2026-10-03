package com.rehletshifaa.identity;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.rehletshifaa.shared.api.ApiException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.util.UriComponentsBuilder;

import java.net.URI;
import java.time.Instant;
import java.util.*;

/** Least-privilege Keycloak integration for staff lifecycle; passwords never pass through this application. */
@Service
public class KeycloakStaffIdentityService implements IdentityProvisioningPort {
    private static final List<String> INVITE_ACTIONS=List.of("VERIFY_EMAIL","UPDATE_PASSWORD","CONFIGURE_TOTP");
    /** Workspace roles the portal understands; Keycloak defaults (offline_access, uma_authorization, default-roles-*) are not reported. */
    private final RestClient http;
    private final ObjectMapper json;
    private final String baseUrl,realm,clientId,clientSecret,webClientId,webBaseUrl;
    private final int inviteLifespan;

    @org.springframework.beans.factory.annotation.Autowired
    public KeycloakStaffIdentityService(org.springframework.web.client.RestClient.Builder http, ObjectMapper json,
        @Value("${app.identity-admin.base-url:http://localhost:8180}") String baseUrl,
        @Value("${app.identity-admin.realm:rehletshifaa}") String realm,
        @Value("${app.identity-admin.client-id:staff-identity-admin}") String clientId,
        @Value("${app.identity-admin.client-secret:}") String clientSecret,
        @Value("${app.identity-admin.web-client-id:rehletshifaa-web}") String webClientId,
        @Value("${app.web-base-url:http://localhost:3000}") String webBaseUrl,
        @Value("${app.identity-admin.invite-lifespan-seconds:43200}") int inviteLifespan) {
        // The Boot builder carries the finite spring.http.client timeouts; RestClient.create() has none.
        this(http.build(),json,baseUrl,realm,clientId,clientSecret,webClientId,webBaseUrl,inviteLifespan);
    }

    KeycloakStaffIdentityService(RestClient http,ObjectMapper json,String baseUrl,String realm,String clientId,
            String clientSecret,String webClientId,String webBaseUrl,int inviteLifespan) {
        this.http=http;this.json=json;this.baseUrl=stripSlash(baseUrl);this.realm=realm;this.clientId=clientId;this.clientSecret=clientSecret;
        this.webClientId=webClientId;this.webBaseUrl=stripSlash(webBaseUrl);this.inviteLifespan=inviteLifespan;
    }

    @Override
    public IdentityAccount invite(String name,String email,String locale) {
        return invite(name,email,null,locale,null);
    }

    @Override public IdentityAccount inviteTracked(String name,String email,String locale,String operationMarker){return invite(name,email,null,locale,operationMarker);}
    @Override public IdentityAccount inviteTracked(String name,String email,String locale,String operationMarker,String compatibilityRole){return invite(name,email,compatibilityRole,locale,operationMarker);}

    /** Legacy staff compatibility only; new business services use IdentityProvisioningPort. */
    public IdentityAccount invite(String name,String email,String role,String locale) {
        return invite(name,email,role,locale,null);
    }
    private IdentityAccount invite(String name,String email,String role,String locale,String operationMarker) {
        requireConfigured();
        String normalized=email.trim().toLowerCase(Locale.ROOT);
        if(!findByEmail(normalized).isEmpty())throw new ApiException(409,"STAFF_EMAIL_EXISTS","An identity account already uses this email address");
        Map<String,Object> user=new LinkedHashMap<>();
        user.put("username",normalized);user.put("email",normalized);user.put("firstName",name.trim());
        user.put("enabled",true);user.put("emailVerified",false);user.put("requiredActions",INVITE_ACTIONS);
        Map<String,List<String>> attributes=new LinkedHashMap<>();attributes.put("locale",List.of("ar".equals(locale)?"ar":"en"));
        if(operationMarker!=null&&!operationMarker.isBlank())attributes.put("rehletshifaaProvisioningOperation",List.of(operationMarker));user.put("attributes",attributes);
        try {
            ResponseEntity<Void> response=http.post().uri(admin("/users")).header("Authorization",bearer()).contentType(MediaType.APPLICATION_JSON).body(user).retrieve().toBodilessEntity();
            String subject=subjectFrom(response.getHeaders().getLocation());
            try {if(role!=null)replaceStaffRole(subject,role);sendInvite(subject,locale);}
            catch(RuntimeException failure){if(operationMarker==null||operationMarker.isBlank())deleteQuietly(subject);throw failure;}
            return new IdentityAccount(subject,normalized,"INVITED",Instant.now());
        } catch(RestClientResponseException e) {throw identityFailure(e,"Unable to create the staff identity account");}
    }

    @Override public Optional<IdentityAccount> recover(String operationMarker){requireConfigured();URI uri=UriComponentsBuilder.fromUriString(admin("/users")).queryParam("q","rehletshifaaProvisioningOperation:"+operationMarker).build().encode().toUri();try{List<Map<String,Object>> found=http.get().uri(uri).header("Authorization",bearer()).retrieve().body(new org.springframework.core.ParameterizedTypeReference<>(){});if(found==null||found.isEmpty())return Optional.empty();if(found.size()!=1)throw new ApiException(409,"AMBIGUOUS_IDENTITY_RECOVERY","Identity recovery returned more than one account");Map<String,Object> user=found.get(0);return Optional.of(new IdentityAccount(String.valueOf(user.get("id")),String.valueOf(user.get("email")),"INVITED",Instant.now()));}catch(RestClientResponseException e){throw identityFailure(e,"Unable to reconcile the identity account");}}

    @Override public EmailResolution resolveVerifiedEmail(String email) {
        requireConfigured();
        String normalized=email.trim().toLowerCase(Locale.ROOT);
        List<Map<String,Object>> found=findByEmail(normalized).stream()
                .filter(user -> normalized.equalsIgnoreCase(String.valueOf(user.get("email"))))
                .toList();
        if(found.isEmpty()) return EmailResolution.none();
        if(found.size()!=1 || !Boolean.TRUE.equals(found.get(0).get("emailVerified"))) return EmailResolution.reviewRequired();
        return EmailResolution.unique(String.valueOf(found.get(0).get("id")), normalized);
    }

    public void resend(String subject,String locale){requireConfigured();sendInvite(subject,locale);}

    public void setEnabled(String subject,boolean enabled){
        requireConfigured();
        try {http.put().uri(admin("/users/"+encode(subject))).header("Authorization",bearer()).contentType(MediaType.APPLICATION_JSON).body(Map.of("enabled",enabled)).retrieve().toBodilessEntity();}
        catch(RestClientResponseException e){throw identityFailure(e,"Unable to update the identity account");}
    }

    @Override public void logout(String subject){
        requireConfigured();
        try {http.post().uri(admin("/users/"+encode(subject)+"/logout")).header("Authorization",bearer()).retrieve().toBodilessEntity();}
        catch(RestClientResponseException e){throw identityFailure(e,"Unable to end the identity account sessions");}
    }

    public String status(String subject,String storedStatus){
        if("DISABLED".equals(storedStatus)||clientSecret.isBlank())return storedStatus;
        try {
            Map<String,Object> user=http.get().uri(admin("/users/"+encode(subject))).header("Authorization",bearer()).retrieve().body(new org.springframework.core.ParameterizedTypeReference<>(){});
            if(user==null||Boolean.FALSE.equals(user.get("enabled")))return "DISABLED";
            Object actions=user.get("requiredActions");
            return actions instanceof Collection<?> collection&&!collection.isEmpty()?"INVITED":"ACTIVE";
        } catch(RuntimeException ignored){return storedStatus;}
    }

    @Override
    public IdentityState identityState(String subject) {
        if (clientSecret.isBlank()) return IdentityState.unavailable();
        try {
            Map<String,Object> user=http.get().uri(admin("/users/"+encode(subject))).header("Authorization",bearer())
                    .retrieve().body(new org.springframework.core.ParameterizedTypeReference<>(){});
            if (user == null) return new IdentityState(true,false,false,false,false);
            List<Map<String,Object>> credentials=http.get().uri(admin("/users/"+encode(subject)+"/credentials"))
                    .header("Authorization",bearer()).retrieve().body(new org.springframework.core.ParameterizedTypeReference<>(){});
            Set<String> types=(credentials==null?List.<Map<String,Object>>of():credentials).stream()
                    .map(value->String.valueOf(value.get("type"))).collect(java.util.stream.Collectors.toSet());
            boolean phishingResistant=types.contains("webauthn")||types.contains("webauthn-passwordless");
            return new IdentityState(true,true,Boolean.TRUE.equals(user.get("enabled")),types.contains("otp")||phishingResistant,phishingResistant);
        } catch(RestClientResponseException e) {
            if(e.getStatusCode().value()==404)return new IdentityState(true,false,false,false,false);
            return IdentityState.unavailable();
        } catch(RuntimeException e) { return IdentityState.unavailable(); }
    }


    private void replaceStaffRole(String subject,String role){
        Map<String,Object> staffRole=role(role);Map<String,Object> patientRole=role("PATIENT");
        http.post().uri(admin("/users/"+encode(subject)+"/role-mappings/realm")).header("Authorization",bearer()).contentType(MediaType.APPLICATION_JSON).body(List.of(staffRole)).retrieve().toBodilessEntity();
        http.method(HttpMethod.DELETE).uri(admin("/users/"+encode(subject)+"/role-mappings/realm")).header("Authorization",bearer()).contentType(MediaType.APPLICATION_JSON).body(List.of(patientRole)).retrieve().toBodilessEntity();
    }

    @Override public void setCompatibilityRole(String subject,String role){requireConfigured();replaceStaffRole(subject,role);}

    private Map<String,Object> role(String name){
        return http.get().uri(admin("/roles/"+encode(name))).header("Authorization",bearer()).retrieve().body(new org.springframework.core.ParameterizedTypeReference<>(){});
    }

    @Override public void sendPasswordReset(String subject,String locale){
        requireConfigured();
        URI uri=UriComponentsBuilder.fromUriString(admin("/users/"+encode(subject)+"/execute-actions-email"))
            .queryParam("client_id",webClientId).queryParam("redirect_uri",webBaseUrl+"/"+("ar".equals(locale)?"ar":"en")+"/portal")
            .queryParam("lifespan",inviteLifespan).build().encode().toUri();
        try {http.put().uri(uri).header("Authorization",bearer()).contentType(MediaType.APPLICATION_JSON).body(List.of("UPDATE_PASSWORD")).retrieve().toBodilessEntity();}
        catch(RestClientResponseException e){throw identityFailure(e,"The password reset email could not be sent");}
    }

    /** Removes OTP and WebAuthn credentials and requires enrolment again at next sign-in. */
    @Override public void resetMfa(String subject){
        requireConfigured();
        try {
            List<Map<String,Object>> credentials=http.get().uri(admin("/users/"+encode(subject)+"/credentials")).header("Authorization",bearer())
                .retrieve().body(new org.springframework.core.ParameterizedTypeReference<>(){});
            for(Map<String,Object> credential:credentials==null?List.<Map<String,Object>>of():credentials){
                String type=String.valueOf(credential.get("type"));
                if(type.equals("otp")||type.startsWith("webauthn"))
                    http.delete().uri(admin("/users/"+encode(subject)+"/credentials/"+encode(String.valueOf(credential.get("id"))))).header("Authorization",bearer()).retrieve().toBodilessEntity();
            }
            http.put().uri(admin("/users/"+encode(subject))).header("Authorization",bearer()).contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("requiredActions",List.of("CONFIGURE_TOTP"))).retrieve().toBodilessEntity();
        } catch(RestClientResponseException e){throw identityFailure(e,"The MFA reset could not be completed");}
    }

    private void sendInvite(String subject,String locale){
        URI uri=UriComponentsBuilder.fromUriString(admin("/users/"+encode(subject)+"/execute-actions-email"))
            .queryParam("client_id",webClientId).queryParam("redirect_uri",webBaseUrl+"/"+("ar".equals(locale)?"ar":"en")+"/portal")
            .queryParam("lifespan",inviteLifespan).build().encode().toUri();
        try {http.put().uri(uri).header("Authorization",bearer()).contentType(MediaType.APPLICATION_JSON).body(INVITE_ACTIONS).retrieve().toBodilessEntity();}
        catch(RestClientResponseException e){throw identityFailure(e,"The account was created, but the invitation email could not be sent");}
    }

    private List<Map<String,Object>> findByEmail(String email){
        URI uri=UriComponentsBuilder.fromUriString(admin("/users")).queryParam("email",email).queryParam("exact",true).build().encode().toUri();
        try {List<Map<String,Object>> found=http.get().uri(uri).header("Authorization",bearer()).retrieve().body(new org.springframework.core.ParameterizedTypeReference<>(){});return found==null?List.of():found;}
        catch(RestClientResponseException e){throw identityFailure(e,"Unable to check the staff email address");}
    }

    private String bearer(){
        var form=new LinkedMultiValueMap<String,String>();form.add("grant_type","client_credentials");form.add("client_id",clientId);form.add("client_secret",clientSecret);
        try {Map<String,Object> token=http.post().uri(baseUrl+"/realms/"+encode(realm)+"/protocol/openid-connect/token").contentType(MediaType.APPLICATION_FORM_URLENCODED).body(form).retrieve().body(new org.springframework.core.ParameterizedTypeReference<>(){});return "Bearer "+Objects.requireNonNull(token).get("access_token");}
        catch(RestClientResponseException e){throw identityFailure(e,"Staff identity service is unavailable");}
    }
    private void deleteQuietly(String subject){try{http.delete().uri(admin("/users/"+encode(subject))).header("Authorization",bearer()).retrieve().toBodilessEntity();}catch(Exception ignored){}}
    private String admin(String path){return baseUrl+"/admin/realms/"+encode(realm)+path;}
    private void requireConfigured(){if(clientSecret.isBlank())throw new ApiException(503,"IDENTITY_ADMIN_NOT_CONFIGURED","Staff identity invitations are not configured");}
    private ApiException identityFailure(RestClientResponseException e,String message){return new ApiException(e.getStatusCode().value()==409?409:502,"IDENTITY_PROVIDER_ERROR",message);}
    private String subjectFrom(URI location){if(location==null)throw new ApiException(502,"IDENTITY_PROVIDER_ERROR","Identity provider returned no account identifier");String path=location.getPath();return path.substring(path.lastIndexOf('/')+1);}
    private static String stripSlash(String value){return value.endsWith("/")?value.substring(0,value.length()-1):value;}
    private static String encode(String value){return java.net.URLEncoder.encode(value,java.nio.charset.StandardCharsets.UTF_8);}
}
