"use client";

import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { FileText } from "lucide-react";

import { intlLocale, type Locale } from "@/lib/i18n";
import { GUARDIAN_CONSENT, GUARDIAN_CONSENT_VERSION, LEGAL_BASES, type LegalBasis } from "@/lib/guardian";
import { useWorkCopy } from "@/components/portal/portal-copy";
import type { CaseDocument } from "@/components/portal/MyCare";
import type { Mutate } from "@/components/portal/portal-model";
import { CaseDocumentUpload, type Send } from "@/components/portal/CaseDocumentUpload";

type Onboarding = { version: number; subjectType?: string | null; completedConsentTypes?: string[] | null };

/**
 * P1-13 (A-05): the guardian's own step in My Care, asked when the backend's current step is one of the guardian blockers.
 * `MINOR_REQUIRES_GUARDIAN` / `GUARDIAN_AUTH_MISSING`: say how you are related and, if it is already on the case, choose the
 * document that shows it. `GUARDIAN_EVIDENCE_MISSING`: choose that document. The guardian consent is asked alongside while it
 * is not on file. The coordinator then checks the document; nothing here decides whether the guardian counts.
 *
 * Only documents of the case cleared by the scanner can be chosen. The guardian can upload one here (`send`): it is
 * scanned, then offered first and selected. Without `send` they are sent to their coordinator for a secure upload link.
 */
export function GuardianStep({ locale, caseId, blockerCode, documents, busy, mutate, load, send }: {
  locale: Locale; caseId: string; blockerCode: string; documents: CaseDocument[]; busy: boolean; mutate: Mutate;
  load: <T>(path: string) => Promise<T>; send?: Send;
}) {
  const work = useWorkCopy();
  const t = work.safety.guardian;
  const id = useId();
  const [onboarding, setOnboarding] = useState<Onboarding | null | undefined>(undefined);
  const [basis, setBasis] = useState<LegalBasis | "">("");
  const [documentId, setDocumentId] = useState("");
  const [consented, setConsented] = useState(false);
  const [touched, setTouched] = useState(false);
  // Uploaded here and scanned clean; the case's document list catches up on the next reload.
  const [uploaded, setUploaded] = useState<CaseDocument[]>([]);
  const form = useRef<HTMLFormElement>(null);
  const evidenceOnly = blockerCode === "GUARDIAN_EVIDENCE_MISSING";
  const usable = useMemo(() => {
    const own = new Set(uploaded.map(doc => doc.documentId));
    return [...uploaded, ...documents.filter(doc => doc.status === "CLEAN" && !own.has(doc.documentId))];
  }, [documents, uploaded]);
  const dateFormat = useMemo(() => new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "medium" }), [locale]);

  useEffect(() => {
    let live = true;
    load<Onboarding>(`/patient/cases/${caseId}/onboarding`).then(view => { if (live) setOnboarding(view ?? null); }, () => { if (live) setOnboarding(null); });
    return () => { live = false; };
  }, [load, caseId]);

  // The upload control the guardian used may give way to the list: focus follows to the new, selected document.
  useEffect(() => {
    const latest = uploaded[0];
    if (latest) form.current?.querySelector<HTMLInputElement>(`input[value="${latest.documentId}"]`)?.focus();
  }, [uploaded]);

  if (onboarding === undefined) return null;
  if (onboarding === null) return <p role="alert" className="text-[0.9375rem] text-alert-800">{t.loadFailed}</p>;

  const needsConsent = !(onboarding.completedConsentTypes ?? []).includes(GUARDIAN_CONSENT);
  const missingBasis = !evidenceOnly && !basis;
  // Choosing a document is the whole point of the evidence step; when declaring, a document can follow later.
  const missingDocument = evidenceOnly && usable.length > 0 && !documentId;
  const missingConsent = needsConsent && !consented;
  // The evidence step with nothing to choose and no consent owed has nothing to send: the coordinator's link comes first.
  const nothingToSend = evidenceOnly && usable.length === 0 && !needsConsent;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (missingBasis || missingDocument || missingConsent || !onboarding) {
      // The first thing to fix takes focus, in the order the form asks it.
      const first = missingBasis ? `input[name="${id}-basis"]` : missingDocument ? `input[name="${id}-document"]` : `input[type="checkbox"]`;
      form.current?.querySelector<HTMLInputElement>(first)?.focus();
      return;
    }
    // The consent first: it never changes which step the backend asks for, so this form is still on the page for the rest.
    if (needsConsent) {
      const recorded = await mutate(`/patient/cases/${caseId}/onboarding/consents`,
        { consentType: GUARDIAN_CONSENT, exactText: work.guardianConsent, policyVersion: GUARDIAN_CONSENT_VERSION, language: locale });
      if (!recorded) return;
    }
    if (!evidenceOnly && basis) {
      const fresh = needsConsent ? await load<Onboarding>(`/patient/cases/${caseId}/onboarding`).catch(() => onboarding) : onboarding;
      await mutate(`/patient/cases/${caseId}/onboarding/subject`, {
        subjectType: "GUARDIAN", relationship: basis === "PARENT" ? "PARENT" : "GUARDIAN", legalBasis: basis,
        expectedVersion: fresh.version, evidenceDocumentId: documentId || null,
      }, "PUT");
    } else if (documentId) {
      await mutate(`/patient/cases/${caseId}/onboarding/guardian-evidence`, { documentId }, "PUT");
    }
  }

  const error = (show: boolean, key: string, message: string) => touched && show
    ? <p id={`${id}-${key}`} className="error-text mt-2">{message}</p> : null;

  return (
    <form ref={form} className="space-y-6" onSubmit={event => void submit(event)} noValidate>
      {!evidenceOnly && (
        <fieldset aria-describedby={touched && missingBasis ? `${id}-basis` : undefined}>
          <legend className="text-[0.9375rem] font-semibold text-ink-800">{t.basisLegend}</legend>
          <div className="mt-2 grid gap-1 sm:grid-cols-3 sm:gap-3">
            {LEGAL_BASES.map(code => (
              <label key={code} className="flex min-h-11 cursor-pointer items-center gap-3">
                <input type="radio" name={`${id}-basis`} value={code} checked={basis === code} onChange={() => setBasis(code)} className="h-4 w-4 flex-none accent-brand-700"/>
                <span className="text-[0.9375rem] text-ink-800">{t.basis[code]}</span>
              </label>
            ))}
          </div>
          {error(missingBasis, "basis", t.chooseBasis)}
        </fieldset>
      )}

      <fieldset aria-describedby={`${id}-evidence-help${touched && missingDocument ? ` ${id}-document` : ""}`}>
        <legend className="text-[0.9375rem] font-semibold text-ink-800">{t.evidenceLegend}</legend>
        {usable.length === 0
          ? <p id={`${id}-evidence-help`} className="mt-1.5 max-w-[65ch] text-[0.9375rem] leading-6 text-ink-600">{send ? t.upload.none : t.noEvidence}</p>
          : <>
              <p id={`${id}-evidence-help`} className="mt-1 text-[0.875rem] leading-6 text-ink-500">{t.evidenceHelp}</p>
              <ul className="mt-2 divide-y divide-line border-y border-line">
                {usable.map(doc => (
                  <li key={doc.documentId}>
                    <label className="flex min-h-11 cursor-pointer items-center gap-3 py-2.5">
                      <input type="radio" name={`${id}-document`} value={doc.documentId} checked={documentId === doc.documentId} onChange={() => setDocumentId(doc.documentId)} className="h-4 w-4 flex-none accent-brand-700"/>
                      <FileText size={17} aria-hidden className="flex-none text-brand-600"/>
                      <span className="min-w-0 flex-1 truncate font-semibold text-ink-800" dir="auto">{doc.fileName}</span>
                      <span className="flex-none text-[0.8125rem] text-ink-500">{dateFormat.format(new Date(doc.createdAt))}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </>}
        {send && <CaseDocumentUpload caseId={caseId} send={send} lead={usable.length > 0 ? t.upload.another : null} ready={t.upload.ready}
          onUploaded={doc => { setUploaded(current => [doc, ...current]); setDocumentId(doc.documentId); }}/>}
        {error(missingDocument, "document", t.chooseDocument)}
      </fieldset>

      {needsConsent && (
        <fieldset>
          <legend className="text-[0.9375rem] font-semibold text-ink-800">{t.consentLegend}</legend>
          <label className="mt-2 flex cursor-pointer items-start gap-3">
            <input type="checkbox" checked={consented} onChange={event => setConsented(event.target.checked)}
                   aria-invalid={touched && missingConsent ? true : undefined} aria-describedby={touched && missingConsent ? `${id}-consent` : undefined}
                   className="mt-1 h-5 w-5 flex-none accent-brand-700"/>
            <span className="max-w-[65ch] text-[0.9375rem] leading-6 text-ink-700">{work.guardianConsent}</span>
          </label>
          {error(missingConsent, "consent", t.acceptConsent)}
        </fieldset>
      )}

      {!nothingToSend && <button type="submit" className="btn-primary" disabled={busy}>{evidenceOnly && usable.length > 0 ? t.useDocument : t.confirm}</button>}
    </form>
  );
}
