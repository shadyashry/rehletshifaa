export function PageHero({ eyebrow, title, intro, children }: { eyebrow: string; title: string; intro: string; children?: React.ReactNode }) {
  return <section className="relative overflow-hidden border-b border-[#e5edf1] bg-[#f8fbfc]">
    <div className="absolute inset-y-0 end-0 w-1/3 bg-[radial-gradient(circle_at_center,#d5eef0_0,transparent_68%)] opacity-80" aria-hidden="true" />
    <div className="container-site relative py-20 md:py-28"><p className="eyebrow">{eyebrow}</p><h1 className="headline mt-5 max-w-4xl">{title}</h1><p className="lead mt-6 max-w-3xl">{intro}</p>{children && <div className="mt-8">{children}</div>}</div>
  </section>;
}

