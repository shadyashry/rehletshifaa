import type { Me, Workspace } from "@/lib/access";

/**
 * Test helper: a fake `apiFetchAs` answering by path. Keys are either a path ("/admin/practitioners") or
 * "METHOD path" ("POST /admin/practitioners"); values are the JSON body, a Response, or a function of the request.
 * Unknown paths answer `{}`.
 */
type Handler = unknown | Response | ((init?: RequestInit) => unknown | Response);
export function fakeApi(map: Record<string, Handler>) {
  return async (_token: string, path: string, init?: RequestInit): Promise<Response> => {
    const method = (init?.method ?? "GET").toUpperCase();
    const handler = map[`${method} ${path}`] ?? (method === "GET" ? map[path] : undefined);
    if (handler === undefined) return json({});
    const value = typeof handler === "function" ? (handler as (i?: RequestInit) => unknown)(init) : handler;
    return value instanceof Response ? value : json(value);
  };
}
export const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
export const failure = (status: number, code: string, message = code) => json({ code, message }, status);

/** What `GET /api/v1/me` would report for someone holding these platform permissions (and optionally workspaces/roles). */
export function meWith(permissions: string[], extra: Partial<Me> = {}): Me {
  const workspaces: Workspace[] = extra.workspaces ?? (permissions.length ? ["CONTROL_CENTER"] : []);
  return {
    subject: "owner", roles: [], permissions, reauthenticate: [], workspaces, managedFunctions: [],
    platformAccountOwner: false, workforce: null, pendingActions: [], ...extra,
  };
}
