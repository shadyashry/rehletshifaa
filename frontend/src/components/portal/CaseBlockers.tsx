"use client";

import { Clock } from "lucide-react";

import type { Locale } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";
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
  const money = (n?: number) => n == null ? null : formatMoney(n, deposit?.currency || "EGP", locale);

  return (
    <section aria-labelledby="case-blockers-title" className="mt-3 rounded-lg border border-status-warning-border bg-status-warning-surface px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id="case-blockers-title" className="label-micro flex items-center gap-1.5 text-status-warning-fg">
          <Clock size={14} strokeWidth={2.25} aria-hidden/>{ar ? "الجاهزية والمعوّقات" : "Readiness & blockers"}
        </h2>
        <p className="text-[0.8125rem] font-semibold text-status-warning-fg">
          {attention === 1 ? (ar ? "عنصر واحد يحتاج إلى متابعة" : "1 item needs attention") : ar ? `${attention} عناصر تحتاج إلى متابعة` : `${attention} items need attention`}
        </p>
      </div>
      <ul className="mt-2 divide-y divide-status-warning-border">
        {blockers.map(b => {
          const detail = b.code === "DEPOSIT_UNPAID" && deposit ? depositDetail(deposit, b.owner, money, ar) : ownerLabel(b, ar);
          return (
            <li key={b.code} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-1.5 text-[0.85rem]">
              <span className="font-semibold text-ink-800">{ar ? b.labelAr : b.labelEn}</span>
              <span className={`text-[0.8rem] ${b.owner === "PATIENT" && b.gating ? "font-semibold text-status-warning-fg" : "text-ink-600"}`}>{detail}</span>
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
