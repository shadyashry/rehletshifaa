import type { Dictionary } from "@/lib/dictionary";
import { intlLocale, type Locale } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";
import { fillTemplate } from "@/lib/portal-labels";

/** The bar's words, from messages/{en,ar}.json (`portalWork.myCare.estimate.bar`), passed in by the page that draws it. */
export type EstimateBarCopy = Dictionary["portalWork"]["myCare"]["estimate"]["bar"];
/** A priced line as both the proposal link and My Care receive it. */
export type EstimateLine = { category?: string | null; quantity: number; unitPrice: number; optional: boolean };
type Part = { category: string; amount: number };

/** One shade per category (petrol-700 / 400 / 200); more categories than shades are not split. */
const SHADES = 3;

/**
 * The expected total split by category, in the order the lines were listed, or an empty list when there is nothing
 * honest to split: fewer than two categories, a line without one, or more categories than shades. Optional lines are
 * left out, as the totals leave them out; the platform's fee line (PLATFORM_FEE) is in the totals, so it is a part.
 */
export function estimateParts(items: readonly EstimateLine[]): Part[] {
  const sums = new Map<string, number>();
  for (const item of items) {
    if (item.optional) continue;
    const category = item.category?.trim() ?? "";
    sums.set(category, (sums.get(category) ?? 0) + item.quantity * item.unitPrice);
  }
  if (sums.size < 2 || sums.size > SHADES || sums.has("")) return [];
  const parts = [...sums].map(([category, amount]) => ({ category, amount }));
  return parts.every(part => part.amount > 0) ? parts : [];
}

/** A category in the patient's words: the backend's own codes are worded, anything else is shown as entered. */
export function categoryLabel(category: string, copy: EstimateBarCopy): string {
  return (copy.categories as Record<string, string>)[category] ?? category;
}

/**
 * UX 1c-2: the estimate on one scale from zero to the top of its range — the expected total filled and split by
 * category, a marker at the expected figure, the range bracketed above (only when a range exists) and the coordination
 * deposit bracketed in coral below (only when its amount is known). The bar is an image with one sentence; the legend
 * under it is the same facts as a readable list, so nothing is carried by the drawing alone.
 */
export function EstimateRangeBar({ items, expected, min, max, deposit, kind = "estimate", currency, locale, copy, className = "" }: {
  items: readonly EstimateLine[];
  /** The expected total as the backend computed it (the sum of the lines shown). */
  expected: number;
  /** The lowest and highest totals; no range, no bracket. */
  min?: number | null; max?: number | null;
  /** The coordination deposit in the same currency; no amount, no bracket. */
  deposit?: number | null;
  /** Which document the figures belong to: a final quote's total is its price, never "estimated". */
  kind?: "estimate" | "quote";
  currency: string; locale: Locale; copy: EstimateBarCopy; className?: string;
}) {
  const range = min != null && max != null && max > min ? { min, max } : null;
  const depositShown = deposit != null && deposit > 0 ? deposit : null;
  const scale = Math.max(expected, range?.max ?? 0, depositShown ?? 0);
  if (!(expected > 0) || !(scale > 0)) return null;

  const parts = estimateParts(items);
  const partsTotal = parts.reduce((sum, part) => sum + part.amount, 0);
  const at = (amount: number) => `${(amount / scale) * 100}%`;
  const money = (amount: number) => formatMoney(amount, currency, locale);
  const figure = (amount: number) => <bdi dir="ltr" className="tabular-nums">{money(amount)}</bdi>;
  const totalName = range ? copy.expected : kind === "quote" ? copy.finalTotal : copy.total;

  const sentence = [
    range ? fillTemplate(copy.chart.range, { min: money(range.min), max: money(range.max), expected: money(expected) })
      : fillTemplate(copy.chart.total, { label: totalName, expected: money(expected) }),
    parts.length ? fillTemplate(copy.chart.parts, { parts: new Intl.ListFormat(intlLocale(locale), { type: "conjunction" })
      .format(parts.map(part => `${categoryLabel(part.category, copy)} ${money(part.amount)}`)) }) : null,
    depositShown != null ? fillTemplate(copy.chart.deposit, { deposit: money(depositShown) }) : null,
  ].filter(Boolean).join(" ");

  return (
    <div className={`est ${className}`}>
      <div role="img" aria-label={sentence} className="est-bar" data-range={range ? "" : undefined} data-deposit={depositShown != null ? "" : undefined}>
        <div className="est-scale">
          <div className="est-track">
            {/* The filled share is the expected total; what is left of the track is the room up to the top of the range. */}
            <div className="est-fill" style={{ inlineSize: at(expected) }}>
              {parts.length
                ? parts.map((part, index) => <span key={part.category} className="est-seg" data-shade={index} style={{ inlineSize: `${(part.amount / partsTotal) * 100}%` }}/>)
                : <span className="est-seg" data-shade={0} style={{ inlineSize: "100%" }}/>}
            </div>
          </div>
          <span className="est-expected" style={{ insetInlineStart: at(expected) }}/>
          {range && <>
            <span className="est-range" style={{ insetInlineStart: at(range.min), inlineSize: at(range.max - range.min) }}/>
            <span className="est-mark est-mark-range">{copy.rangeMark}<span className="est-mark-figures"> {figure(range.min)} {copy.to} {figure(range.max)}</span></span>
          </>}
          {depositShown != null && <>
            <span className="est-deposit" style={{ inlineSize: at(depositShown) }}/>
            <span className="est-mark est-mark-deposit">{copy.depositMark} {figure(depositShown)}</span>
          </>}
        </div>
      </div>

      <dl className="est-legend mt-4">
        {parts.map((part, index) => (
          <div key={part.category}>
            <dt><span aria-hidden className="est-key" data-shade={index}/><span dir="auto">{categoryLabel(part.category, copy)}</span></dt>
            <dd>{figure(part.amount)}</dd>
          </div>
        ))}
        <div data-strong="">
          <dt><span aria-hidden className="est-key est-key-expected"/><span>{totalName}</span></dt>
          <dd>{figure(expected)}</dd>
        </div>
        {range && (
          <div>
            <dt><span aria-hidden className="est-key est-key-range"/><span>{copy.range}</span></dt>
            <dd>{figure(range.min)} {copy.to} {figure(range.max)}</dd>
          </div>
        )}
        {depositShown != null && (
          <div>
            <dt><span aria-hidden className="est-key est-key-deposit"/><span>{copy.deposit}<span className="est-note">{copy.depositNote}</span></span></dt>
            <dd>{figure(depositShown)}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}
