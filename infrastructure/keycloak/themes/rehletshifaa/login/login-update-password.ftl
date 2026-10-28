<#-- UX 7-2: creating the password. The intro Keycloak sends as a warning (updatePasswordMessage) reads as plain text,
     the rule comes from the realm's own policy (passwordPolicies) before the first try, each show-password button names
     its own field, and the submit says what it does. -->
<#import "template.ftl" as layout>
<#import "password-commons.ftl" as passwordCommons>
<#assign intro = message?? && message.type == "warning">
<#macro rule key count=1>
    <#if count == 1><li>${msg(key + "One")}</li><#else><li>${msg(key, count?c)}</li></#if>
</#macro>
<@layout.registrationLayout displayMessage=!intro && !messagesPerField.existsError('password','password-confirm'); section>
    <#if section = "header">
        ${msg("updatePasswordTitle")}
    <#elseif section = "form">
        <#if intro>
            <p class="instruction" id="kc-update-password-intro">${kcSanitize(message.summary)?no_esc}</p>
        </#if>
        <form id="kc-passwd-update-form" class="${properties.kcFormClass!}" onsubmit="login.disabled = true; return true;" action="${url.loginAction}" method="post">
            <#-- Lets a password manager save the new password under the account's email. -->
            <input type="text" name="username" value="${(user.email)!''}" autocomplete="username" hidden readonly>
            <div class="${properties.kcFormGroupClass!}">
                <div class="${properties.kcLabelWrapperClass!}">
                    <label for="password-new" class="${properties.kcLabelClass!}">${msg("passwordNew")}</label>
                </div>
                <div class="${properties.kcInputWrapperClass!}">
                    <#assign p = passwordPolicies!{}>
                    <#assign hasRule = p.length?? || p.upperCase?? || p.lowerCase?? || p.digits?? || p.specialChars?? || (p.notUsername!false) || (p.notEmail!false)>
                    <#-- The fix first, then the rule. -->
                    <#assign describedBy = (messagesPerField.existsError('password')?then("input-error-password ", "") + hasRule?then("kc-password-rule", ""))?trim>
                    <#if hasRule>
                        <div id="kc-password-rule" class="rs-password-rule">
                            <p id="kc-password-rule-intro">${msg("passwordRuleIntro")}</p>
                            <ul aria-labelledby="kc-password-rule-intro">
                                <#if p.length??><li>${msg("passwordRuleLength", p.length?c)}</li></#if>
                                <#if p.upperCase??><@rule key="passwordRuleUpper" count=p.upperCase/></#if>
                                <#if p.lowerCase??><@rule key="passwordRuleLower" count=p.lowerCase/></#if>
                                <#if p.digits??><@rule key="passwordRuleDigits" count=p.digits/></#if>
                                <#if p.specialChars??><@rule key="passwordRuleSpecial" count=p.specialChars/></#if>
                                <#-- Usernames are the email in this realm, so either policy reads as "different from your email". -->
                                <#if (p.notUsername!false) || (p.notEmail!false)><li>${msg("passwordRuleNotEmail")}</li></#if>
                            </ul>
                        </div>
                    </#if>
                    <div class="${properties.kcInputGroup!}" dir="ltr">
                        <input type="password" id="password-new" name="password-new" class="${properties.kcInputClass!}"
                               autofocus autocomplete="new-password"
                               <#if describedBy?has_content>aria-describedby="${describedBy}"</#if>
                               aria-invalid="<#if messagesPerField.existsError('password')>true</#if>"
                        />
                        <button class="${properties.kcFormPasswordVisibilityButtonClass!}" type="button" aria-label="${msg('showPassword')}"
                                aria-controls="password-new"  data-password-toggle
                                data-icon-show="${properties.kcFormPasswordVisibilityIconShow!}" data-icon-hide="${properties.kcFormPasswordVisibilityIconHide!}"
                                data-label-show="${msg('showPassword')}" data-label-hide="${msg('hidePassword')}">
                            <i class="${properties.kcFormPasswordVisibilityIconShow!}" aria-hidden="true"></i>
                        </button>
                    </div>

                    <#if messagesPerField.existsError('password')>
                        <span id="input-error-password" class="${properties.kcInputErrorMessageClass!}" aria-live="polite">
                            ${kcSanitize(messagesPerField.get('password'))?no_esc}
                        </span>
                    </#if>
                </div>
            </div>

            <div class="${properties.kcFormGroupClass!}">
                <div class="${properties.kcLabelWrapperClass!}">
                    <label for="password-confirm" class="${properties.kcLabelClass!}">${msg("passwordConfirm")}</label>
                </div>
                <div class="${properties.kcInputWrapperClass!}">
                    <div class="${properties.kcInputGroup!}" dir="ltr">
                        <input type="password" id="password-confirm" name="password-confirm"
                               class="${properties.kcInputClass!}"
                               autocomplete="new-password"
                               <#if messagesPerField.existsError('password-confirm')>aria-describedby="input-error-password-confirm"</#if>
                               aria-invalid="<#if messagesPerField.existsError('password-confirm')>true</#if>"
                        />
                        <button class="${properties.kcFormPasswordVisibilityButtonClass!}" type="button" aria-label="${msg('showPasswordConfirm')}"
                                aria-controls="password-confirm"  data-password-toggle
                                data-icon-show="${properties.kcFormPasswordVisibilityIconShow!}" data-icon-hide="${properties.kcFormPasswordVisibilityIconHide!}"
                                data-label-show="${msg('showPasswordConfirm')}" data-label-hide="${msg('hidePasswordConfirm')}">
                            <i class="${properties.kcFormPasswordVisibilityIconShow!}" aria-hidden="true"></i>
                        </button>
                    </div>

                    <#if messagesPerField.existsError('password-confirm')>
                        <span id="input-error-password-confirm" class="${properties.kcInputErrorMessageClass!}" aria-live="polite">
                            ${kcSanitize(messagesPerField.get('password-confirm'))?no_esc}
                        </span>
                    </#if>

                </div>
            </div>

            <div class="${properties.kcFormGroupClass!}">
                <@passwordCommons.logoutOtherSessions/>

                <div id="kc-form-buttons" class="${properties.kcFormButtonsClass!}">
                    <#if isAppInitiatedAction??>
                        <input name="login" class="${properties.kcButtonClass!} ${properties.kcButtonPrimaryClass!} ${properties.kcButtonLargeClass!}" type="submit" value="${msg("doSavePassword")}" />
                        <button class="${properties.kcButtonClass!} ${properties.kcButtonDefaultClass!} ${properties.kcButtonLargeClass!}" type="submit" name="cancel-aia" value="true">${msg("doCancel")}</button>
                    <#else>
                        <input name="login" class="${properties.kcButtonClass!} ${properties.kcButtonPrimaryClass!} ${properties.kcButtonBlockClass!} ${properties.kcButtonLargeClass!}" type="submit" value="${msg("doSavePassword")}" />
                    </#if>
                </div>
            </div>
        </form>
        <script type="module" src="${url.resourcesPath}/js/passwordVisibility.js"></script>
    </#if>
</@layout.registrationLayout>
