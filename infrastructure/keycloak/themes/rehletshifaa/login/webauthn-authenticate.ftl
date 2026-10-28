<#-- UX 7-3: signing in with a passkey. Keycloak 26.7.3 (WebAuthnAuthenticator) sends challenge, rpId, createTimeout,
     authenticators (WebAuthnAuthenticatorsBean: credentialId, label, createdAt, transports.displayNameProperties and
     .iconClass), isUserIdentified, userVerification, shouldDisplayAuthenticators, mediation and authenticatorAttachment.
     The h1 says what happens; the person's passkeys are one list (a heading when there are several), each with where it
     lives and when it was added; the icon is the theme's SVG for that kind of key, not a font glyph. -->
<#import "template.ftl" as layout>
<@layout.registrationLayout displayInfo=(realm.registrationAllowed && !registrationDisabled??); section>
    <#if section = "header">
        ${msg("webauthn-login-title")}
    <#elseif section = "form">
        <div id="kc-form-webauthn" class="${properties.kcFormClass!}">
            <form id="webauth" action="${url.loginAction}" method="post">
                <input type="hidden" id="clientDataJSON" name="clientDataJSON"/>
                <input type="hidden" id="authenticatorData" name="authenticatorData"/>
                <input type="hidden" id="signature" name="signature"/>
                <input type="hidden" id="credentialId" name="credentialId"/>
                <input type="hidden" id="userHandle" name="userHandle"/>
                <input type="hidden" id="error" name="error"/>
            </form>

            <#-- Not a PatternFly 3 form-group: inside .form-horizontal its negative margins pushed the list to the card edge. -->
            <div class="no-bottom-margin">
                <#if authenticators??>
                    <form id="authn_select" class="${properties.kcFormClass!}">
                        <#list authenticators.authenticators as authenticator>
                            <input type="hidden" name="authn_use_chk" value="${authenticator.credentialId}"/>
                        </#list>
                    </form>

                    <#if shouldDisplayAuthenticators?? && shouldDisplayAuthenticators>
                        <#assign several = authenticators.authenticators?size gt 1>
                        <#if several>
                            <h2 class="rs-list-title" id="kc-webauthn-list-title">${msg("webauthn-available-authenticators")}</h2>
                        <#else>
                            <p class="instruction">${msg("webauthn-login-intro")}</p>
                        </#if>

                        <ul class="rs-passkeys" <#if several>aria-labelledby="kc-webauthn-list-title"<#else>aria-label="${msg("webauthn-available-authenticators")}"</#if>>
                            <#list authenticators.authenticators as authenticator>
                                <li id="kc-webauthn-authenticator-item-${authenticator?index}" class="rs-passkey">
                                    <span class="${(properties['${authenticator.transports.iconClass}'])!'${properties.kcWebAuthnDefaultIcon!}'}" aria-hidden="true"></span>
                                    <span class="rs-passkey-body">
                                        <span id="kc-webauthn-authenticator-label-${authenticator?index}" class="rs-passkey-label" dir="auto">${authenticator.label}</span>
                                        <#if authenticator.transports?? && authenticator.transports.displayNameProperties?has_content>
                                            <span id="kc-webauthn-authenticator-transport-${authenticator?index}" class="rs-passkey-meta">
                                                <#list authenticator.transports.displayNameProperties as nameProperty>${msg(nameProperty)}<#if nameProperty?has_next>${msg("listSeparator")} </#if></#list>
                                            </span>
                                        </#if>
                                        <span class="rs-passkey-meta">
                                            <span id="kc-webauthn-authenticator-createdlabel-${authenticator?index}">${msg('webauthn-createdAt-label')}</span>
                                            <#-- Keycloak formats the date for the locale (Arabic may carry RLM marks): isolate it, never force a direction. -->
                                            <bdi id="kc-webauthn-authenticator-created-${authenticator?index}">${authenticator.createdAt}</bdi>
                                        </span>
                                    </span>
                                </li>
                            </#list>
                        </ul>
                    </#if>
                </#if>

                <div id="kc-form-buttons">
                    <input id="authenticateWebAuthnButton" type="button" autofocus="autofocus"
                           value="${msg("webauthn-doAuthenticate")}"
                           class="${properties.kcButtonClass!} ${properties.kcButtonPrimaryClass!} ${properties.kcButtonBlockClass!} ${properties.kcButtonLargeClass!}"/>
                </div>
            </div>
        </div>

    <script type="module">
        <#outputformat "JavaScript">
        import { authenticateByWebAuthn } from "${url.resourcesPath}/js/webauthnAuthenticate.js";
        const authButton = document.getElementById('authenticateWebAuthnButton');
        authButton.addEventListener("click", function() {
            const input = {
                isUserIdentified : ${isUserIdentified},
                challenge : ${challenge?c},
                userVerification : ${userVerification?c},
                rpId : ${rpId?c},
                createTimeout : ${createTimeout?c},
                errmsg : ${msg("webauthn-unsupported-browser-text")?c}
            };
            authenticateByWebAuthn(input);
        }, { once: true });
        </#outputformat>
    </script>

    <#elseif section = "info">
        <#if realm.registrationAllowed && !registrationDisabled??>
            <div id="kc-registration">
                <span>${msg("noAccount")} <a href="${url.registrationUrl}">${msg("doRegister")}</a></span>
            </div>
        </#if>
    </#if>
</@layout.registrationLayout>
