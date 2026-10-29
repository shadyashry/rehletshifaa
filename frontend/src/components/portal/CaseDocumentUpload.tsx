"use client";

import { useId, useState } from "react";
import { LoaderCircle, Upload } from "lucide-react";

import { allowedFileTypes, maxFileBytes } from "@/lib/case-form-schema";
import { fillTemplate } from "@/lib/portal-labels";
import { putWithProgress } from "@/lib/upload";
import { useWorkCopy } from "@/components/portal/portal-copy";
import type { CaseDocument } from "@/components/portal/MyCare";

/** A business call with a method and body: the portal's authenticated `api`. */
export type Send = <T>(path: string, init: RequestInit) => Promise<T>;

type Presign = { documentId: string; uploadUrl: string; requiredHeaders: Record<string, string> };
type Pending = { documentId: string; name: string };
type UploadState =
  | { phase: "idle" }
  | { phase: "sending"; name: string; sent: number }
  | { phase: "checking" | "ready"; name: string }
  | { phase: "failed"; message: string; retry?: Pending };

const ACCEPT = ".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png";
const codeOf = (failure: unknown) => (failure as { code?: string } | null)?.code;

/**
 * Adds a file to the patient's own case from My Care (`/patient/cases/{id}/documents`): presign, put the bytes, then confirm,
 * which is when the scanner runs. Only a file that comes back CLEAN is handed on (`onUploaded`). A scanner outage keeps the
 * stored file: "Check again" confirms the same upload rather than sending it twice, and the backend sweeper checks it later
 * if nobody does. Used by the guardian step (the new file becomes the evidence) and the Documents tab.
 */
export function CaseDocumentUpload({ caseId, send, lead, ready, onUploaded, base: endpoint }: {
  caseId: string; send: Send; lead?: string | null;
  /** Where the presign and confirm go: the patient's own (default) or the case team's (`/work/cases/{id}/documents`, D-10). */
  base?: string;
  /** What a clean upload led to, with `{name}`; by default "… is now in your documents". */
  ready?: string;
  onUploaded: (doc: CaseDocument) => void;
}) {
  const t = useWorkCopy().myCare.upload;
  const id = useId();
  const [state, setState] = useState<UploadState>({ phase: "idle" });
  const working = state.phase === "sending" || state.phase === "checking";
  const base = endpoint ?? `/patient/cases/${caseId}/documents`;

  async function check(pending: Pending) {
    setState({ phase: "checking", name: pending.name });
    try {
      await send(`${base}/confirm`, { method: "POST", body: JSON.stringify({ documentId: pending.documentId }) });
      setState({ phase: "ready", name: pending.name });
      onUploaded({ documentId: pending.documentId, fileName: pending.name, status: "CLEAN", createdAt: new Date().toISOString() });
    } catch (failure) {
      const code = codeOf(failure);
      setState(code === "DOCUMENT_SCAN_UNAVAILABLE" ? { phase: "failed", message: t.unavailable, retry: pending }
        : code === "DOCUMENT_INSPECTION_FAILED" || code === "DOCUMENT_METADATA_MISMATCH" ? { phase: "failed", message: fillTemplate(t.rejected, { name: pending.name }) }
        : { phase: "failed", message: t.failed });
    }
  }

  async function choose(file: File) {
    if (!allowedFileTypes.includes(file.type)) { setState({ phase: "failed", message: t.wrongType }); return; }
    if (file.size <= 0 || file.size > maxFileBytes) { setState({ phase: "failed", message: t.tooLarge }); return; }
    setState({ phase: "sending", name: file.name, sent: 0 });
    let pending: Pending;
    try {
      const presign = await send<Presign>(`${base}/presign`, { method: "POST", body: JSON.stringify({ originalFileName: file.name, contentType: file.type, sizeBytes: file.size }) });
      const stored = await putWithProgress(presign.uploadUrl, presign.requiredHeaders, file,
        sent => setState(current => current.phase === "sending" ? { ...current, sent } : current));
      if (!stored) throw new Error("UPLOAD_FAILED");
      pending = { documentId: presign.documentId, name: file.name };
    } catch (failure) {
      const code = codeOf(failure);
      setState({ phase: "failed", message: code === "CASE_FILE_LIMIT_REACHED" || code === "CASE_STORAGE_LIMIT_REACHED" ? t.full
        : code === "UNSUPPORTED_FILE_TYPE" ? t.wrongType : code === "INVALID_FILE_SIZE" ? t.tooLarge : t.failed });
      return;
    }
    await check(pending);
  }

  const status = state.phase === "sending" ? t.sending : state.phase === "checking" ? t.checking : state.phase === "ready" ? ready ?? t.added : null;
  return (
    <div className="mt-3">
      {lead && <p className="text-[0.9375rem] leading-6 text-ink-700">{lead}</p>}
      <p id={`${id}-rules`} className="mt-1 max-w-[65ch] text-[0.875rem] leading-6 text-ink-500">{t.rules}</p>
      <label className={`btn-secondary mt-3 cursor-pointer has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand-600 ${working ? "pointer-events-none opacity-60" : ""}`}>
        <Upload size={17} aria-hidden/>
        {t.choose}
        <input type="file" className="sr-only" accept={ACCEPT} disabled={working} aria-describedby={`${id}-rules`}
               onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (file) void choose(file); }}/>
      </label>
      {state.phase === "sending" && (
        // How much of the file has gone, outside the live region so a screen reader is not read every step.
        <div role="progressbar" aria-label={fillTemplate(t.sending, { name: state.name })} aria-valuemin={0} aria-valuemax={100}
             aria-valuenow={Math.round(state.sent * 100)} className="mt-3 h-1.5 max-w-[24rem] overflow-hidden rounded-full bg-line">
          <div className="h-full rounded-full bg-brand-600 motion-safe:transition-[inline-size] motion-safe:duration-200" style={{ inlineSize: `${Math.round(state.sent * 100)}%` }}/>
        </div>
      )}
      {/* Always rendered, so the live region exists before the first message lands in it. */}
      <p role="status" className="mt-2 flex items-center gap-2 text-[0.875rem] leading-6 text-ink-600">
        {working && <LoaderCircle size={15} aria-hidden className="flex-none text-brand-700 motion-safe:animate-spin"/>}
        {status && "name" in state && <span dir="auto">{fillTemplate(status, { name: state.name })}</span>}
      </p>
      {state.phase === "failed" && (
        <div role="alert">
          <p className="error-text" dir="auto">{state.message}</p>
          {state.retry && <button type="button" className="btn-secondary mt-2" onClick={() => { if (state.retry) void check(state.retry); }}>{t.retry}</button>}
        </div>
      )}
    </div>
  );
}
