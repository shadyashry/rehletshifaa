import type { Dictionary } from "@/lib/dictionary";
import { intlLocale, type Locale } from "@/lib/i18n";
import { CaseStoryTabs } from "./CaseStoryTabs";
import { CareScene, DecideScene, RecommendationScene, ReviewScene, SendScene } from "./StoryScenes";

/**
 * The hero's picture: one example case told in five scenes that follow How It Works — send your case, Consultant
 * review, the recommendation priced in your currency, your decision, treatment and follow-up. Each scene opens on a
 * moment from the patient film (the same patient throughout) and shows, in readable words, what the platform does at
 * that step. The scenes are rendered here, on the server; `CaseStoryTabs` only chooses which one is showing.
 *
 * Every figure in it is an example and says so: the case number, the stamp date (today) and the validity date (thirty
 * days from today) are the only computed values, and no price is shown.
 */
export function CaseStory({ locale, d }: { locale: Locale; d: Dictionary }) {
  const s = d.home.story;
  const dir = locale === "ar" ? "rtl" : "ltr";
  const today = new Date();
  const validDate = new Intl.DateTimeFormat(intlLocale(locale), { day: "numeric", month: "short" })
    .format(new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000));
  const [send, review, recommendation, decide, care] = s.steps;

  return (
    <figure className="case-story-card m-0 flex w-full min-w-0 flex-col">
        <CaseStoryTabs
          label={s.label}
          steps={s.steps.map(({ label }) => ({ label }))}
          pauseLabel={s.pause}
          playLabel={s.play}
          scenes={[
            <SendScene key="send" s={s} step={send} dir={dir} locale={locale} receivedOn={today.toISOString()} />,
            <ReviewScene key="review" s={s} step={review} dir={dir} />,
            <RecommendationScene key="recommendation" s={s} step={recommendation} dir={dir} validUntil={s.recommendation.validUntil.replace("{date}", validDate)} />,
            <DecideScene key="decide" s={s} step={decide} dir={dir} />,
            <CareScene key="care" s={s} step={care} dir={dir} />,
          ]}
        />
      {/* Inside the card, so the card and the text column end on one line. */}
      <figcaption className="mt-auto flex flex-wrap justify-between gap-x-4 gap-y-0.5 border-t border-line bg-surface-pearl px-4 py-2.5 text-[0.75rem] leading-5 text-ink-500 sm:px-5">
        {/* The preliminary notice already sits beside the headline; the card only says this case is an example. */}
        <span>{s.example}</span>
      </figcaption>
    </figure>
  );
}
