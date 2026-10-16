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
    <figure className="m-0 w-full min-w-0">
      <div className="case-story-card">
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
      </div>
      <figcaption className="mt-2.5 flex flex-wrap justify-between gap-x-4 gap-y-1 text-[0.8125rem] leading-5 text-ink-500">
        <span>{s.example}</span>
        <span>{s.preliminary}</span>
      </figcaption>
    </figure>
  );
}
