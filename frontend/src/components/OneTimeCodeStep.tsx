"use client";

import { useId, useState, type ReactNode } from "react";

/** The step's words; each secure link passes its own (from `secureLink.*`), so the wording stays the page's. */
export type OneTimeCodeCopy = {
  /** Before sending: "We will send a 6-digit code to" (followed by the masked destination). */
  sendTo: string;
  /** After sending: "We sent a code to" (followed by the masked destination). */
  sentTo: string;
  send: string; sending: string;
  codeLabel: string;
  verify: string; verifying: string;
  resend: string;
};

/**
 * The one-time-code step shared by the three secure links (status, proposal, profile activation). Possession of a link
 * is never enough: a code goes to the patient's own registered contact first. The step says where the code will go
 * before it is sent (the masked destination the backend returns), offers the other channel only where that link's
 * endpoint accepts one, then asks for the six digits in one labelled field (no placeholder) with a way to resend.
 *
 * Presentation only: sending, verifying and every grant stay in the page that owns the link. The typed code lives here
 * and is cleared whenever a new code is requested.
 */
export function OneTimeCodeStep({ copy, destination, sent, busy, onSend, onVerify, channelSwitch, error }: {
  copy: OneTimeCodeCopy;
  /** The masked contact, e.g. "•••• 7898"; shown before and after sending. */
  destination?: string | null;
  /** Whether a code has been sent in this visit. */
  sent: boolean;
  busy: boolean;
  /** Sends (or resends) a code to the current channel. */
  onSend: () => void;
  onVerify: (code: string) => void;
  /** The other channel, only where the link's endpoint accepts a channel. */
  channelSwitch?: { label: string; onSwitch: () => void } | null;
  /** A failure that belongs to this step (wrong code, too many attempts), shown under the field. */
  error?: ReactNode;
}) {
  const [code, setCode] = useState("");
  const fieldId = useId();
  const errorId = `${fieldId}-error`;
  const send = () => { setCode(""); onSend(); };

  return (
    <div>
      {destination && (
        <p className="leading-7 text-ink-700">
          {sent ? copy.sentTo : copy.sendTo} <strong className="font-semibold text-ink-900"><bdi dir="ltr">{destination}</bdi></strong>
        </p>
      )}
      {channelSwitch && (
        <button type="button" className="link-cta mt-1 inline-flex min-h-11 items-center text-[0.9375rem]" disabled={busy}
                onClick={() => { setCode(""); channelSwitch.onSwitch(); }}>
          {channelSwitch.label}
        </button>
      )}

      {!sent ? (
        <>
          {error && <div id={errorId} className="mt-4">{error}</div>}
          <button type="button" className="btn-primary mt-6 w-full sm:w-auto" disabled={busy} onClick={send}>{busy ? copy.sending : copy.send}</button>
        </>
      ) : (
        <form className="mt-5" noValidate onSubmit={event => { event.preventDefault(); if (!busy && code.length === 6) onVerify(code); }}>
          <label htmlFor={fieldId} className="block text-sm font-bold text-ink-800">{copy.codeLabel}</label>
          <input id={fieldId} className="field mt-2 max-w-[16rem] text-center text-2xl tabular-nums tracking-[0.4em]" dir="ltr"
                 inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus
                 aria-invalid={error ? true : undefined} aria-describedby={error ? errorId : undefined}
                 value={code} onChange={event => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}/>
          {error && <div id={errorId} className="mt-3">{error}</div>}
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-5">
            <button className="btn-primary w-full sm:w-auto" disabled={busy || code.length !== 6}>{busy ? copy.verifying : copy.verify}</button>
            <button type="button" className="link-cta inline-flex min-h-11 items-center self-start text-[0.9375rem] sm:self-auto" disabled={busy} onClick={send}>{copy.resend}</button>
          </div>
        </form>
      )}
    </div>
  );
}
