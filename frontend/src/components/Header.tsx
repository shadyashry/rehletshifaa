import Link from "next/link";
import { Menu } from "lucide-react";
import type { Locale } from "@/lib/i18n";
import { alternateLocale } from "@/lib/i18n";
import type { Dictionary } from "@/lib/dictionary";
import { TrackedLink } from "./TrackedLink";

export function Header({ locale, d }: { locale: Locale; d: Dictionary }) {
  const links = [["", d.nav.home], ["cardiology", d.nav.cardiology], ["consultants", d.nav.consultants], ["how-it-works", d.nav.how]];
  return <header className="border-b border-[#d9e4e9] bg-white/95">
    <div className="container-site flex min-h-20 items-center justify-between gap-5">
      <Link href={`/${locale}`} className="font-brand text-[1.3rem] font-extrabold text-[#08263b]" aria-label={`${d.common.brand} — ${d.nav.home}`}>{d.common.brand}</Link>
      <nav aria-label="Primary navigation" className="hidden items-center gap-7 lg:flex">
        {links.map(([path, label]) => <Link className="text-sm font-semibold text-[#385366] hover:text-[#176b92]" key={path} href={`/${locale}${path ? `/${path}` : ""}`}>{label}</Link>)}
      </nav>
      <div className="hidden items-center gap-3 lg:flex">
        <Link className="px-2 py-2 text-sm font-bold text-[#176b92]" href={`/${alternateLocale(locale)}`}>{d.nav.language}</Link>
        <TrackedLink event="send_case_cta_clicked" className="btn-primary" href={`/${locale}/send-my-case`}>{d.nav.send}</TrackedLink>
      </div>
      <details className="relative lg:hidden">
        <summary className="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-md border border-[#d9e4e9]" aria-label={d.common.menu}><Menu size={20} /></summary>
        <nav className="absolute end-0 top-14 z-50 w-64 rounded-lg border border-[#d9e4e9] bg-white p-3 shadow-xl" aria-label="Mobile navigation">
          {links.map(([path, label]) => <Link className="block rounded-md px-3 py-3 font-semibold hover:bg-[#f4f8fa]" key={path} href={`/${locale}${path ? `/${path}` : ""}`}>{label}</Link>)}
          <Link className="block rounded-md px-3 py-3 font-bold text-[#176b92]" href={`/${alternateLocale(locale)}`}>{d.nav.language}</Link>
          <TrackedLink event="send_case_cta_clicked" className="btn-primary mt-2 w-full" href={`/${locale}/send-my-case`}>{d.nav.send}</TrackedLink>
        </nav>
      </details>
    </div>
  </header>;
}

