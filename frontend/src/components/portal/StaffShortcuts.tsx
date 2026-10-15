"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore, type FocusEvent, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Keyboard, X } from "lucide-react";

import { useWorkCopy } from "@/components/portal/portal-copy";
import type { StaffViewId, StaffViewItem } from "@/components/portal/StaffNav";

/*
 * The staff workspace's keyboard layer (UX area 2, slice 2-2).
 *
 * Two parts. Roving-focus lists (My work, the case queue): one tab stop per list, ↑/↓ and Home/End move between rows,
 * Enter opens the row's case — these are ordinary widget keys and are always on. And a small set of single-key
 * shortcuts — `?` help, `j`/`k` rows, `g` then a letter for the views, `/` search, `n` next item on a case — bound to
 * the physical key (`event.code`), so they work the same with an Arabic layout. Single-key shortcuts are on by default
 * and can be turned off in the help dialog (WCAG 2.1.4); the choice is a per-browser convenience.
 */

// ── The off switch ────────────────────────────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = "portal-shortcuts";
const listeners = new Set<() => void>();
let enabled: boolean | null = null;

function readEnabled() {
  try { return window.localStorage.getItem(STORAGE_KEY) !== "off"; } catch { return true; }
}
// Another tab of the portal turning them off or on applies here too: one listener, however many subscribers.
function onStorage(event: StorageEvent) { if (event.key === STORAGE_KEY) { enabled = null; listeners.forEach(listener => listener()); } }
function subscribe(listener: () => void) {
  if (!listeners.size) window.addEventListener("storage", onStorage);
  listeners.add(listener);
  return () => { listeners.delete(listener); if (!listeners.size) window.removeEventListener("storage", onStorage); };
}
function snapshot() { return (enabled ??= readEnabled()); }

export function setShortcutsEnabled(on: boolean) {
  enabled = on;
  try { if (on) window.localStorage.removeItem(STORAGE_KEY); else window.localStorage.setItem(STORAGE_KEY, "off"); } catch { /* kept for this page only */ }
  listeners.forEach(listener => listener());
}

export function useShortcutsEnabled() { return useSyncExternalStore(subscribe, snapshot, () => true); }

// ── Which key, if any, a keydown is ───────────────────────────────────────────────────────────────────────────────

const NON_TEXT_INPUT = new Set(["checkbox", "radio", "button", "submit", "reset", "range", "color", "file", "image"]);
/** `g` waits this long for its second key. */
const PREFIX_MS = 1500;
let prefixUntil = 0;

function typingIn(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  if (target instanceof HTMLInputElement) return !NON_TEXT_INPUT.has(target.type);
  // A non-modal popup (the queue's filter panel, a menu) keeps its own keys.
  return !!target.closest("[role='dialog'],[role='menu'],[role='listbox'],[role='combobox']");
}
function modalOpen() { return !!document.querySelector("dialog[open],[aria-modal='true']"); }

/**
 * The physical key of a keydown that may act as a shortcut, or null: never in a field, with Ctrl/Alt/Meta, while a
 * modal dialog or drawer is open, or when something else already handled it. Shift is kept only for `?`.
 */
function shortcutKey(event: KeyboardEvent): string | null {
  if (event.defaultPrevented || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return null;
  if (typingIn(event.target) || modalOpen()) return null;
  if ((event.code === "Slash" && event.shiftKey) || event.key === "?") return "?";
  return event.shiftKey ? null : event.code;
}

/** One single-key shortcut owned by a component (the case page binds `n`). A null handler leaves the key unbound. */
export function useStaffShortcut(code: string, handler: (() => void) | null) {
  const on = useShortcutsEnabled();
  // The latest handler without rebinding the listener (`useEffectEvent` once @types/react has it; React 19.2 ships it).
  const latest = useRef(handler);
  useEffect(() => { latest.current = handler; });
  const bound = on && !!handler;
  useEffect(() => {
    if (!bound) return;
    const onKey = (event: KeyboardEvent) => {
      if (Date.now() < prefixUntil || shortcutKey(event) !== code) return;
      event.preventDefault();
      latest.current?.();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [bound, code]);
}

// ── Roving-focus lists ────────────────────────────────────────────────────────────────────────────────────────────

const VISIBLE_LIST = "#staff-view:not([hidden]) [data-roving-list]";

/** Moves the focus to a row's primary control and brings the whole row into view (below the floating header). */
function focusRow(primary: HTMLElement | undefined) {
  if (!primary) return;
  primary.focus({ preventScroll: true });
  // The page scrolls smoothly; a row reached by key must be in view at once.
  primary.closest<HTMLElement>("[data-row]")?.scrollIntoView({ block: "nearest", behavior: "instant" });
}

function rowsOf(list: Element) { return [...list.querySelectorAll<HTMLElement>("[data-roving-primary]")]; }

/**
 * A list whose rows share one tab stop: the current row's primary control (its Open). The row's other controls (select,
 * copy, take ownership…) join the tab order only while the focus is in the list, so Tab enters on Open and Shift+Tab
 * reaches the rest of that row. The current row is kept by id, and when it leaves the list (work done) the row that
 * took its place becomes current.
 */
export function useRovingList(ids: string[], { rowActions = false }: { rowActions?: boolean } = {}) {
  const t = useWorkCopy().shortcuts;
  const hintId = useId();
  const list = useRef<HTMLUListElement | null>(null);
  const [current, setCurrent] = useState<{ id: string | null; index: number }>({ id: null, index: 0 });
  const [inside, setInside] = useState(false);
  // "In the list" follows every focus move on the page: focus can leave without a blur (a control disabled or hidden
  // under it, caught by the next focusin), or go to nothing (a click on the page, caught by focusout).
  useEffect(() => {
    const within = (node: EventTarget | null) => !!node && !!list.current?.contains(node as Node);
    const onFocusIn = (event: globalThis.FocusEvent) => setInside(within(event.target));
    const onFocusOut = (event: globalThis.FocusEvent) => { if (!within(event.relatedTarget)) setInside(false); };
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    return () => { document.removeEventListener("focusin", onFocusIn); document.removeEventListener("focusout", onFocusOut); };
  }, []);
  const found = current.id ? ids.indexOf(current.id) : -1;
  const active = found >= 0 ? ids[found] : ids[Math.min(current.index, ids.length - 1)] ?? null;

  const take = (target: EventTarget) => {
    const row = target instanceof Element ? target.closest<HTMLElement>("[data-row]") : null;
    const id = row?.dataset.row;
    if (id && id !== current.id) setCurrent({ id, index: Math.max(0, ids.indexOf(id)) });
  };
  const listProps = {
    ref: list,
    "data-roving-list": "",
    onKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
      if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || typingIn(event.target)) return;
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
      const rows = rowsOf(event.currentTarget);
      if (!rows.length) return;
      const at = rows.findIndex(primary => primary.closest("[data-row]")?.contains(event.target as Node));
      const to = event.key === "Home" ? 0 : event.key === "End" ? rows.length - 1
        : Math.min(rows.length - 1, Math.max(0, (at < 0 ? 0 : at) + (event.key === "ArrowDown" ? 1 : -1)));
      event.preventDefault();
      focusRow(rows[to]);
    },
    onFocus(event: FocusEvent<HTMLElement>) { take(event.target); },
    // Safari does not focus a clicked button; the row clicked is still the row to come back to.
    onClickCapture(event: MouseEvent<HTMLElement>) {
      take(event.target);
      const primary = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-roving-primary]") : null;
      if (primary && document.activeElement !== primary) primary.focus({ preventScroll: true });
    },
  };
  return {
    listProps,
    /** How the list moves, for screen readers (a list of rows is not an ARIA widget, so nothing else says it). */
    hint: <span id={hintId} className="sr-only">{rowActions ? t.listHintActions : t.listHint}</span>,
    /** The row's Open: the list's one tab stop when the row is current. Keep it focusable (`aria-disabled`, not `disabled`). */
    primary: (id: string) => ({ "data-roving-primary": "", tabIndex: id === active ? 0 : -1, "aria-describedby": hintId }),
    /** Any other control in the row. */
    secondary: (id: string) => (id === active && inside ? 0 : -1),
  };
}

/**
 * Back from a case: the row it was opened from — the row of the case being closed if it is in the visible list (after
 * `n` that is a later row), else the row first opened, else the list's current row. False when there is none.
 */
export function focusReturnRow(rowId: string | null, caseId: string) {
  const list = document.querySelector(VISIBLE_LIST);
  if (!list) return false;
  const rows = rowsOf(list), row = (primary: HTMLElement) => primary.closest<HTMLElement>("[data-row]");
  const primary = rows.find(p => row(p)?.dataset.row === rowId && row(p)?.dataset.case === caseId)
    ?? rows.find(p => row(p)?.dataset.case === caseId)
    ?? rows.find(p => row(p)?.dataset.row === rowId)
    ?? rows.find(p => p.tabIndex === 0);
  primary?.focus({ preventScroll: true });
  return !!primary && document.activeElement === primary;
}

function moveRow(delta: 1 | -1) {
  const list = document.querySelector(VISIBLE_LIST);
  if (!list) return;
  const rows = rowsOf(list);
  const at = rows.findIndex(primary => primary.closest("[data-row]")?.contains(document.activeElement));
  // From outside the list, the first press lands on the current row.
  focusRow(at < 0 ? rows.find(row => row.tabIndex === 0) ?? rows[0] : rows[Math.min(rows.length - 1, Math.max(0, at + delta))]);
}

function focusSearch() {
  const field = document.querySelector<HTMLInputElement>("#staff-view:not([hidden]) input[type='search']");
  if (!field) return false;
  field.focus({ preventScroll: true });
  field.scrollIntoView({ block: "nearest", behavior: "instant" });
  field.select();
  return true;
}

// ── The layer and its help ────────────────────────────────────────────────────────────────────────────────────────

const VIEW_KEYS: Record<string, StaffViewId> = { KeyW: "work", KeyC: "mine", KeyT: "team", KeyM: "conversations" };
const VIEW_LETTER: Record<StaffViewId, string> = { work: "w", mine: "c", team: "t", conversations: "m" };

/**
 * The staff portal's shortcuts and their help. Rendered once by the portal for staff; the case page adds `n` itself.
 * `views` are the places this person has, so `g` reaches only those, and the help names only those.
 */
export function StaffShortcuts({ views, caseOpen, onView }: { views: StaffViewItem[]; caseOpen: boolean; onView: (id: StaffViewId) => void }) {
  const t = useWorkCopy().shortcuts;
  const on = useShortcutsEnabled();
  const [help, setHelp] = useState(false);
  const latest = useRef({ places: views, onCase: caseOpen, go: onView });
  useEffect(() => { latest.current = { places: views, onCase: caseOpen, go: onView }; });

  useEffect(() => {
    if (!on) { prefixUntil = 0; return; }
    const onKey = (event: KeyboardEvent) => {
      const key = shortcutKey(event);
      if (!key) return;
      const { places, onCase, go } = latest.current;
      // The second key after `g` is consumed either way, so it never also acts as its own shortcut.
      if (Date.now() < prefixUntil) {
        prefixUntil = 0;
        event.preventDefault();
        const view = VIEW_KEYS[key];
        if (view && places.some(place => place.id === view)) go(view);
        return;
      }
      if (key === "?") { event.preventDefault(); setHelp(true); return; }
      if (key === "KeyG") { event.preventDefault(); prefixUntil = Date.now() + PREFIX_MS; return; }
      if (onCase) return;
      if (key === "KeyJ" || key === "KeyK") { event.preventDefault(); moveRow(key === "KeyJ" ? 1 : -1); return; }
      if (key === "Slash") {
        event.preventDefault();
        if (focusSearch()) return;
        // My work and Conversations have no search: `/` goes to My cases and its search.
        if (places.some(place => place.id === "mine")) { go("mine"); requestAnimationFrame(() => { focusSearch(); }); }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [on]);

  return <>
    <p className="mt-10">
      <button type="button" aria-haspopup="dialog" aria-keyshortcuts={on ? "?" : undefined} className="inline-flex min-h-11 items-center gap-2 text-[0.875rem] font-semibold text-ink-600 hover:text-brand-700" onClick={() => setHelp(true)}>
        <Keyboard size={16} aria-hidden/>{t.open}
        {on ? <Key hidden>?</Key> : <span className="font-normal text-ink-500">{t.offState}</span>}
      </button>
    </p>
    {help && <ShortcutsDialog views={views} onClose={() => setHelp(false)}/>}
  </>;
}

/**
 * A key as its cap reads (Latin, left to right in both languages, so `lang="en"` for the voice); a drawn arrow carries
 * its name, in the page's language, for screen readers.
 */
function Key({ children, label, hidden = false }: { children: ReactNode; label?: string; hidden?: boolean }) {
  const { locale } = useWorkCopy();
  return <kbd dir="ltr" lang="en" aria-hidden={hidden || undefined} className="inline-flex h-7 [font-family:inherit] min-w-7 items-center justify-center rounded-md border border-line-strong bg-white px-1.5 text-[0.8125rem] font-semibold leading-none text-ink-800">
    {children}{label && <span className="sr-only" lang={locale}>{label}</span>}
  </kbd>;
}

function ShortcutsDialog({ views, onClose }: { views: StaffViewItem[]; onClose: () => void }) {
  const t = useWorkCopy().shortcuts;
  const on = useShortcutsEnabled();
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId(), switchTitle = useId(), switchHint = useId();
  // The CaseDrawer pattern: open as a modal once, and give the focus back to whatever opened it once it has left the page.
  const opener = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const node = dialog.current;
    opener.current ??= document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (node && !node.open) node.showModal();
    return () => { setTimeout(() => { if (node && !node.isConnected) opener.current?.focus(); }, 0); };
  }, []);

  const then = <span className="px-1 text-[0.8125rem] text-ink-500">{t.then}</span>;
  // Grouped by where a key works: everywhere (help, the views), in a list view (rows, search), on a case (next item).
  const anywhere: KeyRow[] = [
    { keys: <Key>?</Key>, text: t.help },
    ...views.map(view => ({ keys: <><Key>g</Key>{then}<Key>{VIEW_LETTER[view.id]}</Key></>, text: view.label })),
  ];
  const lists: KeyRow[] = [
    { keys: <><Key label={t.keys.down}><ArrowDown size={14} aria-hidden/></Key><Key label={t.keys.up}><ArrowUp size={14} aria-hidden/></Key><span aria-hidden className="px-0.5 text-ink-500">·</span><Key>j</Key><Key>k</Key></>, text: t.move },
    { keys: <><Key>{t.keys.home}</Key><Key>{t.keys.end}</Key></>, text: t.firstLast },
    { keys: <Key>{t.keys.enter}</Key>, text: t.openRow },
    { keys: <><Key>{t.keys.shift}</Key><span aria-hidden className="text-ink-500">+</span><Key>{t.keys.tab}</Key></>, text: t.rowActions },
    { keys: <Key>/</Key>, text: t.search },
  ];

  return <dialog ref={dialog} className="account-dialog" aria-labelledby={titleId} onClose={onClose}>
    <div className="sticky -top-6 z-10 -mx-6 -mt-6 flex items-start justify-between gap-4 border-b border-line bg-white px-6 pb-3 pt-6">
      <h2 id={titleId} className="title">{t.title}</h2>
      <button type="button" className="icon-button" aria-label={t.close} onClick={() => dialog.current?.close()}><X size={20} aria-hidden/></button>
    </div>
    <p className="mt-4 text-[0.9375rem] leading-7 text-ink-600">{t.intro}</p>
    {!on && <p className="mt-3 border-y border-line py-2 text-[0.9375rem] font-semibold text-ink-800">{t.offNote}</p>}
    <KeyGroup title={t.anywhere} rows={anywhere}/>
    <KeyGroup title={t.inList} rows={lists}/>
    <KeyGroup title={t.onCase} rows={[{ keys: <Key>n</Key>, text: t.next }]}/>
    <div className="mt-6 border-t border-line pt-4">
      <label className="flex min-h-11 cursor-pointer items-start gap-3">
        <input type="checkbox" className="mt-1 h-4 w-4 flex-none accent-brand-600" checked={on} aria-labelledby={switchTitle} aria-describedby={switchHint} onChange={event => setShortcutsEnabled(event.target.checked)}/>
        <span>
          <span id={switchTitle} className="block font-semibold text-ink-900">{t.switch}</span>
          <span id={switchHint} className="mt-0.5 block text-[0.875rem] leading-6 text-ink-600">{t.switchHint}</span>
        </span>
      </label>
    </div>
  </dialog>;
}

type KeyRow = { keys: ReactNode; text: string };

function KeyGroup({ title, rows }: { title: string; rows: KeyRow[] }) {
  const id = useId();
  return <section aria-labelledby={id} className="mt-5">
    <h3 id={id} className="label-micro text-ink-500">{title}</h3>
    <dl className="mt-2 divide-y divide-line border-y border-line">
      {rows.map(({ keys, text }) => <div key={text} className="grid grid-cols-[minmax(6.5rem,auto)_1fr] items-center gap-x-4 py-2">
        <dt className="flex flex-wrap items-center gap-1">{keys}</dt>
        <dd className="text-[0.9375rem] text-ink-700">{text}</dd>
      </div>)}
    </dl>
  </section>;
}
