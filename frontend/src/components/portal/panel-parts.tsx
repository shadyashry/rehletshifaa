"use client";

import { Component, useState, type FormEvent, type ReactNode } from "react";
import { ChevronDown, CircleAlert } from "lucide-react";

import { ConfirmDialog } from "@/components/portal/portal-ui";

/**
 * The small pieces the staff evidence panels share (P1-15 "Admission & money", P1-16 "Treatment"): a recording task that
 * opens first when it is the viewer's next thing to do, a labelled fact, an amount isolated left-to-right, a picker of the
 * case's checked documents, an action behind a confirmation, the form helpers, and the boundary each panel renders inside.
 */

/**
 * UX 3-2: one panel that cannot be drawn (a view the page does not expect) says so in its own place; the cover, the step
 * and the other panels keep working. Keyed per case by the page, so opening another case starts afresh.
 */
export class PanelBoundary extends Component<{ title: string; message: string; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <section className="card p-5" aria-label={this.props.title}>
        <h3 className="title text-base">{this.props.title}</h3>
        <p role="alert" className="mt-2 flex items-start gap-2 text-[0.875rem] text-alert-800"><CircleAlert size={16} aria-hidden className="mt-0.5 flex-none"/>{this.props.message}</p>
      </section>
    );
  }
}
export type PanelDocument = { documentId: string; fileName: string; status: string };

/** One recording task: a disclosure whose summary names the outcome; the next task opens first and carries the `anchor` id. */
export function Task({ title, next, anchor, children }: { title: string; next: boolean; anchor: string; children: ReactNode }) {
  return (
    <details className="group border-t border-line" open={next || undefined} id={next ? anchor : undefined}>
      <Summary>{title}</Summary>
      <div className="pb-3">{children}</div>
    </details>
  );
}

/** A disclosure's summary with a drawn marker that turns as it opens (the native marker is gone once it is a flex box). Its
 * `<details>` carries `group`. */
export function Summary({ children }: { children: ReactNode }) {
  return (
    <summary className="inline-flex min-h-11 cursor-pointer list-none flex-wrap items-center gap-x-2 text-sm font-bold text-brand-700 hover:text-brand-900 [&::-webkit-details-marker]:hidden">
      <ChevronDown size={16} aria-hidden className="flex-none transition-transform group-open:rotate-180 motion-reduce:transition-none"/>{children}
    </summary>
  );
}

export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return <div><dt className="text-ink-500">{label}</dt><dd className="font-semibold text-ink-900">{children}</dd></div>;
}

export function Money({ children }: { children: ReactNode }) {
  return <bdi dir="ltr" className="tabular-nums">{children}</bdi>;
}

export function DocumentPicker({ name, label, empty, documents, required = false }: { name: string; label: string; empty: string; documents: PanelDocument[]; required?: boolean }) {
  return (
    <label className="block text-sm font-semibold">{label}
      <select className="field" name={name} required={required} defaultValue="">
        <option value="">{empty}</option>
        {documents.filter(d => d.status === "CLEAN").map(d => <option key={d.documentId} value={d.documentId}>{d.fileName}</option>)}
      </select>
    </label>
  );
}

/** A button whose action runs only after a confirmation (countersigning, withdrawing): the dialog names the consequence. */
export function ConfirmAction({ label, context, title, body, confirm, cancel, primary, busy, onConfirm }: {
  label: string; /** Read after the label by screen readers, so several identical buttons stay distinguishable. */ context?: string;
  title: string; body: string; confirm: string; cancel: string; primary: boolean; busy: boolean; onConfirm: () => Promise<unknown>;
}) {
  const [confirming, setConfirming] = useState(false);
  return (
    <>
      <button type="button" className={primary ? "btn-primary" : "btn-secondary"} disabled={busy} onClick={() => setConfirming(true)}>
        {label}{context && <span className="sr-only">: {context}</span>}
      </button>
      {confirming && <ConfirmDialog title={title} body={body} confirm={confirm} cancel={cancel}
                                    onConfirm={() => { setConfirming(false); void onConfirm(); }} onCancel={() => setConfirming(false)}/>}
    </>
  );
}

/** A code's words from a copy table, or the code itself in plain lower case when the table does not know it yet. */
export const pick = (table: Record<string, string>, key: string) => Object.hasOwn(table, key) ? table[key] : key.replaceAll("_", " ").toLowerCase();
export function instant(value: FormDataEntryValue | null) { return value ? new Date(String(value)).toISOString() : null; }
export function text(value: FormDataEntryValue | null) { const v = String(value ?? "").trim(); return v || null; }
/** Submits a form's data; the form is cleared once the command succeeded. */
export function submit(action: (data: FormData) => Promise<boolean>) {
  return (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = event.currentTarget; void action(new FormData(form)).then(done => { if (done) form.reset(); }); };
}
