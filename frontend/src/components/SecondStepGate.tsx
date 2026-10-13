"use client";

import type { Locale } from "@/lib/i18n";
import { secondStepCopy } from "@/lib/second-step";

/**
 * D1: shown when a staff session came back from the sign-in without its second step. One way forward, an alternative for
 * passkey roles (their authenticator app is the agreed backup), and a way out — never a loop of redirects.
 */
export function SecondStepGate({ locale, acr, onContinue, onSignOut }: {
  locale: Locale; acr: "2" | "3"; onContinue: (acr: "2" | "3") => void; onSignOut: () => void;
}) {
  const t = secondStepCopy[locale];
  return (
    <main id="main" className="mx-auto max-w-xl px-4 py-16">
      <section className="card p-6 sm:p-8" aria-labelledby="second-step-title">
        <h1 id="second-step-title" className="title">{t.title}</h1>
        <p className="mt-3 text-sm leading-6 text-ink-700">{acr === "3" ? t.passkey : t.app}</p>
        <p className="mt-2 text-sm leading-6 text-ink-600">{t.firstTime}</p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button type="button" className="btn-primary" onClick={() => onContinue(acr)}>{t.continue}</button>
          {acr === "3" && <button type="button" className="btn-secondary" onClick={() => onContinue("2")}>{t.useApp}</button>}
          <button type="button" className="font-semibold text-ink-700 underline underline-offset-4" onClick={onSignOut}>{t.signOut}</button>
        </div>
      </section>
    </main>
  );
}
