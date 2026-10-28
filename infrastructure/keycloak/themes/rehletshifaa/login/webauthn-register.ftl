<#-- UX 7-3: setting up a passkey. Keycloak 26.7.3 (WebAuthnRegister) sends challenge, userid, username, rpEntityName,
     signatureAlgorithms, rpId, attestationConveyancePreference, authenticatorAttachment, requireResidentKey, residentKey,
     userVerificationRequirement, createTimeout, excludeCredentialIds and, after a failed try, isSetRetry.
     The h1 is words only (Keycloak put a font-glyph key inside it); one sentence says what a passkey is before the
     browser's own dialog opens; the texts handed to webauthnRegister.js come from our bundles like every other string. -->
<#import "template.ftl" as layout>
<#import "password-commons.ftl" as passwordCommons>

<@layout.registrationLayout; section>
    <#if section = "header">
        ${msg("webauthn-registration-title")}
    <#elseif section = "form">
        <p class="instruction" id="kc-webauthn-intro">${msg("webauthn-registration-intro")}</p>

        <form id="register" class="${properties.kcFormClass!}" action="${url.loginAction}" method="post">
            <div class="${properties.kcFormGroupClass!}">
                <input type="hidden" id="clientDataJSON" name="clientDataJSON"/>
                <input type="hidden" id="attestationObject" name="attestationObject"/>
                <input type="hidden" id="publicKeyCredentialId" name="publicKeyCredentialId"/>
                <input type="hidden" id="authenticatorLabel" name="authenticatorLabel"/>
                <input type="hidden" id="transports" name="transports"/>
                <input type="hidden" id="authenticatorAttachment" name="authenticatorAttachment"/>
                <input type="hidden" id="error" name="error"/>
                <@passwordCommons.logoutOtherSessions/>
            </div>
        </form>

        <script type="module">
            <#outputformat "JavaScript">
            import { registerByWebAuthn } from "${url.resourcesPath}/js/webauthnRegister.js";
            const registerButton = document.getElementById('registerWebAuthn');
            registerButton.addEventListener("click", function() {
                const input = {
                    challenge : ${challenge?c},
                    userid : ${userid?c},
                    username : ${username?c},
                    signatureAlgorithms : [<#list signatureAlgorithms as sigAlg>${sigAlg?c},</#list>],
                    rpEntityName : ${rpEntityName?c},
                    rpId : ${rpId?c},
                    attestationConveyancePreference : ${attestationConveyancePreference?c},
                    authenticatorAttachment : ${authenticatorAttachment?c},
                    requireResidentKey : ${requireResidentKey?c},
                    residentKey : ${residentKey?c},
                    userVerificationRequirement : ${userVerificationRequirement?c},
                    createTimeout : ${createTimeout?c},
                    excludeCredentialIds : ${excludeCredentialIds?c},
                    initLabel : ${msg("webauthn-registration-init-label")?c},
                    initLabelPrompt : ${msg("webauthn-registration-init-label-prompt")?c},
                    errmsg : ${msg("webauthn-unsupported-browser-text")?c}
                };
                registerByWebAuthn(input);
            }, { once: true });
            </#outputformat>
        </script>

        <div id="kc-form-buttons" class="rs-actions">
            <input type="button"
                   class="${properties.kcButtonClass!} ${properties.kcButtonPrimaryClass!} ${properties.kcButtonBlockClass!} ${properties.kcButtonLargeClass!}"
                   id="registerWebAuthn" value="${msg("doRegisterSecurityKey")}"/>

            <#if !isSetRetry?has_content && isAppInitiatedAction?has_content>
                <form action="${url.loginAction}" class="${properties.kcFormClass!}" id="kc-webauthn-settings-form"
                      method="post">
                    <button type="submit"
                            class="${properties.kcButtonClass!} ${properties.kcButtonDefaultClass!} ${properties.kcButtonBlockClass!} ${properties.kcButtonLargeClass!}"
                            id="cancelWebAuthnAIA" name="cancel-aia" value="true">${msg("doCancel")}</button>
                </form>
            </#if>
        </div>

    </#if>
</@layout.registrationLayout>
