"use client";

import type { Locale } from "@/lib/i18n";
import type { BlockerView } from "@/components/portal/CurrentAction";

type Deposit = { status: string; currency: string; totalDisplay?: number; paidDisplay?: number };

/**
 * Readiness & blockers, compactly: what is still outstanding and whose move each item is. Rendered only
 * while something is outstanding — a case with nothing blocking it shows nothing here. Values come from
 * the backend's action contract; nothing is inferred from unrelated statuses.
 */
export function CaseBlockers({ locale, blockers, deposit }: { locale: Locale; blockers: BlockerView[]; deposit?: Deposit | null }) {
  const ar = locale === "ar";
  if (!blockers.length) return null;
  // Items somebody must act on now; a step queued behind another (the deposit behind the profile) is listed, not counted.
  const attention = blockers.filter(b => b.gating && b.owner !== "LATER").length;
  const money = (n?: number) => n == null ? null : new Intl.NumberFormat(locale, { style: "currency", currency: deposit?.currency || "EGP", maximumFractionDigits: 0 }).format(n);

  return (
    <section aria-labelledby="case-blockers-title" className="mt-3 rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id="case-blockers-title" className="text-[0.7rem] font-bold uppercase tracking-[0.1em] text-amber-900">
          {ar ? "الجاهزية والمعوّقات" : "Readiness & blockers"}
        </h2>
        <p className="text-[0.78rem] font-semibold text-amber-900">
          {attention === 1 ? (ar ? "عنصر واحد يحتاج إلى متابعة" : "1 item needs attention") : ar ? `${attention} عناصر تحتاج إلى متابعة` : `${attention} items need attention`}
        </p>
      </div>
      <ul className="mt-2 divide-y divide-amber-200/70">
        {blockers.map(b => {
          const detail = b.code === "DEPOSIT_UNPAID" && deposit ? depositDetail(deposit, b.owner, money, ar) : ownerLabel(b, ar);
          return (
            <li key={b.code} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-1.5 text-[0.85rem]">
              <span className="font-semibold text-ink-800">{ar ? b.labelAr : b.labelEn}</span>
              <span className={`text-[0.8rem] ${b.owner === "PATIENT" && b.gating ? "font-semibold text-amber-900" : "text-ink-500"}`}>{detail}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ownerLabel(b: BlockerView, ar: boolean) {
  if (b.owner === "PATIENT") return b.gating ? (ar ? "بانتظار المريض" : "Waiting for patient") : (ar ? "قبل تأكيد السفر" : "Before travel is confirmed");
  if (b.owner === "STAFF") return b.gating ? (ar ? "فريقنا" : "Our team") : (ar ? "قيد المراجعة" : "Under review");
  return ar ? "بانتظار الجاهزية" : "Pending readiness";
}

function depositDetail(deposit: Deposit, owner: BlockerView["owner"], money: (n?: number) => string | null, ar: boolean) {
  const status = ({ REQUESTED: ar ? "مطلوبة" : "Requested", PARTIALLY_PAID: ar ? "مدفوعة جزئيًا" : "Partially paid", REQUIRED: ar ? "مطلوبة" : "Required" } as Record<string, string>)[deposit.status] ?? deposit.status;
  const amount = money(deposit.totalDisplay);
  const tail = owner === "LATER" ? (ar ? "بانتظار الجاهزية" : "pending readiness") : (ar ? "للترتيب مع المريض" : "to arrange with the patient");
  return [status, amount, tail].filter(Boolean).join(" · ");
}
