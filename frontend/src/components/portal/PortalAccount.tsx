"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Languages, LogOut, Settings, X, ExternalLink } from "lucide-react";
import type { Locale } from "@/lib/i18n";

export type Preferences = { displayName: string | null; locale: Locale | null };
type Api = <T,>(path: string, init?: RequestInit) => Promise<T>;

export function PortalAccount({ locale, name, email, role, api, signOut, preferences, onSaved }: {
  locale: Locale; name: string; email?: string; role: string; api: Api;
  signOut: () => Promise<void>; preferences: Preferences; onSaved: (value: Preferences) => void;
}) {
  const router = useRouter();
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const menu = useRef<HTMLDetailsElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const ar = locale === "ar";
  const text = ar ? { account: "الحساب", settings: "إعدادات الحساب", name: "اسم العرض", language: "اللغة", save: "حفظ التغييرات", saving: "جارٍ الحفظ…", close: "إغلاق", signOut: "تسجيل الخروج", security: "كلمة المرور وأمان الحساب", hint: "يُستخدم اسم العرض في البوابة. لا يغيّر الاسم القانوني أو بيانات الاعتماد." }
    : { account: "Account", settings: "Account settings", name: "Display name", language: "Language", save: "Save changes", saving: "Saving…", close: "Close", signOut: "Sign out", security: "Password & account security", hint: "Your display name is used in the portal. It does not change your legal name or credentials." };
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
        <button className="account-option" onClick={() => { trigger.current = menu.current?.querySelector("summary") ?? null; if(menu.current)menu.current.open=false; setError(""); dialog.current?.showModal(); }}><Settings size={18}/>{text.settings}</button>
        <button className="account-option" disabled={busy} onClick={async () => { setBusy(true); setError(""); try { const next = ar ? "en" : "ar"; const value = await api<Preferences>("/account/preferences", { method: "PUT", body: JSON.stringify({ ...preferences, locale: next }) }); onSaved(value); changeLanguage(next); } catch (e) { setError(e instanceof Error ? e.message : text.settings); } finally { setBusy(false); } }}><Languages size={18}/><span lang={ar ? "en" : "ar"}>{ar ? "English" : "العربية"}</span></button>
        <button className="account-option" onClick={() => void signOut()}><LogOut size={18}/>{text.signOut}</button>
        {error && !dialog.current?.open && <p role="alert" className="p-3 text-sm text-alert-800">{error}</p>}
      </div>
    </details>
    <dialog ref={dialog} className="account-dialog" aria-labelledby="account-heading" onClose={() => trigger.current?.focus()}>
      <div className="flex items-start justify-between gap-4"><h2 id="account-heading" className="title">{text.settings}</h2><button className="icon-button" aria-label={text.close} onClick={() => dialog.current?.close()}><X size={20}/></button></div>
      <form key={`${preferences.displayName}-${locale}`} className="mt-5 space-y-5" onSubmit={async event => {
        event.preventDefault(); const data = new FormData(event.currentTarget); setBusy(true); setError("");
        try { const value = await api<Preferences>("/account/preferences", { method: "PUT", body: JSON.stringify({ displayName: data.get("displayName"), locale: data.get("locale") }) }); onSaved(value); dialog.current?.close(); if(value.locale)changeLanguage(value.locale); }
        catch(e) { setError(e instanceof Error ? e.message : text.settings); } finally { setBusy(false); }
      }}>
        <label className="block text-sm font-semibold">{text.name}<input autoComplete="nickname" className="field mt-2" name="displayName" defaultValue={preferences.displayName ?? name} required maxLength={160}/></label>
        <p className="text-sm text-ink-500">{text.hint}</p>
        <label className="block text-sm font-semibold">{text.language}<select className="field mt-2" name="locale" defaultValue={locale}><option value="en">English</option><option value="ar">العربية</option></select></label>
        {error && <p role="alert" className="text-sm text-alert-800">{error}</p>}
        <button className="btn-primary w-full" disabled={busy}>{busy ? text.saving : text.save}</button>
      </form>
      <a className="mt-5 flex items-center gap-2 text-sm font-semibold text-brand-700" href={`${process.env.NEXT_PUBLIC_OIDC_AUTHORITY ?? "http://localhost:8180/realms/rehletshifaa"}/account?ui_locales=${locale}`} target="_blank" rel="noreferrer">{text.security}<ExternalLink size={15}/></a>
    </dialog>
  </>;
  return slot ? createPortal(content, slot) : <div className="flex justify-end">{content}</div>;
}
