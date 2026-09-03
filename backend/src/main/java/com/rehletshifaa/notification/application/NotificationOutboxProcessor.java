package com.rehletshifaa.notification.application;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.*;
import java.util.*;

import static com.rehletshifaa.shared.persistence.SqlValues.timestamp;

@Service
public class NotificationOutboxProcessor {
    private final JdbcClient jdbc; private final List<NotificationChannelPort> channels; private final ObjectMapper json; private final Clock clock; private final String webBaseUrl;
    public NotificationOutboxProcessor(JdbcClient jdbc,List<NotificationChannelPort> channels,ObjectMapper json,Clock clock,@org.springframework.beans.factory.annotation.Value("${app.web-base-url:http://localhost:3000}")String webBaseUrl){this.jdbc=jdbc;this.channels=channels;this.json=json;this.clock=clock;this.webBaseUrl=webBaseUrl;}

    @Scheduled(fixedDelayString="${app.notifications.poll-milliseconds:5000}")
    @Transactional public void dispatch(){
        List<Row> rows=jdbc.sql("SELECT * FROM notification_outbox WHERE status IN ('PENDING','RETRY') AND next_attempt_at<=? ORDER BY created_at LIMIT 20 FOR UPDATE SKIP LOCKED").param(timestamp(clock.instant())).query(this::map).list();
        for(Row row:rows)deliver(row);
    }

    private void deliver(Row row){
        NotificationChannelPort channel=channels.stream().filter(c->c.supports(row.channel())).findFirst().orElse(null);
        if(channel==null){fail(row,"CHANNEL_NOT_CONFIGURED");return;}
        try{Template rendered=render(row.template(),row.data());String reference=channel.deliver(row.destination(),rendered.subject(),rendered.body(),row.key());jdbc.sql("UPDATE notification_outbox SET status='DELIVERED',attempts=attempts+1,provider_reference=?,delivered_at=?,last_error_code=NULL,template_data='{}' WHERE id=?").params(reference,timestamp(clock.instant()),row.id()).update();}
        catch(Exception e){fail(row,"PROVIDER_FAILURE");}
    }
    private void fail(Row row,String code){int attempts=row.attempts()+1;String status=attempts>=row.maxAttempts()?"DEAD_LETTER":"RETRY";long delay=Math.min(3600L,30L*(1L<<Math.min(attempts,6)));jdbc.sql("UPDATE notification_outbox SET status=?,attempts=?,next_attempt_at=?,last_error_code=? WHERE id=?").params(status,attempts,timestamp(clock.instant().plusSeconds(delay)),code,row.id()).update();}
    private Template render(String key,String raw){try{Map<String,String> data=json.readValue(raw,new TypeReference<>(){});return switch(key){case "case-claim-code"->new Template("Your RehletShifaa verification code","Your verification code is "+data.get("code")+". It expires shortly. Do not share it with anyone.");case "new-case-received"->new Template("New medical case received","A new case is ready in the coordinator intake queue. Sign in to the secure portal to review it.");case "case-submitted"->new Template("Your case was received","Your RehletShifaa case "+data.get("caseNumber")+" was received. Sign in to follow its progress.");case "proposal-access-code"->new Template("Your RehletShifaa verification code","Your verification code is "+data.get("code")+". It expires in 15 minutes. Do not share it with anyone.");case "proposal-ready"->new Template("Your treatment proposal is ready","Your RehletShifaa treatment proposal is ready to review securely: "+webBaseUrl+"/"+lang(data)+"/proposal/"+data.get("token")+" — you will confirm a one-time code before anything is shown.");case "account-activation"->new Template("Activate your RehletShifaa account","Your proposal was accepted. Activate your account to follow your journey: "+webBaseUrl+"/"+lang(data)+"/portal?activate="+data.get("token"));default->throw new IllegalArgumentException("Unknown notification template");};}catch(Exception e){throw new IllegalStateException("Invalid notification template data",e);}}
    private String lang(Map<String,String> data){String l=data.get("lang");return "ar".equals(l)?"ar":"en";}
    private Row map(ResultSet rs,int n)throws SQLException{return new Row(rs.getObject("id",UUID.class),rs.getString("channel"),rs.getString("destination"),rs.getString("template_key"),rs.getString("template_data"),rs.getInt("attempts"),rs.getInt("max_attempts"),rs.getString("idempotency_key"));}
    private record Row(UUID id,String channel,String destination,String template,String data,int attempts,int maxAttempts,String key){}
    private record Template(String subject,String body){}
}
