"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FileUp, LockKeyhole, ShieldCheck, X } from "lucide-react";

import { phaseExplanation, phaseLabels, phaseMeanwhile, phasePosition, type JourneyCopy } from "@/lib/patient-journey";
import { CaseJourney } from "@/components/CaseJourney";
import { OneTimeCodeStep } from "@/components/OneTimeCodeStep";
import type { Dictionary } from "@/lib/dictionary";
import { plural } from "@/lib/portal-labels";

import { intlLocale, type Locale } from "@/lib/i18n";
import { apiUrl } from "@/lib/api";
import { localeHref } from "@/lib/links";
import { EmergencyGuidance } from "@/components/EmergencyGuidance";

type Summary = { caseNumber: string; destinationHint: string };
type ActionItem = { id: string; kind: "INFORMATION" | "DOCUMENT"; code: string; label: string; required: boolean; completed: boolean; response: string | null };
type Action = { taskId: string; title: string; message: string | null; blocking: boolean; dueAt: string | null; items: ActionItem[] };
type ProposalState = { state: string; action: "REVIEW_PROPOSAL" | "VIEW_PROPOSAL" | null; versionNumber: number | null; validUntil: string | null; decidedAt: string | null };
/** `expectedWorkingDays`: P1-6 (D-02), how long the team usually takes over this phase; null while the patient owes the step. */
type Status = { caseNumber: string; statusEn: string; statusAr: string; phase?: string | null; actionRequired: boolean; action: Action | null; proposal?: ProposalState | null; expectedWorkingDays?: number | null;
  /** D-1: when the stamped moments happened (stamped on this page in slice B). */
  milestones?: { receivedAt?: string | null; consultantReviewAt?: string | null; estimateReadyAt?: string | null } | null };
type ProposalHandoff = { token: string; grant: string; expiresAt: string };
/** Hands the already-verified proposal grant to the proposal page in this browser session only — never through the URL. */
export const PROPOSAL_HANDOFF_KEY = (token: string) => `rs-proposal-grant:${token}`;
type Presign = { documentId: string; uploadUrl: string; requiredHeaders: Record<string, string> };


/** The page's words, from messages/{en,ar}.json (`secureLink.status`, and the shared working-days plural), passed by the server page. */
export type StatusCopy = Dictionary["secureLink"]["status"] & { workingDays: Dictionary["portalWork"]["plural"]["workingDays"] };

/**
 * The patient's secure, no-login action page.
 *
 * <p>Possession of the link is never enough: a one-time code sent to the patient's own registered contact
 * is exchanged for a short-lived grant first. After that the page shows only what this case's coordinator
 * actually asked for — never the full case form, and never another case.
 */
export function CaseStatusAccess({ locale, token, emergency, copy: t, journeyCopy }: { locale: Locale; token: string;
  copy: StatusCopy;
  /** A-02: the bilingual emergency instruction (common.emergencyNotice), passed by the page so the client bundle carries no dictionary. */
  emergency?: { title: string; body: string };
  /** The journey's words (secureLink.journey), passed by the page for the same reason. */
  journeyCopy: JourneyCopy }) {
  const notice = emergency ? <EmergencyGuidance title={emergency.title} body={emergency.body} className="mb-6"/> : null;
  const router = useRouter();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [phase, setPhase] = useState<"loading" | "summary" | "code" | "view" | "done" | "invalid">("loading");
  const [grant, setGrant] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<Record<string, File>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [opening, setOpening] = useState(false);
  // Each successful send starts a fresh code step (the typed code is kept when a resend fails).
  const [codeRound, setCodeRound] = useState(0);

  /**
   * "Review proposal": the backend re-checks that a decidable version exists for THIS case and hands back a
   * share token plus a view grant minted from the code just verified. The grant travels via sessionStorage,
   * so the proposal page opens without a second code and no credential ever appears in a URL.
   */
  async function openProposal() {
    setOpening(true); setError("");
    try {
      const handoff = await post<ProposalHandoff>(`/proposal-access`, { grant });
      try { sessionStorage.setItem(PROPOSAL_HANDOFF_KEY(handoff.token), JSON.stringify({ grant: handoff.grant, expiresAt: handoff.expiresAt })); } catch {}
      router.push(`/${locale}/proposal/${handoff.token}`);
    } catch (e) {
      setError(e instanceof Error && /available/i.test(e.message) ? t.proposalUnavailable : e instanceof Error ? e.message : t.error);
      setOpening(false);
    }
  }

  useEffect(() => {
    fetch(apiUrl(`/public/cases/${token}`))
      .then(async response => { if (!response.ok) throw new Error(); setSummary(await response.json() as Summary); setPhase("summary"); })
      .catch(() => setPhase("invalid"));
  }, [token]);

  async function request() {
    setBusy(true); setError("");
    try {
      const response = await fetch(apiUrl(`/public/cases/${token}/request-access`), { method: "POST" });
      if (!response.ok) throw new Error(await apiError(response, t.error));
      setSummary(await response.json() as Summary); setPhase("code"); setCodeRound(round => round + 1);
    } catch (e) { setError(e instanceof Error ? e.message : t.error); } finally { setBusy(false); }
  }

  async function verify(code: string) {
    setBusy(true); setError("");
    try {
      const access = await post<{ grant: string }>(`/verify`, { code: code.trim() });
      setGrant(access.grant);
      const view = await post<Status>(`/view`, { grant: access.grant });
      setStatus(view);
      setValues(Object.fromEntries((view.action?.items ?? []).map(item => [item.id, item.response ?? ""])));
      setPhase("view");
    } catch (e) { setError(e instanceof Error ? e.message : t.error); } finally { setBusy(false); }
  }

  async function post<T>(path: string, body: unknown, headers?: Record<string, string>): Promise<T> {
    const response = await fetch(apiUrl(`/public/cases/${token}${path}`), {
      method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body),
    });
    if (!response.ok) {
      const problem = await response.json().catch(() => null);
      const failure = new Error(problem?.message ?? t.error) as Error & { fields?: { field: string; message: string }[] };
      failure.fields = problem?.errors;
      throw failure;
    }
    return response.json() as Promise<T>;
  }

  /** Mirrors the backend rules so a patient is corrected before the round-trip; the backend still decides. */
  function check(items: ActionItem[]) {
    const found: Record<string, string> = {};
    for (const item of items) {
      if (!item.required || item.completed) continue;
      if (item.kind === "DOCUMENT" ? !files[item.id] : !values[item.id]?.trim()) {
        found[item.id] = item.kind === "DOCUMENT" ? t.missingFile : t.missing;
      }
    }
    return found;
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const items = status?.action?.items ?? [];
    const local = check(items);
    if (Object.keys(local).length) { setErrors(local); setError(t.fix); return; }
    if (!items.length && !note.trim()) { setError(t.fix); return; }
    setBusy(true); setError(""); setErrors({});
    try {
      const answers: { itemId: string; value: string | null; documentId: string | null }[] = [];
      for (const item of items) {
        const file = files[item.id];
        if (file) {
          const presign = await post<Presign>(`/documents/presign`,
            { originalFileName: file.name, contentType: file.type, sizeBytes: file.size }, { "X-Case-Grant": grant });
          const upload = await fetch(presign.uploadUrl, { method: "PUT", headers: presign.requiredHeaders, body: file });
          if (!upload.ok) throw new Error(t.error);
          await post(`/documents/confirm`, { documentId: presign.documentId }, { "X-Case-Grant": grant });
          answers.push({ itemId: item.id, value: values[item.id]?.trim() || null, documentId: presign.documentId });
        } else if (values[item.id]?.trim()) {
          answers.push({ itemId: item.id, value: values[item.id].trim(), documentId: null });
        }
      }
      await post(`/respond`, { grant, message: note.trim() || null, language: locale, items: answers });
      setPhase("done");
    } catch (e) {
      const failure = e as Error & { fields?: { field: string; message: string }[] };
      if (failure.fields?.length) {
        setErrors(Object.fromEntries(failure.fields.map(f => [f.field.replace(/^item:/, ""), f.message])));
        setError(t.fix);
      } else setError(failure.message || t.error);
    } finally { setBusy(false); }
  }

  if (phase === "loading") return <Frame title={t.title} notice={notice}><p role="status" className="text-ink-600">{t.loading}</p></Frame>;
  if (phase === "invalid") return <Frame title={t.title} notice={notice}><p role="alert" className="rounded-xl bg-alert-50 p-4 text-alert-800">{t.invalid}</p></Frame>;
  if (phase === "done") return (
    <Frame title={t.title} notice={notice}>
      <span aria-hidden className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-600 text-2xl text-white">✓</span>
      <h2 className="title mt-5">{t.doneTitle}</h2>
      <p className="mt-2 leading-7 text-ink-600">{t.doneBody}</p>
    </Frame>
  );

  const action = status?.action;
  // The proposal state refines the phase story so the page never says "being prepared, or ready" when the
  // backend knows which — and never "no action is required" next to a decision that is waiting.
  const proposalState = status?.actionRequired ? null : status?.proposal?.state ?? null;
  const explain = proposalState === "READY" ? { title: t.proposalReadyTitle, body: t.proposalReady, next: t.proposalReadyNext }
    : proposalState === "PREPARING" ? { title: t.proposalPreparingTitle, body: t.proposalPreparing, next: t.proposalPreparingNext }
    : phaseExplanation(status?.phase, !!status?.actionRequired, journeyCopy);
  // DEP-3: in the deposit phase the payment is the patient's own step (paid in My Care), and this link cannot tell whether it
  // was made: no "nothing needed", no team timing, and one way to My Care.
  const depositStep = !!status && !status.actionRequired && status.phase === "deposit";
  // P1-6 (D-02): while the team has the step, how long it usually takes and what the patient can do meanwhile.
  const teamStep = !!status && !status.actionRequired && proposalState !== "READY" && !depositStep;
  const usually = teamStep && status?.expectedWorkingDays ? t.usuallyWithin.replace("{duration}", plural(locale, status.expectedWorkingDays, t.workingDays)) : null;
  const meanwhile = teamStep ? phaseMeanwhile(status?.phase, false, journeyCopy) : null;
  return (
    <Frame title={t.title} notice={notice}>
      {summary && <p className="mb-5 font-bold text-brand-800">{summary.caseNumber}</p>}

      {(phase === "summary" || phase === "code") && <>
        {phase === "summary" && <p className="mb-5 flex items-start gap-2 leading-7 text-ink-600"><LockKeyhole className="mt-1 flex-none" size={17} aria-hidden/>{t.private}</p>}
        {/* The link offers one contact (the summary names no other), so no channel switch: the code goes where the backend
            chose, named before it is sent. */}
        <OneTimeCodeStep key={codeRound} copy={{ sendTo: t.sendTo, sentTo: t.sent, send: t.send, sending: t.sending, codeLabel: t.code, verify: t.verify, verifying: t.verifying, resend: t.resend }}
                         destination={summary?.destinationHint} sent={phase === "code"} busy={busy} error={error || null}
                         onSend={() => void request()} onVerify={code => void verify(code)}/>
      </>}

      {phase === "view" && status && <>
        {/* Where the case is, in the patient's own language, before anything is asked of them. */}
        <section aria-labelledby="status-now" className="rounded-xl border border-brand-200 bg-brand-50 p-4">
          <p className="text-[0.7rem] font-bold uppercase tracking-[0.1em] text-brand-700">{t.now}</p>
          <h2 id="status-now" className="mt-1 text-[1.05rem] font-bold leading-6 text-brand-900">{explain.title}</h2>
          <p className="mt-1.5 leading-6 text-ink-700">{explain.body}</p>
          {usually && <p className="mt-2 text-[0.9rem] text-ink-700">{usually}</p>}
          {depositStep && <a className="btn-primary mt-4 w-full sm:w-auto" href={`${localeHref(locale, "portal")}?signin=1`}>{journeyCopy.payInMyCare}</a>}
          {teamStep && <p className="mt-2 text-[0.9rem] font-semibold text-brand-800">{t.noAction}</p>}
          {explain.next && (
            <p className="mt-3 border-t border-brand-200 pt-3 text-[0.88rem] leading-6 text-ink-600">
              <span className="font-bold text-ink-800">{t.next}:</span> {explain.next}
            </p>
          )}
          {meanwhile && (
            <p className="mt-2 text-[0.88rem] leading-6 text-ink-600">
              <span className="font-bold text-ink-800">{t.meanwhile}:</span> {meanwhile}
            </p>
          )}
        </section>

        <CaseJourney id="status-journey" title={t.journey} steps={phaseLabels(journeyCopy)} current={phasePosition(status.phase)}
                     completedLabel={journeyCopy.done} currentLabel={journeyCopy.current}
                     yoursLabel={status.actionRequired || depositStep ? journeyCopy.yours : null} className="mt-6 border-t border-line pt-5"/>

        <p className="mt-5 text-[0.82rem] text-ink-500">
          {t.status}: <span className="font-semibold text-ink-700">{locale === "ar" ? status.statusAr : status.statusEn}</span>
        </p>

        {/* The proposal, exactly as the backend says the patient may see it: one action when a version is
            decidable, plain status otherwise — never a link that leads nowhere. "Being prepared" is told once,
            in the box above, so no section is rendered for it. */}
        {status.proposal && !["NONE", "PREPARING"].includes(status.proposal.state) && (
          <section aria-labelledby="status-proposal" className="mt-5 rounded-xl border border-line p-4">
            <p id="status-proposal" className="text-[0.7rem] font-bold uppercase tracking-[0.1em] text-ink-500">{t.proposalTitle}</p>
            {status.proposal.state !== "READY" && <p className="mt-1 leading-6 text-ink-700">{proposalCopy(status.proposal.state, t)}</p>}
            {/* No technical version number for the patient: only whether this is an updated document, and its validity. */}
            {status.proposal.state !== "REVISION_REQUESTED" && ((status.proposal.versionNumber ?? 0) > 1 || (status.proposal.validUntil && status.proposal.state === "READY")) && (
              <p className="mt-1 text-[0.82rem] text-ink-500">
                {[(status.proposal.versionNumber ?? 0) > 1 ? t.updatedVersion : "", status.proposal.validUntil && status.proposal.state === "READY" ? `${t.proposalValid} ${new Date(status.proposal.validUntil).toLocaleDateString(intlLocale(locale), { day: "numeric", month: "short", year: "numeric" })}` : ""].filter(Boolean).join(" · ")}
              </p>
            )}
            {status.proposal.action === "REVIEW_PROPOSAL" && (
              <button type="button" className="btn-primary mt-4 w-full sm:w-auto" disabled={opening} onClick={() => void openProposal()}>
                {opening ? t.proposalOpening : t.proposalReview}
              </button>
            )}
          </section>
        )}

        {status.actionRequired && (
          <form className="mt-8" onSubmit={submit} noValidate>
            <h3 className="title">{t.action}</h3>
            {/* Only the coordinator's own words go here. The generic fallback repeated, almost verbatim,
                the explanation already shown above this form. */}
            {action?.message && <p className="mt-2 leading-7 text-ink-600">{action.message}</p>}
            {action?.dueAt && <p className="mt-1 text-sm font-semibold text-ink-700">{t.due} {new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "medium" }).format(new Date(action.dueAt))}</p>}

            <div className="mt-6 space-y-5">
              {(action?.items ?? []).map(item => (
                <div key={item.id}>
                  <label className="block text-sm font-bold text-ink-800" htmlFor={`item-${item.id}`}>
                    {item.label}
                    {item.required
                      ? <span className="ms-1 font-normal text-alert-600" aria-hidden>*</span>
                      : <span className="ms-2 text-xs font-normal text-ink-500">({t.optional})</span>}
                    {item.required && <span className="sr-only"> ({t.required})</span>}
                  </label>
                  {item.completed && <p className="mt-1 text-xs font-semibold text-brand-700">{t.already}</p>}
                  {item.kind === "DOCUMENT" ? (
                    <div className="mt-2">
                      <label className={`flex cursor-pointer items-center gap-3 rounded-xl border border-dashed p-4 ${errors[item.id] ? "border-alert-400 bg-alert-50" : "border-line-strong"}`}>
                        <FileUp aria-hidden className="text-brand-600"/>
                        <span className="text-sm">{files[item.id] ? `${files[item.id].name}` : t.choose}</span>
                        <input id={`item-${item.id}`} className="sr-only" type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                               onChange={e => { const file = e.target.files?.[0]; if (file) setFiles(current => ({ ...current, [item.id]: file })); }}/>
                      </label>
                      {files[item.id] && (
                        <button type="button" className="link-cta mt-2 text-sm"
                                onClick={() => setFiles(current => { const next = { ...current }; delete next[item.id]; return next; })}>
                          <X size={14} className="me-1 inline" aria-hidden/>{t.remove}
                        </button>
                      )}
                    </div>
                  ) : (
                    <textarea id={`item-${item.id}`} className={`field mt-2 min-h-20 ${errors[item.id] ? "field-error" : ""}`} maxLength={4000}
                              value={values[item.id] ?? ""} onChange={e => setValues(current => ({ ...current, [item.id]: e.target.value }))}/>
                  )}
                  {errors[item.id] && <p className="error-text mt-1">{errors[item.id]}</p>}
                </div>
              ))}

              <label className="block text-sm font-bold text-ink-800">
                {action?.items?.length ? t.note : t.noItems}
                <textarea className="field mt-2 min-h-24" maxLength={10000} value={note} onChange={e => setNote(e.target.value)}/>
              </label>
            </div>

            <p className="mt-6 flex items-start gap-2 rounded-xl bg-mist p-4 text-sm leading-6 text-ink-600">
              <ShieldCheck className="mt-0.5 flex-none text-brand-600" size={17} aria-hidden/>{t.private}
            </p>
            <button className="btn-primary mt-6 w-full sm:w-auto" disabled={busy}>{busy ? t.sending : t.submit}</button>
          </form>
        )}
      </>}

      {error && phase !== "summary" && phase !== "code" && <p role="alert" className="mt-5 rounded-xl bg-alert-50 p-4 text-alert-800">{error}</p>}
    </Frame>
  );
}

function proposalCopy(state: string, t: StatusCopy) {
  switch (state) {
    case "READY": return t.proposalReady;
    case "ACCEPTED": return t.proposalAccepted;
    case "DECLINED": return t.proposalDeclined;
    case "REVISION_REQUESTED": return t.proposalRevision;
    case "EXPIRED": return t.proposalExpired;
    default: return t.proposalPreparing;
  }
}

function Frame({ title, notice, children }: { title: string; notice?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="section section-soft">
      <div className="container-site" style={{ maxWidth: "42rem" }}>
        <h1 className="headline">{title}</h1>
        <div className="card mt-6 p-6 sm:p-8">{notice}{children}</div>
      </div>
    </section>
  );
}

async function apiError(response: Response, fallback: string) {
  const body = await response.json().catch(() => ({}));
  return typeof body.message === "string" ? body.message : fallback;
}
