"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { intlLocale, type Locale } from "@/lib/i18n";
import { ProposalDecisionDialog } from "@/components/ProposalDecisionDialog";
import { CoordinationDepositTerms } from "@/components/CoordinationDepositTerms";
import { apiUrl } from "@/lib/api";
import { ARABIC_TERMS_APPROVED, estimateTerms, exchangeRateStatement, finalQuoteTerms, generalDisclaimers, isForeignCurrency, LEGACY_PLACEHOLDER_TERMS } from "@/lib/commercial-terms";
import type { Dictionary } from "@/lib/dictionary";
import { OneTimeCodeStep } from "@/components/OneTimeCodeStep";
import { fillTemplate, plural } from "@/lib/portal-labels";
import { formatMoney } from "@/lib/money";
import { scrollIntoView } from "@/lib/scroll";

type Item = { id: string; category: string; description: string; quantity: number; unitPrice: number; optional: boolean };
type Summary = { caseNumber: string; channel: string; destinationHint: string; whatsappHint?: string | null; emailHint?: string | null };
type Proposal = {
  caseNumber: string; patientName: string; documentType?: string; versionNumber?: number; currency?: string;
  items: Item[]; totalMin?: number; totalExpected?: number; totalMax?: number;
  assumptions?: string; includedServices?: string; excludedServices?: string; scopeChangeReason?: string;
  paymentTerms?: string; refundTerms?: string; disclaimers?: string;
  validUntil?: string; decided: boolean; decisionState?: string;
  recommendedTreatment?: string; risksAndLimitations?: string; notes?: string;
  depositDueDisplay?: number; depositPaidDisplay?: number; consultantName?: string | null;
  /** Day of the exchange rate frozen on this version at release; absent on legacy versions. */
  fxRateDate?: string | null;
  /** When the patient asked their coordinator to go through the terms in Arabic (assisted path); absent until then. */
  assistance?: { requestedAt?: string | null } | null;
};
type Decision = "ACCEPTED" | "ACKNOWLEDGED" | "DECLINED" | "REVISION_REQUESTED";
/** Terminal states the patient cannot act out of; each gets its own honest explanation, never a raw error. */
type Blocked = "EXPIRED" | "SUPERSEDED" | "DECIDED" | null;


/**
 * The page's words, from messages/{en,ar}.json (`secureLink.proposal`, plus the assisted path and the services plural),
 * passed by the server page so this client bundle carries no dictionary.
 */
export type ProposalCopy = Dictionary["secureLink"]["proposal"] & {
  assisted: Dictionary["portalProposal"]["assisted"];
  services: Dictionary["portalWork"]["plural"]["services"];
};

/**
 * Legal wording stays beside lib/commercial-terms and out of the messages: English is read from there, the Arabic is
 * kept verbatim until the legal and native review (L1–L5) approves it.
 */
const TERMS = {
  en: {
    estimateBasis: `${estimateTerms.nonBinding} ${estimateTerms.mayChange}`,
    coordinationNote: estimateTerms.coordinationIncluded as string,
    finalConsentStatement: finalQuoteTerms.notMedicalConsent as string,
  },
  ar: {
    estimateBasis: "هذا تقدير مبدئي غير ملزم، وليس سعرًا نهائيًا ولا ضمانًا للسعر. قد تتغيّر خطة علاجك ويرتفع سعرها أو ينخفض بعد أن يفحصك طبيبك المعالج حضوريًا.",
    coordinationNote: "يشمل سعر الباقة تنسيق الحالة وترتيبات مقدّمي الخدمة والجدولة وخدمات دعم المريض من رحلة شفاء.",
    finalConsentStatement: "يشمل القبول باقة الرعاية المنسّقة وليس موافقة طبية خاصة بالإجراء؛ وسيأخذ طبيبي موافقة مستنيرة منفصلة قبل العلاج.",
  },
};

type Phase = "loading" | "invalid" | "intro" | "code" | "view" | "done";

/** A titled block of the consultant's or coordinator's own words; absent when there is nothing to say. */
function Prose({ label, text, id }: { label: string; text?: string; id?: string }) {
  if (!text) return null;
  return (
    <section aria-labelledby={id} className="mt-7">
      <h2 id={id} className="text-[0.72rem] font-bold uppercase tracking-[0.1em] text-brand-700">{label}</h2>
      <p dir="auto" className="mt-2 whitespace-pre-line text-[1rem] leading-7 text-ink-800">{text}</p>
    </section>
  );
}

/** Whether a validity date has passed; read when a response arrives (an event), never during render. */
function hasLapsed(validUntil?: string): boolean {
  return !!validUntil && new Date(validUntil).getTime() <= Date.now();
}

/** The grant Check Case Status stored for this token, removed on first read so it cannot be replayed from storage. */
function takeHandoffGrant(token: string): string | null {
  try {
    const key = `rs-proposal-grant:${token}`;
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    sessionStorage.removeItem(key);
    const parsed = JSON.parse(raw) as { grant?: string; expiresAt?: string };
    if (!parsed.grant || (parsed.expiresAt && new Date(parsed.expiresAt).getTime() <= Date.now())) return null;
    return parsed.grant;
  } catch { return null; }
}

export function ProposalSign({ locale, token, copy }: { locale: Locale; token: string; copy: ProposalCopy }) {
  const t = { ...copy, ...TERMS[locale] };
  const [phase, setPhase] = useState<Phase>("loading");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [grant, setGrant] = useState("");
  const [channel, setChannel] = useState<"WHATSAPP" | "EMAIL">("WHATSAPP");
  const [acknowledged, setAcknowledged] = useState(false);
  const [ackError, setAckError] = useState(false);
  const [outcome, setOutcome] = useState<Decision | null>(null);
  const [dialog, setDialog] = useState<"REVISION_REQUESTED" | "DECLINED" | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [blocked, setBlocked] = useState<Blocked>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const decisionRef = useRef<HTMLDivElement>(null);
  const [decisionVisible, setDecisionVisible] = useState(true);
  const [requestFailed, setRequestFailed] = useState(false);
  const requestedRef = useRef<HTMLParagraphElement>(null);
  // Until the terms have approved Arabic wording, an Arabic page asks the coordinator to go through them with the
  // patient in Arabic and record the decision (owner decision, GATE P2-1) instead of asking for an acknowledgement.
  const assisted = locale === "ar" && !ARABIC_TERMS_APPROVED;
  const assistedCopy = copy.assisted;

  /** Asks the coordinator for the Arabic conversation; the page then says it was asked, also after a reload. */
  async function requestAssistance() {
    setBusy(true); setRequestFailed(false);
    try {
      const r = await fetch(apiUrl(`/public/proposals/${token}/assistance`), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ grant }) });
      // An expired or replaced version is explained like any decision on it, never offered again.
      if (r.status === 410) { setBlocked("EXPIRED"); return; }
      if (r.status === 409) { setBlocked("SUPERSEDED"); return; }
      if (!r.ok) { setRequestFailed(true); scrollIntoView(decisionRef.current, { behavior: "smooth", block: "center" }); return; }
      const assistance = (await r.json()) as Proposal["assistance"];
      setProposal(current => current ? { ...current, assistance } : current);
      // The button (inline or in the sticky bar) is replaced by the confirmation: bring it into view and give it focus.
      requestAnimationFrame(() => { scrollIntoView(requestedRef.current, { behavior: "smooth", block: "center" }); requestedRef.current?.focus(); });
    } catch { setRequestFailed(true); } finally { setBusy(false); }
  }

  /** The verified grant travels to the English page, so switching language does not ask for a second code. */
  function keepGrantForEnglish() {
    try { sessionStorage.setItem(`rs-proposal-grant:${token}`, JSON.stringify({ grant })); } catch { /* private mode: the English page asks for a code */ }
  }

  /** Loads the full proposal with a grant already proven elsewhere; false when the grant is no longer good. */
  async function openWithGrant(g: string) {
    const r = await fetch(apiUrl(`/public/proposals/${token}/view`), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ grant: g }) });
    if (!r.ok) return false;
    const full = (await r.json()) as Proposal;
    setGrant(g); setProposal(full);
    if (full.decided) setBlocked("DECIDED");
    else if (hasLapsed(full.validUntil)) setBlocked("EXPIRED");
    setPhase("view");
    return true;
  }

  useEffect(() => {
    void fetch(apiUrl(`/public/proposals/${token}`))
      .then(async (r) => { if (!r.ok) throw new Error(); return r.json() as Promise<Summary>; })
      .then(async (s) => {
        setSummary(s); setChannel(s.channel === "EMAIL" ? "EMAIL" : "WHATSAPP");
        // Arriving from a verified Check Case Status session: the grant minted there opens the proposal at
        // once. It is single-use here and, if it has lapsed, the page simply falls back to its own code.
        const handed = takeHandoffGrant(token);
        if (handed && await openWithGrant(handed)) return;
        setPhase("intro");
      })
      .catch(() => setPhase("invalid"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);


  // The sticky bar exists to carry the decision while it is off screen — never alongside it.
  useEffect(() => {
    const node = decisionRef.current;
    if (phase !== "view" || !node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setDecisionVisible(entry.isIntersecting), { rootMargin: "-80px 0px 0px 0px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [phase, proposal]);

  async function requestAccess(ch: "WHATSAPP" | "EMAIL" = channel) {
    setBusy(true); setError("");
    try {
      const r = await fetch(apiUrl(`/public/proposals/${token}/request-access`), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channel: ch }) });
      if (r.status === 429) throw new Error(t.tooMany);
      if (!r.ok) throw new Error(t.error);
      setSummary((await r.json()) as Summary);
      setPhase("code");
    } catch (e) { setError(e instanceof Error && e.message ? e.message : t.error); } finally { setBusy(false); }
  }

  async function verify(code: string) {
    if (code.trim().length !== 6) return;
    setBusy(true); setError("");
    try {
      const g = await fetch(apiUrl(`/public/proposals/${token}/verify`), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: code.trim() }) })
        .then(async (r) => { if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { message?: string }).message ?? t.error); return r.json() as Promise<{ grant: string }>; });
      setGrant(g.grant);
      const full = await fetch(apiUrl(`/public/proposals/${token}/view`), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ grant: g.grant }) })
        .then(async (r) => { if (!r.ok) throw new Error(t.error); return r.json() as Promise<Proposal>; });
      setProposal(full);
      if (full.decided) setBlocked("DECIDED");
      else if (hasLapsed(full.validUntil)) setBlocked("EXPIRED");
      setPhase("view");
    } catch (e) { setError(e instanceof Error ? e.message : t.error); } finally { setBusy(false); }
  }

  /** One operation for every decision, whichever control invoked it. Backend status decides the outcome. */
  async function decide(decision: Decision, comment?: string, acknowledgementAccepted?: boolean) {
    setBusy(true); setError("");
    try {
      const r = await fetch(apiUrl(`/public/proposals/${token}/decision`), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grant, decision, comment: comment || undefined, acknowledgementAccepted }),
      });
      if (!r.ok) {
        // A stale document must not look like a transient failure: say what happened and stop offering actions.
        if (r.status === 410) { setBlocked("EXPIRED"); return; }
        if (r.status === 409) { setBlocked("SUPERSEDED"); return; }
        throw new Error(((await r.json().catch(() => ({}))) as { message?: string }).message ?? t.error);
      }
      setOutcome(decision); setPhase("done");
    } catch (e) { setError(e instanceof Error ? e.message : t.error); } finally { setBusy(false); }
  }

  function submitPrimary() {
    if (!acknowledged) { setAckError(true); scrollIntoView(decisionRef.current, { behavior: "smooth", block: "center" }); return; }
    setAckError(false);
    void decide(isFinal ? "ACCEPTED" : "ACKNOWLEDGED", undefined, true);
  }

  const isFinal = proposal?.documentType === "FINAL_TREATMENT_QUOTE";
  const currency = proposal?.currency ?? "EGP";
  // Amounts are computed and rounded by the backend; this only formats them.
  const money = (n?: number) => {
    if (n == null) return "—";
    return formatMoney(n, currency, locale);
  };
  const items = useMemo(() => proposal?.items.filter((i) => !i.optional) ?? [], [proposal]);
  const itemsTotal = items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
  const expected = proposal?.totalExpected ?? itemsTotal;
  const hasRange = proposal?.totalMin != null && proposal?.totalMax != null && proposal.totalMin !== proposal.totalMax;
  // Each figure isolated on its own, so the separator word keeps the page's reading order in Arabic.
  const rangeText = hasRange ? <><bdi dir="ltr">{money(proposal?.totalMin)}</bdi> {t.rangeSep} <bdi dir="ltr">{money(proposal?.totalMax)}</bdi></> : null;
  // Approved commercial wording exists in English only; Arabic keeps its current strings until the native review.
  const en = locale === "en";
  const docKind = isFinal ? "quote" : "estimate";
  const showRate = isForeignCurrency(currency);
  const rateDate = proposal?.fxRateDate
    ? new Intl.DateTimeFormat("en", { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${proposal.fxRateDate}T00:00:00Z`))
    : null;
  const depositDue = !isFinal && proposal?.depositDueDisplay != null && proposal.depositDueDisplay > 0;
  // Placeholder text older versions stored stays in their record but is never presented as terms.
  const storedExclusions = proposal?.excludedServices?.trim() && !LEGACY_PLACEHOLDER_TERMS.includes(proposal.excludedServices.trim())
    ? proposal.excludedServices.trim() : "";
  const basisPoints = [...estimateTerms.basis.filter((_, i) => i !== 2 || !!proposal?.assumptions?.trim()), ...(showRate ? [estimateTerms.basisRate] : [])];
  // Only group when the data genuinely carries more than one category — never invent clinical sections.
  const groups = useMemo(() => {
    const distinct = new Set(items.map((i) => i.category).filter(Boolean));
    if (distinct.size < 2) return [{ category: null as string | null, rows: items }];
    return [...distinct].map((category) => ({ category, rows: items.filter((i) => i.category === category) }));
  }, [items]);

  const primaryLabel = isFinal ? t.acceptFinal : t.acknowledge;
  const ackShort = isFinal ? t.ackShortFinal : t.ackShort;
  const ackLong = isFinal ? t.finalConsentStatement : t.ackStatement;
  // On the assisted path the patient does not acknowledge on the page: the first step is the conversation.
  const nextSteps = (isFinal ? t.nextFinal : t.nextPrelim)
    .map((step, index) => assisted && index === 0 ? (isFinal ? assistedCopy.nextFirstQuote : assistedCopy.nextFirst) : step)
    .filter((_, index) => !(!isFinal && index === 2 && !(proposal?.depositDueDisplay && proposal.depositDueDisplay > 0)));
  const doneCopy = outcome === "DECLINED" ? { title: t.declinedTitle, msg: t.declinedMsg }
    : outcome === "REVISION_REQUESTED" ? { title: t.revisionTitle, msg: t.revisionMsg }
    : isFinal ? { title: t.acceptedTitle, msg: t.acceptedMsg }
    : { title: t.ackDoneTitle, msg: depositDue && t.ackDoneDeposit ? `${t.ackDoneMsg} ${t.ackDoneDeposit}` : t.ackDoneMsg };
  const blockedMessage = blocked === "EXPIRED" ? (isFinal ? t.blockedExpiredFinal : t.blockedExpired)
    : blocked === "SUPERSEDED" ? t.blockedSuperseded : t.blockedDecided;

  return (
    <section className="section bg-mist">
      <div className="container-site max-w-[1120px]">
        {phase === "loading" && <p className="card p-6" aria-live="polite">{t.loading}</p>}
        {phase === "invalid" && <p role="alert" className="card bg-alert-50 p-6 text-alert-800">{t.invalid}</p>}

        {(phase === "intro" || phase === "code") && summary && (
          <div className="card mx-auto max-w-xl p-6 sm:p-8">
            <p className="eyebrow">RehletShifaa · {summary.caseNumber}</p>
            <h1 className="headline mt-2">{t.verifyTitle}</h1>
            <div className="mt-3">
              <OneTimeCodeStep
                copy={{ sendTo: channel === "WHATSAPP" ? t.verifyIntroWhatsapp : t.verifyIntroEmail, sentTo: t.codeSent, send: t.sendCode, sending: t.sending,
                        codeLabel: t.codeLabel, verify: t.verify, verifying: t.verifying, resend: t.resend }}
                destination={(channel === "WHATSAPP" ? summary.whatsappHint : summary.emailHint) ?? summary.destinationHint}
                sent={phase === "code"} busy={busy} onSend={() => void requestAccess()} onVerify={code => void verify(code)}
                channelSwitch={(channel === "WHATSAPP" ? summary.emailHint : summary.whatsappHint) ? {
                  label: channel === "WHATSAPP" ? t.emailInstead : t.whatsappInstead,
                  // Before a code is sent the switch only changes where it will go; after, it sends one there.
                  onSwitch: () => { const other = channel === "WHATSAPP" ? "EMAIL" : "WHATSAPP"; setChannel(other); if (phase === "code") void requestAccess(other); },
                } : null}
                error={error ? <p role="alert" className="rounded-xl bg-alert-50 p-3 text-alert-800">{error}</p> : null}/>
            </div>
          </div>
        )}

        {phase === "view" && proposal && (
          <>
            {/* Identity of the document first: what it is, who it is for, and how long it stands. */}
            <header className="rounded-2xl bg-white p-5 shadow-[0_1px_2px_rgba(28,51,58,0.05)] sm:p-7">
              <span className={`inline-block rounded-full px-3 py-1 text-[0.72rem] font-bold ${isFinal ? "bg-brand-600 text-white" : "bg-status-warning-surface text-status-warning-fg ring-1 ring-status-warning-border"}`}>
                {isFinal ? t.finalBadge : t.prelimBadge}
              </span>
              <h1 className="mt-3 text-[1.6rem] font-bold leading-8 text-brand-900 sm:text-[1.9rem]">{isFinal ? t.finalTitle : t.prelimTitle}</h1>
              <dl className="mt-5 grid gap-x-8 gap-y-3 border-t border-line pt-4 text-[0.9rem] sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <dt className="text-[0.72rem] font-semibold uppercase tracking-[0.06em] text-ink-500">{t.greeting}</dt>
                  <dd dir="auto" className="mt-0.5 font-bold text-ink-900">{proposal.patientName}</dd>
                </div>
                <div>
                  <dt className="text-[0.72rem] font-semibold uppercase tracking-[0.06em] text-ink-500">{t.caseRef}</dt>
                  <dd className="mt-0.5 font-bold text-ink-900" dir="ltr">{proposal.caseNumber}</dd>
                </div>
                {/* The technical version number stays internal; a patient only needs to know this document was updated. */}
                {proposal.versionNumber != null && proposal.versionNumber > 1 && (
                  <div>
                    <dt className="text-[0.72rem] font-semibold uppercase tracking-[0.06em] text-ink-500">{t.versionLabel}</dt>
                    <dd className="mt-0.5 font-bold text-ink-900">{t.updatedVersion}</dd>
                  </div>
                )}
                {proposal.validUntil && (
                  <div>
                    <dt className="text-[0.72rem] font-semibold uppercase tracking-[0.06em] text-ink-500">{t.validUntil}</dt>
                    <dd className="mt-0.5 font-bold text-ink-900">{new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "long" }).format(new Date(proposal.validUntil))}</dd>
                  </div>
                )}
              </dl>
            </header>

            {blocked && (
              <p role="status" className="mt-4 rounded-lg border border-status-warning-border bg-status-warning-surface p-4 text-[0.92rem] leading-6 text-status-warning-fg">
                {blockedMessage} <span className="text-ink-700">{t.contactCoordinator}</span>
              </p>
            )}

            <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
              <div className="min-w-0 rounded-2xl bg-white p-5 shadow-[0_1px_2px_rgba(28,51,58,0.05)] sm:p-7">
                <Prose id="recommendation-heading" label={isFinal ? t.assessmentLabel : t.treatmentLabel} text={proposal.recommendedTreatment} />
                {proposal.consultantName && (
                  <p className="mt-2 text-[0.88rem] font-semibold text-brand-800">{t.reviewedBy} <span dir="auto">{proposal.consultantName}</span></p>
                )}
                {isFinal && <Prose id="scope-heading" label={t.scopeLabel} text={proposal.scopeChangeReason} />}
                {!isFinal && <Prose id="assumptions-heading" label={t.assumptionsLabel} text={proposal.assumptions} />}
                <Prose id="risks-heading" label={isFinal ? t.risksLabel : t.changeLabel} text={proposal.risksAndLimitations} />

                {/* The price breakdown: names left, amounts aligned to the line end, one rhythm. */}
                <section aria-labelledby="services-heading" className="mt-8">
                  <h2 id="services-heading" className="text-[0.72rem] font-bold uppercase tracking-[0.1em] text-brand-700">
                    {isFinal ? t.confirmedLabel : t.servicesLabel}
                  </h2>
                  {groups.map((group) => (
                    <div key={group.category ?? "all"} className="mt-3">
                      {group.category && <p className="border-b border-line pb-1.5 text-[0.8rem] font-bold text-ink-600">{group.category}</p>}
                      <ul>
                        {group.rows.map((item) => (
                          <li key={item.id} className="flex items-baseline justify-between gap-6 border-b border-line py-3 last:border-0">
                            <span dir="auto" className="min-w-0 text-[0.95rem] leading-6 text-ink-800">{item.description}</span>
                            <span className="flex-none whitespace-nowrap text-[0.95rem] font-bold tabular-nums text-ink-900"><bdi dir="ltr">{money(item.quantity * item.unitPrice)}</bdi></span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                  {/* A stored range is always shown as a range, with the expected figure beside it — never "expected" alone. */}
                  <div className="mt-3 border-t-2 border-brand-200 pt-3">
                    <p className="flex items-baseline justify-between gap-6">
                      <span className="text-[0.95rem] font-bold text-ink-800">{isFinal ? t.finalPriceLabel : hasRange ? t.rangeLabel : t.servicesTotal}</span>
                      <span className="whitespace-nowrap text-[1.05rem] font-bold tabular-nums text-brand-900">{rangeText ?? <bdi dir="ltr">{money(expected)}</bdi>}</span>
                    </p>
                    {hasRange && (
                      <p className="mt-1 flex items-baseline justify-between gap-6">
                        <span className="text-[0.9rem] text-ink-700">{t.expectedLabel}</span>
                        <span className="whitespace-nowrap text-[0.95rem] font-bold tabular-nums text-ink-900"><bdi dir="ltr">{money(expected)}</bdi></span>
                      </p>
                    )}
                  </div>
                </section>

                <section aria-labelledby="scope-of-cover" className="mt-8 grid gap-5 sm:grid-cols-2">
                  <h2 id="scope-of-cover" className="sr-only">{t.scopeHeading}</h2>
                  <div>
                    <p className="text-[0.72rem] font-bold uppercase tracking-[0.1em] text-brand-700">{t.includedLabel}</p>
                    <p dir="auto" className="mt-2 text-[0.92rem] leading-6 text-ink-700">{proposal.includedServices || items.map((i) => i.description).join(" · ")}</p>
                    <p className="mt-2 text-[0.85rem] leading-6 text-ink-600">{t.coordinationNote}</p>
                  </div>
                  <div>
                    <p className="text-[0.72rem] font-bold uppercase tracking-[0.1em] text-ink-500">{!isFinal && en ? estimateTerms.notIncludedTitle : t.excludedLabel}</p>
                    {!isFinal && en ? (
                      <>
                        <ul className="mt-2 list-disc space-y-0.5 ps-5 text-[0.92rem] leading-6 text-ink-700">
                          {estimateTerms.notIncluded.map((item) => <li key={item}>{item}</li>)}
                        </ul>
                        {storedExclusions && <p dir="auto" className="mt-2 text-[0.92rem] leading-6 text-ink-700">{storedExclusions}</p>}
                      </>
                    ) : (
                      <p dir="auto" className="mt-2 text-[0.92rem] leading-6 text-ink-700">{storedExclusions || t.excludedFallback}</p>
                    )}
                  </div>
                </section>

                {!isFinal && en && (
                  <section aria-labelledby="basis-heading" className="mt-8">
                    <h2 id="basis-heading" className="text-[0.72rem] font-bold uppercase tracking-[0.1em] text-brand-700">{estimateTerms.basisTitle}</h2>
                    <p className="mt-2 text-[0.95rem] font-semibold leading-6 text-ink-900">{estimateTerms.nonBinding}</p>
                    <ul className="mt-2 list-disc space-y-0.5 ps-5 text-[0.92rem] leading-6 text-ink-700">
                      {basisPoints.map((point) => <li key={point}>{point}</li>)}
                    </ul>
                    <p className="mt-2 text-[0.92rem] leading-6 text-ink-700">{estimateTerms.mayChange} {estimateTerms.finalQuoteFollows}</p>
                  </section>
                )}

                {isFinal && en && (
                  <section aria-labelledby="quote-terms-heading" className="mt-8">
                    <h2 id="quote-terms-heading" className="text-[0.72rem] font-bold uppercase tracking-[0.1em] text-brand-700">{t.aboutQuote}</h2>
                    <p className="mt-2 text-[0.92rem] leading-6 text-ink-700">{finalQuoteTerms.basis} {finalQuoteTerms.changes}</p>
                    <p className="mt-3 text-[0.85rem] font-bold text-ink-800">{finalQuoteTerms.paymentTitle}</p>
                    <p className="mt-1 text-[0.92rem] leading-6 text-ink-700">{finalQuoteTerms.payment}</p>
                  </section>
                )}

                <section aria-labelledby="next-heading" className="mt-8 rounded-xl bg-mist p-4 sm:p-5">
                  <h2 id="next-heading" className="text-[0.72rem] font-bold uppercase tracking-[0.1em] text-brand-700">{t.nextTitle}</h2>
                  <ol className="mt-3 space-y-2.5">
                    {nextSteps.map((step, index) => (
                      <li key={step} className="flex gap-3 text-[0.92rem] leading-6 text-ink-800">
                        <span aria-hidden className="mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full bg-brand-100 text-[0.72rem] font-bold text-brand-800">{index + 1}</span>
                        {step}
                      </li>
                    ))}
                  </ol>
                </section>

                {/* The deposit, refund and cancellation terms are read here, before the patient is asked to continue. */}
                {depositDue && (
                  <div className="mt-8">
                    <CoordinationDepositTerms id="deposit-terms" locale={locale} amount={money(proposal.depositDueDisplay)} currency={currency} />
                  </div>
                )}

                <Prose id="notes-heading" label={t.notesLabel} text={proposal.notes} />
                {(en || proposal.disclaimers) && (
                  <div className="mt-6 space-y-1 border-t border-line pt-4 text-[0.78rem] leading-5 text-ink-500">
                    {en && <p>{generalDisclaimers}</p>}
                    {proposal.disclaimers && <p>{proposal.disclaimers}</p>}
                  </div>
                )}

                {!blocked && (
                  <div ref={decisionRef} className="mt-8 border-t border-line pt-6">
                    <h2 className="text-[0.72rem] font-bold uppercase tracking-[0.1em] text-brand-700">{t.beforeTitle}</h2>
                    {assisted ? (
                      <div className="mt-3 space-y-3">
                        <p className="max-w-[60ch] text-[0.95rem] leading-7 text-ink-800">{isFinal ? assistedCopy.explainQuote : assistedCopy.explain}</p>
                        {proposal.assistance?.requestedAt ? (
                          <p ref={requestedRef} tabIndex={-1} role="status" className="text-[0.95rem] font-semibold leading-6 text-brand-900 outline-none">
                            {fillTemplate(assistedCopy.requested, { date: new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "long" }).format(new Date(proposal.assistance.requestedAt)), name: assistedCopy.nameFallback })}
                          </p>
                        ) : (
                          <div>
                            <button type="button" className="btn-primary min-h-11 px-6" disabled={busy} onClick={() => void requestAssistance()}>
                              {busy ? assistedCopy.sending : fillTemplate(assistedCopy.ask, { name: assistedCopy.askFallback })}
                            </button>
                            {requestFailed && <p role="alert" className="mt-2 text-[0.85rem] font-semibold text-alert-700">{assistedCopy.requestFailed}</p>}
                          </div>
                        )}
                        <p className="flex flex-wrap items-center gap-x-1.5 text-[0.88rem] leading-6 text-ink-600">
                          {assistedCopy.englishPrompt}
                          <a href={`/en/proposal/${token}`} hrefLang="en" onClick={keepGrantForEnglish} className="inline-flex min-h-11 items-center font-semibold text-brand-700 underline decoration-line-strong underline-offset-4 hover:decoration-current">{assistedCopy.englishLink}</a>
                        </p>
                      </div>
                    ) : (<>
                    <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-white p-4 has-[:checked]:border-brand-300 has-[:checked]:bg-brand-50">
                      <input type="checkbox" className="mt-0.5 h-5 w-5 flex-none accent-brand-600" checked={acknowledged}
                             aria-describedby={depositDue ? "ack-detail deposit-terms" : "ack-detail"} aria-invalid={ackError || undefined}
                             onChange={(e) => { setAcknowledged(e.target.checked); if (e.target.checked) setAckError(false); }} />
                      <span>
                        <span className="block text-[0.95rem] font-semibold leading-6 text-ink-900">{ackShort}</span>
                        <span id="ack-detail" className="mt-1 block text-[0.85rem] leading-6 text-ink-600">{ackLong}</span>
                      </span>
                    </label>
                    {ackError && <p role="alert" className="mt-2 text-[0.85rem] font-semibold text-alert-700">{t.ackRequired}</p>}
                    </>)}
                    {error && <p role="alert" className="mt-3 rounded-xl bg-alert-50 p-3 text-[0.9rem] text-alert-800">{error}</p>}

                    <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3">
                      {!assisted && <button className="btn-primary min-h-11 px-6" disabled={busy} onClick={submitPrimary}>{busy ? t.deciding : primaryLabel}</button>}
                      <button type="button" className="min-h-11 text-[0.92rem] font-bold text-brand-800 underline underline-offset-4 disabled:opacity-50"
                              disabled={busy} onClick={() => setDialog("REVISION_REQUESTED")}>{t.requestRevision}</button>
                    </div>

                    <details className="mt-4" open={moreOpen} onToggle={(e) => setMoreOpen((e.currentTarget as HTMLDetailsElement).open)}>
                      <summary className="inline-block cursor-pointer text-[0.85rem] font-semibold text-ink-500 hover:text-ink-700">{t.moreOptions}</summary>
                      <button type="button" className="mt-3 min-h-11 text-[0.9rem] font-semibold text-ink-600 underline underline-offset-4 hover:text-alert-700 disabled:opacity-50"
                              disabled={busy} onClick={() => setDialog("DECLINED")}>{t.decline}</button>
                    </details>
                  </div>
                )}
              </div>

              {/* The commercial answer, kept beside the reading rather than buried under it. */}
              <aside aria-labelledby="summary-heading" className="order-first lg:order-none lg:sticky lg:top-6">
                <div className="rounded-lg border border-line bg-white p-5">
                  <h2 id="summary-heading" className="label-micro text-brand-700">{isFinal ? t.quoteSummaryHeading : t.summaryHeading}</h2>
                  <p className="mt-3 text-[0.85rem] font-semibold text-ink-700">{isFinal ? t.finalPriceLabel : hasRange ? t.rangeLabel : t.totalLabel}</p>
                  {hasRange ? (
                    <>
                      <p className="mt-1 text-[1.5rem] font-bold leading-8 text-brand-900"><bdi dir="ltr">{money(proposal.totalMin)}</bdi> <span className="text-[0.9rem] font-normal text-ink-500">{t.rangeSep}</span> <bdi dir="ltr">{money(proposal.totalMax)}</bdi></p>
                      <p className="mt-1 text-[0.88rem] text-ink-700">{t.expectedLabel}: <strong><bdi dir="ltr">{money(expected)}</bdi></strong></p>
                    </>
                  ) : (
                    <p className="mt-1 text-[1.75rem] font-bold leading-9 text-brand-900"><bdi dir="ltr">{money(expected)}</bdi></p>
                  )}
                  {/* A final quote is never described with the estimate's "may change" basis. */}
                  {(!isFinal || en) && (
                    <p className="mt-3 border-t border-line pt-3 text-[0.8125rem] leading-5 text-ink-600">{isFinal ? finalQuoteTerms.basis : t.estimateBasis}</p>
                  )}
                  {showRate && (
                    <p lang="en" dir="ltr" className="mt-2 text-start text-[0.8125rem] leading-5 text-ink-600">{exchangeRateStatement(currency, docKind, rateDate)}</p>
                  )}
                  <dl className="mt-3 space-y-1.5 text-[0.85rem]">
                    <div className="flex justify-between gap-4">
                      <dt className="text-ink-600">{t.servicesLabel}</dt>
                      <dd className="font-semibold text-ink-800">{plural(locale, items.length, copy.services)}</dd>
                    </div>
                    {proposal.validUntil && (
                      <div className="flex justify-between gap-4">
                        <dt className="text-ink-600">{t.validUntil}</dt>
                        <dd className="font-semibold text-ink-800">{new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "long" }).format(new Date(proposal.validUntil))}</dd>
                      </div>
                    )}
                  </dl>
                  {depositDue && (
                    <div className="mt-4 border-t border-line pt-3">
                      <p className="text-[0.8125rem] font-bold text-brand-800">{t.payNow}</p>
                      <p className="mt-0.5 text-[1.15rem] font-bold text-ink-900"><bdi dir="ltr">{money(proposal.depositDueDisplay)}</bdi></p>
                      <p className="mt-1 text-[0.8125rem] leading-5 text-ink-600">{t.payNowNote}</p>
                    </div>
                  )}
                  {isFinal && proposal.depositPaidDisplay != null && proposal.depositPaidDisplay > 0 && (
                    <p className="mt-4 text-[0.85rem] text-ink-700">{t.alreadyPaid}: <strong><bdi dir="ltr">{money(proposal.depositPaidDisplay)}</bdi></strong></p>
                  )}
                </div>
              </aside>
            </div>

            {/* Carries the same two operations while the decision block is out of view; never a third choice. */}
            {!blocked && !decisionVisible && !(assisted && proposal.assistance?.requestedAt) && (
              <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white px-4 py-3 shadow-[0_-2px_12px_rgba(28,51,58,0.08)]">
                <div className="container-site flex max-w-[1120px] flex-col gap-2 px-0 min-[480px]:flex-row min-[480px]:items-center min-[480px]:justify-between min-[480px]:gap-3">
                  <div className="min-w-0">
                    <p className="text-[1.05rem] font-bold leading-6 text-brand-900">{rangeText ?? <bdi dir="ltr">{money(expected)}</bdi>}</p>
                    <p className="text-[0.8125rem] text-ink-600">
                      {isFinal ? t.finalPriceLabel : hasRange ? t.rangeLabel : t.totalLabel}
                      {hasRange && <> · {t.expectedLabel} <bdi dir="ltr">{money(expected)}</bdi></>}
                    </p>
                  </div>
                  <div className="flex items-center justify-end gap-3 min-[480px]:flex-none">
                    <button type="button" className="min-h-11 text-[0.9rem] font-bold text-brand-800 underline underline-offset-4 disabled:opacity-50"
                            disabled={busy} onClick={() => setDialog("REVISION_REQUESTED")}>{t.requestRevision}</button>
                    <button className="btn-primary min-h-11 flex-1 justify-center px-5 sm:flex-none" disabled={busy} onClick={assisted ? () => void requestAssistance() : submitPrimary}>
                      {busy ? (assisted ? assistedCopy.sending : t.deciding) : assisted ? assistedCopy.askShort : primaryLabel}
                    </button>
                  </div>
                </div>
              </div>
            )}
            {!blocked && !decisionVisible && !(assisted && proposal.assistance?.requestedAt) && <div aria-hidden className="h-20" />}

            {dialog && (
              <ProposalDecisionDialog locale={locale} kind={dialog} busy={busy}
                                      onConfirm={(comment) => { setDialog(null); void decide(dialog, comment); }}
                                      onClose={() => setDialog(null)} />
            )}
          </>
        )}

        {phase === "done" && (
          <div className="card mx-auto max-w-xl p-8 text-center">
            <h1 className="headline">{doneCopy.title}</h1>
            <p className="lead mt-4">{doneCopy.msg}</p>
          </div>
        )}
      </div>
    </section>
  );
}
