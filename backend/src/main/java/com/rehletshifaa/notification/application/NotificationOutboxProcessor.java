package com.rehletshifaa.notification.application;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.rehletshifaa.shared.crypto.CryptoService;
import io.micrometer.core.instrument.MeterRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import java.util.*;
@Service
public class NotificationOutboxProcessor {
    private static final Logger log=LoggerFactory.getLogger(NotificationOutboxProcessor.class);
    private static final int BATCH_SIZE=20;
    /**
     * No provider call may start this close to lease expiry. It must exceed the slowest single delivery the
     * configured client timeouts allow (SMTP connect+write+read, HTTP connect+read), or a reclaiming worker
     * could send the same message while this one is still inside its call.
     */
    public static final java.time.Duration SEND_MARGIN=java.time.Duration.ofSeconds(60);
    private final NotificationOutboxStore store; private final List<NotificationChannelPort> channels; private final ObjectMapper json; private final String webBaseUrl; private final CryptoService crypto; private final MeterRegistry metrics; private final java.time.Clock clock;
    private volatile boolean stopping;
    public NotificationOutboxProcessor(NotificationOutboxStore store,List<NotificationChannelPort> channels,ObjectMapper json,@org.springframework.beans.factory.annotation.Value("${app.web-base-url:http://localhost:3000}")String webBaseUrl,CryptoService crypto,MeterRegistry metrics,java.time.Clock clock){this.store=store;this.channels=channels;this.json=json;this.webBaseUrl=webBaseUrl;this.crypto=crypto;this.metrics=metrics;this.clock=clock;}
    /** Shutdown has begun: finish the in-flight send, hand every other claimed message straight back. */
    @org.springframework.context.event.EventListener(org.springframework.context.event.ContextClosedEvent.class) void stop(){stopping=true;}
    /**
     * Deliberately not transactional: an email or WhatsApp message cannot be rolled back, so holding a
     * database transaction across the provider call would mean a late failure re-sends everything in the
     * batch. Claiming and recording each outcome are separate short transactions inside the store.
     */
    @Scheduled(fixedDelayString="${app.notifications.poll-milliseconds:5000}")
    public void dispatch(){
        if(stopping)return;
        for(NotificationOutboxStore.OutboxMessage message:store.claim(BATCH_SIZE)){
            if(stopping||!clock.instant().isBefore(message.leaseExpiresAt().minus(SEND_MARGIN))){store.release(message.id(),message.attempts());continue;}
            deliver(message);
        }
    }
    private void deliver(NotificationOutboxStore.OutboxMessage message){
        NotificationChannelPort channel=channels.stream().filter(c->c.supports(message.channel())).findFirst().orElse(null);
        if(channel==null){fail(message,"CHANNEL_NOT_CONFIGURED",false);return;}
        Template rendered;
        try{rendered=render(message.templateKey(),message.templateData());}
        catch(Exception e){fail(message,"TEMPLATE_FAILURE",true);return;} // never retryable: the data will not improve
        String reference;
        try{reference=channel.deliver(message.destination(),rendered.subject(),rendered.body(),message.idempotencyKey());}
        catch(Exception e){fail(message,"PROVIDER_FAILURE",false);return;}
        // The provider accepted it. A failure to record that must not be booked as a provider failure (which
        // would schedule a deliberate re-send); the lease is left to expire, as for a crash at this point.
        try{if(store.recordDelivered(message.id(),message.attempts(),reference))count(message,"delivered");}
        catch(RuntimeException e){count(message,"delivered_unrecorded");log.error("Notification delivered but outcome not recorded: id={} channel={} attempt={}/{}",message.id(),message.channel(),message.attempts(),message.maxAttempts());}
    }
    private void fail(NotificationOutboxStore.OutboxMessage message,String code,boolean permanent){int max=permanent?message.attempts():message.maxAttempts();if(store.recordFailure(message.id(),message.attempts(),max,code)){String outcome=message.attempts()>=max?"dead_letter":"retry";count(message,outcome);log.warn("Notification delivery {}: id={} channel={} code={} attempt={}/{}",outcome,message.id(),message.channel(),code,message.attempts(),message.maxAttempts());}}
    private void count(NotificationOutboxStore.OutboxMessage message,String outcome){metrics.counter("notification.delivery","channel",message.channel(),"outcome",outcome).increment();}
    private Template render(String key,String raw){try{String clear=com.rehletshifaa.shared.crypto.EncryptedText.decode(crypto,raw);Map<String,String> data=json.readValue(clear,new TypeReference<>(){});return switch(key){case "consultant-credential-expiry"->new Template("Credential renewal reminder","A verified credential expires within "+data.get("days")+" day(s). Sign in to your consultant workspace to submit a renewal.");case "new-case-received"->new Template("New care request"+caseRef(data)+" — waiting in the team queue","A new care request"+caseRef(data)+" has been received and is waiting in the coordination team queue for a coordinator to take ownership. Sign in to the secure portal to review it.");case "case-status-link"->new Template("Your RehletShifaa case was received","Your case was received. Check its status securely: "+webBaseUrl+"/"+lang(data)+"/status/"+data.get("token"));case "case-access-code"->new Template("Your RehletShifaa verification code","Your verification code is "+data.get("code")+". It expires in 15 minutes. Do not share it with anyone.");case "patient-action-link"->new Template("Action required for your RehletShifaa case","Your coordinator needs information from you. Respond securely: "+webBaseUrl+"/"+lang(data)+"/status/"+data.get("token"));case "proposal-access-code"->new Template("Your RehletShifaa verification code","Your verification code is "+data.get("code")+". It expires in 15 minutes. Do not share it with anyone.");case "proposal-ready"->new Template("Your treatment proposal is ready","Your treatment proposal is ready to review securely: "+webBaseUrl+"/"+lang(data)+"/proposal/"+data.get("token")+" — you will confirm a one-time code before anything is shown.");case "onboarding-activation"->new Template("Complete your RehletShifaa profile","Your treatment proposal has been accepted. One secure link now covers everything that comes next: completing your profile, your coordination deposit, and access to your secure portal. Complete My Profile: "+webBaseUrl+"/"+lang(data)+"/activate/"+data.get("token")+" — for your security you will confirm a one-time code first.");case "staff-work-assigned"->new Template("Action required"+caseRef(data)+": "+data.get("title"),"You have new work in the RehletShifaa portal"+caseRef(data)+": "+data.get("title")+". Sign in to the secure portal to act on it.");case "coordinator-work-assigned"->new Template("Coordinator action"+caseRef(data)+": "+data.get("title"),"Case"+caseRef(data)+" needs you as its coordinator: "+data.get("title")+". Open your coordinator workspace in the secure portal to act on it.");case "consultant-work-assigned"->new Template("Consultant action"+caseRef(data)+": "+data.get("title"),"You have new consultant work"+caseRef(data)+": "+data.get("title")+". Open your consultant workspace in the secure portal to review the case and record your clinical decision.");case "deposit-required-coordinator"->new Template("Patient acknowledged the estimate"+caseRef(data)+" — deposit to arrange","The patient acknowledged their preliminary estimate"+caseRef(data)+" and a coordination deposit is now due. The case has no coordinator yet: take ownership in the secure portal and send the payment instructions.");case "deposit-settled-coordinator"->new Template("Deposit received"+caseRef(data)+" — case ready for coordination","The coordination deposit"+caseRef(data)+" has been settled. The case is waiting in the team queue for a coordinator to start treatment coordination.");case "deposit-settled-patient"->new Template("Your treatment journey is now active","We have received your coordination deposit. Your RehletShifaa coordinator is starting the next stage of your treatment journey and will contact you shortly.");case "account-link-continue"->new Template("Continue securely with RehletShifaa","A RehletShifaa case was started using this email address. If this was you, or you are helping a family member, sign in to continue securely: "+webBaseUrl+"/"+lang(data)+"/portal?link="+data.get("token")+" — if you do not recognise this, you can safely ignore this message. This private link expires for your security.");case "secure-message"->new Template("New secure message from RehletShifaa","A new secure message is available. Check your case securely: "+webBaseUrl+"/"+lang(data)+"/status/"+data.get("token"));default->throw new IllegalArgumentException("Unknown notification template");};}catch(Exception e){throw new IllegalStateException("Invalid notification template data",e);}}
    private String lang(Map<String,String> data){String l=data.get("lang");return "ar".equals(l)?"ar":"en";}
    /** " for case RS-…" when the payload names a case, else nothing — the only case fact that travels by email. */
    private static String caseRef(Map<String,String> data){String c=data.get("case");return c==null||c.isBlank()?"":" for case "+c;}
    private record Template(String subject,String body){}
}
