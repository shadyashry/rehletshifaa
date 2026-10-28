<#-- UX 7-2: the account-setup moments. Keycloak 26.7.3 sends the start page with message.summary =
     confirmExecutionOfActions and no messageHeader, and the done page with messageHeader = accountUpdatedTitle and
     message.summary = accountUpdatedMessage. The heading says the moment once; the steps follow as plain text (no
     orphan colon); the way on is one primary button. -->
<#import "template.ftl" as layout>
<@layout.registrationLayout displayMessage=false; section>
    <#if section = "header">
        <#if messageHeader??>
            ${kcSanitize(msg("${messageHeader}"))?no_esc}
        <#else>
            ${message.summary}
        </#if>
    <#elseif section = "form">
    <div id="kc-info-message">
        <#-- Without a messageHeader the summary is already the heading. -->
        <#if messageHeader??>
            <p class="instruction">${message.summary}</p>
        </#if>
        <#if requiredActions?? && requiredActions?has_content>
            <#if requiredActions?size == 1>
                <p class="instruction" id="kc-required-actions">${kcSanitize(msg("requiredActionNext", msg("requiredAction.${requiredActions[0]}")))?no_esc}</p>
            <#else>
                <p class="instruction" id="kc-required-actions-intro">${msg("requiredActionsIntro")}</p>
                <ol class="rs-required-actions" aria-labelledby="kc-required-actions-intro">
                    <#list requiredActions as reqActionItem>
                        <li>${kcSanitize(msg("requiredAction.${reqActionItem}"))?no_esc}</li>
                    </#list>
                </ol>
            </#if>
        </#if>
        <#if !skipLink??>
            <#if pageRedirectUri?has_content>
                <#assign nextUrl = pageRedirectUri nextLabel = msg("backToApplication")>
            <#elseif actionUri?has_content>
                <#-- The button names the step it starts: the one action, or the setup as a whole. -->
                <#if requiredActions?? && requiredActions?size == 1>
                    <#assign nextUrl = actionUri nextLabel = msg("requiredAction.${requiredActions[0]}")>
                <#elseif requiredActions?? && requiredActions?has_content>
                    <#assign nextUrl = actionUri nextLabel = msg("doStartSetup")>
                <#else>
                    <#assign nextUrl = actionUri nextLabel = msg("proceedWithAction")>
                </#if>
            <#elseif (client.baseUrl)?has_content>
                <#assign nextUrl = client.baseUrl nextLabel = msg("backToApplication")>
            </#if>
            <#if nextUrl??>
                <div id="kc-form-buttons">
                    <a id="kc-info-next" class="${properties.kcButtonClass!} ${properties.kcButtonPrimaryClass!} ${properties.kcButtonBlockClass!} ${properties.kcButtonLargeClass!}" href="${nextUrl}">${nextLabel}</a>
                </div>
            </#if>
        </#if>
    </div>
    </#if>
</@layout.registrationLayout>
