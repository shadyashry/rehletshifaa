import { SectionHeader } from "@/components/SectionHeader";
import type { Dictionary } from "@/lib/dictionary";
import type { Locale } from "@/lib/i18n";

export function JourneyFilm({ d, locale }: { d: Dictionary; locale: Locale }) {
  const arabic = locale === "ar";
  const source = arabic ? "/media/rehletshifaa-journey-ar.mp4?v=4" : "/media/rehletshifaa-journey-en.mp4?v=2";
  const poster = arabic ? "/media/rehletshifaa-journey-ar-poster.jpg" : "/media/rehletshifaa-journey-en-poster.jpg";
  const label = arabic
    ? "رحلة المريض مع رحلة شفاء، من مشاركة التقارير الطبية إلى المتابعة المنظمة"
    : "RehletShifaa patient journey from sharing medical reports to coordinated follow-up";

  return (
    <section id="journey-video" className="section scroll-mt-24 border-b border-line bg-white">
      <div className="container-site">
        <SectionHeader eyebrow={d.home.video.eyebrow} title={d.home.video.title} intro={d.home.video.intro} />
        <div className="mt-10 overflow-hidden rounded-3xl border border-line bg-mist shadow-[0_24px_70px_-46px_rgba(41,69,77,0.5)]">
          <video
            className="block aspect-video w-full bg-mist"
            controls
            playsInline
            preload="metadata"
            poster={poster}
            aria-label={label}
          >
            <source src={source} type="video/mp4" />
            {arabic ? "متصفحك لا يدعم تشغيل الفيديو." : "Your browser does not support embedded video."}
          </video>
        </div>
        <p className="mt-4 text-center text-sm font-medium text-ink-500">
          {arabic ? "٧٠ ثانية · صوت نسائي عربي واضح · موسيقى هادئة · نصوص توضيحية كاملة" : "62 seconds · professionally narrated · fully captioned"}
        </p>
      </div>
    </section>
  );
}
