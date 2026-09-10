package com.rehletshifaa.notification.application;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.rehletshifaa.shared.crypto.CryptoService;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import java.util.*;
@Service
public class NotificationOutboxProcessor {
    private static final int BATCH_SIZE=20;
    private final NotificationOutboxStore store; private final List<NotificationChannelPort> channels; private final ObjectMapper json; private final String webBaseUrl; private final CryptoService crypto;
    public NotificationOutboxProcessor(NotificationOutboxStore store,List<NotificationChannelPort> channels,ObjectMapper json,@org.springframework.beans.factory.annotation.Value("${app.web-base-url:http://localhost:3000}")String webBaseUrl,CryptoService crypto){this.store=store;this.channels=channels;this.json=json;this.webBaseUrl=webBaseUrl;this.crypto=crypto;}
    /**
     * Deliberately not transactional: an email or WhatsApp message cannot be rolled back, so holding a
     * database transaction across the provider call would mean a late failure re-sends everything in the
     * batch. Claiming and recording each outcome are separate short transactions inside the store.
     */
    @Scheduled(fixedDelayString="${app.notifications.poll-milliseconds:5000}")
    public void dispatch(){
        for(NotificationOutboxStore.OutboxMessage message:store.claim(BATCH_SIZE))deliver(message);
    }
    private void deliver(NotificationOutboxStore.OutboxMessage message){
        NotificationChannelPort channel=channels.stream().filter(c->c.supports(message.channel())).findFirst().orElse(null);
        if(channel==null){fail(message,"CHANNEL_NOT_CONFIGURED");return;}
        Template rendered;
        try{rendered=render(message.templateKey(),message.templateData());}
        catch(Exception e){fail(message,"TEMPLATE_FAILURE");return;} // never retryable: the data will not improve
        try{store.recordDelivered(message.id(),channel.deliver(message.destination(),rendered.subject(),rendered.body(),message.idempotencyKey()));}
        catch(Exception e){fail(message,"PROVIDER_FAILURE");}
    }
    private void fail(NotificationOutboxStore.OutboxMessage message,String code){store.recordFailure(message.id(),message.attempts(),message.maxAttempts(),code);}
    private Template render(String key,String raw){try{String clear=raw.startsWith("enc:")?crypto.decrypt(raw.substring(4)):raw;Map<String,String> data=json.readValue(clear,new TypeReference<>(){});return switch(key){case "case-claim-code"->new Template("Your RehletShifaa verification code","Your verification code is "+data.get("code")+". It expires shortly. Do not share it with anyone.");case "new-case-received"->new Template("New medical case received","A new case is ready in the coordinator intake queue. Sign in to the secure portal to review it.");case "case-submitted"->new Template("Your case was received","Your RehletShifaa case was received. Use the secure link we sent to follow its progress.");case "case-status-link"->new Template("Your RehletShifaa case was received","Your case was received. Check its status securely: "+webBaseUrl+"/"+lang(data)+"/status/"+data.get("token"));case "case-access-code"->new Template("Your RehletShifaa verification code","Your verification code is "+data.get("code")+". It expires in 15 minutes. Do not share it with anyone.");case "patient-action-link"->new Template("Action required for your RehletShifaa case","Your coordinator needs information from you. Respond securely: "+webBaseUrl+"/"+lang(data)+"/status/"+data.get("token"));case "proposal-access-code"->new Template("Your RehletShifaa verification code","Your verification code is "+data.get("code")+". It expires in 15 minutes. Do not share it with anyone.");case "proposal-ready"->new Template("Your treatment proposal is ready","Your RehletShifaa treatment proposal is ready to review securely: "+webBaseUrl+"/"+lang(data)+"/proposal/"+data.get("token")+" — you will confirm a one-time code before anything is shown.");case "account-activation"->new Template("Activate your RehletShifaa account","Your proposal was accepted. Activate your account to follow your journey: "+webBaseUrl+"/"+lang(data)+"/portal?activate="+data.get("token"));case "onboarding-activation"->new Template("Complete your RehletShifaa profile","Your treatment proposal has been accepted. One secure link now covers everything that comes next: completing your profile, your coordination deposit, and access to your secure portal. Complete My Profile: "+webBaseUrl+"/"+lang(data)+"/activate/"+data.get("token")+" — for your security you will confirm a one-time code first.");case "staff-work-assigned"->new Template("Action required: "+data.get("title"),"You have new work in the RehletShifaa portal"+(data.get("case")==null||data.get("case").isBlank()?"":" for case "+data.get("case"))+": "+data.get("title")+". Sign in to the secure portal to act on it.");case "deposit-settled-coordinator"->new Template("Deposit received — case ready for coordination","A patient has completed profile activation and settled the coordination deposit. The case is waiting for you in the secure portal.");case "deposit-settled-patient"->new Template("Your treatment journey is now active","We have received your coordination deposit. Your RehletShifaa coordinator is starting the next stage of your treatment journey and will contact you shortly.");case "secure-message"->new Template("New secure message from RehletShifaa","A new secure message is available. Check your case securely: "+webBaseUrl+"/"+lang(data)+"/status/"+data.get("token"));default->throw new IllegalArgumentException("Unknown notification template");};}catch(Exception e){throw new IllegalStateException("Invalid notification template data",e);}}
    private String lang(Map<String,String> data){String l=data.get("lang");return "ar".equals(l)?"ar":"en";}
    private record Template(String subject,String body){}
}
