import { HowYourPriceWorks } from "@/components/PriceTransparency";
import type { Dictionary } from "@/lib/dictionary";

/**
 * "How your price works": the same three steps the proposal shows, in front of the visitor before they send a case.
 * No action of its own — the page already has one — so the promise is read, not sold. The guarantee wording comes from
 * a single key per language, which counsel's approved text replaces.
 */
export function PriceSection({ d }: { d: Dictionary }) {
  return (
    <section className="bg-surface-default py-[clamp(2.5rem,1.9rem+1.8vw,3.75rem)]">
      <div className="container-site max-w-[1120px]">
        <HowYourPriceWorks copy={d.portalProposal.price} headingId="home-price-works" layout="columns" headingClassName="headline max-w-[26ch] [text-wrap:balance]" />
      </div>
    </section>
  );
}
