"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, Plus } from "lucide-react";
import type { Locale } from "@/lib/i18n";
import type { AdminApi } from "./admin-api";
import { ActionMenu, EmptyState, ErrorNotice, Field, SectionTabs, StatusBadge, SuccessNotice } from "./cc-ui";
import { careAreaLabel } from "./admin-labels";

/*
 * Consultant price lists and credential approval, care-area service templates and exchange rates
 * (`/admin/practitioners/**`, `/admin/service-templates/**`, `/admin/fx-rates/**`).
 */

type CatalogService = { id: string; serviceCode: string; serviceName: string; category?: string; priceEgp: number; active: boolean };
type FxRate = { currency: string; rate: number; rateDate: string; source: string };
type ImportRow = { line: number; serviceCode: string; serviceName: string; category?: string; priceEgp?: number; action: string; message?: string };
type ImportResult = { committed: boolean; added: number; updated: number; unchanged: number; errors: number; rows: ImportRow[] };
type Template = { id: string; careCategory: string; name: string; referenceStandard?: string; guidanceNote?: string };
type TemplateItem = { serviceCode: string; serviceName: string; category?: string; suggestedPriceEgp?: number; sortOrder: number; active: boolean };

const CURRENCY_NAMES: Record<string, [string, string]> = { USD: ["US Dollar", "دولار أمريكي"], EUR: ["Euro", "يورو"], EGP: ["Egyptian Pound", "جنيه مصري"], AED: ["UAE Dirham", "درهم إماراتي"], SAR: ["Saudi Riyal", "ريال سعودي"], GBP: ["British Pound", "جنيه إسترليني"], KWD: ["Kuwaiti Dinar", "دينار كويتي"], QAR: ["Qatari Riyal", "ريال قطري"], JOD: ["Jordanian Dinar", "دينار أردني"] };
const currencyName = (c: string, locale: Locale) => `${c} — ${CURRENCY_NAMES[c]?.[locale === "ar" ? 1 : 0] ?? c}`;
export function money(amount: number, currency: string, locale: Locale) { try { return new Intl.NumberFormat(locale, { style: "currency", currency }).format(amount); } catch { return `${amount.toLocaleString(locale)} ${currency}`; } }
const json = (method: string, body?: unknown) => ({ method, ...(body !== undefined ? { body } : {}) });

/** One direct consultant's own EGP price list: derive from the care-area template, edit, import from CSV, view in other currencies. */
export function ConsultantPriceList({ locale, api, practitionerId, careArea, editable }: { locale: Locale; api: AdminApi; practitionerId: string; careArea?: string; editable: boolean }) {
  const ar = locale === "ar";
  const base = `/admin/practitioners/${practitionerId}/catalog`;
  const [rows, setRows] = useState<CatalogService[] | null>(null); const [fx, setFx] = useState<FxRate[]>([]);
  const [busy, setBusy] = useState(false); const [notice, setNotice] = useState(""); const [error, setError] = useState<unknown>(null);
  const [display, setDisplay] = useState("EGP"); const [importFile, setImportFile] = useState<File | null>(null); const [preview, setPreview] = useState<ImportResult | null>(null); const [adding, setAdding] = useState(false);
  const read = useCallback(() => Promise.all([api<CatalogService[]>(base), api<FxRate[]>("/admin/fx-rates")]), [api, base]);
  const load = useCallback(async () => { try { const [cat, rates] = await read(); setRows(cat); setFx(rates); } catch (e) { setError(e); setRows([]); } }, [read]);
  useEffect(() => {
    let live = true;
    read().then(([cat, rates]) => { if (live) { setRows(cat); setFx(rates); } }, (e) => { if (live) { setError(e); setRows([]); } });
    return () => { live = false; };
  }, [read]);
  const run = async (work: () => Promise<unknown>, done = ar ? "تم الحفظ." : "Saved.") => { setBusy(true); setError(null); setNotice(""); try { await work(); setNotice(done); await load(); return true; } catch (e) { setError(e); return false; } finally { setBusy(false); } };
  const patch = (id: string, field: keyof CatalogService, value: string | number | boolean) => setRows((rs) => rs?.map((r) => (r.id === id ? { ...r, [field]: value } : r)) ?? null);
  const upload = async (file: File, commit: boolean) => {
    setBusy(true); setError(null); setNotice("");
    try { const fd = new FormData(); fd.append("file", file); const res = await api<ImportResult>(`${base}/import?commit=${commit}`, { method: "POST", raw: fd }); if (commit) { setNotice(`${ar ? "تم الاستيراد" : "Imported"}: +${res.added} · ~${res.updated}`); setPreview(null); setImportFile(null); await load(); } else setPreview(res); }
    catch (e) { setError(e); } finally { setBusy(false); }
  };
  const downloadTemplate = () => { const csv = "service_code,service_name,category,price_egp,active\nCARD-CONSULT,Diagnostic cardiology consultation,Consultation,3500,true\nCARD-ECHO,Transthoracic echocardiogram,Diagnostics,4500,true\n"; const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); const a = document.createElement("a"); a.href = url; a.download = "price-list-template.csv"; a.click(); URL.revokeObjectURL(url); };
  if (rows === null) return <p role="status">{ar ? "جارٍ تحميل قائمة الأسعار…" : "Loading price list…"}</p>;
  const currencies = ["EGP", ...fx.filter((f) => f.currency !== "EGP").map((f) => f.currency)];
  const rate = display === "EGP" ? 1 : fx.find((f) => f.currency === display)?.rate ?? null;
  return (
    <div>
      <SuccessNotice>{notice || null}</SuccessNotice>
      <ErrorNotice error={error} locale={locale} />
      <div className="cc-section-head">
        <div><p className="cc-meta">{ar ? "الأسعار الأساسية بالجنيه المصري وتظهر فورًا في صفحة الطبيب." : "Base prices are in EGP and show on the doctor's page immediately."}</p></div>
        {editable && <div className="cc-section-actions">
          <button type="button" className="cc-small" disabled={busy} onClick={() => setAdding(true)}><Plus size={15} aria-hidden />{ar ? "إضافة خدمة" : "Add service"}</button>
          <ActionMenu label={ar ? "خيارات قائمة الأسعار" : "Price list options"} actions={[
            { label: ar ? `اشتقاق من قالب ${careAreaLabel(careArea, locale)}` : `Derive from the ${careAreaLabel(careArea, locale)} template`, onSelect: () => void run(() => api(`${base}/derive`, json("POST"))), disabled: busy },
            { label: ar ? "تنزيل نموذج CSV" : "Download CSV template", onSelect: downloadTemplate },
          ]} />
        </div>}
      </div>
      {adding && editable && (
        <form className="cc-card" style={{ marginBottom: 16 }} onSubmit={(e) => { e.preventDefault(); const f = e.currentTarget, d = new FormData(f); void run(() => api(base, json("POST", { serviceCode: String(d.get("code")).trim(), serviceName: String(d.get("name")).trim(), category: String(d.get("category") || "").trim() || undefined, priceEgp: Number(d.get("price")) || 0, active: true }))).then((ok) => { if (ok) { f.reset(); setAdding(false); } }); }}>
          <div className="cc-form-grid">
            <Field label={ar ? "اسم الخدمة" : "Service name"} required><input name="name" required /></Field>
            <Field label={ar ? "رمز الخدمة" : "Service code"} hint={ar ? "رمز ثابت لا يتغير" : "A stable code that never changes"} required><input name="code" dir="ltr" required /></Field>
            <Field label={ar ? "الفئة" : "Category"} optionalLabel={ar ? "اختياري" : "optional"}><input name="category" /></Field>
            <Field label={ar ? "السعر (ج.م)" : "Price (EGP)"} required><input name="price" type="number" min="0" step="0.01" dir="ltr" required /></Field>
          </div>
          <div className="cc-form-actions"><button disabled={busy}>{ar ? "إضافة الخدمة" : "Add service"}</button><button type="button" className="cc-secondary" onClick={() => setAdding(false)}>{ar ? "إلغاء" : "Cancel"}</button></div>
        </form>
      )}
      {!rows.length ? <EmptyState title={ar ? "لا توجد قائمة أسعار بعد" : "No price list yet"} body={ar ? "اشتقّها من قالب مجال الرعاية أو أضف خدمة." : "Derive it from the care-area template, or add a service."} action={editable ? <button type="button" disabled={busy} onClick={() => void run(() => api(`${base}/derive`, json("POST")))}>{ar ? "اشتقاق من القالب" : "Derive from template"}</button> : undefined} /> : <>
        {currencies.length > 1 && <label className="cc-filterbar" style={{ alignItems: "center" }}><span>{ar ? "عرض الأسعار بعملة" : "View prices in"}</span><select style={{ maxWidth: 240 }} value={display} onChange={(e) => setDisplay(e.target.value)}>{currencies.map((c) => <option key={c} value={c}>{currencyName(c, locale)}</option>)}</select></label>}
        <div className="cc-table-wrap"><table className="cc-data">
          <thead><tr><th>{ar ? "الخدمة" : "Service"}</th><th>{ar ? "الفئة" : "Category"}</th><th>{ar ? "السعر (ج.م)" : "Price (EGP)"}</th><th>{ar ? "مفعّلة" : "Active"}</th>{editable && <th><span className="cc-sr">{ar ? "إجراءات" : "Actions"}</span></th>}</tr></thead>
          <tbody>{rows.map((r) => <tr key={r.id}>
            <td>{editable ? <input aria-label={ar ? "اسم الخدمة" : "Service name"} value={r.serviceName} onChange={(e) => patch(r.id, "serviceName", e.target.value)} /> : r.serviceName}<span className="cc-row-sub" dir="ltr">{r.serviceCode}</span></td>
            <td>{editable ? <input aria-label={ar ? "الفئة" : "Category"} value={r.category ?? ""} onChange={(e) => patch(r.id, "category", e.target.value)} /> : r.category}</td>
            <td>{editable ? <input aria-label={ar ? "السعر" : "Price"} type="number" min="0" step="0.01" dir="ltr" value={r.priceEgp} onChange={(e) => patch(r.id, "priceEgp", Number(e.target.value))} /> : money(r.priceEgp, "EGP", locale)}{display !== "EGP" && rate && <span className="cc-row-sub">≈ {money(r.priceEgp * rate, display, locale)}</span>}</td>
            <td><input type="checkbox" aria-label={ar ? "مفعّلة" : "Active"} checked={r.active} disabled={!editable} onChange={(e) => patch(r.id, "active", e.target.checked)} /></td>
            {editable && <td><span className="cc-row-actions"><button type="button" className="cc-secondary cc-small" disabled={busy} onClick={() => void run(() => api(`${base}/${r.id}`, json("PUT", { serviceCode: r.serviceCode, serviceName: r.serviceName, category: r.category, priceEgp: r.priceEgp, active: r.active })))}>{ar ? "حفظ" : "Save"}</button>
              <ActionMenu label={ar ? "إجراءات الخدمة" : "Service actions"} actions={[{ label: ar ? "إيقاف الخدمة" : "Deactivate service", destructive: true, disabled: busy, onSelect: () => void run(() => api(`${base}/${r.id}`, json("DELETE"))) }]} /></span></td>}
          </tr>)}</tbody>
        </table></div>
      </>}
      {editable && <details className="cc-technical" style={{ marginTop: 20 }}>
        <summary>{ar ? "استيراد قائمة أسعار من ملف CSV" : "Import a price list from CSV"}</summary>
        <p className="cc-meta">{ar ? "احفظ الملف من إكسل بصيغة CSV بالأعمدة: service_code, service_name, category, price_egp, active. ستظهر معاينة قبل التطبيق." : "Save your sheet as CSV with the columns service_code, service_name, category, price_egp, active. You'll see a preview before anything changes."} <button type="button" className="cc-link" onClick={downloadTemplate}><Download size={14} aria-hidden /> {ar ? "تنزيل النموذج" : "Download template"}</button></p>
        <label>{ar ? "ملف CSV" : "CSV file"}<input type="file" accept=".csv,text/csv" onChange={(e) => { const f = e.target.files?.[0] ?? null; setImportFile(f); setPreview(null); if (f) void upload(f, false); }} /></label>
        {preview && <div className="cc-card">
          <p><strong>{ar ? "معاينة الاستيراد" : "Import preview"}</strong> — {ar ? "جديد" : "new"} {preview.added} · {ar ? "محدّث" : "updated"} {preview.updated} · {ar ? "دون تغيير" : "unchanged"} {preview.unchanged}{preview.errors > 0 && <> · <StatusBadge tone="danger">{ar ? "أخطاء" : "errors"} {preview.errors}</StatusBadge></>}</p>
          <div className="cc-table-wrap" style={{ maxHeight: 260, overflow: "auto" }}><table className="cc-data"><thead><tr><th>{ar ? "سطر" : "Line"}</th><th>{ar ? "الرمز" : "Code"}</th><th>{ar ? "الخدمة" : "Service"}</th><th>{ar ? "السعر" : "Price"}</th><th>{ar ? "الإجراء" : "Action"}</th></tr></thead>
            <tbody>{preview.rows.map((row, i) => <tr key={i}><td>{row.line}</td><td dir="ltr">{row.serviceCode}</td><td>{row.serviceName}</td><td>{row.priceEgp != null ? money(row.priceEgp, "EGP", locale) : "—"}</td><td><StatusBadge tone={row.action === "ERROR" ? "danger" : row.action === "NEW" ? "success" : row.action === "UPDATE" ? "info" : "neutral"}>{row.action}</StatusBadge>{row.message && <span className="cc-row-sub">{row.message}</span>}</td></tr>)}</tbody></table></div>
          <div className="cc-form-actions"><button type="button" disabled={busy || !importFile || preview.added + preview.updated === 0} onClick={() => { if (importFile) void upload(importFile, true); }}>{ar ? "تأكيد الاستيراد" : "Confirm import"} (+{preview.added} · ~{preview.updated})</button><button type="button" className="cc-secondary" onClick={() => { setPreview(null); setImportFile(null); }}>{ar ? "إلغاء" : "Cancel"}</button></div>
        </div>}
      </details>}
    </div>
  );
}

/**
 * Commercial › Exchange Rates. Backend semantics (`CurrencyService`): one stored rate per currency per day, EGP → currency.
 * Each day the market rate is read once from the rate provider (source API); a rate saved here (MANUAL) replaces it for that
 * day only; with no row for a day the most recent earlier rate is used (FALLBACK). A proposal freezes the rate on the day it
 * is sent to the patient, so changing a rate never changes a proposal already sent. Nothing here is a live market feed.
 */
export function ExchangeRates({ locale, api, editable }: { locale: Locale; api: AdminApi; editable: boolean }) {
  const ar = locale === "ar";
  const [date, setDate] = useState("");
  const [fx, setFx] = useState<FxRate[] | null>(null); const [error, setError] = useState<unknown>(null); const [notice, setNotice] = useState(""); const [busy, setBusy] = useState(false);
  const read = useCallback(() => api<FxRate[]>(`/admin/fx-rates${date ? `?date=${date}` : ""}`), [api, date]);
  const load = useCallback(async () => { try { setFx(await read()); } catch (e) { setError(e); setFx([]); } }, [read]);
  useEffect(() => {
    let live = true;
    read().then((rates) => { if (live) setFx(rates); }, (e) => { if (live) { setError(e); setFx([]); } });
    return () => { live = false; };
  }, [read]);
  const pin = async (currency: string, rate: number) => { setBusy(true); setError(null); setNotice(""); try { await api(`/admin/fx-rates/${currency}`, json("PUT", { rate })); setNotice(ar ? `تم حفظ سعر ${currency} لليوم.` : `${currency} rate saved for today.`); await load(); return true; } catch (e) { setError(e); return false; } finally { setBusy(false); } };
  if (fx === null) return <p role="status">{ar ? "جارٍ التحميل…" : "Loading…"}</p>;
  const rows = fx.filter((f) => f.currency !== "EGP");
  const historical = !!date;
  const shown = rows[0]?.rateDate;
  return (
    <div>
      <div className="cc-card" style={{ marginBottom: 16 }}>
        <p><strong>{ar ? "كيف تُستخدم هذه الأسعار" : "How these rates are used"}</strong></p>
        <ul className="cc-consequences">
          <li>{ar ? "يُخزَّن سعر واحد لكل عملة في اليوم، من الجنيه المصري إلى العملة. هذه ليست أسعار سوق لحظية." : "One rate is stored per currency per day, from EGP to that currency. These are not live market prices."}</li>
          <li>{ar ? "يُقرأ سعر السوق مرة واحدة يوميًا من مزوّد الأسعار. السعر الذي تحفظه هنا يحل محله لذلك اليوم فقط." : "The market rate is read once a day from the rate provider. A rate you save here replaces it for that day only."}</li>
          <li>{ar ? "تستخدم الحسابات الجديدة سعر يومها. يحتفظ كل عرض بالسعر المجمَّد يوم إرساله إلى المريض — تغيير السعر لا يغيّر عرضًا أُرسل بالفعل." : "New calculations use the rate of the day they are made. Each proposal keeps the rate frozen on the day it was sent to the patient — changing a rate never changes a proposal already sent."}</li>
        </ul>
      </div>
      <div className="cc-filterbar">
        <Field label={ar ? "عرض أسعار يوم" : "Show rates for"} hint={ar ? "اتركه فارغًا لليوم." : "Leave empty for today."}><input type="date" dir="ltr" value={date} onChange={(e) => { setDate(e.target.value); setNotice(""); }} /></Field>
      </div>
      <SuccessNotice>{notice || null}</SuccessNotice>
      <ErrorNotice error={error} locale={locale} />
      {shown && <p className="cc-meta" role="status">{historical
        ? (ar ? <>أسعار سابقة — استُخدمت للحسابات يوم <bdi dir="ltr">{shown}</bdi>.</> : <>Historical rates — used for calculations on <bdi dir="ltr">{shown}</bdi>.</>)
        : (ar ? <>الأسعار المستخدمة للحسابات الجديدة اليوم، <bdi dir="ltr">{shown}</bdi>.</> : <>Rates used for new calculations today, <bdi dir="ltr">{shown}</bdi>.</>)}</p>}
      {!rows.length ? <EmptyState title={ar ? "لا توجد أسعار صرف" : "No exchange rates available"} /> : (
        <ul className="cc-fx-list" aria-label={ar ? "أسعار الصرف" : "Exchange rates"}>
          {rows.map((f) => <FxRow key={f.currency + f.rate + f.rateDate} f={f} locale={locale} busy={busy} editable={editable && !historical} onPin={pin} />)}
        </ul>
      )}
    </div>
  );
}
const FX_SOURCE: Record<string, [string, string, string, string]> = {
  API: ["Daily market rate", "سعر السوق اليومي", "Read from the rate provider for this day.", "قُرئ من مزوّد الأسعار لهذا اليوم."],
  MANUAL: ["Saved manually", "محفوظ يدويًا", "Replaces the market rate for this day only.", "يحل محل سعر السوق لهذا اليوم فقط."],
  FALLBACK: ["Most recent earlier rate", "أحدث سعر سابق", "No rate is stored for this day, so the most recent earlier rate is used.", "لا يوجد سعر مخزّن لهذا اليوم، لذا يُستخدم أحدث سعر سابق."],
};
function FxRow({ f, locale, busy, editable, onPin }: { f: FxRate; locale: Locale; busy: boolean; editable: boolean; onPin: (currency: string, rate: number) => Promise<boolean> }) {
  const ar = locale === "ar";
  const [egpPer, setEgpPer] = useState((f.rate ? 1 / f.rate : 0).toFixed(4));
  const per = Number(egpPer);
  const stored = f.rate ? 1 / f.rate : 0;
  const source = FX_SOURCE[f.source] ?? [f.source, f.source, "", ""];
  return (
    <li>
      <div><span className="cc-meta">{ar ? "من ← إلى" : "From → To"}</span><strong><bdi dir="ltr">EGP → {f.currency}</bdi></strong><span className="cc-row-sub">{currencyName(f.currency, locale)}</span></div>
      <div><span className="cc-meta">{ar ? "السعر" : "Rate"}</span>
        <strong><bdi dir="ltr">1 {f.currency} = {stored.toLocaleString("en", { maximumFractionDigits: 4 })} EGP</bdi></strong>
        {stored > 0 && <span className="cc-row-sub"><bdi dir="ltr">1,000 EGP ≈ {money(1000 * f.rate, f.currency, "en")}</bdi></span>}</div>
      <div><span className="cc-meta">{ar ? "المصدر" : "Source"}</span>{f.source === "MANUAL" ? <StatusBadge tone="info">{source[ar ? 1 : 0]}</StatusBadge> : <strong>{source[ar ? 1 : 0]}</strong>}<span className="cc-row-sub">{source[ar ? 3 : 2]} · <bdi dir="ltr">{f.rateDate}</bdi></span></div>
      {editable ? <div>
        <label className="cc-field"><span className="cc-field-label">{ar ? `جنيه لكل 1 ${f.currency}` : `EGP per 1 ${f.currency}`}</span><input type="number" min="0" step="0.0001" dir="ltr" value={egpPer} onChange={(e) => setEgpPer(e.target.value)} /></label>
        <button type="button" className="cc-secondary cc-small" disabled={busy || !(per > 0)} onClick={() => void onPin(f.currency, 1 / per)}>{ar ? "حفظ السعر لليوم" : "Save rate for today"}</button>
        <span className="cc-row-sub">{ar ? "لليوم فقط؛ غدًا يُستخدم سعر السوق اليومي مجددًا ما لم تحفظ سعرًا آخر." : "Today only; tomorrow the daily market rate is used again unless you save another."}</span>
      </div> : <div />}
    </li>
  );
}

/** One governed service baseline per care area: the reference list consultants' price lists derive from. */
export function CareAreaTemplates({ locale, api, editable }: { locale: Locale; api: AdminApi; editable: boolean }) {
  const ar = locale === "ar";
  const [templates, setTemplates] = useState<Template[] | null>(null); const [selected, setSelected] = useState(""); const [items, setItems] = useState<TemplateItem[]>([]);
  const [busy, setBusy] = useState(false); const [error, setError] = useState<unknown>(null); const [notice, setNotice] = useState(""); const [adding, setAdding] = useState(false);
  useEffect(() => {
    let live = true;
    api<Template[]>("/admin/service-templates").then((rows) => { if (live) { setTemplates(rows); setSelected((v) => v || rows[0]?.id || ""); } },
      (e) => { if (live) { setError(e); setTemplates([]); } });
    return () => { live = false; };
  }, [api]);
  const readItems = useCallback((id: string) => api<TemplateItem[]>(`/admin/service-templates/${id}/items`), [api]);
  const loadItems = useCallback(async (id: string) => { if (!id) { setItems([]); return; } try { setItems(await readItems(id)); } catch (e) { setError(e); } }, [readItems]);
  // No template chosen: no items (adjusted while rendering); otherwise the effect reads the chosen template's items.
  if (!selected && items.length > 0) setItems([]);
  useEffect(() => {
    if (!selected) return;
    let live = true;
    readItems(selected).then((rows) => { if (live) setItems(rows); }, (e) => { if (live) setError(e); });
    return () => { live = false; };
  }, [selected, readItems]);
  const run = async (work: () => Promise<unknown>) => { setBusy(true); setError(null); setNotice(""); try { await work(); setNotice(ar ? "تم حفظ القالب." : "Template saved."); await loadItems(selected); return true; } catch (e) { setError(e); return false; } finally { setBusy(false); } };
  if (templates === null) return <p role="status">{ar ? "جارٍ التحميل…" : "Loading…"}</p>;
  if (!templates.length) return <><ErrorNotice error={error} locale={locale} action="load" /><EmptyState title={ar ? "لا توجد قوالب خدمات" : "No service templates"} /></>;
  const current = templates.find((t) => t.id === selected);
  return (
    <div>
      <p className="cc-meta">{ar ? "قائمة مرجعية للخدمات والفوترة، وليست خطة علاج. يختار الاستشاري ما يلزم سريريًا." : "A service and billing reference, not a treatment plan. The consultant selects what is clinically appropriate."}</p>
      <SuccessNotice>{notice || null}</SuccessNotice>
      <ErrorNotice error={error} locale={locale} />
      <SectionTabs attentionLabel={locale === "ar" ? "يحتاج إجراء" : "needs attention"} label={ar ? "مجالات الرعاية" : "Care areas"} active={selected} onChange={setSelected} tabs={templates.map((t) => ({ key: t.id, label: careAreaLabel(t.careCategory, locale) }))} />
      {current && <>
        <div className="cc-section-head"><div><h3 style={{ margin: 0 }}>{current.name}</h3>{current.referenceStandard && <p className="cc-meta">{current.referenceStandard}</p>}{current.guidanceNote && <p>{current.guidanceNote}</p>}</div>
          {editable && <div className="cc-section-actions"><button type="button" className="cc-small" onClick={() => setAdding(true)}><Plus size={15} aria-hidden />{ar ? "إضافة خدمة للقالب" : "Add service to template"}</button></div>}</div>
        {adding && editable && (
          <form className="cc-card" style={{ marginBottom: 16 }} onSubmit={(e) => { e.preventDefault(); const f = e.currentTarget, d = new FormData(f); void run(() => api(`/admin/service-templates/${selected}/items`, json("POST", { serviceCode: d.get("code"), serviceName: d.get("name"), category: d.get("category"), suggestedPriceEgp: d.get("price") ? Number(d.get("price")) : null, sortOrder: items.length + 1, active: true }))).then((ok) => { if (ok) { f.reset(); setAdding(false); } }); }}>
            <div className="cc-form-grid">
              <Field label={ar ? "اسم الخدمة" : "Service name"} required><input name="name" required /></Field>
              <Field label={ar ? "رمز ثابت" : "Stable code"} required><input name="code" dir="ltr" required /></Field>
              <Field label={ar ? "الفئة" : "Category"} optionalLabel={ar ? "اختياري" : "optional"}><input name="category" /></Field>
              <Field label={ar ? "سعر مقترح (ج.م)" : "Suggested price (EGP)"} optionalLabel={ar ? "اختياري" : "optional"}><input name="price" type="number" min="0" step="0.01" dir="ltr" /></Field>
            </div>
            <div className="cc-form-actions"><button disabled={busy}>{ar ? "إضافة للقالب" : "Add to template"}</button><button type="button" className="cc-secondary" onClick={() => setAdding(false)}>{ar ? "إلغاء" : "Cancel"}</button></div>
          </form>
        )}
        {!items.length ? <EmptyState title={ar ? "لا توجد خدمات في هذا القالب" : "This template has no services yet"} /> : (
          <div className="cc-table-wrap"><table className="cc-data">
            <thead><tr><th>{ar ? "الخدمة" : "Service"}</th><th>{ar ? "الفئة" : "Category"}</th><th>{ar ? "السعر الأساسي" : "Base price"}</th><th>{ar ? "الحالة" : "Status"}</th>{editable && <th><span className="cc-sr">{ar ? "إجراءات" : "Actions"}</span></th>}</tr></thead>
            <tbody>{items.map((item) => <tr key={item.serviceCode}>
              <td>{item.serviceName}<span className="cc-row-sub" dir="ltr">{item.serviceCode}</span></td><td>{item.category}</td>
              <td>{item.suggestedPriceEgp ? money(item.suggestedPriceEgp, "EGP", locale) : (ar ? "يُحدَّد محليًا" : "Set locally")}</td>
              <td><StatusBadge tone={item.active ? "success" : "neutral"}>{item.active ? (ar ? "مفعّلة" : "Active") : (ar ? "موقوفة" : "Inactive")}</StatusBadge></td>
              {editable && <td><button type="button" className={item.active ? "cc-secondary cc-danger-button cc-small" : "cc-secondary cc-small"} disabled={busy} onClick={() => void run(() => api(`/admin/service-templates/${selected}/items/${encodeURIComponent(item.serviceCode)}`, json("PUT", { ...item, active: !item.active })))}>{item.active ? (ar ? "إيقاف" : "Deactivate") : (ar ? "تفعيل" : "Activate")}</button></td>}
            </tr>)}</tbody>
          </table></div>
        )}
      </>}
    </div>
  );
}

/** Legacy direct-consultant approval: record a verified credential, then approve (or reject with a reason) for case assignment. */
export function ConsultantApproval({ locale, api, practitionerId, status, editable, onChanged }: { locale: Locale; api: AdminApi; practitionerId: string; status?: string; editable: boolean; onChanged: () => void }) {
  const ar = locale === "ar";
  const [busy, setBusy] = useState(false); const [error, setError] = useState<unknown>(null); const [notice, setNotice] = useState("");
  const [reason, setReason] = useState(""); const [rejecting, setRejecting] = useState(false); const [approving, setApproving] = useState(false); const [touched, setTouched] = useState(false);
  const run = async (work: () => Promise<unknown>, done: string) => { setBusy(true); setError(null); setNotice(""); try { await work(); setNotice(done); onChanged(); return true; } catch (e) { setError(e); return false; } finally { setBusy(false); } };
  if (!editable) return <p className="cc-meta">{ar ? "وصول للقراءة فقط." : "Read-only access."}</p>;
  return (
    <div>
      <SuccessNotice>{notice || null}</SuccessNotice>
      <ErrorNotice error={error} locale={locale} />
      <h3>{ar ? "١. تسجيل اعتماد موثّق" : "1. Record a verified credential"}</h3>
      <p className="cc-meta">{ar ? "مثال: رخصة مزاولة، شهادة زمالة، أو وثيقة تأمين مسؤولية." : "For example a practice licence, fellowship certificate or indemnity cover."}</p>
      <form onSubmit={(e) => { e.preventDefault(); const f = e.currentTarget, d = new FormData(f); const expires = d.get("expires"); void run(() => api(`/admin/practitioners/${practitionerId}/credentials`, json("POST", { credentialType: d.get("credentialType"), referenceNumber: d.get("reference"), source: d.get("source"), expiresAt: expires ? new Date(`${expires}T23:59:59Z`).toISOString() : null })), ar ? "تم تسجيل الاعتماد." : "Credential recorded.").then((ok) => { if (ok) f.reset(); }); }}>
        <div className="cc-form-grid">
          <Field label={ar ? "نوع الاعتماد" : "Credential type"} required><input name="credentialType" required /></Field>
          <Field label={ar ? "رقم التسجيل أو الترخيص" : "Registration or licence number"} required><input name="reference" dir="ltr" required /></Field>
          <Field label={ar ? "جهة الإصدار" : "Issuing authority"} required><input name="source" required /></Field>
          <Field label={ar ? "تاريخ الانتهاء" : "Expiry date"} optionalLabel={ar ? "اختياري" : "optional"}><input name="expires" type="date" dir="ltr" /></Field>
        </div>
        <div className="cc-form-actions"><button className="cc-secondary" disabled={busy}>{ar ? "تسجيل الاعتماد" : "Record credential"}</button></div>
      </form>
      <h3 style={{ marginTop: 28 }}>{ar ? "٢. قرار الاعتماد للحالات" : "2. Case approval decision"}</h3>
      <p className="cc-meta">{ar ? "الموافقة تجعل الاستشاري متاحًا للتعيين على الحالات. الرفض يتطلب سببًا." : "Approving makes the consultant available for case assignment. Rejecting needs a reason."}{status ? <> · {ar ? "الحالة الحالية" : "Current"}: {status}</> : null}</p>
      {approving ? (
        <div className="cc-card" role="group" aria-label={ar ? "تأكيد الاعتماد للحالات" : "Confirm case approval"}>
          <p><strong>{ar ? "اعتماد هذا الاستشاري لاستقبال الحالات؟" : "Approve this consultant to receive cases?"}</strong></p>
          <p>{ar ? "بعد الاعتماد قد يصبح الاستشاري مؤهلًا للتعيين على حالات فعلية متى استوفى بقية الشروط. تأكد أولًا من أن اعتماداته الموثّقة مسجّلة." : "After approval, this consultant may become eligible for live case assignment when all other requirements are satisfied. Make sure their verified credentials are recorded first."}</p>
          <div className="cc-form-actions"><button type="button" disabled={busy} onClick={() => void run(() => api(`/admin/practitioners/${practitionerId}/decision?approved=true`, json("POST")), ar ? "تم اعتماد الاستشاري للحالات." : "Consultant approved for cases.").then((ok) => { if (ok) setApproving(false); })}>{ar ? "نعم، اعتمده للحالات" : "Yes, approve for cases"}</button><button type="button" className="cc-secondary" onClick={() => setApproving(false)}>{ar ? "إلغاء" : "Cancel"}</button></div>
        </div>
      ) : !rejecting ? (
        <div className="cc-form-actions">
          <button type="button" disabled={busy} onClick={() => setApproving(true)}>{ar ? "اعتماد للحالات…" : "Approve for cases…"}</button>
          <button type="button" className="cc-secondary cc-danger-button" disabled={busy} onClick={() => setRejecting(true)}>{ar ? "رفض…" : "Reject…"}</button>
        </div>
      ) : (
        <form className="cc-card" onSubmit={(e) => { e.preventDefault(); setTouched(true); if (!reason.trim()) return; void run(() => api(`/admin/practitioners/${practitionerId}/decision?approved=false&reason=${encodeURIComponent(reason.trim())}`, json("POST")), ar ? "تم تسجيل الرفض." : "Rejection recorded.").then((ok) => { if (ok) { setRejecting(false); setReason(""); } }); }}>
          <Field label={ar ? "سبب الرفض" : "Reason for rejection"} required error={touched && !reason.trim() ? (ar ? "السبب مطلوب." : "A reason is required.") : undefined}><textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} /></Field>
          <div className="cc-form-actions"><button className="cc-danger-button" disabled={busy}>{ar ? "تأكيد الرفض" : "Confirm rejection"}</button><button type="button" className="cc-secondary" onClick={() => setRejecting(false)}>{ar ? "إلغاء" : "Cancel"}</button></div>
        </form>
      )}
    </div>
  );
}


