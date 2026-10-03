"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import type { Locale } from "@/lib/i18n";
import { ControlCenterShell } from "./ControlCenterShell";
import { useControlCenterAccess } from "./control-center-access";
import { useAdminApi } from "./admin-api";
import { EmptyState, Field } from "./cc-ui";
import { CareAreaTemplates, ConsultantPriceList, ExchangeRates } from "./catalog-admin";
import { consultantHref, type Consultant } from "./consultant-model";

type PricingView = "consultants" | "templates";

/** Commercial › Price Lists (CONSULTANT_CATALOG_MANAGE): each consultant's EGP price list, and the care-area templates they derive from. */
export function PricingHub({ locale, initialView }: { locale: Locale; initialView?: PricingView }) {
  const ar = locale === "ar";
  const { user, loading: authLoading, signIn } = useAuth();
  const access = useControlCenterAccess();
  const api = useAdminApi();
  const canManage = access.can("CONSULTANT_CATALOG_MANAGE");
  const [view, setView] = useState<PricingView>(initialView ?? "consultants");
  const [consultants, setConsultants] = useState<Consultant[] | null>(null); const [selected, setSelected] = useState("");
  useEffect(() => { if (canManage && view === "consultants") void api<Consultant[]>("/admin/practitioners").then((r) => setConsultants(Array.isArray(r) ? r : [])).catch(() => setConsultants([])); }, [canManage, view, api]);
  const title = ar ? "قوائم الأسعار" : "Price Lists";
  const shell = (body: React.ReactNode) => <ControlCenterShell locale={locale} active="pricing" title={title} intro={ar ? "قائمة أسعار كل استشاري بالجنيه المصري، والقوالب التي تُشتق منها." : "Each consultant's price list in EGP, and the care-area templates they derive from."}>{body}</ControlCenterShell>;
  if (authLoading || access.loading) return shell(<p role="status">{ar ? "جارٍ التحميل…" : "Loading…"}</p>);
  if (!user) return shell(<button onClick={() => void signIn()}>{ar ? "تسجيل الدخول الآمن" : "Sign in securely"}</button>);
  if (!canManage) return shell(<EmptyState title={ar ? "ليس لديك وصول إلى قوائم الأسعار" : "You don't have access to price lists"} />);
  const chosen = consultants?.find((c) => c.id === selected);
  return shell(
    <>
      <div className="cc-segmented" role="group" aria-label={title}>
        <button type="button" aria-pressed={view === "consultants"} onClick={() => setView("consultants")}>{ar ? "أسعار الاستشاريين" : "Consultant prices"}</button>
        <button type="button" aria-pressed={view === "templates"} onClick={() => setView("templates")}>{ar ? "قوالب مجالات الرعاية" : "Care-area templates"}</button>
      </div>
      {view === "consultants" && (consultants === null ? <p role="status">{ar ? "جارٍ التحميل…" : "Loading…"}</p> : <>
        <div className="cc-filterbar"><Field label={ar ? "الاستشاري" : "Consultant"}>
          <select value={selected} onChange={(e) => setSelected(e.target.value)}><option value="">{consultants.length ? (ar ? "اختر استشاريًا" : "Choose a consultant") : (ar ? "لا يوجد استشاريون" : "No consultants")}</option>{consultants.map((c) => <option key={c.id} value={c.id}>{c.displayName ?? c.id}</option>)}</select>
        </Field></div>
        {chosen ? <>
          <p className="cc-meta"><Link href={consultantHref(locale, chosen.id, "prices")}>{ar ? "فتح صفحة الاستشاري" : "Open the consultant's page"}</Link></p>
          <ConsultantPriceList key={chosen.id} locale={locale} api={api} practitionerId={chosen.id} careArea={chosen.careCategory} editable={canManage} />
        </> : <EmptyState title={ar ? "اختر استشاريًا لعرض قائمة أسعاره" : "Choose a consultant to see their price list"} body={ar ? "قائمة الأسعار بالجنيه المصري، ومشتقة من قالب مجال رعايته." : "The price list is in EGP and derived from their care-area template."} />}
      </>)}
      {view === "templates" && <CareAreaTemplates locale={locale} api={api} editable={canManage} />}
    </>
  );
}

/** Commercial › Exchange Rates: read with reference data; pinning a rate is a commercial-policy change (Finance). */
export function ExchangeRatesPage({ locale }: { locale: Locale }) {
  const ar = locale === "ar";
  const { user, loading: authLoading, signIn } = useAuth();
  const access = useControlCenterAccess();
  const api = useAdminApi();
  const title = ar ? "أسعار الصرف" : "Exchange Rates";
  const shell = (body: React.ReactNode) => <ControlCenterShell locale={locale} active="exchangeRates" title={title} intro={ar ? "أسعار يومية مخزّنة لتحويل الأسعار بالجنيه المصري إلى عملات أخرى. يحتفظ كل عرض بالسعر المجمَّد يوم إرساله." : "Stored daily rates for showing EGP prices in other currencies. Every proposal keeps the rate frozen on the day it was sent."}>{body}</ControlCenterShell>;
  if (authLoading || access.loading) return shell(<p role="status">{ar ? "جارٍ التحميل…" : "Loading…"}</p>);
  if (!user) return shell(<button onClick={() => void signIn()}>{ar ? "تسجيل الدخول الآمن" : "Sign in securely"}</button>);
  if (!access.can("REFERENCE_DATA_READ")) return shell(<EmptyState title={ar ? "ليس لديك وصول إلى أسعار الصرف" : "You don't have access to exchange rates"} />);
  return shell(<ExchangeRates locale={locale} api={api} editable={access.can("COMMERCIAL_POLICY_MANAGE")} />);
}
