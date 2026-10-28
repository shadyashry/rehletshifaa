<#-- UX 7-2: the resend link says what it does (stock wording was "Click here" + "to re-send the email.").
     UX 7-3 close: the send is the card's own button: primary before anything was sent, secondary once it was (then the
     next move is opening the email); the spam hint shows only after a link was sent. -->
<#import "template.ftl" as layout>
<@layout.registrationLayout displayInfo=(verifyEmail?? && !isAppInitiatedAction??); section>
    <#if section = "header">
        ${msg("emailVerifyTitle")}
    <#elseif section = "form">
        <p class="instruction">
            <#if verifyEmail??>
                ${msg("emailVerifyInstruction1",verifyEmail)}
            <#else>
                ${msg("emailVerifyInstruction4",user.email)}
            </#if>
        </p>
        <#if isAppInitiatedAction??>
            <form id="kc-verify-email-form" class="${properties.kcFormClass!}" action="${url.loginAction}" method="post">
                <div id="kc-form-buttons" class="rs-actions">
                    <#if verifyEmail??>
                        <input class="${properties.kcButtonClass!} ${properties.kcButtonDefaultClass!} ${properties.kcButtonBlockClass!} ${properties.kcButtonLargeClass!}" type="submit" value="${msg("emailVerifyResend")}" />
                    <#else>
                        <input class="${properties.kcButtonClass!} ${properties.kcButtonPrimaryClass!} ${properties.kcButtonBlockClass!} ${properties.kcButtonLargeClass!}" type="submit" value="${msg("emailVerifySend")}" />
                    </#if>
                    <button class="${properties.kcButtonClass!} ${properties.kcButtonDefaultClass!} ${properties.kcButtonBlockClass!} ${properties.kcButtonLargeClass!}" type="submit" name="cancel-aia" value="true" formnovalidate>${msg("doCancel")}</button>
                </div>
            </form>
        <#else>
            <#-- Keycloak sends (or resends) the email on a GET of the action URL. -->
            <div id="kc-form-buttons" class="rs-actions">
                <#-- Works once (template.ftl's data-once-link handler): a double tap must not send two emails. -->
                <a id="kc-verify-email-send" href="${url.loginAction}" rel="nofollow"
                   data-once-link data-disabled-class="${properties.kcFormSocialAccountListButtonDisabledClass!}"
                   class="${properties.kcButtonClass!} ${verifyEmail???then(properties.kcButtonDefaultClass!, properties.kcButtonPrimaryClass!)} ${properties.kcButtonBlockClass!} ${properties.kcButtonLargeClass!}">${msg(verifyEmail???then("emailVerifyResend", "emailVerifySend"))}</a>
            </div>
        </#if>
    <#elseif section = "info">
        <p class="instruction">${msg("emailVerifyInstruction2")}</p>
    </#if>
</@layout.registrationLayout>
