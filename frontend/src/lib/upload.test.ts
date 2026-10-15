import { afterEach, describe, expect, it, vi } from "vitest";

import { putWithProgress } from "./upload";

/** A stand-in for the browser's XMLHttpRequest: records the call and lets the test drive its events. */
class FakeRequest {
  static last: FakeRequest;
  method = ""; url = ""; headers: Record<string, string> = {}; body: unknown; status = 0;
  upload: { onprogress?: (event: { lengthComputable: boolean; loaded: number; total: number }) => void } = {};
  onload?: () => void; onerror?: () => void; onabort?: () => void; ontimeout?: () => void;
  constructor() { FakeRequest.last = this; }
  open(method: string, url: string) { this.method = method; this.url = url; }
  setRequestHeader(name: string, value: string) { this.headers[name] = value; }
  send(body: unknown) { this.body = body; }
}

describe("putWithProgress", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("puts the file with the presigned headers, reports progress and resolves on the store's answer", async () => {
    vi.stubGlobal("XMLHttpRequest", FakeRequest);
    const progress = vi.fn();
    const file = new Blob(["%PDF"], { type: "application/pdf" });
    const result = putWithProgress("https://upload.test/x", { "Content-Type": "application/pdf" }, file, progress);
    const request = FakeRequest.last;
    expect([request.method, request.url, request.headers, request.body]).toEqual(["PUT", "https://upload.test/x", { "Content-Type": "application/pdf" }, file]);
    request.upload.onprogress?.({ lengthComputable: true, loaded: 25, total: 100 });
    request.upload.onprogress?.({ lengthComputable: false, loaded: 0, total: 0 });
    expect(progress.mock.calls).toEqual([[0.25]]);
    request.status = 200; request.onload?.();
    expect(await result).toBe(true);
  });

  it("resolves false when the store refuses or the network fails", async () => {
    vi.stubGlobal("XMLHttpRequest", FakeRequest);
    const refused = putWithProgress("https://upload.test/x", {}, new Blob(["x"]), vi.fn());
    FakeRequest.last.status = 403; FakeRequest.last.onload?.();
    expect(await refused).toBe(false);
    const failed = putWithProgress("https://upload.test/x", {}, new Blob(["x"]), vi.fn());
    FakeRequest.last.onerror?.();
    expect(await failed).toBe(false);
  });
});
