"use client";

import { useCallback, useEffect, useRef } from "react";
import { useAuth } from "@/components/AuthProvider";
import { apiFetchAs } from "@/lib/api";
import { ControlCenterError } from "./cc-ui";

export type AdminApi = <T>(path: string, init?: { method?: string; body?: unknown; headers?: Record<string, string>; raw?: BodyInit }) => Promise<T>;

/**
 * One request helper for the redesigned Control Center screens. It keeps the backend's status and error code
 * (so the UI can show business language while support can still see the code). A sensitive action that needs a
 * recent sign-in surfaces as a `REAUTHENTICATION_REQUIRED` error; `ErrorNotice` explains it and offers the sign-in,
 * so the page never jumps to the sign-in screen unexplained. The returned function is stable and always uses
 * the latest access token, so a silent token renewal never re-runs a page's loads or discards a half-filled form.
 */
export function useAdminApi(): AdminApi {
  const { user } = useAuth();
  const latest = useRef({ user });
  useEffect(() => { latest.current = { user }; }, [user]);
  return useCallback(async <T,>(path: string, init: { method?: string; body?: unknown; headers?: Record<string, string>; raw?: BodyInit } = {}): Promise<T> => {
    const current = latest.current.user ?? user;
    if (!current) throw new ControlCenterError("Sign-in required", "AUTHENTICATION_REQUIRED", 401);
    const response = await apiFetchAs(current.access_token, path, {
      method: init.method ?? "GET", headers: init.headers,
      ...(init.raw !== undefined ? { body: init.raw } : init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    }).catch(() => { throw new ControlCenterError("Network error", "NETWORK_ERROR"); });
    if (!response.ok) {
      const data = await response.json().catch(() => ({})) as { code?: string; message?: string };
      throw new ControlCenterError(data.message || data.code || String(response.status), data.code, response.status);
    }
    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as T;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
