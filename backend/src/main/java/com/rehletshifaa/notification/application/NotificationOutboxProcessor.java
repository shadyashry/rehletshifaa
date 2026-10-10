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
        try{reference=channel.deliver(new OutgoingNotification(message.destination(),rendered.subject(),rendered.body(),message.templateKey(),rendered.language(),rendered.parameters(),rendered.linkPath(),message.idempotencyKey()));}
        catch(UndeliverableNotificationException e){fail(message,e.code(),true);return;} // e.g. no approved template: retrying cannot help
        catch(Exception e){fail(message,"PROVIDER_FAILURE",false);return;}
        // The provider accepted it. A failure to record that must not be booked as a provider failure (which
        // would schedule a deliberate re-send); the lease is left to expire, as for a crash at this point.
        try{if(store.recordDelivered(message.id(),message.attempts(),reference))count(message,"delivered");}
        catch(RuntimeException e){count(message,"delivered_unrecorded");log.error("Notification delivered but outcome not recorded: id={} channel={} attempt={}/{}",message.id(),message.channel(),message.attempts(),message.maxAttempts());}
    }
    private void fail(NotificationOutboxStore.OutboxMessage message,String code,boolean permanent){int max=permanent?message.attempts():message.maxAttempts();if(store.recordFailure(message.id(),message.attempts(),max,code)){String outcome=message.attempts()>=max?"dead_letter":"retry";count(message,outcome);log.warn("Notification delivery {}: id={} channel={} code={} attempt={}/{}",outcome,message.id(),message.channel(),code,message.attempts(),message.maxAttempts());}}
    private void count(NotificationOutboxStore.OutboxMessage message,String outcome){metrics.counter("notification.delivery","channel",message.channel(),"outcome",outcome).increment();}
    private Template render(String key,String raw){try{String clear=com.rehletshifaa.shared.crypto.EncryptedText.decode(crypto,raw);Map<String,String> data=json.readValue(clear,new TypeReference<>(){});return switch(key){case "consultant-credential-expiry"->new Template("Credential renewal reminder","A verified credential expires within "+data.get("days")+" day(s). Sign in to your consultant workspace to submit a renewal.");case "new-case-received"->new Template("New care request"+caseRef(data)+" — waiting in the team queue","A new care request"+caseRef(data)+" has been received and is waiting in the coordination team queue for a coordinator to take ownership. Sign in to the secure portal to review it.");case "staff-work-assigned"->new Template("Action required"+caseRef(data)+": "+data.get("title"),"You have new work in the RehletShifaa portal"+caseRef(data)+": "+data.get("title")+". Sign in to the secure portal to act on it.");case "coordinator-work-assigned"->new Template("Coordinator action"+caseRef(data)+": "+data.get("title"),"Case"+caseRef(data)+" needs you as its coordinator: "+data.get("title")+". Open your coordinator workspace in the secure portal to act on it.");case "consultant-work-assigned"->new Template("Consultant action"+caseRef(data)+": "+data.get("title"),"You have new consultant work"+caseRef(data)+": "+data.get("title")+". Open your consultant workspace in the secure portal to review the case and record your clinical decision.");case "deposit-required-coordinator"->new Template("Patient acknowledged the estimate"+caseRef(data)+" — deposit to arrange","The patient acknowledged their preliminary estimate"+caseRef(data)+" and a coordination deposit is now due. The case has no coordinator yet: take ownership in the secure portal and send the payment instructions.");case "deposit-settled-coordinator"->new Template("Deposit received"+caseRef(data)+" — case ready for coordination","The coordination deposit"+caseRef(data)+" has been settled. The case is waiting in the team queue for a coordinator to start treatment coordination.");
// Patient-facing: language, body parameters and the link path travel with the text, for template channels.
case "case-status-link"->linked(data,"status","Your RehletShifaa case was received","Your case was received. Check its status securely: %s");case "patient-action-link"->linked(data,"status","Action required for your RehletShifaa case","Your coordinator needs information from you. Respond securely: %s");case "secure-message"->linked(data,"status","New secure message from RehletShifaa","A new secure message is available. Check your case securely: %s");case "proposal-ready"->linked(data,"proposal","Your treatment proposal is ready","Your treatment proposal is ready to review securely: %s — you will confirm a one-time code before anything is shown.");case "final-quote-ready"->linked(data,"proposal","Your final quote is ready","Your final quote is ready to review securely: %s — you will confirm a one-time code before anything is shown.");case "onboarding-activation"->linked(data,"activate","Complete your RehletShifaa profile","Your treatment proposal has been accepted. One secure link now covers everything that comes next: completing your profile, your coordination deposit, and access to your secure portal. Complete My Profile: %s — for your security you will confirm a one-time code first.");case "case-access-code","proposal-access-code"->code(data);case "conversation-text"->conversationText(data);case "intake-followup"->new Template("Your RehletShifaa coordinator has an update","Your RehletShifaa coordinator has an update for you. Reply to this message to continue the conversation.",lang(data),List.of(),null);case "proposal-decision-recorded"->decisionRecorded(data);case "deposit-settled-patient"->new Template("Your treatment journey is now active","We have received your coordination deposit. Your RehletShifaa coordinator is starting the next stage of your treatment journey and will contact you shortly.",lang(data),List.of(),null);case "account-link-continue"->new Template("Continue securely with RehletShifaa","A RehletShifaa case was started using this email address. If this was you, or you are helping a family member, sign in to continue securely: "+webBaseUrl+"/"+lang(data)+"/portal?link="+data.get("token")+" — if you do not recognise this, you can safely ignore this message. This private link expires for your security.");default->throw new IllegalArgumentException("Unknown notification template");};}catch(Exception e){throw new IllegalStateException("Invalid notification template data",e);}}
    /** A patient link: the full URL in the text, and {@code <lang>/<route>/<token>} for a template's URL button. */
    private Template linked(Map<String,String> data,String route,String subject,String body){String token=data.get("token");if(token==null||token.isBlank())throw new IllegalArgumentException("Link token missing");String path=lang(data)+"/"+route+"/"+token;return new Template(subject,body.formatted(webBaseUrl+"/"+path),lang(data),List.of(),path);}
    /** A coordinator's reply inside WhatsApp's 24-hour window: the text itself, sent as written. */
    private Template conversationText(Map<String,String> data){String body=data.get("body");if(body==null||body.isBlank())throw new IllegalArgumentException("Reply text missing");return new Template("",body,lang(data),List.of(),null);}
    /** A one-time code; the payload names no language, so a template channel uses its configured default. */
    private static Template code(Map<String,String> data){String code=data.get("code");if(code==null||code.isBlank())throw new IllegalArgumentException("Code missing");String l=data.get("lang");return new Template("Your RehletShifaa verification code","Your verification code is "+code+". It expires in 15 minutes. Do not share it with anyone.","ar".equals(l)||"en".equals(l)?l:null,List.of(code),null);}
    private String lang(Map<String,String> data){String l=data.get("lang");return "ar".equals(l)?"ar":"en";}
    /** " for case RS-…" when the payload names a case, else nothing — the only case fact that travels by email. */
    private static String caseRef(Map<String,String> data){String c=data.get("case");return c==null||c.isBlank()?"":" for case "+c;}
    private record Template(String subject,String body,String language,List<String> parameters,String linkPath){Template(String subject,String body){this(subject,body,null,List.of(),null);}}

    /** "8 October 2026" / "8 أكتوبر 2026" from an ISO day; the raw value if it is not one. */
    private static String readableDate(String iso,boolean ar){
        if(iso==null||iso.isBlank())return "";
        try{return java.time.LocalDate.parse(iso).format(java.time.format.DateTimeFormatter.ofPattern("d MMMM yyyy",ar?java.util.Locale.forLanguageTag("ar"):java.util.Locale.ENGLISH));}
        catch(java.time.format.DateTimeParseException e){return iso;}
    }

    /** A decision the coordinator recorded for the patient (Arabic assisted path): plain words in the patient's language. */
    private Template decisionRecorded(Map<String,String> data){
        boolean ar="ar".equals(lang(data));String decision=data.getOrDefault("decision","");String date=readableDate(data.get("date"),ar);
        boolean representative="REPRESENTATIVE".equals(data.get("confirmedBy"));
        if(ar){
            String what=switch(decision){case "ACKNOWLEDGED"->"الإقرار بالتقدير المبدئي";case "ACCEPTED"->"قبول العرض النهائي";case "REVISION_REQUESTED"->"طلب تعديلات";case "DECLINED"->"رفض المقترح";default->"قرار بشأن المقترح";};
            String with=representative?"مع ممثّلك":"معك";
            return new Template("سُجّل قرارك بشأن مقترح رحلة شفاء","سُجّل قرارك بشأن مقترح رحلة شفاء ("+what+") بعد التحدث "+with+" في "+date+". إن لم يكن هذا ما اتُّفق عليه، يُرجى التواصل مع منسّقك.","ar",List.of(what,with,date),null);
        }
        String what=switch(decision){case "ACKNOWLEDGED"->"you acknowledged the preliminary estimate";case "ACCEPTED"->"you accepted the final quote";case "REVISION_REQUESTED"->"you asked for changes";case "DECLINED"->"you declined the proposal";default->"a decision on your proposal";};
        String with=representative?"your representative":"you";
        return new Template("Your RehletShifaa proposal decision was recorded","Your coordinator recorded your decision on your RehletShifaa proposal ("+what+") after speaking with "+with+" on "+date+". If this is not what was agreed, please contact your coordinator.","en",List.of(what,with,date),null);
    }
}
