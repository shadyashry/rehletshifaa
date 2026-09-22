"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { apiFetchAs } from "@/lib/api";
import type { Locale } from "@/lib/i18n";

export function ControlCenterNavigation({ locale }: { locale: Locale }) {
  const { user } = useAuth();
  const [allowed, setAllowed] = useState(false);
  useEffect(() => {
    let active = true; setAllowed(false);
    if (user) void apiFetchAs(user.access_token, "/admin/access/me").then(async (r) => {
      if (!r.ok) return;
      const decisions = await r.json() as { permission: string; allowed: boolean }[];
      if (active) setAllowed(decisions.some((d) => d.permission === "provider.view" && d.allowed));
    }).catch(() => {});
    return () => { active = false; };
  }, [user]);
  return allowed ? <Link className="btn-secondary my-3 inline-flex" href={"/" + locale + "/portal/control-center"}>{locale === "ar" ? "مركز تحكم مقدمي الرعاية" : "Provider Control Center"}</Link> : null;
}
