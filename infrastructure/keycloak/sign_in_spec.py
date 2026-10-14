"""A2b (D1 / MFA-1): the one specification of the Keycloak sign-in. The realm files carry the same flows
(KeycloakRealmContractTest checks both); generate_sync_authentication.py turns it into sync-authentication.sh."""
import json, os, re, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
AMR_MAX_AGE = "36000"  # the method counts for the sign-in session (10 h, the SSO maximum)

# (alias, description, top_level, [executions]); an execution is ("auth", provider, requirement, config_alias|None) or ("flow", alias, requirement)
FLOWS = [
    ("rehletshifaa-browser", "Sign-in: password, then the second factor the person has (passkey, authenticator app or recovery code); staff without one enrol now", True, [
        ("auth", "auth-cookie", "ALTERNATIVE", None),
        ("flow", "rehletshifaa-sign-in", "ALTERNATIVE"),
    ]),
    ("rehletshifaa-sign-in", "Password and second factor", False, [
        ("auth", "auth-username-password-form", "REQUIRED", "rs-amr-pwd"),
        ("flow", "rehletshifaa-second-factor", "CONDITIONAL"),
        ("flow", "rehletshifaa-staff-enrolment", "CONDITIONAL"),
    ]),
    ("rehletshifaa-second-factor", "Anyone who has a second factor uses it, at every sign-in, from every client: passkey, authenticator app or a recovery code", False, [
        ("auth", "conditional-user-configured", "REQUIRED", None),
        ("auth", "webauthn-authenticator", "ALTERNATIVE", "rs-amr-hwk"),
        ("auth", "auth-otp-form", "ALTERNATIVE", "rs-amr-otp"),
        ("auth", "auth-recovery-authn-code-form", "ALTERNATIVE", "rs-amr-recovery"),
    ]),
    ("rehletshifaa-staff-enrolment", "Staff without a second factor set one up at this sign-in", False, [
        ("auth", "conditional-user-role", "REQUIRED", "rs-cond-staff"),
        ("auth", "conditional-sub-flow-executed", "REQUIRED", "rs-cond-no-second-factor"),
        ("auth", "auth-otp-form", "REQUIRED", "rs-amr-otp-enrol"),
    ]),
    ("rehletshifaa-direct-grant-denied", "No password-only tokens: every token comes from the browser sign-in", True, [
        ("auth", "deny-access-authenticator", "REQUIRED", "rs-deny-direct-grant"),
    ]),
    ("rehletshifaa-reset-credentials", "Password reset proves the second factor before the new password", True, [
        ("auth", "reset-credentials-choose-user", "REQUIRED", None),
        ("auth", "reset-credential-email", "REQUIRED", None),
        ("flow", "rehletshifaa-reset-second-factor", "CONDITIONAL"),
        ("auth", "reset-password", "REQUIRED", None),
    ]),
    ("rehletshifaa-reset-second-factor", "A reset never bypasses a second factor the person has", False, [
        ("auth", "conditional-user-configured", "REQUIRED", None),
        ("auth", "webauthn-authenticator", "ALTERNATIVE", None),
        ("auth", "auth-otp-form", "ALTERNATIVE", None),
        ("auth", "auth-recovery-authn-code-form", "ALTERNATIVE", None),
    ]),
]

def amr(value):
    return {"default.reference.value": value, "default.reference.maxAge": AMR_MAX_AGE}

CONFIGS = {
    "rs-amr-pwd": amr("pwd"),
    "rs-amr-hwk": amr("hwk"),
    "rs-amr-otp": amr("otp"),
    "rs-amr-recovery": amr("mfa"),
    "rs-amr-otp-enrol": amr("otp"),
    "rs-cond-staff": {"condUserRole": "rs-staff", "negate": "false"},
    "rs-cond-no-second-factor": {"flow_to_check": "rehletshifaa-second-factor", "check_result": "not-executed"},
    "rs-deny-direct-grant": {"denyErrorMessage": "Sign in through the RehletShifaa website."},
}

BINDINGS = {"browserFlow": "rehletshifaa-browser", "directGrantFlow": "rehletshifaa-direct-grant-denied",
            "resetCredentialsFlow": "rehletshifaa-reset-credentials"}

STAFF_ROLE = {"name": "rs-staff", "description": "Works on cases or the platform: signs in with a second factor (D1). Set by the platform when staff are invited.", "composite": False, "clientRole": False}

AMR_MAPPER = {"name": "amr", "protocol": "openid-connect", "protocolMapper": "oidc-amr-mapper", "consentRequired": False,
              "config": {"id.token.claim": "true", "access.token.claim": "true", "introspection.token.claim": "true", "userinfo.token.claim": "false"}}

# Credential changes and sign-in failures are kept 90 days for the security review (who added or removed a second factor).
EVENTS = {"eventsEnabled": True, "eventsExpiration": 7776000,
          "enabledEventTypes": ["LOGIN_ERROR", "UPDATE_CREDENTIAL", "REMOVE_CREDENTIAL", "UPDATE_TOTP", "REMOVE_TOTP",
                                "UPDATE_PASSWORD", "RESET_PASSWORD", "RESET_PASSWORD_ERROR", "CUSTOM_REQUIRED_ACTION",
                                "EXECUTE_ACTIONS", "SEND_RESET_PASSWORD", "CODE_TO_TOKEN_ERROR", "USER_DISABLED_BY_TEMPORARY_LOCKOUT",
                                "USER_DISABLED_BY_PERMANENT_LOCKOUT"],
          "adminEventsEnabled": True, "adminEventsDetailsEnabled": False}

BRUTE_FORCE = {"bruteForceProtected": True, "permanentLockout": False, "maxFailureWaitSeconds": 900, "minimumQuickLoginWaitSeconds": 60,
               "waitIncrementSeconds": 60, "quickLoginCheckMilliSeconds": 1000, "maxDeltaTimeSeconds": 43200, "failureFactor": 5}

def realm_flows():
    out = []
    for alias, desc, top, execs in FLOWS:
        rows = []
        for i, e in enumerate(execs, start=1):
            if e[0] == "auth":
                row = {"authenticator": e[1], "authenticatorFlow": False, "requirement": e[2], "priority": i * 10}
                if e[3]: row["authenticatorConfig"] = e[3]
            else:
                row = {"authenticatorFlow": True, "requirement": e[2], "priority": i * 10, "flowAlias": e[1]}
            rows.append(row)
        out.append({"alias": alias, "description": desc, "providerId": "basic-flow", "topLevel": top, "builtIn": False, "authenticationExecutions": rows})
    return out

def realm_configs():
    return [{"alias": a, "config": c} for a, c in CONFIGS.items()]
