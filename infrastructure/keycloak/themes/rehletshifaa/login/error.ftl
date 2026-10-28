<#-- UX 7-2: an error is a sentence, not an apology. The message says what happened and who helps (the expired
     setup link names the coordinator); the way on is one primary button, and a trace id stays a quiet line. -->
<#import "template.ftl" as layout>
<@layout.registrationLayout displayMessage=false; section>
    <#if section = "header">
        ${kcSanitize(msg("errorTitle"))?no_esc}
    <#elseif section = "form">
        <div id="kc-error-message">
            <p class="instruction">${kcSanitize(message.summary)?no_esc}</p>
            <#if traceId??>
                <p class="instruction rs-quiet" id="traceId">${msg("traceIdSupportMessage", traceId)}</p>
            </#if>
            <#if !skipLink?? && client?? && client.baseUrl?has_content>
                <div id="kc-form-buttons">
                    <a id="backToApplication" class="${properties.kcButtonClass!} ${properties.kcButtonPrimaryClass!} ${properties.kcButtonBlockClass!} ${properties.kcButtonLargeClass!}" href="${client.baseUrl}">${msg("backToApplication")}</a>
                </div>
            </#if>
        </div>
    </#if>
</@layout.registrationLayout>
