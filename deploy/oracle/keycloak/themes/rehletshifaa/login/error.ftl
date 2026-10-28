<#-- UX 7-2: an error is a sentence, not an apology. The message says what happened and who helps (the expired
     setup link names the coordinator); the way on is one primary button, and a trace id stays a quiet line.
     UX 7-3 close: an expired or used setup link (Keycloak sends one of the expired* messages; their text is ours, so the
     summary tells the page which it is) gets its own title, a sign-in that works with or without a client (the portal's
     sign-in when Keycloak has none), and the coordinator through the portal's WhatsApp route (rsPortalUrl, from the
     APP_ORIGIN environment in theme.properties). "Sign in to see the case" only when the way on is the portal. -->
<#import "template.ftl" as layout>
<#assign expired = false>
<#if message?? && message.summary??>
    <#list ["expiredActionMessage", "expiredActionTokenNoSessionMessage", "expiredActionTokenSessionExistsMessage"] as key>
        <#if message.summary == msg(key)><#assign expired = true></#if>
    </#list>
</#if>
<#assign portal = (properties.rsPortalUrl!"")?remove_ending("/")>
<@layout.registrationLayout displayMessage=false; section>
    <#if section = "header">
        <#if expired>${msg("expiredLinkTitle")}<#else>${kcSanitize(msg("errorTitle"))?no_esc}</#if>
    <#elseif section = "form">
        <div id="kc-error-message">
            <p class="instruction">${kcSanitize(message.summary)?no_esc}</p>
            <#if traceId??>
                <p class="instruction rs-quiet" id="traceId">${msg("traceIdSupportMessage", traceId)}</p>
            </#if>
            <#if !skipLink??>
                <#if client?? && client.baseUrl?has_content>
                    <#assign nextUrl = client.baseUrl>
                <#elseif expired && portal?has_content>
                    <#assign nextUrl = portal + "/" + lang + "/portal">
                </#if>
                <#if nextUrl??>
                    <div id="kc-form-buttons" class="rs-actions">
                        <#if nextUrl??>
                            <a id="backToApplication" class="${properties.kcButtonClass!} ${properties.kcButtonPrimaryClass!} ${properties.kcButtonBlockClass!} ${properties.kcButtonLargeClass!}" href="${nextUrl}">${msg((expired && portal?has_content && nextUrl?starts_with(portal))?then("doSignInToCase", "backToApplication"))}</a>
                        </#if>
                        <#if expired && portal?has_content>
                            <a id="kc-contact-coordinator" class="${properties.kcButtonClass!} ${properties.kcButtonDefaultClass!} ${properties.kcButtonBlockClass!} ${properties.kcButtonLargeClass!}" href="${portal}/${lang}/whatsapp">${msg("doContactCoordinator")}</a>
                        </#if>
                    </div>
                </#if>
            </#if>
        </div>
    </#if>
</@layout.registrationLayout>
