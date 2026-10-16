"use client";

import { Fragment, useId, useState, type ReactNode } from "react";

import type { Locale } from "@/lib/i18n";
import { formatMoney, parseAmount } from "@/lib/money";
import type { DirectoryFacility, DirectoryPackage } from "@/components/portal/portal-model";

const BASE = "EGP";

/** A Finance-approved package with the facility it belongs to. */
export type PackageOption = DirectoryPackage & { facilityId: string; facilityName: string };
/** A picked package with the consultant's expected EGP figure. */
export type PackageLine = PackageOption & { amountEgp: number };

export function facilityPackages(facilities: DirectoryFacility[]): PackageOption[] {
  return facilities.flatMap(f => f.packages.map(p => ({ ...p, facilityId: f.id, facilityName: f.name })));
}

/** The picked lines, their EGP total, and whether every expected figure sits inside its approved range (the server refuses otherwise). */
export function facilityPackageLines(packages: PackageOption[], picks: Map<string, number>) {
  const lines: PackageLine[] = packages.filter(p => picks.has(p.id)).map(p => ({ ...p, amountEgp: picks.get(p.id) ?? p.minEgp }));
  return {
    lines,
    total: lines.reduce((sum, p) => sum + p.amountEgp, 0),
    inRange: lines.every(p => p.amountEgp >= p.minEgp && p.amountEgp <= p.maxEgp),
  };
}

/** The cost-estimate line the backend expects for a package: an EGP figure inside the range, naming the package. */
export function packageEstimate(line: PackageLine) {
  return { serviceDescription: `${line.name} — ${line.facilityName}`, estimatedCost: line.amountEgp, currency: BASE, facilityPackageId: line.id };
}

export type PackagePickerLabels = { title: string; hint: string; expected: string; outOfRange: string; /** "{min} – {max}"; each figure is isolated. */ range: string };

/** A template with React nodes for its placeholders (amounts stay isolated runs inside an Arabic sentence). */
function fillNodes(template: string, values: Record<string, ReactNode>) {
  return template.split(/(\{\w+\})/).map((part, index) => {
    const key = /^\{(\w+)\}$/.exec(part)?.[1];
    return key && key in values ? <Fragment key={index}>{values[key]}</Fragment> : part;
  });
}

/**
 * P0-5 (B-02): the consultant picks Finance-approved facility packages (hospital, theatre, ICU, implants) and sets the expected
 * EGP figure inside each approved range. Shared by the clinical review and the final in-person assessment (one picker, UX 3-1),
 * so the range rule lives once. The figure is typed as text (Western or Arabic-Indic digits) and kept as typed; it is checked
 * when the field is left or when the decision is sent (`showErrors`), not at every keystroke. Renders nothing without packages.
 */
export function FacilityPackagePicker({ locale, packages, picks, onToggle, onAmount, labels, showErrors = false }: {
  locale: Locale; packages: PackageOption[]; picks: Map<string, number>;
  onToggle: (id: string, minEgp: number) => void; onAmount: (id: string, amount: number) => void; labels: PackagePickerLabels;
  /** The decision was sent with a figure outside its range: say it at every such figure. */ showErrors?: boolean;
}) {
  const id = useId();
  const [typed, setTyped] = useState<Map<string, string>>(new Map());
  const [left, setLeft] = useState<Set<string>>(new Set());
  if (packages.length === 0) return null;
  const egp = (amount: number) => <bdi dir="ltr">{formatMoney(amount, BASE, locale)}</bdi>;
  // The same hairline list as the approved services (UX 3-1): a checked box says "picked"; no tinted card per row.
  return (
    <div className="mt-4">
      <h5 id={`${id}-title`} className="text-[0.875rem] font-bold text-ink-800">{labels.title}</h5>
      <p className="mt-0.5 max-w-[65ch] text-[0.875rem] leading-6 text-ink-600">{labels.hint}</p>
      <ul aria-labelledby={`${id}-title`} className="mt-1 divide-y divide-line border-y border-line">
        {packages.map(pkg => {
          const on = picks.has(pkg.id);
          const amount = picks.get(pkg.id) ?? pkg.minEgp;
          const inRange = amount >= pkg.minEgp && amount <= pkg.maxEgp;
          const said = !inRange && (showErrors || left.has(pkg.id));
          const field = `${id}-${pkg.id}`;
          return (
            <li key={pkg.id} className="py-2">
              <label className="flex min-h-11 cursor-pointer items-center gap-3">
                <input type="checkbox" className="h-4 w-4 flex-none accent-brand-600" checked={on} onChange={() => onToggle(pkg.id, pkg.minEgp)}/>
                <span className="min-w-0 flex-1">
                  <span dir="auto" className="block text-[0.9375rem] font-semibold text-ink-900">{pkg.name}</span>
                  <span className="block text-[0.8125rem] text-ink-500"><bdi>{pkg.facilityName}</bdi></span>
                </span>
                <span id={`${field}-range`} className="flex-none whitespace-nowrap text-end text-[0.8125rem] tabular-nums text-ink-600">
                  {fillNodes(labels.range, { min: egp(pkg.minEgp), max: egp(pkg.maxEgp) })}
                </span>
              </label>
              {on && (
                <div className="mt-1 ps-7">
                  <label htmlFor={field} className="block text-[0.875rem] font-bold text-ink-800">{labels.expected}</label>
                  <input id={field} className={`field mt-1 w-full max-w-60 ${said ? "field-error" : ""}`} type="text" inputMode="numeric" dir="ltr" autoComplete="off"
                         data-out-of-range={inRange ? undefined : ""} value={typed.get(pkg.id) ?? String(amount)} aria-invalid={said || undefined}
                         aria-describedby={said ? `${field}-range ${field}-error` : `${field}-range`}
                         onChange={event => { const raw = event.target.value; setTyped(map => new Map(map).set(pkg.id, raw)); const value = parseAmount(raw); onAmount(pkg.id, Number.isFinite(value) ? value : 0); }}
                         onBlur={() => setLeft(set => new Set(set).add(pkg.id))}/>
                  {said && <p id={`${field}-error`} className="error-text mt-1">{labels.outOfRange}</p>}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
