<#-- UX 7-3: setting up the authenticator app. Keycloak 26.7.3 (UpdateTotp) sends totp (TotpBean: totpSecret,
     totpSecretEncoded, totpSecretQrCode, manualUrl, qrUrl, policy, supportedApplications, otpCredentials) and "mode"
     ("manual" when the person asked for the key), plus field errors "totp" and "userLabel".
     The page names the task (h1) and why (loginTotpIntro, which Keycloak never rendered). The QR view also shows the key:
     someone setting up on the phone that holds the app cannot scan its own screen, so on a phone the key comes first;
     the manual view adds the settings some apps ask for. The key and the algorithm are not words: translate="no".
     The save button says what it does (it was the generic doSubmit). -->
<#import "template.ftl" as layout>
<#import "password-commons.ftl" as passwordCommons>
<@layout.registrationLayout displayRequiredFields=false displayMessage=!messagesPerField.existsError('totp','userLabel'); section>

    <#if section = "header">
        ${msg("loginTotpSetupTitle")}
    <#elseif section = "form">
        <p class="instruction" id="kc-totp-intro">${msg("loginTotpIntro")}</p>
        <ol id="kc-totp-settings">
            <li>
                <p>${msg("loginTotpStep1")}</p>

                <ul id="kc-totp-supported-apps" translate="no">
                    <#list totp.supportedApplications as app>
                        <li>${msg(app)}</li>
                    </#list>
                </ul>
            </li>

            <#if mode?? && mode = "manual">
                <li>
                    <p>${msg("loginTotpManualStep2")}</p>
                    <p><code id="kc-totp-secret-key" dir="ltr" translate="no">${totp.totpSecretEncoded}</code></p>
                    <p><a href="${totp.qrUrl}" id="mode-barcode">${msg("loginTotpScanBarcode")}</a></p>
                </li>
                <li>
                    <p>${msg("loginTotpManualStep3")}</p>
                    <dl class="rs-totp-policy">
                        <div id="kc-totp-type">
                            <dt>${msg("loginTotpType")}</dt>
                            <dd>${msg("loginTotp." + totp.policy.type)}</dd>
                        </div>
                        <div id="kc-totp-algorithm">
                            <dt>${msg("loginTotpAlgorithm")}</dt>
                            <dd dir="ltr" translate="no">${totp.policy.getAlgorithmKey()}</dd>
                        </div>
                        <div id="kc-totp-digits">
                            <dt>${msg("loginTotpDigits")}</dt>
                            <dd>${totp.policy.digits}</dd>
                        </div>
                        <#if totp.policy.type = "totp">
                            <div id="kc-totp-period">
                                <#-- The unit sits in the term, so the number never has to agree with it (Arabic plurals). -->
                                <dt>${msg("loginTotpInterval")}</dt>
                                <dd>${totp.policy.period?c}</dd>
                            </div>
                        <#elseif totp.policy.type = "hotp">
                            <div id="kc-totp-counter">
                                <dt>${msg("loginTotpCounter")}</dt>
                                <dd>${totp.policy.initialCounter}</dd>
                            </div>
                        </#if>
                    </dl>
                </li>
            <#else>
                <li>
                    <p>${msg("loginTotpStep2")}</p>
                    <div class="rs-totp-add">
                        <div class="rs-totp-qr">
                            <p class="rs-totp-way">${msg("loginTotpScanWay")}</p>
                            <img id="kc-totp-secret-qr-code" src="data:image/png;base64, ${totp.totpSecretQrCode}" alt="${msg("loginTotpQrAlt")}" width="246" height="246">
                        </div>
                        <div class="rs-totp-key">
                            <p class="rs-totp-way">${msg("loginTotpKeyWay")}</p>
                            <p><code id="kc-totp-secret-key" dir="ltr" translate="no">${totp.totpSecretEncoded}</code></p>
                            <p><a href="${totp.manualUrl}" id="mode-manual">${msg("loginTotpUnableToScan")}</a></p>
                        </div>
                    </div>
                </li>
            </#if>
            <li>
                <p>${msg("loginTotpStep3")}</p>
                <p>${msg("loginTotpStep3DeviceName")}</p>
            </li>
        </ol>

        <form action="${url.loginAction}" class="${properties.kcFormClass!}" id="kc-totp-settings-form" method="post">
            <div class="${properties.kcFormGroupClass!}">
                <div class="${properties.kcLabelWrapperClass!}">
                    <label for="totp" class="${properties.kcLabelClass!}">${msg("authenticatorCode")}</label>
                </div>
                <div class="${properties.kcInputWrapperClass!}">
                    <input type="text" id="totp" name="totp" class="${properties.kcInputClass!}"
                           autocomplete="one-time-code" inputmode="numeric" spellcheck="false" autocapitalize="off" dir="ltr" required
                           <#-- After a refused save, focus lands on the field at fault so its error is read out. -->
                           <#if messagesPerField.existsError('totp') || !messagesPerField.existsError('userLabel')>autofocus</#if>
                           aria-invalid="<#if messagesPerField.existsError('totp')>true</#if>"
                           <#if messagesPerField.existsError('totp')>aria-describedby="input-error-otp-code"</#if> />

                    <#if messagesPerField.existsError('totp')>
                        <span id="input-error-otp-code" class="${properties.kcInputErrorMessageClass!}" aria-live="polite">
                            ${kcSanitize(messagesPerField.get('totp'))?no_esc}
                        </span>
                    </#if>

                </div>
                <input type="hidden" id="totpSecret" name="totpSecret" value="${totp.totpSecret}" />
                <#if mode??><input type="hidden" id="mode" name="mode" value="${mode}"/></#if>
            </div>

            <div class="${properties.kcFormGroupClass!}">
                <div class="${properties.kcLabelWrapperClass!}">
                    <#-- Keycloak requires a name only once the account already has an authenticator. -->
                    <label for="userLabel" class="${properties.kcLabelClass!}">${msg("loginTotpDeviceName")}<#if totp.otpCredentials?size lt 1> <span class="rs-quiet">${msg("fieldOptional")}</span></#if></label>
                </div>

                <div class="${properties.kcInputWrapperClass!}">
                    <input type="text" class="${properties.kcInputClass!}" id="userLabel" name="userLabel" autocomplete="off" dir="auto"
                           <#if messagesPerField.existsError('userLabel') && !messagesPerField.existsError('totp')>autofocus</#if>
                           aria-invalid="<#if messagesPerField.existsError('userLabel')>true</#if>"
                           <#if messagesPerField.existsError('userLabel')>aria-describedby="input-error-otp-label"</#if> />

                    <#if messagesPerField.existsError('userLabel')>
                        <span id="input-error-otp-label" class="${properties.kcInputErrorMessageClass!}" aria-live="polite">
                            ${kcSanitize(messagesPerField.get('userLabel'))?no_esc}
                        </span>
                    </#if>
                </div>
            </div>

            <div class="${properties.kcFormGroupClass!}">
                <@passwordCommons.logoutOtherSessions/>
            </div>

            <div id="kc-form-buttons" class="rs-actions">
                <input type="submit"
                       class="${properties.kcButtonClass!} ${properties.kcButtonPrimaryClass!} ${properties.kcButtonBlockClass!} ${properties.kcButtonLargeClass!}"
                       id="saveTOTPBtn" value="${msg("doSaveTotp")}"
                />
                <#if isAppInitiatedAction??>
                    <button type="submit"
                            class="${properties.kcButtonClass!} ${properties.kcButtonDefaultClass!} ${properties.kcButtonBlockClass!} ${properties.kcButtonLargeClass!}"
                            id="cancelTOTPBtn" name="cancel-aia" value="true">${msg("doCancel")}</button>
                </#if>
            </div>
        </form>
    </#if>
</@layout.registrationLayout>
