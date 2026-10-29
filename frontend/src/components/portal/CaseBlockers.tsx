"use client";

import { Clock } from "lucide-react";

import type { Locale } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";
import type { BlockerView } from "@/components/portal/CurrentAction";

type Deposit = { status: string; currency: string; totalDisplay?: number; paidDisplay?: number; balanceDisplay?: number; transfer?: { status: string } | null };

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

/** QA W-22: where the payment stands — queued behind readiness, the patient's to pay, Finance checking the reference, or a balance due. */
function depositDetail(deposit: Deposit, owner: BlockerView["owner"], money: (n?: number) => string | null, ar: boolean) {
  if (owner === "STAFF") return ar ? "وصل الرقم المرجعي للتحويل · يتحقق منه الفريق المالي" : "Transfer reference received · Finance is checking it";
  const partial = deposit.status === "PARTIALLY_PAID";
  const status = partial ? (ar ? "مدفوعة جزئيًا" : "Partially paid") : (ar ? "مطلوبة" : "Requested");
  const amount = money(partial ? deposit.balanceDisplay : deposit.totalDisplay);
  if (owner === "LATER") return [status, amount, ar ? "بانتظار الجاهزية" : "pending readiness"].filter(Boolean).join(" · ");
  if (deposit.transfer?.status === "REJECTED") return ar ? "لم يُؤكَّد الرقم المرجعي · بانتظار أن يعيد المريض إرساله" : "Reference not confirmed · waiting for the patient to resend it";
  const tail = partial ? (ar ? "متبقٍ على المريض" : "still due from the patient") : (ar ? "بانتظار دفع المريض" : "waiting for the patient's payment");
  return [status, amount, tail].filter(Boolean).join(" · ");
}
