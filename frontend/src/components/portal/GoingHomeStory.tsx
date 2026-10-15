"use client";

import { useId, useMemo, type ReactNode } from "react";
import { FileText, Printer } from "lucide-react";

import type { Dictionary } from "@/lib/dictionary";
import { intlLocale, type Locale } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";
import { fillTemplate } from "@/lib/portal-labels";
import type { HandoverLetter, PatientDischargeView, PatientStatement } from "@/components/portal/portal-model";

export type GoingHomeCopy = Dictionary["portalWork"]["myCare"]["goingHome"];
export type StatementCopy = Dictionary["portalWork"]["statement"];
export type LetterCopy = { title: string; hint: string; english: string; arabic: string; print: string };

const words = (table: Record<string, string>, key?: string | null) => key && Object.hasOwn(table, key) ? table[key] : key ?? "";

/**
 * Prints one language of the handover letter on its own page: a blank window written through the DOM (never as markup, so the
 * letter's text cannot become HTML), in the letter's language and direction.
 */
export function printLetter(text: string, lang: "en" | "ar", title: string) {
  const view = window.open("", "_blank");
  if (!view) return;
  view.opener = null;
  const doc = view.document;
  doc.title = title;
  doc.documentElement.lang = lang;
  doc.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  const page = doc.createElement("div");
  page.style.cssText = "white-space:pre-wrap;font:15px/1.6 system-ui,sans-serif;max-width:68ch;margin:2rem auto;padding:0 1rem;color:#111";
  page.textContent = text;
  doc.body.appendChild(page);
  view.focus();
  view.print();
}

/** The generated letter for the home doctor, English and Arabic side by side (stacked on a phone), each printable on its own. */
export function LetterBlock({ copy: t, letter, headingLevel = 3 }: { copy: LetterCopy; letter: HandoverLetter; headingLevel?: 3 | 4 }) {
  const id = useId();
  const Heading = headingLevel === 3 ? "h3" : "h4";
  const versions = ([["en", t.english, letter.english], ["ar", t.arabic, letter.arabic]] as const).filter(([, , text]) => !!text);
  if (versions.length === 0) return null;
  return (
    <section aria-labelledby={`${id}-title`}>
      <Heading id={`${id}-title`} className="text-[0.9375rem] font-bold text-ink-800">{t.title}</Heading>
      <p className="mt-0.5 max-w-[65ch] text-[0.875rem] text-ink-600">{t.hint}</p>
      <details className="mt-1">
        <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-bold text-brand-700">{t.title}</summary>
        <div className="grid gap-4 pb-2 lg:grid-cols-2">
          {versions.map(([lang, label, text]) => (
            <div key={lang} className="min-w-0 rounded-lg border border-line bg-white p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[0.8125rem] font-semibold text-ink-600">{label}</p>
                <button type="button" className="btn-secondary" onClick={() => printLetter(text!, lang, `${t.title} · ${label}`)}>
                  <Printer size={16} aria-hidden/>{t.print}<span className="sr-only">: {label}</span>
                </button>
              </div>
              <p lang={lang} dir={lang === "ar" ? "rtl" : "ltr"} className="mt-2 whitespace-pre-wrap break-words text-[0.875rem] leading-6 text-ink-800">{text}</p>
            </div>
          ))}
        </div>
      </details>
    </section>
  );
}

/**
 * P1-17, the patient's "Going home" (My Care and the verified status link): the warning signs first, then the medicines, the
 * follow-up date, the journey home, the pack documents and the letter for the home doctor. Everything is the backend's
 * record; nothing is inferred here.
 */
export function GoingHomeStory({ locale, copy: t, view, documentNames, documentsAction }: {
  locale: Locale; copy: GoingHomeCopy; view: PatientDischargeView;
  /** File names by document id, where the surface knows the patient's documents. */
  documentNames?: Record<string, string>;
  /** Where the patient finds the documents (My Care's Documents view); absent where the surface has none. */
  documentsAction?: ReactNode;
}) {
  const id = useId();
  const day = useMemo(() => new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "long" }), [locale]);
  const when = useMemo(() => new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "long", timeStyle: "short" }), [locale]);
  if (!view.discharged) return null;
  const section = "mt-5 border-t border-line pt-4";
  return (
    <div>
      {view.warningSigns && (
        <section aria-labelledby={`${id}-warning`} className="rounded-lg border border-alert-200 bg-alert-50 p-4">
          <h3 id={`${id}-warning`} className="text-[0.9375rem] font-bold text-alert-800">{t.warningTitle}</h3>
          <p dir="auto" className="mt-1 max-w-[65ch] whitespace-pre-wrap text-[0.9375rem] leading-7 text-ink-900">{view.warningSigns}</p>
        </section>
      )}

      {view.medications.length > 0 && (
        <section aria-labelledby={`${id}-medicines`} className={view.warningSigns ? section : undefined}>
          <h3 id={`${id}-medicines`} className="text-[0.9375rem] font-bold text-ink-800">{t.medicines}</h3>
          <ul className="mt-2 divide-y divide-line">
            {view.medications.map((m, index) => (
              <li key={`${m.name}-${index}`} className="py-2.5 text-[0.9375rem]">
                <p dir="auto" className="font-semibold text-ink-900">{m.name}</p>
                <dl className="mt-0.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[0.875rem] text-ink-700">
                  <div className="flex gap-1"><dt className="text-ink-500">{t.dose}:</dt><dd dir="auto">{m.dose}</dd></div>
                  <div className="flex gap-1"><dt className="text-ink-500">{t.frequency}:</dt><dd dir="auto">{m.frequency}</dd></div>
                  <div className="flex gap-1"><dt className="text-ink-500">{t.duration}:</dt><dd dir="auto">{m.duration}</dd></div>
                </dl>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(view.followUpDueAt || view.returnMode) && (
        <dl className={`${section} grid gap-4 text-[0.9375rem] sm:grid-cols-2`}>
          {view.followUpDueAt && <div>
            <dt className="font-bold text-ink-800">{t.followUp}</dt>
            <dd className="mt-0.5 text-ink-700">{fillTemplate(t.followUpLine, { mode: words(t.modes, view.followUpMode), date: day.format(new Date(view.followUpDueAt)) })}</dd>
          </div>}
          {view.returnMode && <div>
            <dt className="font-bold text-ink-800">{t.travel}</dt>
            <dd className="mt-0.5 text-ink-700">{view.departed ? t.departed
              : fillTemplate(t.returnLine, { mode: words(t.travelModes, view.returnMode), date: view.returnDepartureAt ? when.format(new Date(view.returnDepartureAt)) : "—" })}</dd>
          </div>}
        </dl>
      )}

      {view.documents.length > 0 && (
        <section aria-labelledby={`${id}-documents`} className={section}>
          <h3 id={`${id}-documents`} className="text-[0.9375rem] font-bold text-ink-800">{t.documents}</h3>
          <ul className="mt-2 space-y-1.5">
            {view.documents.map(doc => (
              <li key={`${doc.kind}-${doc.documentId}`} className="flex items-start gap-2 text-[0.9375rem]">
                <FileText size={17} aria-hidden className="mt-0.5 flex-none text-brand-600"/>
                <span className="min-w-0">
                  <span className="font-semibold text-ink-900">{words(t.kinds, doc.kind)}</span>
                  {documentNames?.[doc.documentId] && <span className="block truncate text-[0.8125rem] text-ink-600" dir="auto">{documentNames[doc.documentId]}</span>}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[0.875rem] text-ink-600">{t.documentsHint}</p>
          {documentsAction}
        </section>
      )}

      {view.handoverLetter && (
        <div className={section}>
          <LetterBlock copy={{ title: t.letter, hint: t.letterHint, english: t.english, arabic: t.arabic, print: t.print }} letter={view.handoverLetter}/>
        </div>
      )}
    </div>
  );
}

/**
 * P1-17, a statement as the backend issued it (the patient's and the staff's): the lines (charges positive, payments negative),
 * the total charged and what is owed either way, in EGP and, at the frozen rate, the patient's currency. No figure is added up
 * here.
 */
export function StatementSheet({ locale, copy: t, statement: s, headingLevel = 3 }: { locale: Locale; copy: StatementCopy; statement: PatientStatement; headingLevel?: 3 | 4 }) {
  const id = useId();
  const Heading = headingLevel === 3 ? "h3" : "h4";
  const issued = useMemo(() => new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "long" }), [locale]);
  const other = s.displayCurrency && s.displayCurrency !== "EGP" ? s.displayCurrency : null;
  const egp = (n: number) => <bdi dir="ltr" className="tabular-nums">{formatMoney(n, "EGP", locale)}</bdi>;
  const shown = (n?: number | null) => other && n != null ? <bdi dir="ltr" className="tabular-nums">{formatMoney(n, other, locale)}</bdi> : null;
  const owed = s.totals.balanceDueEgp > 0 ? { label: t.balanceDue, egp: s.totals.balanceDueEgp, shown: s.totals.balanceDueDisplay }
    : s.totals.creditDueEgp > 0 ? { label: t.creditDue, egp: s.totals.creditDueEgp, shown: s.totals.creditDueDisplay } : null;
  return (
    <section aria-labelledby={`${id}-title`}>
      <Heading id={`${id}-title`} className="text-[0.9375rem] font-bold text-ink-800">
        {fillTemplate(t.number, { number: `⁨${s.statementNumber}⁩` })}
      </Heading>
      <p className="text-[0.8125rem] text-ink-600">{fillTemplate(t.issued, { date: issued.format(new Date(s.issuedAt)) })}</p>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[18rem] text-[0.875rem] tabular-nums">
          <thead className="text-ink-500">
            <tr className="border-b border-line">
              <th scope="col" className="py-1 pe-3 text-start font-semibold">{t.item}</th>
              <th scope="col" className="py-1 pe-3 text-end font-semibold">{t.egp}</th>
              {other && <th scope="col" className="py-1 text-end font-semibold"><bdi dir="ltr">{other}</bdi></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {s.lines.map((line, index) => (
              <tr key={`${line.kind}-${index}`}>
                <td className="py-1.5 pe-3">
                  <span className="text-ink-900">{words(t.lineKinds, line.kind)}</span>
                  {line.description && <span dir="auto" className="block text-[0.8125rem] text-ink-600">{line.description}</span>}
                </td>
                <td className="py-1.5 pe-3 text-end">{egp(line.amountEgp)}</td>
                {other && <td className="py-1.5 text-end">{shown(line.amountDisplay) ?? "—"}</td>}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-line font-bold text-ink-900">
              <th scope="row" className="py-1.5 pe-3 text-start">{t.totalCharged}</th>
              <td className="py-1.5 pe-3 text-end">{egp(s.totals.totalChargedEgp)}</td>
              {other && <td className="py-1.5 text-end">{shown(s.totals.totalChargedDisplay) ?? "—"}</td>}
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[0.9375rem]">
        {owed ? <>
          <span className="font-semibold text-ink-700">{owed.label}</span>
          <span className="font-bold text-ink-900">{egp(owed.egp)}</span>
          {shown(owed.shown) && <span className="text-ink-600">· {shown(owed.shown)}</span>}
        </> : <span className="text-ink-700">{t.settled}</span>}
      </p>
      {other && <p className="mt-1 text-[0.8125rem] text-ink-500">{t.rate}</p>}
    </section>
  );
}
