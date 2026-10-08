"use client";

import { useId, useRef, useState, type FormEvent } from "react";

import { useWorkCopy } from "@/components/portal/portal-copy";
import { fillTemplate } from "@/lib/portal-labels";
import { intlLocale } from "@/lib/i18n";

type Mutate = (path: string, body?: unknown, method?: string) => Promise<unknown>;
export type RecordableProposal = { versionId: string; versionNumber?: number; documentType?: string };

const CHANNELS = ["PHONE", "WHATSAPP_CALL", "VIDEO", "IN_PERSON"] as const;

/** "Now" for a datetime-local field, in the coordinator's own time zone, to the minute. */
function localNow() {
  const now = new Date();
  now.setSeconds(0, 0);
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

/**
 * The owning coordinator records the patient's proposal decision after going through the terms with them in Arabic
 * (plans/arabic-proposal-decision.md). Every field is evidence the backend keeps beside the decision: what was
 * decided, who confirmed it, how and when the conversation happened, and the coordinator's attestation that the terms
 * were explained and understood. The patient later sees that it was recorded, by whom and how.
 */
export function RecordProposalDecision({ locale, caseId, proposal, busy, mutate }: {
  locale: string; caseId: string; proposal: RecordableProposal; busy: boolean; mutate: Mutate;
}) {
  const work = useWorkCopy();
  const t = work.recordDecision;
  const quote = proposal.documentType === "FINAL_TREATMENT_QUOTE";
  const [decision, setDecision] = useState("");
  const [confirmedBy, setConfirmedBy] = useState("PATIENT");
  const [channel, setChannel] = useState<string>("PHONE");
  const [when, setWhen] = useState(localNow);
  const [note, setNote] = useState("");
  const [attested, setAttested] = useState(false);
  const [errors, setErrors] = useState<{ decision?: boolean; note?: boolean; attested?: boolean; when?: boolean }>({});
  const [failed, setFailed] = useState(false);
  const [latest] = useState(localNow);
  const ids = { decision: useId(), note: useId(), attest: useId(), when: useId() };
  const firstDecision = useRef<HTMLInputElement>(null), noteRef = useRef<HTMLTextAreaElement>(null);
  const whenRef = useRef<HTMLInputElement>(null), attestRef = useRef<HTMLInputElement>(null);
  const channels = t.channels as Record<string, string>;
  const decisions = [
    { value: quote ? "ACCEPTED" : "ACKNOWLEDGED", label: quote ? t.accept : t.acknowledge },
    { value: "REVISION_REQUESTED", label: t.changes },
    { value: "DECLINED", label: t.decline },
  ];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // The form validates itself (noValidate keeps browser bubbles out of the drawer), so the time is checked here too:
    // empty, unreadable or in the future is never sent as evidence. The server also refuses a time before release.
    const at = new Date(when);
    const next = { decision: !decision, note: decision === "REVISION_REQUESTED" && !note.trim(), attested: !attested,
      when: !when || Number.isNaN(at.getTime()) || at.getTime() > Date.now() + 5 * 60000 };
    setErrors(next);
    setFailed(false);
    // The first problem takes focus, in the order the form reads, so the message beside it is the one heard first.
    const first = next.decision ? firstDecision : next.when ? whenRef : next.note ? noteRef : next.attested ? attestRef : null;
    if (first) { first.current?.focus(); return; }
    try {
      const result = await mutate(`/coordinator/cases/${caseId}/proposals/${proposal.versionId}/decision/on-behalf`, {
        decision, comment: note.trim() || undefined, channel, confirmedBy, conversationAt: at.toISOString(), attested,
      });
      if (!result) setFailed(true);
    } catch { setFailed(true); }
  }

  const radio = "flex min-h-11 items-center gap-3 text-[0.9375rem] text-ink-800";
  return (
    <form className="space-y-5" onSubmit={submit} noValidate>
      <p className="text-[0.875rem] text-ink-600">
        {proposal.versionNumber ? fillTemplate(t.document, { type: quote ? t.quote : t.estimate, version: new Intl.NumberFormat(intlLocale(locale)).format(proposal.versionNumber) }) : (quote ? t.quote : t.estimate)}
      </p>

      <fieldset aria-describedby={errors.decision ? ids.decision : undefined}>
        <legend className="text-[0.9375rem] font-semibold text-ink-900">{t.decision}</legend>
        <div className="mt-1">
          {decisions.map((option, index) => (
            <label key={option.value} className={radio}>
              <input ref={index === 0 ? firstDecision : undefined} type="radio" name={`decision-${proposal.versionId}`} className="h-5 w-5 flex-none" value={option.value}
                     checked={decision === option.value} onChange={() => { setDecision(option.value); setErrors(e => ({ ...e, decision: false })); }}/>
              {option.label}
            </label>
          ))}
        </div>
        {errors.decision && <p id={ids.decision} role="alert" className="error-text">{t.decisionRequired}</p>}
      </fieldset>

      <fieldset>
        <legend className="text-[0.9375rem] font-semibold text-ink-900">{t.confirmedBy}</legend>
        <div className="mt-1">
          {[["PATIENT", t.patient], ["REPRESENTATIVE", t.representative]].map(([value, label]) => (
            <label key={value} className={radio}>
              <input type="radio" name={`confirmed-${proposal.versionId}`} className="h-5 w-5 flex-none" value={value}
                     checked={confirmedBy === value} onChange={() => setConfirmedBy(value)}/>
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-[0.9375rem] font-semibold text-ink-900">{t.channel}
          <select name="conversation-channel" autoComplete="off" className="field mt-2" value={channel} onChange={event => setChannel(event.target.value)}>
            {CHANNELS.map(value => <option key={value} value={value}>{channels[value]}</option>)}
          </select>
        </label>
        <label className="block text-[0.9375rem] font-semibold text-ink-900">{t.when}
          <input ref={whenRef} type="datetime-local" name="conversation-at" autoComplete="off" className={`field mt-2 ${errors.when ? "field-error" : ""}`} value={when} max={latest} required
                 aria-invalid={errors.when || undefined} aria-describedby={errors.when ? ids.when : undefined}
                 onChange={event => { setWhen(event.target.value); setErrors(e => ({ ...e, when: false })); }}/>
        </label>
      </div>
      {errors.when && <p id={ids.when} role="alert" className="error-text -mt-3">{t.whenInvalid}</p>}

      <label className="block text-[0.9375rem] font-semibold text-ink-900">{t.note}
        <textarea ref={noteRef} name="decision-note" autoComplete="off" className={`field mt-2 min-h-20 ${errors.note ? "field-error" : ""}`} maxLength={10000} value={note} dir="auto"
                  aria-invalid={errors.note || undefined} aria-describedby={errors.note ? ids.note : undefined}
                  onChange={event => { setNote(event.target.value); if (event.target.value.trim()) setErrors(e => ({ ...e, note: false })); }}/>
      </label>
      {errors.note && <p id={ids.note} role="alert" className="error-text -mt-3">{t.noteRequired}</p>}

      <label className="flex items-start gap-3 text-[0.9375rem] leading-6 text-ink-800">
        <input ref={attestRef} type="checkbox" className="mt-1 h-5 w-5 flex-none" checked={attested} aria-invalid={errors.attested || undefined}
               aria-describedby={errors.attested ? ids.attest : undefined}
               onChange={event => { setAttested(event.target.checked); if (event.target.checked) setErrors(e => ({ ...e, attested: false })); }}/>
        {quote ? t.attestQuote : t.attestEstimate}
      </label>
      {errors.attested && <p id={ids.attest} role="alert" className="error-text -mt-3">{t.attestRequired}</p>}

      <p className="max-w-prose text-[0.875rem] leading-6 text-ink-600">{t.provenance}</p>
      <div>
        <button className="btn-primary" disabled={busy}>{busy ? t.saving : t.submit}</button>
        {failed && <p role="alert" className="error-text mt-2">{t.failed}</p>}
      </div>
    </form>
  );
}
