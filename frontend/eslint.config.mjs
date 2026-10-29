import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// DESIGN.md "The One Digit Rule": every Intl constructor and toLocale*String takes intlLocale(locale), never a bare
// Arabic tag (Arabic-Indic digits) or a hard-coded "en-US".
// Any Arabic tag ("ar-SA" also switches to the Hijri calendar) and a hard-coded "en-US".
const LOCALE_LITERAL = "/^(ar(-.+)?|en-US)$/";
const localeMessage = 'Format through intlLocale(locale) (lib/i18n), not a hard-coded Arabic tag or "en-US" (DESIGN.md, The One Digit Rule).';
const localeLiterals = [
  `NewExpression[callee.object.name="Intl"] > Literal[value=${LOCALE_LITERAL}]`,
  `CallExpression[callee.object.name="Intl"] > Literal[value=${LOCALE_LITERAL}]`,
  `:matches(NewExpression, CallExpression)[callee.object.name="Intl"] > ArrayExpression > Literal[value=${LOCALE_LITERAL}]`,
  `:matches(NewExpression, CallExpression)[callee.object.name="Intl"] ConditionalExpression > Literal[value=${LOCALE_LITERAL}]`,
  `CallExpression[callee.property.name=/^toLocale(Date|Time)?String$/] ConditionalExpression > Literal[value=${LOCALE_LITERAL}]`,
  `CallExpression[callee.property.name=/^toLocale(Date|Time)?String$/] > Literal[value=${LOCALE_LITERAL}]`,
].map(selector => ({ selector, message: localeMessage }));

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/**/*.test.{ts,tsx}"],
    rules: { "no-restricted-syntax": ["error", ...localeLiterals] },
  },
  globalIgnores([".next/**", "coverage/**", "playwright-report/**"]),
]);
