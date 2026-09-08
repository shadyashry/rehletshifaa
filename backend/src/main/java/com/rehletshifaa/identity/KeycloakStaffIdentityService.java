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
public class KeycloakStaffIdentityService {
    private static final List<String> INVITE_ACTIONS=List.of("VERIFY_EMAIL","UPDATE_PASSWORD");
    private final RestClient http=RestClient.create();
    private final ObjectMapper json;
    private final String baseUrl,realm,clientId,clientSecret,webClientId,webBaseUrl;
    private final int inviteLifespan;

    public KeycloakStaffIdentityService(ObjectMapper json,
        @Value("${app.identity-admin.base-url:http://localhost:8180}") String baseUrl,
        @Value("${app.identity-admin.realm:rehletshifaa}") String realm,
        @Value("${app.identity-admin.client-id:staff-identity-admin}") String clientId,
        @Value("${app.identity-admin.client-secret:}") String clientSecret,
        @Value("${app.identity-admin.web-client-id:rehletshifaa-web}") String webClientId,
        @Value("${app.web-base-url:http://localhost:3000}") String webBaseUrl,
        @Value("${app.identity-admin.invite-lifespan-seconds:43200}") int inviteLifespan) {
        this.json=json;this.baseUrl=stripSlash(baseUrl);this.realm=realm;this.clientId=clientId;this.clientSecret=clientSecret;
        this.webClientId=webClientId;this.webBaseUrl=stripSlash(webBaseUrl);this.inviteLifespan=inviteLifespan;
    }

    public IdentityAccount invite(String name,String email,String role,String locale) {
        requireConfigured();
        String normalized=email.trim().toLowerCase(Locale.ROOT);
        if(!findByEmail(normalized).isEmpty())throw new ApiException(409,"STAFF_EMAIL_EXISTS","An identity account already uses this email address");
        Map<String,Object> user=new LinkedHashMap<>();
        user.put("username",normalized);user.put("email",normalized);user.put("firstName",name.trim());
        user.put("enabled",true);user.put("emailVerified",false);user.put("requiredActions",INVITE_ACTIONS);
        user.put("attributes",Map.of("locale",List.of("ar".equals(locale)?"ar":"en")));
        try {
            ResponseEntity<Void> response=http.post().uri(admin("/users")).header("Authorization",bearer()).contentType(MediaType.APPLICATION_JSON).body(user).retrieve().toBodilessEntity();
            String subject=subjectFrom(response.getHeaders().getLocation());
            try {replaceStaffRole(subject,role);sendInvite(subject,locale);}
            catch(RuntimeException failure){deleteQuietly(subject);throw failure;}
            return new IdentityAccount(subject,normalized,"INVITED",Instant.now());
        } catch(RestClientResponseException e) {throw identityFailure(e,"Unable to create the staff identity account");}
    }

    public void resend(String subject,String locale){requireConfigured();sendInvite(subject,locale);}

    public void setEnabled(String subject,boolean enabled){
        requireConfigured();
        try {http.put().uri(admin("/users/"+encode(subject))).header("Authorization",bearer()).contentType(MediaType.APPLICATION_JSON).body(Map.of("enabled",enabled)).retrieve().toBodilessEntity();}
        catch(RestClientResponseException e){throw identityFailure(e,"Unable to update the identity account");}
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

    private void replaceStaffRole(String subject,String role){
        Map<String,Object> staffRole=role(role);Map<String,Object> patientRole=role("PATIENT");
        http.post().uri(admin("/users/"+encode(subject)+"/role-mappings/realm")).header("Authorization",bearer()).contentType(MediaType.APPLICATION_JSON).body(List.of(staffRole)).retrieve().toBodilessEntity();
        http.method(HttpMethod.DELETE).uri(admin("/users/"+encode(subject)+"/role-mappings/realm")).header("Authorization",bearer()).contentType(MediaType.APPLICATION_JSON).body(List.of(patientRole)).retrieve().toBodilessEntity();
    }

    private Map<String,Object> role(String name){
        return http.get().uri(admin("/roles/"+encode(name))).header("Authorization",bearer()).retrieve().body(new org.springframework.core.ParameterizedTypeReference<>(){});
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
    public record IdentityAccount(String subject,String email,String status,Instant invitedAt){}
}
