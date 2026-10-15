"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

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
  /** Said under the field when Verify is pressed with fewer than six digits. A link that passes it keeps Verify enabled. */
  incomplete?: string;
};

/** Arabic-Indic and Persian digits (common on Arabic phone keyboards) as ASCII, so a code typed either way is kept. */
function asciiDigits(value: string) {
  return value
    .replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 0x06f0));
}

/**
 * The one-time-code step shared by the three secure links (status, proposal, profile activation). Possession of a link
 * is never enough: a code goes to the patient's own registered contact first. The step says where the code will go
 * before it is sent (the masked destination the backend returns), offers the other channel only where that link's
 * endpoint accepts one, then asks for the six digits in one labelled field (no placeholder) with a way to resend.
 *
 * Presentation only: sending, verifying and every grant stay in the page that owns the link. The typed code lives here;
 * the page bumps `round` after each successful send, so a failed resend never empties the field.
 */
export function OneTimeCodeStep({ copy, destination, sent, busy, onSend, onVerify, channelSwitch, error, notice, round = 0, children }: {
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
  /** A failure that belongs to this step (wrong code, too many attempts, sending failed), shown under the field. */
  error?: string | null;
  /** Counts successful sends; a new round empties the field (the step stays mounted, so its live region announces). */
  round?: number;
  /** A quiet confirmation under the field, e.g. "New code sent" after a resend; announced politely. */
  notice?: string | null;
  /** Said with the destination, before and after sending (e.g. "We will never ask you for this code"). */
  children?: ReactNode;
}) {
  const [code, setCode] = useState("");
  const [short, setShort] = useState(false);
  const [seenRound, setSeenRound] = useState(round);
  if (round !== seenRound) { setSeenRound(round); setCode(""); setShort(false); }
  const fieldRef = useRef<HTMLInputElement>(null);
  const fieldId = useId();
  const errorId = `${fieldId}-error`, destinationId = `${fieldId}-destination`;
  // A wrong or expired code puts the patient back in the field with the digits selected, ready to retype.
  useEffect(() => { if (error && sent) { fieldRef.current?.focus(); fieldRef.current?.select(); } }, [error, sent]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- only a new round moves focus, not the step's other state
  useEffect(() => { if (round > 1 && sent) fieldRef.current?.focus(); }, [round]);
  const problem = error || (short && copy.incomplete) || null;
  const message = problem ? <p id={errorId} role="alert" className="mt-3 text-[0.9375rem] font-semibold leading-6 text-alert-800">{problem}</p> : null;

  return (
    <div>
      {destination && (
        <p id={destinationId} className="leading-7 text-ink-700">
          {sent ? copy.sentTo : copy.sendTo} <strong className="font-semibold text-ink-900"><bdi dir="ltr">{destination}</bdi></strong>
        </p>
      )}
      {channelSwitch && (
        <button type="button" className="link-cta mt-1 inline-flex min-h-11 items-center text-[0.9375rem]" disabled={busy}
                onClick={channelSwitch.onSwitch}>
          {channelSwitch.label}
        </button>
      )}
      {children}

      {!sent ? (
        <>
          {message}
          <button type="button" className="btn-primary mt-6 w-full sm:w-auto" disabled={busy} onClick={onSend}>{busy ? copy.sending : copy.send}</button>
        </>
      ) : (
        <form className="mt-5" noValidate onSubmit={event => { event.preventDefault(); if (busy) return; if (code.length === 6) onVerify(code); else setShort(true); }}>
          <label htmlFor={fieldId} className="block text-sm font-bold text-ink-800">{copy.codeLabel}</label>
          <input ref={fieldRef} id={fieldId} className="field mt-2 max-w-[16rem] text-center text-2xl tabular-nums tracking-[0.4em]" dir="ltr"
                 name="one-time-code" inputMode="numeric" autoComplete="one-time-code" spellCheck={false} enterKeyHint="done" autoFocus
                 aria-invalid={problem ? true : undefined} aria-describedby={[destination ? destinationId : "", problem ? errorId : ""].join(" ").trim() || undefined}
                 value={code} onChange={event => { setShort(false); setCode(asciiDigits(event.target.value).replace(/\D/g, "").slice(0, 6)); }}/>
          {message}
          {/* Always rendered so the confirmation is announced when it appears. */}
          <p role="status" className={!problem && !busy && notice ? "mt-3 text-[0.9375rem] leading-6 text-brand-800" : "sr-only"}>
            {!problem && !busy && notice ? <span key={round}>{notice}</span> : null}
          </p>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-5">
            <button className="btn-primary w-full sm:w-auto" disabled={busy || (!copy.incomplete && code.length !== 6)}>{busy ? copy.verifying : copy.verify}</button>
            <button type="button" className="link-cta inline-flex min-h-11 items-center self-start text-[0.9375rem] sm:self-auto" disabled={busy} onClick={onSend}>{copy.resend}</button>
          </div>
        </form>
      )}
    </div>
  );
}
