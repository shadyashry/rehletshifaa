package com.rehletshifaa.access.platform.infrastructure;

import com.rehletshifaa.access.platform.application.GovernanceCommissioningService;
import com.rehletshifaa.access.platform.application.GovernanceCommissioningService.Start;
import com.rehletshifaa.access.platform.infrastructure.GovernanceCommissioningStore.Administrator;
import com.rehletshifaa.shared.api.ApiException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Deployment-only commissioning command. It is opt-in and deliberately absent from normal HTTP administration.
 * Values are injected for a single run and removed after completion.
 */
@Configuration
public class GovernanceCommissioningCommandConfiguration {
    private static final Logger log = LoggerFactory.getLogger(GovernanceCommissioningCommandConfiguration.class);

    @Bean ApplicationRunner governanceCommissioningCommand(GovernanceCommissioningService service,
            @Value("${app.access.commissioning.action:}") String action,
            @Value("${app.access.commissioning.id:}") String id,
            @Value("${app.access.commissioning.operator:}") String operator,
            @Value("${app.access.commissioning.idempotency-key:}") String key,
            @Value("${app.access.commissioning.owner-subject:}") String owner,
            @Value("${app.access.commissioning.administrator-subjects:}") String subjects,
            @Value("${app.access.commissioning.administrator-names:}") String names,
            @Value("${app.access.commissioning.administrator-emails:}") String emails,
            @Value("${app.access.commissioning.administrator-locales:en,en}") String locales,
            @Value("${app.access.commissioning.reason:}") String reason) {
        return args -> {
            if (action.isBlank()) return;
            switch (action.trim().toLowerCase()) {
                case "validate" -> log.info("Governance commissioning validation: {}", service.validate(start(operator, key, owner, subjects, names, emails, locales, reason)));
                case "start" -> log.info("Governance commissioning started: {}", service.start(start(operator, key, owner, subjects, names, emails, locales, reason)).id());
                case "status" -> log.info("Governance commissioning status: {}", service.status(uuid(id)));
                case "cancel" -> log.info("Governance commissioning cancelled: {}", service.cancel(uuid(id), operator, reason).id());
                default -> throw new ApiException(400, "INVALID_COMMISSIONING_ACTION", "Use validate, start, status or cancel");
            }
        };
    }

    private static Start start(String operator, String key, String owner, String subjects, String names,
            String emails, String locales, String reason) {
        List<String> subjectList = split(subjects);
        List<String> nameList = split(names);
        List<String> emailList = split(emails);
        List<String> localeList = split(locales);
        if (subjectList.size() != 2 || nameList.size() != 2 || emailList.size() != 2 || localeList.size() != 2)
            throw new ApiException(400, "INVALID_COMMISSIONING", "Configure exactly two administrator subjects, names, emails and locales");
        List<Administrator> administrators = List.of(
                new Administrator(subjectList.get(0), nameList.get(0), emailList.get(0), localeList.get(0)),
                new Administrator(subjectList.get(1), nameList.get(1), emailList.get(1), localeList.get(1)));
        return new Start(operator, key, owner, administrators, reason);
    }

    private static List<String> split(String value) {
        List<String> result = new ArrayList<>();
        for (String item : value.split(",")) if (!item.trim().isBlank()) result.add(item.trim());
        return result;
    }

    private static UUID uuid(String value) {
        try { return UUID.fromString(value.trim()); }
        catch (Exception e) { throw new ApiException(400, "INVALID_COMMISSIONING_ID", "Configure a valid commissioning id"); }
    }
}
