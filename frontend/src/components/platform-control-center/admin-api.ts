"use client";

import { useCallback, useEffect, useRef } from "react";
import { useAuth } from "@/components/AuthProvider";
import { apiFetchAs } from "@/lib/api";
import { ControlCenterError } from "./cc-ui";

export type AdminApi = <T>(path: string, init?: { method?: string; body?: unknown; headers?: Record<string, string>; raw?: BodyInit }) => Promise<T>;

/**
 * One request helper for the redesigned Control Center screens. It keeps the backend's status and error code
 * (so the UI can show business language while support can still see the code) and sends the admin back through
 * sign-in when a sensitive action needs a recent authentication. The returned function is stable and always uses
 * the latest access token, so a silent token renewal never re-runs a page's loads or discards a half-filled form.
 */
export function useAdminApi(): AdminApi {
  const { user, signIn } = useAuth();
  const latest = useRef({ user, signIn });
  useEffect(() => { latest.current = { user, signIn }; }, [user, signIn]);
  return useCallback(async <T,>(path: string, init: { method?: string; body?: unknown; headers?: Record<string, string>; raw?: BodyInit } = {}): Promise<T> => {
    const { user: current, signIn: reauthenticate } = latest.current.user ? latest.current : { user, signIn };
    if (!current) throw new ControlCenterError("Sign-in required", "AUTHENTICATION_REQUIRED", 401);
    const response = await apiFetchAs(current.access_token, path, {
      method: init.method ?? "GET", headers: init.headers,
      ...(init.raw !== undefined ? { body: init.raw } : init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({})) as { code?: string; message?: string };
      if (data.code === "REAUTHENTICATION_REQUIRED") await reauthenticate(true);
      throw new ControlCenterError(data.message || data.code || String(response.status), data.code, response.status);
    }
    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as T;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
