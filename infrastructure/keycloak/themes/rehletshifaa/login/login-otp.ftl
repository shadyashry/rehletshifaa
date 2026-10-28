<#-- UX 7-3: the authenticator code at sign-in. Keycloak 26.7.3 (OTPFormAuthenticator) sends otpLogin
     (userOtpCredentials: id + userLabel; selectedCredentialId) and, on a wrong code, the field error "totp".
     The page says what it asks for (the h1; template.ftl puts the account beneath it); several authenticators are one
     labelled choice of native radios (Keycloak's tiles gave each label a positive tabindex); the code field asks the
     phone for digits and lets the browser offer a one-time code; the error is tied to its field. -->
<#import "template.ftl" as layout>
<@layout.registrationLayout displayMessage=!messagesPerField.existsError('totp'); section>
    <#if section="header">
        ${msg("loginOtpTitle")}
    <#elseif section="form">
        <form id="kc-otp-login-form" class="${properties.kcFormClass!}" onsubmit="login.disabled = true; return true;" action="${url.loginAction}"
            method="post">
            <#if otpLogin.userOtpCredentials?size gt 1>
                <fieldset class="rs-choice">
                    <legend class="${properties.kcLabelClass!}">${msg("loginOtpChooseDevice")}</legend>
                    <#list otpLogin.userOtpCredentials as otpCredential>
                        <label class="rs-choice-item" for="kc-otp-credential-${otpCredential?index}">
                            <input id="kc-otp-credential-${otpCredential?index}" type="radio" name="selectedCredentialId" value="${otpCredential.id}" <#if otpCredential.id == otpLogin.selectedCredentialId>checked="checked"</#if>>
                            <span class="${properties.kcLoginOTPListItemIconClass!}" aria-hidden="true"></span>
                            <span dir="auto">${otpCredential.userLabel}</span>
                        </label>
                    </#list>
                </fieldset>
            </#if>

            <div class="${properties.kcFormGroupClass!}">
                <div class="${properties.kcLabelWrapperClass!}">
                    <label for="otp" class="${properties.kcLabelClass!}">${msg("loginOtpOneTime")}</label>
                </div>

                <div class="${properties.kcInputWrapperClass!}">
                    <input id="otp" name="otp" type="text" class="${properties.kcInputClass!}"
                           autocomplete="one-time-code" inputmode="numeric" spellcheck="false" autocapitalize="off"
                           autofocus dir="ltr"
                           aria-invalid="<#if messagesPerField.existsError('totp')>true</#if>"
                           <#if messagesPerField.existsError('totp')>aria-describedby="input-error-otp-code"</#if> />

                    <#if messagesPerField.existsError('totp')>
                        <span id="input-error-otp-code" class="${properties.kcInputErrorMessageClass!}" aria-live="polite">
                            ${kcSanitize(messagesPerField.get('totp'))?no_esc}
                        </span>
                    </#if>
                </div>
            </div>

            <div id="kc-form-buttons">
                <input
                    class="${properties.kcButtonClass!} ${properties.kcButtonPrimaryClass!} ${properties.kcButtonBlockClass!} ${properties.kcButtonLargeClass!}"
                    name="login" id="kc-login" type="submit" value="${msg("doLogIn")}" />
            </div>
        </form>
    </#if>
</@layout.registrationLayout>
