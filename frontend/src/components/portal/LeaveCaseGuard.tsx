"use client";

import { useCallback, useEffect, useId, useRef, type RefObject } from "react";

import { useWorkCopy } from "@/components/portal/portal-copy";

type TextField = HTMLInputElement | HTMLTextAreaElement;
const TEXT_INPUTS = new Set(["text", "email", "tel", "url", "number"]);
const isTextField = (target: EventTarget | null): target is TextField =>
  target instanceof HTMLTextAreaElement || (target instanceof HTMLInputElement && TEXT_INPUTS.has(target.type));

/**
 * Unsent text in the open case (plans/portal-p2-pass-3.md §1). A text field records its value when it is first focused;
 * a draft is any such field still on the page whose value has changed since. A sent form resets or unmounts its field,
 * so it stops counting, and no form has to opt in. Choices (selects, radios, checkboxes) are not drafts, and neither is
 * a search box. Watching restarts for every case (`key`). After a successful save, `rebaseline(control)` makes the
 * fields of the panel that saved clean again — the outermost form, section or dialog around the control that acted, or
 * every field when there is none — so saved text is not "unsent".
 */
export function useDraftWatch(root: RefObject<HTMLElement | null>, key: string | null) {
  const fields = useRef(new Map<TextField, string>());
  useEffect(() => {
    fields.current = new Map();
    const element = root.current;
    if (!element || !key) return;
    const onFocus = (event: FocusEvent) => {
      if (isTextField(event.target) && !fields.current.has(event.target)) fields.current.set(event.target, event.target.value);
    };
    element.addEventListener("focusin", onFocus);
    return () => element.removeEventListener("focusin", onFocus);
  }, [root, key]);
  const hasDraft = useCallback(() => [...fields.current].some(([field, initial]) => field.isConnected && field.value.trim() !== initial.trim()), []);
  const rebaseline = (control?: Element | null) => {
    let scope: Element | null = null;
    for (let node = control?.closest("form, section, dialog") ?? null; node && root.current?.contains(node); node = node.parentElement?.closest("form, section, dialog") ?? null) scope = node;
    for (const field of fields.current.keys()) if (!scope || scope.contains(field)) fields.current.set(field, field.value);
  };
  return { hasDraft, rebaseline };
}

/**
 * Asks before the case closes over unsent text. An in-page dialog, not `window.confirm`, so it speaks the page's
 * language; "Keep editing" has the focus and Escape keeps editing too.
 */
export function LeaveCaseDialog({ onStay, onLeave }: { onStay: () => void; onLeave: () => void }) {
  const t = useWorkCopy().leaveCase;
  const dialog = useRef<HTMLDialogElement>(null);
  const leaving = useRef(false);
  const stay = useRef<HTMLButtonElement>(null);
  const id = useId();
  // showModal gives the focus trap, Escape handling and focus restoration natively; the safe choice takes the focus.
  useEffect(() => { dialog.current?.showModal(); stay.current?.focus(); }, []);
  return (
    <dialog ref={dialog} className="account-dialog" role="alertdialog" aria-labelledby={`${id}-title`} aria-describedby={`${id}-body`}
            onClose={() => (leaving.current ? onLeave() : onStay())}>
      <h2 id={`${id}-title`} className="title">{t.title}</h2>
      <p id={`${id}-body`} className="mt-2 text-[0.9375rem] leading-6 text-ink-600">{t.body}</p>
      {/* The safe choice comes first in reading order and on top on phones; beside it from sm. */}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row-reverse sm:justify-start">
        <button type="button" ref={stay} className="btn-primary" onClick={() => dialog.current?.close()}>{t.stay}</button>
        <button type="button" className="btn-secondary" onClick={() => { leaving.current = true; dialog.current?.close(); }}>{t.leave}</button>
      </div>
    </dialog>
  );
}
