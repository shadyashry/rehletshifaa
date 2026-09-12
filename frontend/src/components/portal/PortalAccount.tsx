"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Languages, LogOut, Settings, X, ExternalLink } from "lucide-react";
import type { Locale } from "@/lib/i18n";
import { OIDC_AUTHORITY } from "@/lib/api";

export type Preferences = { displayName: string | null; locale: Locale | null };
type Api = <T,>(path: string, init?: RequestInit) => Promise<T>;
/** The patient's reusable account facts, exactly as the backend returns them — never anything from a case. */
type PatientProfile = { givenName?: string | null; familyName?: string | null; displayName?: string | null; preferredName?: string | null; dateOfBirth?: string | null; country?: string | null; nationality?: string | null; preferredLanguage?: string | null; email?: string | null; emailVerified: boolean; whatsappNumber?: string | null; phoneVerified: boolean };

export function PortalAccount({ locale, name, email, role, api, signOut, preferences, onSaved, patient = false }: {
  locale: Locale; name: string; email?: string; role: string; api: Api;
  signOut: () => Promise<void>; preferences: Preferences; onSaved: (value: Preferences) => void; patient?: boolean;
}) {
  // Profile & Security (patients): account facts, loaded when the dialog opens — separate from any case.
  const [profile, setProfile] = useState<PatientProfile | null>(null);
  const [profileError, setProfileError] = useState("");
  const loadProfile = () => { setProfileError(""); api<PatientProfile>("/patient/account/profile").then(setProfile).catch(e => setProfileError(e instanceof Error ? e.message : "")); };
  const router = useRouter();
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const menu = useRef<HTMLDetailsElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const ar = locale === "ar";
  const text = ar ? { account: "الحساب", settings: patient ? "الملف الشخصي والأمان" : "إعدادات الحساب", name: "اسم العرض", language: "اللغة", save: "حفظ التغييرات", saving: "جارٍ الحفظ…", close: "إغلاق", signOut: "تسجيل الخروج", security: "كلمة المرور وأمان الحساب", hint: "يُستخدم اسم العرض في البوابة. لا يغيّر الاسم القانوني أو بيانات الاعتماد.",
      details: "بياناتك", givenName: "الاسم", familyName: "اسم العائلة", preferredName: "الاسم المفضّل", dob: "تاريخ الميلاد", country: "بلد الإقامة", nationality: "الجنسية", preferredLanguage: "اللغة المفضّلة", email: "البريد الإلكتروني", whatsapp: "واتساب / الجوال", verified: "موثّق", notVerified: "غير موثّق", notProvided: "غير مُقدَّم", correction: "لتصحيح هذه البيانات، راسل منسقك.", preferencesTitle: "تفضيلات البوابة", loading: "جارٍ التحميل…" }
    : { account: "Account", settings: patient ? "Profile & Security" : "Account settings", name: "Display name", language: "Language", save: "Save changes", saving: "Saving…", close: "Close", signOut: "Sign out", security: "Password & account security", hint: "Your display name is used in the portal. It does not change your legal name or credentials.",
      details: "Your details", givenName: "Given name(s)", familyName: "Family name", preferredName: "Preferred name", dob: "Date of birth", country: "Country of residence", nationality: "Nationality", preferredLanguage: "Preferred language", email: "Email", whatsapp: "WhatsApp / mobile", verified: "Verified", notVerified: "Not verified", notProvided: "Not provided", correction: "To correct these details, message your coordinator.", preferencesTitle: "Portal preferences", loading: "Loading…" };
  useEffect(() => {
    setSlot(document.getElementById("portal-account-slot"));
    const close = (event: PointerEvent) => { if (menu.current && !menu.current.contains(event.target as Node)) menu.current.open = false; };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  const changeLanguage = (next: Locale) => {
    if (next !== locale) router.push(`${window.location.pathname.replace(/^\/(en|ar)(?=\/|$)/, `/${next}`)}${window.location.search}${window.location.hash}`, { scroll: false });
  };
  const content = <>
    <details ref={menu} className="portal-account relative" onKeyDown={event => { if (event.key === "Escape" && menu.current) { menu.current.open = false; menu.current.querySelector("summary")?.focus(); } }}>
      <summary aria-label={`${text.account}: ${name}`} className="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-full bg-brand-700 font-bold text-white ring-4 ring-brand-50">{name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase() || "•"}</summary>
      <div className="absolute end-0 top-14 z-50 w-72 max-w-[calc(100vw-2rem)] rounded-2xl border border-line bg-white p-2 shadow-xl">
        <div className="border-b border-line px-3 py-3"><p className="break-words font-bold">{name}</p><p className="text-sm text-ink-500">{role}</p>{email && <p dir="auto" className="truncate text-xs text-ink-500">{email}</p>}</div>
        <button className="account-option" onClick={() => { trigger.current = menu.current?.querySelector("summary") ?? null; if(menu.current)menu.current.open=false; setError(""); if (patient) loadProfile(); dialog.current?.showModal(); }}><Settings size={18}/>{text.settings}</button>
        <button className="account-option" disabled={busy} onClick={async () => { setBusy(true); setError(""); try { const next = ar ? "en" : "ar"; const value = await api<Preferences>("/account/preferences", { method: "PUT", body: JSON.stringify({ ...preferences, locale: next }) }); onSaved(value); changeLanguage(next); } catch (e) { setError(e instanceof Error ? e.message : text.settings); } finally { setBusy(false); } }}><Languages size={18}/><span lang={ar ? "en" : "ar"}>{ar ? "English" : "العربية"}</span></button>
        <button className="account-option" onClick={() => void signOut()}><LogOut size={18}/>{text.signOut}</button>
        {error && !dialog.current?.open && <p role="alert" className="p-3 text-sm text-alert-800">{error}</p>}
      </div>
    </details>
    <dialog ref={dialog} className="account-dialog" aria-labelledby="account-heading" onClose={() => trigger.current?.focus()}>
      <div className="flex items-start justify-between gap-4"><h2 id="account-heading" className="title">{text.settings}</h2><button className="icon-button" aria-label={text.close} onClick={() => dialog.current?.close()}><X size={20}/></button></div>
      {patient && (
        <section aria-labelledby="profile-details" className="mt-5">
          <h3 id="profile-details" className="text-[0.72rem] font-bold uppercase tracking-[0.1em] text-ink-500">{text.details}</h3>
          {profileError ? <p role="alert" className="mt-2 text-sm text-alert-800">{profileError}</p> : !profile ? <p className="mt-2 text-sm text-ink-500">{text.loading}</p> : (
            <dl className="mt-2 grid gap-x-6 gap-y-2.5 text-[0.9rem] sm:grid-cols-2">
              {([
                [text.givenName, profile.givenName], [text.familyName, profile.familyName], [text.preferredName, profile.preferredName],
                [text.dob, profile.dateOfBirth ? new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(new Date(profile.dateOfBirth)) : null],
                [text.country, profile.country], [text.nationality, profile.nationality],
                [text.preferredLanguage, profile.preferredLanguage === "ar" ? "العربية" : profile.preferredLanguage === "en" ? "English" : profile.preferredLanguage],
              ] as [string, string | null | undefined][]).filter(([, value]) => value).map(([label, value]) => (
                <div key={label} className="min-w-0"><dt className="text-[0.72rem] font-bold uppercase tracking-[0.08em] text-ink-500">{label}</dt><dd className="mt-0.5 truncate font-semibold text-ink-900">{value}</dd></div>
              ))}
              <div className="min-w-0"><dt className="text-[0.72rem] font-bold uppercase tracking-[0.08em] text-ink-500">{text.email}</dt><dd className="mt-0.5 truncate font-semibold text-ink-900" dir="ltr">{profile.email ?? text.notProvided}</dd>{profile.email && <dd className={`text-[0.78rem] font-semibold ${profile.emailVerified ? "text-brand-700" : "text-ink-500"}`}>{profile.emailVerified ? text.verified : text.notVerified}</dd>}</div>
              <div className="min-w-0"><dt className="text-[0.72rem] font-bold uppercase tracking-[0.08em] text-ink-500">{text.whatsapp}</dt><dd className="mt-0.5 truncate font-semibold text-ink-900" dir="ltr">{profile.whatsappNumber ?? text.notProvided}</dd>{profile.whatsappNumber && <dd className={`text-[0.78rem] font-semibold ${profile.phoneVerified ? "text-brand-700" : "text-ink-500"}`}>{profile.phoneVerified ? text.verified : text.notVerified}</dd>}</div>
            </dl>
          )}
          <p className="mt-3 text-[0.82rem] text-ink-500">{text.correction}</p>
          <h3 className="mt-5 text-[0.72rem] font-bold uppercase tracking-[0.1em] text-ink-500">{text.preferencesTitle}</h3>
        </section>
      )}
      <form key={`${preferences.displayName}-${locale}`} className={`${patient ? "mt-3" : "mt-5"} space-y-5`} onSubmit={async event => {
        event.preventDefault(); const data = new FormData(event.currentTarget); setBusy(true); setError("");
        try { const value = await api<Preferences>("/account/preferences", { method: "PUT", body: JSON.stringify({ displayName: patient ? preferences.displayName : data.get("displayName"), locale: data.get("locale") }) }); onSaved(value); dialog.current?.close(); if(value.locale)changeLanguage(value.locale); }
        catch(e) { setError(e instanceof Error ? e.message : text.settings); } finally { setBusy(false); }
      }}>
        {/* Patients already have a preferred name on their profile; a second, portal-only name would only compete with it. */}
        {!patient && <>
          <label className="block text-sm font-semibold">{text.name}<input autoComplete="nickname" className="field mt-2" name="displayName" defaultValue={preferences.displayName ?? name} required maxLength={160}/></label>
          <p className="text-sm text-ink-500">{text.hint}</p>
        </>}
        <label className="block text-sm font-semibold">{text.language}<select className="field mt-2" name="locale" defaultValue={locale}><option value="en">English</option><option value="ar">العربية</option></select></label>
        {error && <p role="alert" className="text-sm text-alert-800">{error}</p>}
        <button className="btn-primary w-full" disabled={busy}>{busy ? text.saving : text.save}</button>
      </form>
      <a className="mt-5 flex items-center gap-2 text-sm font-semibold text-brand-700" href={`${OIDC_AUTHORITY}/account?ui_locales=${locale}`} target="_blank" rel="noreferrer">{text.security}<ExternalLink size={15}/></a>
    </dialog>
  </>;
  return slot ? createPortal(content, slot) : <div className="flex justify-end">{content}</div>;
}
