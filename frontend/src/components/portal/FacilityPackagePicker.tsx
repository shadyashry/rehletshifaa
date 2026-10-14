"use client";

import type { Locale } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";
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

export type PackagePickerLabels = { title: string; hint: string; expected: string; outOfRange: string };

/**
 * P0-5 (B-02): the consultant picks Finance-approved facility packages (hospital, theatre, ICU, implants) and sets the expected
 * EGP figure inside each approved range. Shared by the clinical review and the final in-person assessment, so the range rule
 * lives once. Renders nothing when no facility offers a priceable package.
 */
export function FacilityPackagePicker({ locale, packages, picks, onToggle, onAmount, labels }: {
  locale: Locale; packages: PackageOption[]; picks: Map<string, number>;
  onToggle: (id: string, minEgp: number) => void; onAmount: (id: string, amount: number) => void; labels: PackagePickerLabels;
}) {
  if (packages.length === 0) return null;
  return (
    <div className="mt-4">
      <h4 className="label-micro text-brand-700">{labels.title}</h4>
      <p className="mt-1 text-[0.8rem] leading-6 text-ink-600">{labels.hint}</p>
      <ul className="mt-2 space-y-1">
        {packages.map(pkg => {
          const on = picks.has(pkg.id);
          const amount = picks.get(pkg.id) ?? pkg.minEgp;
          const inRange = amount >= pkg.minEgp && amount <= pkg.maxEgp;
          return (
            <li key={pkg.id} className={`rounded-lg border p-2.5 transition ${on ? "border-brand-500 bg-brand-50" : "border-line"}`}>
              <label className="flex cursor-pointer items-center gap-3">
                <input type="checkbox" className="h-4 w-4 flex-none accent-brand-600" checked={on} onChange={() => onToggle(pkg.id, pkg.minEgp)}/>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.9rem] font-semibold text-ink-900">{pkg.name}</span>
                  <span className="block text-[0.8125rem] text-ink-500">{pkg.facilityName} · <bdi dir="ltr">{pkg.procedureCode}</bdi></span>
                </span>
                <span className="flex-none whitespace-nowrap text-end text-[0.8125rem] text-ink-600">
                  <bdi dir="ltr">{formatMoney(pkg.minEgp, BASE, locale)} – {formatMoney(pkg.maxEgp, BASE, locale)}</bdi>
                </span>
              </label>
              {on && (
                <label className="mt-2 block text-[0.8rem] font-bold text-ink-700">{labels.expected}
                  <input className="field mt-1" type="number" min={pkg.minEgp} max={pkg.maxEgp} step="1" value={amount} aria-invalid={!inRange}
                         onChange={event => onAmount(pkg.id, Number(event.target.value) || 0)}/>
                  {!inRange && <span className="mt-1 block font-semibold text-alert-700">{labels.outOfRange}</span>}
                </label>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
