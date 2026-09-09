"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Bell, Check, X } from "lucide-react";

import type { Locale } from "@/lib/i18n";

export type StaffNotification = {
  id: string; caseId: string | null; caseNumber: string | null; taskId: string | null;
  eventType: string; title: string; context: string | null; createdAt: string; read: boolean;
};
type Feed = { unread: number; items: StaffNotification[] };
type Api = <T,>(path: string, init?: RequestInit) => Promise<T>;

/**
 * Staff notification centre: "something happened that concerns you".
 *
 * <p>Opening or reading a notification never completes the related work item — the CTA takes the staff
 * member to the case where the actual work lives. Rendered into the header slot beside the account avatar.
 */
export function NotificationBell({ locale, api, onOpenCase }: { locale: Locale; api: Api; onOpenCase: (caseId: string) => void }) {
  const ar = locale === "ar";
  const t = ar
    ? { label: "الإشعارات", unread: "غير مقروءة", empty: "لا توجد إشعارات بعد.", emptyHint: "سنُعلمك عندما يحتاج شيء إلى تدخلك.", markAll: "تعليم الكل كمقروء", open: "فتح الحالة", close: "إغلاق", now: "الآن", ago: "منذ" }
    : { label: "Notifications", unread: "unread", empty: "No notifications yet.", emptyHint: "We'll tell you when something needs you.", markAll: "Mark all as read", open: "Open case", close: "Close", now: "Just now", ago: "ago" };

  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [feed, setFeed] = useState<Feed>({ unread: 0, items: [] });
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => { setSlot(document.getElementById("portal-account-slot")); }, []);

  const load = useCallback(async () => {
    try { setFeed(await api<Feed>("/notifications")); } catch { /* the bell must never break the portal */ }
  }, [api]);

  // Subscribe to the inbox: an initial fetch plus a quiet refresh, both outside the effect body.
  useEffect(() => {
    const first = setTimeout(() => { void load(); }, 0);
    const timer = setInterval(() => { void load(); }, 120_000);
    return () => { clearTimeout(first); clearInterval(timer); };
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      if (panel.current?.contains(event.target as Node) || button.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); button.current?.focus(); } };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", escape); };
  }, [open]);

  async function markRead(id?: string) {
    setFeed(current => ({
      unread: id ? Math.max(0, current.unread - (current.items.find(n => n.id === id)?.read ? 0 : 1)) : 0,
      items: current.items.map(n => (id ? n.id === id : true) ? { ...n, read: true } : n),
    }));
    try { await api(`/notifications/read${id ? `?id=${encodeURIComponent(id)}` : ""}`, { method: "POST" }); } catch { void load(); }
  }

  const content = <div className="relative">
    <button ref={button} type="button" className="relative flex h-11 w-11 items-center justify-center rounded-full border border-line bg-white text-ink-700 transition hover:border-brand-300 hover:text-brand-800"
            aria-label={feed.unread ? `${t.label}: ${feed.unread} ${t.unread}` : t.label} aria-expanded={open} aria-haspopup="dialog"
            onClick={() => setOpen(value => !value)}>
      <Bell size={20} aria-hidden/>
      {feed.unread > 0 && (
        <span aria-hidden className="absolute -end-0.5 -top-0.5 grid min-w-5 place-items-center rounded-full bg-alert-600 px-1 text-[11px] font-bold leading-5 text-white">
          {feed.unread > 9 ? "9+" : feed.unread}
        </span>
      )}
    </button>
    {open && (
      <div ref={panel} role="dialog" aria-label={t.label}
           className="absolute end-0 top-14 z-50 max-h-[70vh] w-[22rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-line bg-white shadow-xl">
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h2 className="font-bold text-ink-900">{t.label}</h2>
          <div className="flex items-center gap-1">
            {feed.unread > 0 && (
              <button type="button" className="rounded-lg px-2 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-50" onClick={() => void markRead()}>
                <Check size={14} className="me-1 inline" aria-hidden/>{t.markAll}
              </button>
            )}
            <button type="button" className="icon-button" aria-label={t.close} onClick={() => { setOpen(false); button.current?.focus(); }}><X size={18}/></button>
          </div>
        </div>
        {feed.items.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <Bell className="mx-auto mb-3 text-ink-300" size={26} aria-hidden/>
            <p className="font-semibold text-ink-700">{t.empty}</p>
            <p className="mt-1 text-sm text-ink-500">{t.emptyHint}</p>
          </div>
        ) : (
          <ul className="max-h-[calc(70vh-3.5rem)] divide-y divide-line overflow-y-auto">
            {feed.items.map(item => (
              <li key={item.id} className={item.read ? "px-4 py-3" : "border-s-4 border-brand-600 bg-brand-50/60 px-4 py-3"}>
                <div className="flex items-start gap-2">
                  {!item.read && <span aria-hidden className="mt-1.5 h-2 w-2 flex-none rounded-full bg-brand-600"/>}
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold leading-6 text-ink-900">{item.title}</p>
                    {item.context && <p className="mt-0.5 text-sm leading-6 text-ink-600">{item.context}</p>}
                    <p className="mt-1 text-xs text-ink-500">
                      {item.caseNumber && <span className="font-semibold text-brand-700">{item.caseNumber} · </span>}
                      {since(item.createdAt, locale, t)}
                    </p>
                    {item.caseId && (
                      <button type="button" className="link-cta mt-2 text-sm"
                              onClick={() => { setOpen(false); void markRead(item.id); onOpenCase(item.caseId!); }}>
                        {t.open}
                      </button>
                    )}
                  </div>
                  {!item.read && (
                    <button type="button" className="icon-button flex-none" aria-label={`${t.markAll}: ${item.title}`} onClick={() => void markRead(item.id)}>
                      <Check size={16}/>
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    )}
  </div>;

  return slot ? createPortal(content, slot) : null;
}

function since(iso: string, locale: Locale, t: { now: string; ago: string }) {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return t.now;
  const units: [Intl.RelativeTimeFormatUnit, number][] = [["minute", 60], ["hour", 24], ["day", 30]];
  let value = minutes;
  for (const [unit, limit] of units) {
    if (value < limit) return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(-value, unit);
    value = Math.floor(value / limit);
  }
  return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(-value, "month");
}
