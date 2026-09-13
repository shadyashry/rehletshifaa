/**
 * Cross-browser patient-path pack.
 *
 * These existing specs already isolate the browser-facing contracts with deterministic
 * API fixtures. Importing them here runs the same intake, proposal/OTP, activation and
 * My Care/deposit behaviours in Chromium, Firefox and WebKit via playwright.qa.config.ts.
 * The separate live Chromium journeys remain the authority for persistence, Keycloak,
 * Mailpit, workflow and deposit outcomes.
 */
import "../case-flow.spec";
import "../proposal-otp.spec";
import "../activation-flow.spec";
import "../my-care.spec";
