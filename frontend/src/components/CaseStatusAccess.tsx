"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, CircleCheck, FileUp, LockKeyhole, ShieldCheck, X } from "lucide-react";

import { phaseExplanation, phaseLabels, phaseMeanwhile, phasePosition, type JourneyCopy } from "@/lib/patient-journey";
import { CaseJourney } from "@/components/CaseJourney";
import { OneTimeCodeStep } from "@/components/OneTimeCodeStep";
import { CaseStamp } from "@/components/brand/CaseStamp";
import { DossierPage } from "@/components/brand/DossierPage";
import type { Dictionary } from "@/lib/dictionary";
import { plural } from "@/lib/portal-labels";

import { intlLocale, type Locale } from "@/lib/i18n";
import { apiUrl } from "@/lib/api";
import { localeHref } from "@/lib/links";
import { EmergencyGuidance } from "@/components/EmergencyGuidance";

/** `channel`: where the backend sends the code (WHATSAPP or EMAIL); this link offers no other. */
type Summary = { caseNumber: string; destinationHint: string; channel?: string | null };
type ActionItem = { id: string; kind: "INFORMATION" | "DOCUMENT"; code: string; label: string; required: boolean; completed: boolean; response: string | null };
type Action = { taskId: string; title: string; message: string | null; blocking: boolean; dueAt: string | null; items: ActionItem[] };
/** `documentType` and `releasedAt` come with the backend's `PatientProposalState`: the estimate's stamp date, and which noun the page uses. */
type ProposalState = { state: string; action: "REVIEW_PROPOSAL" | "VIEW_PROPOSAL" | null; versionNumber: number | null; validUntil: string | null; decidedAt: string | null;
  documentType?: string | null; releasedAt?: string | null };
/** `expectedWorkingDays`: P1-6 (D-02), how long the team usually takes over this phase; null while the patient owes the step. */
type Status = { caseNumber: string; statusEn: string; statusAr: string; phase?: string | null; actionRequired: boolean; action: Action | null; proposal?: ProposalState | null; expectedWorkingDays?: number | null;
  /** D-1: when the stamped moments happened; a stamp is printed only from one of these. */
  milestones?: { receivedAt?: string | null; consultantReviewAt?: string | null; estimateReadyAt?: string | null } | null };
type ProposalHandoff = { token: string; grant: string; expiresAt: string };
/** Hands the already-verified proposal grant to the proposal page in this browser session only — never through the URL. */
export const PROPOSAL_HANDOFF_KEY = (token: string) => `rs-proposal-grant:${token}`;
type Presign = { documentId: string; uploadUrl: string; requiredHeaders: Record<string, string> };
/** A failed call: the HTTP status and the backend's stable `code`, never its English message (that is not patient copy). */
type Failure = Error & { status?: number; code?: string; fields?: { field: string; message: string }[] };

/** What the upload endpoint accepts (backend `app.storage`), checked when a file is chosen; the backend still decides. */
const FILE_TYPES = ["application/pdf", "image/jpeg", "image/png"];
const MAX_FILE_BYTES = 15 * 1024 * 1024;
const NOTE_ID = "status-note";

/** The page's words, from messages/{en,ar}.json (`secureLink.status`, the shared working-days plural, the stamp words and the case-number label), passed by the server page. */
export type StatusCopy = Dictionary["secureLink"]["status"] & {
  workingDays: Dictionary["portalWork"]["plural"]["workingDays"];
  stamp: Dictionary["portalWork"]["myCare"]["stamp"];
  caseNumber: string;
};

type Page = "loading" | "sealed" | "view" | "done" | "invalid";

/**
 * The patient's secure, no-login status page: one page of the case file, sealed until the patient proves the contact.
 *
 * <p>Possession of the link is never enough: a one-time code sent to the patient's own registered contact is exchanged
 * for a short-lived grant first. Before that the page shows the case number, where the code will go and one action;
 * after it, the current page of the file — where the case is (stamped on the three real moments, dated by the backend),
 * whether anything is needed, the journey, and only what this case's coordinator actually asked for.
 */
export function CaseStatusAccess({ locale, token, emergency, copy: t, journeyCopy }: { locale: Locale; token: string;
  copy: StatusCopy;
  /** A-02: the bilingual emergency instruction (common.emergencyNotice), passed by the page so the client bundle carries no dictionary. */
  emergency?: { title: string; body: string; more?: string };
  /** The journey's words (secureLink.journey), passed by the page for the same reason. */
  journeyCopy: JourneyCopy }) {
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
  /** A failure of the code step (shown under its field) or of the form (under Send). */
  const [error, setError] = useState("");
  const [opening, setOpening] = useState(false);
  /** A failure of the "Review estimate" handoff, said under its button. */
  const [openError, setOpenError] = useState("");
  // Each successful send starts a fresh code step (the typed code is kept when a resend fails).
  const [codeRound, setCodeRound] = useState(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const shownPage = useRef<Page>("loading");
  /** The field to focus once the errors just set are on screen (so it is announced with its error). */
  const focusAfterErrors = useRef<string | null>(null);

  // Focus moves to the new page's heading on every step the patient takes (not on arrival, where the page starts as
  // usual; sending the code stays on the sealed page, where the code field takes focus itself).
  const page: Page = phase === "summary" || phase === "code" ? "sealed" : phase;
  useEffect(() => {
    const from = shownPage.current;
    shownPage.current = page;
    if (from !== "loading" && from !== page) headingRef.current?.focus();
  }, [page]);
  useEffect(() => {
    const id = focusAfterErrors.current;
    focusAfterErrors.current = null;
    if (id) document.getElementById(id)?.focus();
  }, [errors]);

  /**
   * "Review estimate": the backend re-checks that a decidable version exists for THIS case and hands back a
   * share token plus a view grant minted from the code just verified. The grant travels via sessionStorage,
   * so the proposal page opens without a second code and no credential ever appears in a URL.
   */
  async function openProposal() {
    setOpening(true); setOpenError("");
    try {
      const handoff = await post<ProposalHandoff>(`/proposal-access`, { grant });
      try { sessionStorage.setItem(PROPOSAL_HANDOFF_KEY(handoff.token), JSON.stringify({ grant: handoff.grant, expiresAt: handoff.expiresAt })); } catch {}
      router.push(`/${locale}/proposal/${handoff.token}`);
    } catch (e) {
      const failure = e as Failure;
      if (failure.code === "CASE_LINK_INVALID") { setPhase("invalid"); return; }
      setOpenError(failure.code === "PROPOSAL_NOT_AVAILABLE" ? t.proposalUnavailable : failure.status === 401 ? t.sessionEnded : t.error);
      setOpening(false);
    }
  }

  useEffect(() => {
    fetch(apiUrl(`/public/cases/${token}`))
      .then(async response => { if (!response.ok) throw new Error(); setSummary(await response.json() as Summary); setPhase("summary"); })
      .catch(() => setPhase("invalid"));
  }, [token]);

  /** The code step's failures, in the patient's words; an expired or revoked link ends on the invalid page. */
  function codeFailure(e: unknown) {
    const failure = e as Failure;
    if (failure.code === "CASE_LINK_INVALID") { setPhase("invalid"); return; }
    setError(failure.code === "TOO_MANY_REQUESTS" ? t.tooManyCodes : failure.code === "VERIFICATION_INVALID" ? t.codeInvalid : t.error);
  }

  async function request() {
    setBusy(true); setError("");
    try {
      setSummary(await post<Summary>(`/request-access`));
      setPhase("code"); setCodeRound(round => round + 1);
    } catch (e) { codeFailure(e); } finally { setBusy(false); }
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
    } catch (e) { codeFailure(e); } finally { setBusy(false); }
  }

  /** POSTs to this link's endpoint; a call without a body sends none (request-access takes no channel on this link). */
  async function post<T>(path: string, body?: unknown, headers?: Record<string, string>): Promise<T> {
    const response = await fetch(apiUrl(`/public/cases/${token}${path}`), body === undefined ? { method: "POST" } : {
      method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body),
    });
    if (!response.ok) {
      const problem = await response.json().catch(() => null);
      const failure = new Error(t.error) as Failure;
      failure.status = response.status;
      failure.code = typeof problem?.code === "string" ? problem.code : undefined;
      failure.fields = Array.isArray(problem?.errors) ? problem.errors : undefined;
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

  /** Shows the errors beside their fields and moves focus to the first one, in the order the fields appear. */
  function showErrors(found: Record<string, string>, items: ActionItem[]) {
    const first = items.find(item => found[item.id]);
    focusAfterErrors.current = first ? `item-${first.id}` : NOTE_ID;
    setErrors(found);
  }

  /** A rejected file replaces the one chosen before (it is never sent silently); the error says why. */
  function chooseFile(item: ActionItem, file: File | undefined) {
    if (!file) return;
    const problem = !FILE_TYPES.includes(file.type) ? t.fileType : file.size <= 0 || file.size > MAX_FILE_BYTES ? t.fileSize : null;
    setErrors(current => { const next = { ...current }; if (problem) next[item.id] = problem; else delete next[item.id]; return next; });
    setFiles(current => { const next = { ...current }; if (problem) delete next[item.id]; else next[item.id] = file; return next; });
  }

  function removeFile(item: ActionItem) {
    setFiles(current => { const next = { ...current }; delete next[item.id]; return next; });
    document.getElementById(`item-${item.id}`)?.focus();
  }

  /** One file's upload: presign, PUT, confirm. A failure is said beside that file's field. */
  async function upload(item: ActionItem, file: File): Promise<string> {
    let presign: Presign;
    try {
      presign = await post<Presign>(`/documents/presign`, { originalFileName: file.name, contentType: file.type, sizeBytes: file.size }, { "X-Case-Grant": grant });
    } catch (e) {
      const failure = e as Failure;
      throw Object.assign(failure, { itemId: failure.code === "UNSUPPORTED_FILE_TYPE" || failure.code === "INVALID_FILE_SIZE" ? item.id : undefined,
        itemMessage: failure.code === "UNSUPPORTED_FILE_TYPE" ? t.fileType : t.fileSize });
    }
    const put = await fetch(presign.uploadUrl, { method: "PUT", headers: presign.requiredHeaders, body: file }).catch(() => null);
    if (!put?.ok) throw Object.assign(new Error(t.uploadFailed) as Failure, { itemId: item.id, itemMessage: t.uploadFailed });
    try {
      await post(`/documents/confirm`, { documentId: presign.documentId }, { "X-Case-Grant": grant });
    } catch (e) {
      const failure = e as Failure;
      throw Object.assign(failure, { itemId: failure.status === 422 ? item.id : undefined, itemMessage: t.fileRejected });
    }
    return presign.documentId;
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const items = status?.action?.items ?? [];
    const local = check(items);
    if (!items.length && !note.trim()) local.note = t.noteMissing;
    if (Object.keys(local).length) { setError(""); showErrors(local, items); return; }
    setBusy(true); setError(""); setErrors({});
    try {
      const answers: { itemId: string; value: string | null; documentId: string | null }[] = [];
      for (const item of items) {
        const file = files[item.id];
        if (file) {
          const documentId = await upload(item, file);
          answers.push({ itemId: item.id, value: values[item.id]?.trim() || null, documentId });
        } else if (values[item.id]?.trim()) {
          answers.push({ itemId: item.id, value: values[item.id].trim(), documentId: null });
        }
      }
      await post(`/respond`, { grant, message: note.trim() || null, language: locale, items: answers });
      setPhase("done");
    } catch (e) {
      const failure = e as Failure & { itemId?: string; itemMessage?: string };
      // The backend's field errors name the item; the words are this page's, by the item's kind.
      const fieldErrors = Object.fromEntries((failure.fields ?? []).flatMap(f => {
        const item = items.find(i => `item:${i.id}` === f.field);
        return item ? [[item.id, item.kind === "DOCUMENT" ? t.missingFile : t.missing]] : [];
      }));
      if (failure.itemId && failure.itemMessage) fieldErrors[failure.itemId] = failure.itemMessage;
      if (failure.code === "RESPONSE_EMPTY") fieldErrors.note = t.noteMissing;
      if (failure.code === "CASE_LINK_INVALID") setPhase("invalid");
      else if (Object.keys(fieldErrors).length) showErrors(fieldErrors, items);
      else setError(failure.status === 401 ? t.sessionEnded : t.error);
    } finally { setBusy(false); }
  }

  const notice = emergency
    ? <EmergencyGuidance variant="quiet" title={emergency.title} body={emergency.body} more={emergency.more} className="mb-5"/>
    : null;
  const caseNumber = status?.caseNumber ?? summary?.caseNumber ?? null;
  const heading = (text: string, id?: string) => <h1 id={id} ref={headingRef} tabIndex={-1} className="statement mt-5 text-brand-900 outline-none">{text}</h1>;

  if (phase === "loading") return (
    <Desk notice={notice}>
      <DossierPage className={PAGE_PAD}>
        <p role="status" className="text-ink-600">{t.loading}</p>
      </DossierPage>
    </Desk>
  );

  if (phase === "invalid") return (
    <Desk notice={notice}>
      <DossierPage className={PAGE_PAD}>
        <LockKeyhole aria-hidden size={28} className="text-ink-400"/>
        {heading(t.invalid)}
        <p className="mt-3 max-w-[65ch] text-ink-600">{t.invalidHelp}</p>
        <a className="link-cta mt-4" href={localeHref(locale, "track-case")}>{t.invalidAction}</a>
      </DossierPage>
    </Desk>
  );

  if (phase === "done") return (
    <Desk notice={notice}>
      <DossierPage className={PAGE_PAD} kicker={t.caseNumber} reference={caseNumber}>
        <CircleCheck aria-hidden size={28} className="mt-6 text-brand-600"/>
        {heading(t.doneTitle)}
        <p className="mt-3 max-w-[65ch] text-ink-600">{t.doneBody}</p>
      </DossierPage>
    </Desk>
  );

  const channel = summary?.channel;
  if (phase === "summary" || phase === "code") return (
    <Desk notice={notice}>
      {/* The sealed page: the case it belongs to, where the code will go, and one action. The link offers one contact
          (the summary names no other), so there is no channel switch. */}
      <DossierPage className={PAGE_PAD} kicker={caseNumber ? t.caseNumber : null} reference={caseNumber} aria-labelledby="status-heading">
        {heading(t.title, "status-heading")}
        <p className="mt-3 flex items-start gap-2 text-ink-600"><LockKeyhole className="mt-1.5 flex-none text-ink-400" size={17} aria-hidden/>{t.private}</p>
        <div className="mt-5 border-t border-line pt-5">
          <OneTimeCodeStep round={codeRound} notice={phase === "code" && codeRound > 1 ? t.codeResent : null}
                           copy={{ sendTo: channel === "WHATSAPP" ? t.sendToWhatsApp : channel === "EMAIL" ? t.sendToEmail : t.sendTo,
                                   sentTo: channel === "WHATSAPP" ? t.sentWhatsApp : channel === "EMAIL" ? t.sentEmail : t.sent,
                                   send: t.send, sending: t.sending, codeLabel: t.code, verify: t.verify, verifying: t.verifying, resend: t.resend, incomplete: t.codeIncomplete }}
                           destination={summary?.destinationHint} sent={phase === "code"} busy={busy} error={error || null}
                           onSend={() => void request()} onVerify={code => void verify(code)}>
            <p className="mt-2 flex items-start gap-2 text-[0.9375rem] leading-6 text-ink-600">
              <ShieldCheck className="mt-0.5 flex-none text-brand-600" size={17} aria-hidden/>{t.neverAsk}
            </p>
          </OneTimeCodeStep>
        </div>
      </DossierPage>
    </Desk>
  );

  if (!status) return null;
  const action = status.action;
  const proposal = status.proposal ?? null;
  const proposalState = proposal?.state ?? "NONE";
  const quote = proposal?.documentType === "FINAL_TREATMENT_QUOTE";
  const reviewable = proposalState === "READY" && proposal?.action === "REVIEW_PROPOSAL";
  // The page's story: the coordinator's request first; otherwise what the backend says about the estimate (so the page
  // never says "being prepared, or ready" when it knows which); otherwise the phase.
  const story = status.actionRequired ? null : proposalStory(proposalState, quote, t);
  const explain = story ?? phaseExplanation(status.phase, status.actionRequired, journeyCopy);
  const ready = !status.actionRequired && proposalState === "READY";
  const settled = !status.actionRequired && (proposalState === "DECLINED" || proposalState === "EXPIRED");
  // DEP-3: in the deposit phase the payment is the patient's own step (paid in My Care), and this link cannot tell whether it
  // was made: no "nothing needed", no team timing, and one way to My Care.
  const depositStep = !status.actionRequired && !story && status.phase === "deposit";
  // P1-6 (D-02): while the team has the step, how long it usually takes and what the patient can do meanwhile.
  const teamStep = !status.actionRequired && !ready && !depositStep;
  const usually = teamStep && !settled && status.expectedWorkingDays ? t.usuallyWithin.replace("{duration}", plural(locale, status.expectedWorkingDays, t.workingDays)) : null;
  const meanwhile = teamStep && !settled ? phaseMeanwhile(status.phase, false, journeyCopy) : null;
  // The estimate in one line where it is not the page's own story: acknowledged (any phase), or decided while the
  // coordinator is asking for something.
  const proposalNote = proposalState === "ACCEPTED" || (status.actionRequired && ["REVISION_REQUESTED", "DECLINED", "EXPIRED"].includes(proposalState))
    ? proposalCopy(proposalState, t) : null;
  const stamp = stampFor(status, t.stamp);
  const reviewButton = (className: string) => (
    <button type="button" className={className} disabled={opening} aria-describedby={openError ? "proposal-error" : undefined} onClick={() => void openProposal()}>
      {opening ? t.proposalOpening : quote ? t.quoteReview : t.proposalReview}
    </button>
  );
  const proposalError = openError ? <p id="proposal-error" role="alert" className="mt-3 text-[0.9375rem] font-semibold leading-6 text-alert-800">{openError}</p> : null;
  const date = (iso: string) => new Intl.DateTimeFormat(intlLocale(locale), { day: "numeric", month: "short", year: "numeric" }).format(new Date(iso));

  return (
    <Desk notice={notice}>
      {/* The current page of the file: where the case is, stamped on the three real moments with the date the backend recorded. */}
      <DossierPage edge="tab" className={PAGE_PAD} kicker={t.caseNumber} reference={caseNumber} aria-labelledby="status-now"
                   stamp={stamp ? <CaseStamp label={stamp.label} date={stamp.date} locale={locale}/> : null}>
        {heading(explain.title, "status-now")}
        <p className="mt-3 max-w-[65ch] text-ink-600">{explain.body}</p>
        {usually && <p className="mt-2 text-[0.9375rem] text-ink-700">{usually}</p>}

        {/* The one action, when the backend says there is one: review a decidable version, or pay the deposit in My Care. */}
        {ready && proposal && <>
          {(proposal.validUntil || (proposal.versionNumber ?? 0) > 1) && (
            // No technical version number for the patient: only whether this is an updated document, and its validity.
            <p className="mt-3 text-[0.9375rem] text-ink-600">
              {[(proposal.versionNumber ?? 0) > 1 ? t.updatedVersion : "", proposal.validUntil ? `${t.proposalValid} ${date(proposal.validUntil)}` : ""].filter(Boolean).join(" · ")}
            </p>
          )}
          {reviewable && reviewButton("btn-primary mt-6 w-full sm:w-auto")}
          {proposalError}
        </>}
        {depositStep && <a className="btn-primary mt-6 w-full sm:w-auto" href={`${localeHref(locale, "portal")}?signin=1`}>{journeyCopy.payInMyCare}</a>}
        {teamStep && (
          <p className="mt-5 flex items-center gap-2.5 text-[0.9375rem] font-semibold text-brand-800">
            <span aria-hidden className="grid h-6 w-6 flex-none place-items-center rounded-full bg-brand-100 text-brand-700"><Check size={14} strokeWidth={3}/></span>
            {t.noAction}
          </p>
        )}

        {/* Everything below the page's opening sits under the stamp's corner, so it takes the page's full width back. */}
        <div className="dossier-page-full">
        {proposalNote && <p id="status-proposal" className="mt-5 border-t border-line pt-4 text-[0.9375rem] leading-7 text-ink-600">{proposalNote}</p>}
        {/* A decidable estimate while the coordinator is also asking for something: still reachable, but the form below
            keeps the page's one filled action. */}
        {status.actionRequired && reviewable && (
          <div id="status-proposal" className="mt-5 border-t border-line pt-4">
            <p className="text-[0.9375rem] font-semibold leading-7 text-ink-800">{quote ? t.quoteReadyTitle : t.proposalReadyTitle}</p>
            {reviewButton("btn-secondary mt-3 w-full sm:w-auto")}
            {proposalError}
          </div>
        )}
        {explain.next && (
          <div className="mt-5 border-t border-line pt-4 text-[0.9375rem] leading-7">
            <p className="font-semibold text-ink-800">{t.next}</p>
            <p className="text-ink-600">{explain.next}</p>
          </div>
        )}
        {meanwhile && (
          <div className="mt-4 text-[0.9375rem] leading-7">
            <p className="font-semibold text-ink-800">{t.meanwhile}</p>
            <p className="text-ink-600">{meanwhile}</p>
          </div>
        )}

        <CaseJourney id="status-journey" title={t.journey} steps={phaseLabels(journeyCopy)} current={phasePosition(status.phase)}
                     completedLabel={journeyCopy.done} currentLabel={journeyCopy.current}
                     yoursLabel={status.actionRequired || depositStep ? journeyCopy.yours : null} className="mt-8 border-t border-line pt-6"/>

        {status.actionRequired && (
          <form className="mt-8 border-t border-line pt-6" onSubmit={submit} noValidate aria-labelledby="status-response">
            <h2 id="status-response" className="title text-brand-900">{t.action}</h2>
            {/* Only the coordinator's own words go here; the page's story above already explains the request. */}
            {action?.message && <p className="mt-2 max-w-[65ch] text-ink-600" dir="auto">{action.message}</p>}
            {action?.dueAt && <p className="mt-1 text-[0.9375rem] font-semibold text-ink-700">{t.due} {date(action.dueAt)}</p>}

            <div className="mt-6 space-y-6">
              {(action?.items ?? []).map(item => {
                const id = `item-${item.id}`, invalid = !!errors[item.id], errorId = invalid ? `${id}-error` : undefined;
                return (
                  <div key={item.id}>
                    <label className="block text-[0.9375rem] font-bold text-ink-800" htmlFor={id}>
                      <bdi>{item.label}</bdi>
                      {item.required
                        ? <span className="ms-1 font-normal text-alert-700" aria-hidden>*</span>
                        : <span className="ms-2 text-[0.8125rem] font-normal text-ink-500">({t.optional})</span>}
                      {item.required && <span className="sr-only"> ({t.required})</span>}
                    </label>
                    {item.completed && <p className="mt-1 text-[0.8125rem] font-semibold text-brand-700">{t.already}</p>}
                    {item.kind === "DOCUMENT" ? (
                      <div className="mt-2">
                        <label className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-lg border border-dashed bg-surface-pearl px-4 py-3 transition-colors hover:border-brand-600 hover:bg-brand-50 has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand-600 ${invalid ? "border-alert-700" : "border-ink-350"}`}>
                          <FileUp aria-hidden size={20} className="flex-none text-brand-600"/>
                          <span className="min-w-0 break-words text-[0.9375rem] text-ink-800">{files[item.id] ? <bdi>{files[item.id].name}</bdi> : t.choose}</span>
                          <input id={id} className="sr-only" type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                                 aria-invalid={invalid || undefined} aria-describedby={errorId}
                                 onChange={e => { chooseFile(item, e.target.files?.[0]); e.target.value = ""; }}/>
                        </label>
                        {files[item.id] && (
                          <button type="button" className="link-cta mt-1 text-[0.9375rem]" onClick={() => removeFile(item)}>
                            <X size={16} aria-hidden/>{t.remove}
                          </button>
                        )}
                      </div>
                    ) : (
                      <textarea id={id} className={`field mt-2 min-h-20 ${invalid ? "field-error" : ""}`} maxLength={4000} dir="auto"
                                aria-invalid={invalid || undefined} aria-describedby={errorId}
                                value={values[item.id] ?? ""} onChange={e => setValues(current => ({ ...current, [item.id]: e.target.value }))}/>
                    )}
                    {/* A rejected file is announced as it is chosen (focus stays on the file field); other errors are read with the field they focus. */}
                    {invalid && <p id={errorId} role={item.kind === "DOCUMENT" ? "alert" : undefined} className="error-text mt-1.5 text-[0.875rem] font-semibold">{errors[item.id]}</p>}
                  </div>
                );
              })}

              <div>
                <label className="block text-[0.9375rem] font-bold text-ink-800" htmlFor={NOTE_ID}>
                  {action?.items?.length ? <>{t.note}<span className="ms-2 text-[0.8125rem] font-normal text-ink-500">({t.optional})</span></> : t.noItems}
                </label>
                <textarea id={NOTE_ID} className={`field mt-2 min-h-24 ${errors.note ? "field-error" : ""}`} maxLength={10000} dir="auto"
                          aria-invalid={errors.note ? true : undefined} aria-describedby={errors.note ? `${NOTE_ID}-error` : undefined}
                          value={note} onChange={e => setNote(e.target.value)}/>
                {errors.note && <p id={`${NOTE_ID}-error`} className="error-text mt-1.5 text-[0.875rem] font-semibold">{errors.note}</p>}
              </div>
            </div>

            <button className="btn-primary mt-7 w-full sm:w-auto" disabled={busy} aria-describedby={error ? "respond-error" : undefined}>{busy ? t.sending : t.submit}</button>
            {error && <p id="respond-error" role="alert" className="mt-3 text-[0.9375rem] font-semibold leading-6 text-alert-800">{error}</p>}
          </form>
        )}
        </div>
      </DossierPage>
    </Desk>
  );
}

/** The page's padding, read by `.dossier-page` through `--page-pad` (its rule is unlayered, so padding utilities would lose). */
const PAGE_PAD = "[--page-pad:1.25rem] sm:[--page-pad:2rem]";

/**
 * D-1: the stamp for the moment this page is about — case received (while it waits for, or is with, the coordinator),
 * specialist reviewing (the Consultant's phase), estimate ready (a preliminary estimate the patient can review) — printed
 * only with the date the backend recorded. A request for information, a final quote and every later phase carry none.
 */
function stampFor(status: Status, labels: StatusCopy["stamp"]): { label: string; date: string } | null {
  if (status.actionRequired) return null;
  const m = status.milestones, p = status.proposal;
  const moment = p?.state === "READY" ? (p.documentType === "FINAL_TREATMENT_QUOTE" ? null : { label: labels.estimateReady, date: m?.estimateReadyAt ?? p.releasedAt })
    : status.phase === "received" || status.phase === "coordinator" ? { label: labels.received, date: m?.receivedAt }
    : status.phase === "consultant" ? { label: labels.inReview, date: m?.consultantReviewAt }
    : null;
  return moment?.date ? { label: moment.label, date: moment.date } : null;
}

/** The page's story when the estimate itself is what this page is about (nothing is asked of the patient). */
function proposalStory(state: string, quote: boolean, t: StatusCopy): { title: string; body: string; next?: string } | null {
  switch (state) {
    case "READY": return quote ? { title: t.quoteReadyTitle, body: t.quoteReady, next: t.quoteReadyNext } : { title: t.proposalReadyTitle, body: t.proposalReady, next: t.proposalReadyNext };
    case "PREPARING": return { title: t.proposalPreparingTitle, body: t.proposalPreparing, next: t.proposalPreparingNext };
    case "REVISION_REQUESTED": return { title: t.revisionTitle, body: t.proposalRevision, next: t.proposalPreparingNext };
    case "DECLINED": return { title: t.declinedTitle, body: t.proposalDeclined };
    case "EXPIRED": return { title: t.expiredTitle, body: t.proposalExpired };
    default: return null;
  }
}

/** The estimate in one line, where it sits beside another story (acknowledged; decided during a request). */
function proposalCopy(state: string, t: StatusCopy) {
  switch (state) {
    case "ACCEPTED": return t.proposalAccepted;
    case "DECLINED": return t.proposalDeclined;
    case "REVISION_REQUESTED": return t.proposalRevision;
    case "EXPIRED": return t.proposalExpired;
    default: return null;
  }
}

/** The paper desk the page rests on: one column, the quiet emergency line first in reading order (D-4). */
function Desk({ notice, children }: { notice: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="section section-soft">
      <div className="container-site" style={{ maxWidth: "42rem" }}>
        {notice}
        {children}
      </div>
    </section>
  );
}
