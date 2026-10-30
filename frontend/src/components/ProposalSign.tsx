"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, CircleCheck, Clock, LockKeyhole, ShieldCheck } from "lucide-react";

import { intlLocale, type Locale } from "@/lib/i18n";
import { ProposalDecisionDialog } from "@/components/ProposalDecisionDialog";
import { CoordinationDepositTerms } from "@/components/CoordinationDepositTerms";
import { CaseStamp } from "@/components/brand/CaseStamp";
import { DossierPage } from "@/components/brand/DossierPage";
import { categoryLabel, EstimateRangeBar, type EstimateBarCopy } from "@/components/EstimateRangeBar";
import { apiUrl } from "@/lib/api";
import { ARABIC_TERMS_APPROVED, estimateTerms, exchangeRateStatement, finalQuoteTerms, generalDisclaimers, isForeignCurrency, LEGACY_PLACEHOLDER_TERMS } from "@/lib/commercial-terms";
import type { Dictionary } from "@/lib/dictionary";
import { OneTimeCodeStep } from "@/components/OneTimeCodeStep";
import { fillTemplate, plural } from "@/lib/portal-labels";
import { formatMoney } from "@/lib/money";
import { scrollIntoView } from "@/lib/scroll";
import { ACCEPTANCE_HOLD_ID, AcceptanceHold, HowYourPriceWorks, PayeeNote, PayeeTotals, ScopeChangeNotice, payeesSplit, type PayeeTotal } from "@/components/PriceTransparency";
import { COOLING_PERIOD, FX_REAPPROVAL_REQUIRED, finalQuoteState, isPlatformFee, useNow } from "@/lib/price-transparency";

type Item = { id: string; category: string; description: string; quantity: number; unitPrice: number; optional: boolean; payee?: string | null };
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
  /** D-1: when this version was released to the patient, printed on the "Estimate ready" stamp; no date, no stamp. */
  releasedAt?: string | null;
  /** When the patient asked their coordinator to go through the terms in Arabic (assisted path); absent until then. */
  assistance?: { requestedAt?: string | null } | null;
  /** When a final quote above the estimate's maximum can be accepted (end of its cooling period); null otherwise. */
  acceptableFrom?: string | null;
  /** Finance is checking the exchange rate before this final quote can be accepted: null | PENDING | CONFIRMED. */
  fxReapprovalStatus?: string | null;
  /** P1-19: each payee's total (the Consultant's fee and the hospital's charges apart), in document order. */
  payeeTotals?: PayeeTotal[] | null;
};
type Decision = "ACCEPTED" | "ACKNOWLEDGED" | "DECLINED" | "REVISION_REQUESTED";
/** Terminal states the patient cannot act out of; each gets its own honest explanation, never a raw error. */
type Blocked = "EXPIRED" | "SUPERSEDED" | "DECIDED" | null;
/** A failed call: the HTTP status and the backend's stable `code`, never its English message (that is not patient copy). */
type Failure = Error & { status?: number; code?: string };


/**
 * The page's words, from messages/{en,ar}.json (`secureLink.proposal`, plus the assisted path, the services plural and
 * the stamp's words), passed by the server page so this client bundle carries no dictionary.
 */
export type ProposalCopy = Dictionary["secureLink"]["proposal"] & {
  assisted: Dictionary["portalProposal"]["assisted"];
  services: Dictionary["portalWork"]["plural"]["services"];
  stampEstimateReady: string;
  estimateBar: EstimateBarCopy;
  price: Dictionary["portalProposal"]["price"];
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
function Prose({ label, text, id, first = false }: { label: string; text?: string; id?: string; first?: boolean }) {
  if (!text) return null;
  return (
    <section aria-labelledby={id} className={first ? "" : "mt-7"}>
      <h2 id={id} className="label-micro text-brand-700">{label}</h2>
      <p dir="auto" className="mt-2 whitespace-pre-line leading-7 text-ink-800">{text}</p>
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

/** Reads a failed response into its status and stable code; the message stays unread. */
async function failure(response: Response, fallback: string): Promise<Failure> {
  const body = (await response.json().catch(() => null)) as { code?: unknown } | null;
  return Object.assign(new Error(fallback), { status: response.status, code: typeof body?.code === "string" ? body.code : undefined });
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
  /** Why the link no longer opens a decidable document (expired, already decided); the generic line otherwise. */
  const [invalidReason, setInvalidReason] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const decisionRef = useRef<HTMLDivElement>(null);
  const [decisionVisible, setDecisionVisible] = useState(true);
  const [requestFailed, setRequestFailed] = useState(false);
  // The code the server last refused an acceptance with, for a hold this page did not know about yet.
  const [refusedWith, setRefusedWith] = useState<string | null>(null);
  // Each successful send starts a fresh code step (the typed code is kept when a resend fails).
  const [codeRound, setCodeRound] = useState(0);
  const requestedRef = useRef<HTMLParagraphElement>(null);
  const blockedRef = useRef<HTMLParagraphElement>(null);
  const ackRef = useRef<HTMLInputElement>(null);
  const requestFailedRef = useRef<HTMLParagraphElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const shownPage = useRef<Phase | "sealed">("loading");
  // Until the terms have approved Arabic wording, an Arabic page asks the coordinator to go through them with the
  // patient in Arabic and record the decision (owner decision, GATE P2-1) instead of asking for an acknowledgement.
  const assisted = locale === "ar" && !ARABIC_TERMS_APPROVED;
  const assistedCopy = copy.assisted;

  // Focus moves to the new page's heading on every step the patient takes (not on arrival; sending the code stays on
  // the sealed page, where the code field takes focus itself).
  const page = phase === "intro" || phase === "code" ? "sealed" : phase;
  useEffect(() => {
    const from = shownPage.current;
    shownPage.current = page;
    if (from !== "loading" && from !== page) headingRef.current?.focus();
  }, [page]);

  /** The document can no longer be decided (expired, superseded): the notice replaces the decision and takes focus. */
  function block(reason: Exclude<Blocked, null>) {
    setBlocked(reason);
    requestAnimationFrame(() => { scrollIntoView(blockedRef.current, { behavior: "smooth", block: "center" }); blockedRef.current?.focus({ preventScroll: true }); });
  }

  /** Asks the coordinator for the Arabic conversation; the page then says it was asked, also after a reload. */
  async function requestAssistance() {
    setBusy(true); setRequestFailed(false);
    try {
      const r = await fetch(apiUrl(`/public/proposals/${token}/assistance`), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ grant }) });
      // An expired or replaced version is explained like any decision on it, never offered again.
      if (r.status === 410) { block("EXPIRED"); return; }
      if (r.status === 409) { block("SUPERSEDED"); return; }
      if (!r.ok) {
        setRequestFailed(true);
        requestAnimationFrame(() => { scrollIntoView(requestFailedRef.current, { behavior: "smooth", block: "center" }); requestFailedRef.current?.focus({ preventScroll: true }); });
        return;
      }
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

  /** The code step's failures, in the patient's words; a link that no longer works ends on the invalid page. */
  function codeFailure(e: unknown) {
    const f = e as Failure;
    if (f.code === "PROPOSAL_LINK_INVALID" || f.code === "PROPOSAL_EXPIRED" || f.code === "PROPOSAL_NOT_DECIDABLE") {
      setInvalidReason(f.code === "PROPOSAL_EXPIRED" ? t.blockedExpired : f.code === "PROPOSAL_NOT_DECIDABLE" ? t.blockedDecided : null);
      setPhase("invalid");
      return;
    }
    // The gateway's own rate limit answers 429 without a code.
    setError(f.code === "RESEND_TOO_SOON" ? t.resendTooSoon : f.code === "TOO_MANY_REQUESTS" || f.status === 429 ? t.tooMany
      : f.code === "VERIFICATION_EXPIRED" ? t.codeExpired : f.code === "VERIFICATION_INVALID" ? t.codeInvalid : t.error);
  }

  async function requestAccess(ch: "WHATSAPP" | "EMAIL" = channel) {
    setBusy(true); setError("");
    try {
      const r = await fetch(apiUrl(`/public/proposals/${token}/request-access`), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channel: ch }) });
      if (!r.ok) throw await failure(r, t.error);
      setSummary((await r.json()) as Summary); setCodeRound(round => round + 1);
      setPhase("code");
    } catch (e) { codeFailure(e); } finally { setBusy(false); }
  }

  async function verify(code: string) {
    if (code.trim().length !== 6) return;
    setBusy(true); setError("");
    try {
      const g = await fetch(apiUrl(`/public/proposals/${token}/verify`), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: code.trim() }) })
        .then(async (r) => { if (!r.ok) throw await failure(r, t.error); return r.json() as Promise<{ grant: string }>; });
      setGrant(g.grant);
      const full = await fetch(apiUrl(`/public/proposals/${token}/view`), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ grant: g.grant }) })
        .then(async (r) => { if (!r.ok) throw await failure(r, t.error); return r.json() as Promise<Proposal>; });
      setProposal(full);
      if (full.decided) setBlocked("DECIDED");
      else if (hasLapsed(full.validUntil)) setBlocked("EXPIRED");
      setPhase("view");
    } catch (e) { codeFailure(e); } finally { setBusy(false); }
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
        if (r.status === 410) { block("EXPIRED"); return; }
        const f = await failure(r, t.error);
        // A hold on accepting is not a replaced document: explain it in place and keep the other choices open.
        if (f.status === 409 && (f.code === COOLING_PERIOD || f.code === FX_REAPPROVAL_REQUIRED)) {
          setRefusedWith(f.code);
          requestAnimationFrame(() => scrollIntoView(document.getElementById(ACCEPTANCE_HOLD_ID), { behavior: "smooth", block: "center" }));
          return;
        }
        if (f.status === 409) { block("SUPERSEDED"); return; }
        throw f;
      }
      setOutcome(decision); setPhase("done");
    } catch (e) {
      const f = e as Failure;
      if (f.code === "ACKNOWLEDGEMENT_REQUIRED") { setAckError(true); return; }
      setError(f.code === "VERIFICATION_REQUIRED" ? t.sessionEnded : t.error);
    } finally { setBusy(false); }
  }

  function submitPrimary() {
    if (!acknowledged) {
      setAckError(true);
      scrollIntoView(decisionRef.current, { behavior: "smooth", block: "center" });
      ackRef.current?.focus({ preventScroll: true });
      return;
    }
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
  const longDate = (iso: string) => new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "long" }).format(new Date(iso));
  const heading = (text: string) => <h1 ref={headingRef} tabIndex={-1} className="statement mt-5 text-brand-900 outline-none">{text}</h1>;
  const items = useMemo(() => proposal?.items.filter((i) => !i.optional) ?? [], [proposal]);
  // The platform's one disclosed line is worded here (the stored text is English) and sits after the medical lines.
  const medicalItems = useMemo(() => items.filter((i) => !isPlatformFee(i)), [items]);
  const feeItem = items.find(isPlatformFee);
  const price = copy.price;
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
    const distinct = new Set(medicalItems.map((i) => i.category).filter(Boolean));
    if (distinct.size < 2) return [{ category: null as string | null, heading: null as string | null, rows: medicalItems }];
    // A category is named in words, never the backend's code; the platform's fee line is worded on its own after them.
    return [...distinct].map((category) => ({ category, heading: categoryLabel(category, copy.estimateBar), rows: medicalItems.filter((i) => i.category === category) }));
  }, [medicalItems, copy.estimateBar]);
  // Cooling period or Finance's rate check: accepting waits, declining and asking for changes never do.
  const now = useNow(proposal?.acceptableFrom);
  const hold = finalQuoteState(proposal ?? {}, now, refusedWith);
  const acceptBlocked = isFinal && hold.acceptBlocked;

  const primaryLabel = isFinal ? t.acceptFinal : t.acknowledge;
  const ackShort = isFinal ? t.ackShortFinal : t.ackShort;
  const ackLong = isFinal ? t.finalConsentStatement : t.ackStatement;
  // On the assisted path the patient does not acknowledge on the page: the first step is the conversation.
  const nextSteps = (isFinal ? t.nextFinal : t.nextPrelim)
    .map((step, index) => assisted && index === 0 ? (isFinal ? assistedCopy.nextFirstQuote : assistedCopy.nextFirst) : step)
    .filter((_, index) => !(!isFinal && index === 2 && !(proposal?.depositDueDisplay && proposal.depositDueDisplay > 0)));
  // The profile link goes where the backend sends it: the patient's WhatsApp when the case has one, otherwise email.
  const profileLinkSent = summary?.whatsappHint ? t.ackDoneWhatsApp : summary?.emailHint ? t.ackDoneEmail : t.ackDoneMsg;
  const doneCopy = outcome === "DECLINED" ? { title: t.declinedTitle, msg: t.declinedMsg }
    : outcome === "REVISION_REQUESTED" ? { title: t.revisionTitle, msg: t.revisionMsg }
    : isFinal ? { title: t.acceptedTitle, msg: t.acceptedMsg }
    : { title: t.ackDoneTitle, msg: depositDue && t.ackDoneDeposit ? `${profileLinkSent} ${t.ackDoneDeposit}` : profileLinkSent };
  const blockedMessage = blocked === "EXPIRED" ? (isFinal ? t.blockedExpiredFinal : t.blockedExpired)
    : blocked === "SUPERSEDED" ? t.blockedSuperseded : t.blockedDecided;

  return (
    <section className="section section-soft">
      <div className="container-site max-w-[1120px]">
        {phase === "loading" && (
          <DossierPage className={`mx-auto max-w-xl ${PAGE_PAD}`}><p role="status" className="text-ink-600">{t.loading}</p></DossierPage>
        )}
        {phase === "invalid" && (
          <DossierPage className={`mx-auto max-w-xl ${PAGE_PAD}`}>
            <LockKeyhole aria-hidden size={28} className="text-ink-400"/>
            {heading(t.invalidTitle)}
            <p className="mt-3 max-w-[65ch] text-ink-600">{invalidReason ?? t.invalid}</p>
            <p className="mt-2 max-w-[65ch] text-ink-600">{t.contactCoordinator}</p>
          </DossierPage>
        )}

        {(phase === "intro" || phase === "code") && summary && (
          // The sealed page of the document: the case it belongs to, where the code goes, one action.
          <DossierPage className={`mx-auto max-w-xl ${PAGE_PAD}`} kicker={t.caseRef} reference={summary.caseNumber}>
            {heading(t.verifyTitle)}
            <div className="mt-4 border-t border-line pt-5">
              <OneTimeCodeStep round={codeRound}
                copy={{ sendTo: channel === "WHATSAPP" ? t.verifyIntroWhatsapp : t.verifyIntroEmail, sentTo: t.codeSent, send: t.sendCode, sending: t.sending,
                        codeLabel: t.codeLabel, verify: t.verify, verifying: t.verifying, resend: t.resend, incomplete: t.codeIncomplete,
                        lifetime: t.codeLifetime, resendIn: t.resendIn }}
                destination={(channel === "WHATSAPP" ? summary.whatsappHint : summary.emailHint) ?? summary.destinationHint}
                sent={phase === "code"} busy={busy} onSend={() => void requestAccess()} onVerify={code => void verify(code)}
                notice={phase === "code" && codeRound > 1 ? t.codeResent : null}
                // One rule for the three links: the other channel is offered only before a code is sent.
                channelSwitch={phase === "intro" && (channel === "WHATSAPP" ? summary.emailHint : summary.whatsappHint) ? {
                  label: channel === "WHATSAPP" ? t.emailInstead : t.whatsappInstead,
                  onSwitch: () => setChannel(channel === "WHATSAPP" ? "EMAIL" : "WHATSAPP"),
                } : null}
                error={error || null}>
                <p className="mt-2 flex items-start gap-2 text-[0.9375rem] leading-6 text-ink-600">
                  <ShieldCheck className="mt-0.5 flex-none text-brand-600" size={17} aria-hidden/>{t.neverAsk}
                </p>
              </OneTimeCodeStep>
            </div>
          </DossierPage>
        )}

        {phase === "view" && proposal && (
          <>
            {/* The document's first page: what it is, who it is for, the case, how long it stands — stamped when the
                estimate was released to the patient (a final quote carries no stamp: three moments only). */}
            <DossierPage edge="tab" className={PAGE_PAD} kicker={isFinal ? t.finalBadge : t.prelimBadge}
                         stamp={!isFinal && !blocked && proposal.releasedAt ? <CaseStamp label={t.stampEstimateReady} date={proposal.releasedAt} locale={locale}/> : null}>
              {heading(isFinal ? t.finalTitle : t.prelimTitle)}
              <dl className="dossier-page-full mt-5 grid gap-x-8 gap-y-3 border-t border-line pt-4 text-[0.9375rem] sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <dt className="text-[0.8125rem] font-semibold text-ink-500">{t.greeting}</dt>
                  <dd className="mt-0.5 font-bold text-ink-900"><bdi>{proposal.patientName}</bdi></dd>
                </div>
                <div>
                  <dt className="text-[0.8125rem] font-semibold text-ink-500">{t.caseRef}</dt>
                  <dd className="mt-0.5 font-bold text-ink-900"><bdi dir="ltr" className="whitespace-nowrap">{proposal.caseNumber}</bdi></dd>
                </div>
                {/* The technical version number stays internal; a patient only needs to know this document was updated. */}
                {proposal.versionNumber != null && proposal.versionNumber > 1 && (
                  <div>
                    <dt className="text-[0.8125rem] font-semibold text-ink-500">{t.versionLabel}</dt>
                    <dd className="mt-0.5 font-bold text-ink-900">{t.updatedVersion}</dd>
                  </div>
                )}
                {proposal.validUntil && (
                  <div>
                    <dt className="text-[0.8125rem] font-semibold text-ink-500">{t.validUntil}</dt>
                    <dd className="mt-0.5 font-bold text-ink-900">{longDate(proposal.validUntil)}</dd>
                  </div>
                )}
              </dl>
            </DossierPage>

            {blocked && (
              <p ref={blockedRef} tabIndex={-1} role="status" className="mt-4 flex items-start gap-2.5 border-b border-line pb-4 text-[0.9375rem] leading-6 text-ink-800 outline-none">
                <Clock aria-hidden size={18} className="mt-0.5 flex-none text-alert-700"/>
                <span>{blockedMessage}{blocked !== "EXPIRED" && <> <span className="text-ink-600">{t.contactCoordinator}</span></>}</span>
              </p>
            )}

            {isFinal && !blocked && hold.acceptBlocked && <div className="mt-4"><AcceptanceHold copy={price} locale={locale} state={hold} /></div>}

            <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
              {/* One reading column, in the order a patient decides: recommendation, price, scope, basis, next, terms, decision. */}
              <div className="card min-w-0 p-5 sm:p-7">
                {isFinal && <ScopeChangeNotice copy={price} reason={proposal.scopeChangeReason} id="scope-heading" className="mb-1" />}
                <Prose id="recommendation-heading" label={isFinal ? t.assessmentLabel : t.treatmentLabel} text={proposal.recommendedTreatment} first />
                {proposal.consultantName && (
                  <p className="mt-2 text-[0.875rem] font-semibold text-brand-800">{t.reviewedBy} <bdi>{proposal.consultantName}</bdi></p>
                )}
                {!isFinal && <Prose id="assumptions-heading" label={t.assumptionsLabel} text={proposal.assumptions} />}
                <Prose id="risks-heading" label={isFinal ? t.risksLabel : t.changeLabel} text={proposal.risksAndLimitations} />

                {/* The price breakdown: names at the start, amounts aligned to the line end, one rhythm. */}
                <section aria-labelledby="services-heading" className="mt-8">
                  <h2 id="services-heading" className="label-micro text-brand-700">{isFinal ? t.confirmedLabel : t.servicesLabel}</h2>
                  {groups.map((group) => (
                    <div key={group.category ?? "all"} className="mt-3">
                      {group.heading && <p dir="auto" className="border-b border-line pb-1.5 text-[0.8125rem] font-bold text-ink-600">{group.heading}</p>}
                      <ul>
                        {group.rows.map((item) => (
                          <li key={item.id} className="flex items-baseline justify-between gap-6 border-b border-line py-3 last:border-0">
                            <span className="min-w-0 text-[0.9375rem] leading-6 text-ink-800"><bdi dir="auto">{item.description}</bdi><PayeeNote copy={price} payee={item.payee} split={payeesSplit(proposal.payeeTotals)} /></span>
                            <span className="flex-none whitespace-nowrap text-[0.9375rem] font-bold tabular-nums text-ink-900"><bdi dir="ltr">{money(item.quantity * item.unitPrice)}</bdi></span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                  {feeItem && (
                    <ul className="mt-1">
                      <li className="flex items-baseline justify-between gap-6 border-t border-line py-3">
                        <span className="min-w-0">
                          <span className="block text-[0.95rem] leading-6 rtl:text-base rtl:leading-[1.85] text-ink-800">{price.feeLabel}</span>
                          <span className="block text-[0.85rem] leading-5 text-ink-600">{price.feeNote}</span>
                        </span>
                        <span className="flex-none whitespace-nowrap text-[0.95rem] rtl:text-base font-bold tabular-nums text-ink-900"><bdi dir="ltr">{money(feeItem.quantity * feeItem.unitPrice)}</bdi></span>
                      </li>
                    </ul>
                  )}
                  {/* UX 1c-2: the totals as one scale (the range bracketed, the deposit in coral) over its legend, the readable
                      table: a stored range is always shown as a range, with the expected figure beside it. */}
                  <EstimateRangeBar className="mt-3 border-t border-line-strong pt-4" items={items} expected={expected} min={proposal.totalMin} max={proposal.totalMax}
                                    deposit={depositDue ? proposal.depositDueDisplay : null} kind={isFinal ? "quote" : "estimate"}
                                    currency={currency} locale={locale} copy={copy.estimateBar}/>
                  <PayeeTotals copy={price} totals={proposal.payeeTotals} headingId="payees-heading" className="mt-6" format={(amount) => money(amount)} />
                </section>

                {!isFinal && <div className="mt-8"><HowYourPriceWorks copy={price} headingId="how-price-works" /></div>}

                <section aria-labelledby="scope-of-cover" className="mt-8 grid gap-5 sm:grid-cols-2">
                  <h2 id="scope-of-cover" className="sr-only">{t.scopeHeading}</h2>
                  <div>
                    <p className="label-micro text-brand-700">{isFinal ? t.includedQuoteLabel : t.includedLabel}</p>
                    <p dir="auto" className="mt-2 text-[0.9375rem] leading-6 text-ink-700">{proposal.includedServices || medicalItems.map((i) => i.description).join(" · ")}</p>
                    <p className="mt-2 text-[0.875rem] leading-6 text-ink-600">{t.coordinationNote}</p>
                  </div>
                  <div>
                    <p className="label-micro text-ink-500">{!isFinal && en ? estimateTerms.notIncludedTitle : t.excludedLabel}</p>
                    {!isFinal && en ? (
                      <>
                        <ul className="mt-2 list-disc space-y-0.5 ps-5 text-[0.9375rem] leading-6 text-ink-700">
                          {estimateTerms.notIncluded.map((item) => <li key={item}>{item}</li>)}
                        </ul>
                        {storedExclusions && <p dir="auto" className="mt-2 text-[0.9375rem] leading-6 text-ink-700">{storedExclusions}</p>}
                      </>
                    ) : (
                      <p dir="auto" className="mt-2 text-[0.9375rem] leading-6 text-ink-700">{storedExclusions || (isFinal ? t.excludedFallbackQuote : t.excludedFallback)}</p>
                    )}
                  </div>
                </section>

                {!isFinal && en && (
                  <section aria-labelledby="basis-heading" className="mt-8">
                    <h2 id="basis-heading" className="label-micro text-brand-700">{estimateTerms.basisTitle}</h2>
                    <p className="mt-2 text-[0.9375rem] font-semibold leading-6 text-ink-900">{estimateTerms.nonBinding}</p>
                    <ul className="mt-2 list-disc space-y-0.5 ps-5 text-[0.9375rem] leading-6 text-ink-700">
                      {basisPoints.map((point) => <li key={point}>{point}</li>)}
                    </ul>
                    <p className="mt-2 text-[0.9375rem] leading-6 text-ink-700">{estimateTerms.mayChange} {estimateTerms.finalQuoteFollows}</p>
                  </section>
                )}

                {isFinal && en && (
                  <section aria-labelledby="quote-terms-heading" className="mt-8">
                    <h2 id="quote-terms-heading" className="label-micro text-brand-700">{t.aboutQuote}</h2>
                    <p className="mt-2 text-[0.9375rem] leading-6 text-ink-700">{finalQuoteTerms.basis} {finalQuoteTerms.changes}</p>
                    <p className="mt-3 text-[0.875rem] font-bold text-ink-800">{finalQuoteTerms.paymentTitle}</p>
                    <p className="mt-1 text-[0.9375rem] leading-6 text-ink-700">{finalQuoteTerms.payment}</p>
                  </section>
                )}

                {/* What happens next, numbered like the journey: hairline-separated, no tinted panel. */}
                <section aria-labelledby="next-heading" className="mt-8 border-t border-line pt-6">
                  <h2 id="next-heading" className="label-micro text-brand-700">{t.nextTitle}</h2>
                  <ol className="mt-4 space-y-3">
                    {nextSteps.map((step, index) => (
                      <li key={step} className="flex items-start gap-3 text-[0.9375rem] leading-6 text-ink-800">
                        <span aria-hidden className="journey-marker flex-none">{index + 1}</span>
                        <span className="pt-1">{step}</span>
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
                  <div className="mt-6 space-y-1 border-t border-line pt-4 text-[0.8125rem] leading-5 text-ink-500">
                    {en && <p>{generalDisclaimers}</p>}
                    {proposal.disclaimers && <p dir="auto">{proposal.disclaimers}</p>}
                  </div>
                )}

                {!blocked && (
                  <div ref={decisionRef} className="mt-8 border-t border-line pt-6">
                    <h2 className="label-micro text-brand-700">{t.beforeTitle}</h2>
                    {assisted ? (
                      <div className="mt-3 space-y-3">
                        <p className="max-w-[60ch] text-[0.9375rem] leading-7 text-ink-800">{isFinal ? assistedCopy.explainQuote : assistedCopy.explain}</p>
                        {proposal.assistance?.requestedAt ? (
                          <p ref={requestedRef} tabIndex={-1} role="status" className="text-[0.9375rem] font-semibold leading-6 text-brand-900 outline-none">
                            {fillTemplate(assistedCopy.requested, { date: longDate(proposal.assistance.requestedAt), name: assistedCopy.nameFallback })}
                          </p>
                        ) : (
                          <div>
                            <button type="button" className="btn-primary min-h-11 px-6" disabled={busy} onClick={() => void requestAssistance()}>
                              {busy ? assistedCopy.sending : fillTemplate(assistedCopy.ask, { name: assistedCopy.askFallback })}
                            </button>
                            {requestFailed && <p ref={requestFailedRef} tabIndex={-1} role="alert" className="mt-2 text-[0.875rem] font-semibold text-alert-800 outline-none">{assistedCopy.requestFailed}</p>}
                          </div>
                        )}
                        <p className="flex flex-wrap items-center gap-x-1.5 text-[0.875rem] leading-6 text-ink-600">
                          {assistedCopy.englishPrompt}
                          <a href={`/en/proposal/${token}`} hrefLang="en" onClick={keepGrantForEnglish} className="inline-flex min-h-11 items-center font-semibold text-brand-700 underline decoration-line-strong underline-offset-4 hover:decoration-current">{assistedCopy.englishLink}</a>
                        </p>
                      </div>
                    ) : (<>
                    <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-lg border border-ink-350 bg-white p-4 has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50">
                      <input ref={ackRef} type="checkbox" className="mt-0.5 h-5 w-5 flex-none accent-brand-600" checked={acknowledged}
                             aria-describedby={[depositDue ? "ack-detail deposit-terms" : "ack-detail", ackError ? "ack-error" : ""].join(" ").trim()} aria-invalid={ackError || undefined}
                             onChange={(e) => { setAcknowledged(e.target.checked); if (e.target.checked) setAckError(false); }} />
                      <span>
                        <span className="block text-[0.9375rem] font-semibold leading-6 text-ink-900">{ackShort}</span>
                        <span id="ack-detail" className="mt-1 block text-[0.875rem] leading-6 text-ink-600">{ackLong}</span>
                      </span>
                    </label>
                    {ackError && <p id="ack-error" role="alert" className="mt-2 text-[0.875rem] font-semibold text-alert-800">{t.ackRequired}</p>}
                    </>)}
                    {error && <p role="alert" className="mt-3 text-[0.9375rem] font-semibold leading-6 text-alert-800">{error}</p>}

                    <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3">
                      {!assisted && <button className="btn-primary min-h-11 px-6" disabled={busy || acceptBlocked} aria-describedby={acceptBlocked ? ACCEPTANCE_HOLD_ID : undefined} onClick={submitPrimary}>{busy ? t.deciding : primaryLabel}</button>}
                      <button type="button" className="min-h-11 text-[0.9375rem] font-bold text-brand-800 underline underline-offset-4 disabled:opacity-50"
                              disabled={busy} onClick={() => setDialog("REVISION_REQUESTED")}>{t.requestRevision}</button>
                    </div>

                    <details className="group mt-2" open={moreOpen} onToggle={(e) => setMoreOpen((e.currentTarget as HTMLDetailsElement).open)}>
                      <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-[0.875rem] font-semibold text-ink-500 hover:text-ink-700 [&::-webkit-details-marker]:hidden">
                        {t.moreOptions}<ChevronDown aria-hidden size={16} className="transition-transform group-open:rotate-180"/>
                      </summary>
                      <button type="button" className="mt-1 min-h-11 text-[0.9375rem] font-semibold text-ink-600 underline underline-offset-4 hover:text-alert-700 disabled:opacity-50"
                              disabled={busy} onClick={() => setDialog("DECLINED")}>{isFinal ? t.declineQuote : t.decline}</button>
                    </details>
                  </div>
                )}
              </div>

              {/* The commercial answer, kept beside the reading rather than buried under it (first on phones). */}
              <aside aria-labelledby="summary-heading" className="order-first lg:order-none lg:sticky lg:top-6">
                <div className="rounded-lg border border-line bg-white p-5">
                  <h2 id="summary-heading" className="label-micro text-brand-700">{isFinal ? t.quoteSummaryHeading : t.summaryHeading}</h2>
                  <p className="mt-3 text-[0.875rem] font-semibold text-ink-700">{isFinal ? t.finalPriceLabel : hasRange ? t.rangeLabel : t.totalLabel}</p>
                  {hasRange ? (
                    <>
                      <p className="statement mt-1 text-brand-900"><bdi dir="ltr">{money(proposal.totalMin)}</bdi> <span className="text-[0.9375rem] font-normal text-ink-500">{t.rangeSep}</span> <bdi dir="ltr">{money(proposal.totalMax)}</bdi></p>
                      <p className="mt-1 text-[0.875rem] text-ink-700">{t.expectedLabel}: <strong><bdi dir="ltr">{money(expected)}</bdi></strong></p>
                    </>
                  ) : (
                    <p className="statement mt-1 text-brand-900"><bdi dir="ltr">{money(expected)}</bdi></p>
                  )}
                  {/* A final quote is never described with the estimate's "may change" basis. */}
                  {(!isFinal || en) && (
                    <p className="mt-3 border-t border-line pt-3 text-[0.8125rem] leading-5 text-ink-600">{isFinal ? finalQuoteTerms.basis : t.estimateBasis}</p>
                  )}
                  {showRate && (
                    <p lang="en" dir="ltr" className="mt-2 text-start text-[0.8125rem] leading-5 text-ink-600">{exchangeRateStatement(currency, docKind, rateDate)}</p>
                  )}
                  <dl className="mt-3 space-y-1.5 text-[0.875rem]">
                    <div className="flex justify-between gap-4">
                      <dt className="text-ink-600">{t.servicesLabel}</dt>
                      <dd className="font-semibold text-ink-800">{plural(locale, medicalItems.length, copy.services)}</dd>
                    </div>
                    {proposal.validUntil && (
                      <div className="flex justify-between gap-4">
                        <dt className="text-ink-600">{t.validUntil}</dt>
                        <dd className="font-semibold text-ink-800">{longDate(proposal.validUntil)}</dd>
                      </div>
                    )}
                  </dl>
                  {depositDue && (
                    <div className="mt-4 border-t border-line pt-3">
                      <p className="text-[0.8125rem] font-bold text-brand-800">{t.payNow}</p>
                      <p className="mt-0.5 text-[1.125rem] font-bold text-ink-900"><bdi dir="ltr">{money(proposal.depositDueDisplay)}</bdi></p>
                      <p className="mt-1 text-[0.8125rem] leading-5 text-ink-600">{t.payNowNote}</p>
                    </div>
                  )}
                  {isFinal && proposal.depositPaidDisplay != null && proposal.depositPaidDisplay > 0 && (
                    <p className="mt-4 text-[0.875rem] text-ink-700">{t.alreadyPaid}: <strong><bdi dir="ltr">{money(proposal.depositPaidDisplay)}</bdi></strong></p>
                  )}
                </div>
              </aside>
            </div>

            {/* Carries the same two operations while the decision block is out of view; never a third choice. */}
            {!blocked && !decisionVisible && !(assisted && proposal.assistance?.requestedAt) && (
              <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line-strong bg-white px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                <div className="container-site flex max-w-[1120px] flex-col gap-2 px-0 min-[480px]:flex-row min-[480px]:items-center min-[480px]:justify-between min-[480px]:gap-3">
                  <div className="min-w-0">
                    <p className="text-[1.0625rem] font-bold leading-6 text-brand-900">{rangeText ?? <bdi dir="ltr">{money(expected)}</bdi>}</p>
                    <p className="text-[0.8125rem] text-ink-600">
                      {isFinal ? t.finalPriceLabel : hasRange ? t.rangeLabel : t.totalLabel}
                      {hasRange && <> · {t.expectedLabel} <bdi dir="ltr">{money(expected)}</bdi></>}
                    </p>
                  </div>
                  <div className="flex items-center justify-end gap-3 min-[480px]:flex-none">
                    <button type="button" className="min-h-11 text-[0.9375rem] font-bold text-brand-800 underline underline-offset-4 disabled:opacity-50"
                            disabled={busy} onClick={() => setDialog("REVISION_REQUESTED")}>{t.requestRevision}</button>
                    <button className="btn-primary min-h-11 flex-1 justify-center px-5 sm:flex-none" disabled={busy || (acceptBlocked && !assisted)} aria-describedby={acceptBlocked && !assisted ? ACCEPTANCE_HOLD_ID : undefined} onClick={assisted ? () => void requestAssistance() : submitPrimary}>
                      {busy ? (assisted ? assistedCopy.sending : t.deciding) : assisted ? assistedCopy.askShort : primaryLabel}
                    </button>
                  </div>
                </div>
              </div>
            )}
            {!blocked && !decisionVisible && !(assisted && proposal.assistance?.requestedAt) && <div aria-hidden className="h-40 min-[480px]:h-24" />}

            {dialog && (
              <ProposalDecisionDialog locale={locale} kind={dialog} busy={busy}
                                      onConfirm={(comment) => { setDialog(null); void decide(dialog, comment); }}
                                      onClose={() => setDialog(null)} />
            )}
          </>
        )}

        {phase === "done" && (
          // The same file, one page on: the case, what was recorded, and the real next step.
          <DossierPage className={`mx-auto max-w-xl ${PAGE_PAD}`} kicker={t.caseRef} reference={proposal?.caseNumber ?? summary?.caseNumber}>
            <CircleCheck aria-hidden size={28} className="mt-6 text-brand-600"/>
            {heading(doneCopy.title)}
            <p className="mt-3 max-w-[65ch] text-ink-600">{doneCopy.msg}</p>
          </DossierPage>
        )}
      </div>
    </section>
  );
}

/** The page's padding, read by `.dossier-page` through `--page-pad` (its rule is unlayered, so padding utilities would lose). */
const PAGE_PAD = "[--page-pad:1.25rem] sm:[--page-pad:2rem]";
