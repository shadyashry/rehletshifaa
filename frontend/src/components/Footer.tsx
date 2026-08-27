import Link from "next/link";
import type { Locale } from "@/lib/i18n";
import type { Dictionary } from "@/lib/dictionary";

export function Footer({ locale, d }: { locale: Locale; d: Dictionary }) {
  const links = [["", d.nav.home], ["cardiology", d.nav.cardiology], ["consultants", d.nav.consultants], ["how-it-works", d.nav.how], ["send-my-case", d.nav.send]];
  return <footer className="bg-[#08263b] text-white">
    <div className="container-site grid gap-10 py-14 md:grid-cols-[.8fr_1.2fr]">
      <div><p className="font-brand text-2xl font-extrabold">{d.common.brand}</p><p className="mt-2 text-[#b8d1dc]">{d.common.tagline}</p></div>
      <div>
        <nav className="flex flex-wrap gap-x-6 gap-y-3 text-sm font-semibold text-[#d8e7ed]" aria-label="Footer navigation">
          {links.map(([path, label]) => <Link key={path} href={`/${locale}${path ? `/${path}` : ""}`}>{label}</Link>)}
          <Link href={`/${locale}/privacy`}>{d.common.privacy}</Link><Link href={`/${locale}/terms`}>{d.common.terms}</Link><Link href={`/${locale}/medical-disclaimer`}>{d.common.disclaimer}</Link>
        </nav>
        <p className="mt-8 max-w-3xl text-xs leading-6 text-[#9fbac6]">{d.common.medicalNotice}</p>
      </div>
    </div>
  </footer>;
}

