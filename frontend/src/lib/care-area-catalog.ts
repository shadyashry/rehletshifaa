import { additionalCareAreas } from "./additional-care-areas";
import { CARE_AREA_SLUGS } from "./care-areas";
import { getConsultants, type ConsultantProfile } from "./consultants";
import type { Dictionary } from "./dictionary";
import type { Locale } from "./i18n";

/** The body systems the Care Areas atlas is organised by, in atlas (and care-network wheel) order. */
export const CARE_SYSTEMS = ["heart", "neuro", "movement", "digestive", "surgery", "women"] as const;
export type CareSystem = (typeof CARE_SYSTEMS)[number];

export type CareAreaIconName = "heart" | "vessel" | "brain" | "rehab" | "bone" | "digestive" | "surgery" | "plastic" | "women";

type CatalogEntry = {
  slug: string;
  system: CareSystem;
  icon: CareAreaIconName;
  /** The short label used on the care-network wheel. */
  short: Record<Locale, string>;
  /** Three approved sub-area labels, derived from the care-area body copy. */
  facets: Record<Locale, readonly string[]>;
};

/** Presentation metadata per public care area — titles and bodies stay in the dictionaries / additional catalogue. */
const CATALOG: readonly CatalogEntry[] = [
  { slug: "cardiology", system: "heart", icon: "heart", short: { en: "Cardiology", ar: "القلب" }, facets: { en: ["Coronary", "Structural heart", "Heart rhythm"], ar: ["الشرايين التاجية", "القلب الهيكلي", "نظم القلب"] } },
  { slug: "vascular-endovascular-surgery", system: "heart", icon: "vessel", short: { en: "Vascular", ar: "الأوعية الدموية" }, facets: { en: ["Arterial disease", "Aortic aneurysm", "Dialysis access"], ar: ["أمراض الشرايين", "تمدد الأورطي", "وصلات الغسيل الكلوي"] } },
  { slug: "interventional-neuroradiology", system: "neuro", icon: "brain", short: { en: "Neurointervention", ar: "الأشعة العصبية" }, facets: { en: ["Brain vessels", "Spinal vessels", "Catheter-based treatment"], ar: ["أوعية المخ", "أوعية الحبل الشوكي", "العلاج بالقسطرة"] } },
  { slug: "rheumatology-rehabilitation", system: "neuro", icon: "rehab", short: { en: "Rehab & swallowing", ar: "التأهيل والبلع" }, facets: { en: ["Adult & pediatric dysphagia", "Physical medicine", "Rheumatology"], ar: ["البلع للكبار والأطفال", "الطب الطبيعي", "الروماتيزم"] } },
  { slug: "orthopedics", system: "movement", icon: "bone", short: { en: "Orthopedics", ar: "العظام" }, facets: { en: ["Joint replacement", "Sports injuries", "Spine assessment"], ar: ["استبدال المفاصل", "إصابات الملاعب", "تقييم العمود الفقري"] } },
  { slug: "gastroenterology-hepatology", system: "digestive", icon: "digestive", short: { en: "Digestive & liver", ar: "الهضمي والكبد" }, facets: { en: ["Hepatology", "Inflammatory bowel disease", "Advanced endoscopy"], ar: ["أمراض الكبد", "التهاب الأمعاء", "المناظير المتقدمة"] } },
  { slug: "general-surgery", system: "surgery", icon: "surgery", short: { en: "General surgery", ar: "الجراحة العامة" }, facets: { en: ["Laparoscopic", "Bariatric", "Hepatobiliary & pancreatic"], ar: ["المناظير", "جراحات السمنة", "الكبد والبنكرياس"] } },
  { slug: "plastic-reconstructive-surgery", system: "surgery", icon: "plastic", short: { en: "Plastic surgery", ar: "التجميل والترميم" }, facets: { en: ["Reconstructive", "Hand & burns", "Maxillofacial"], ar: ["الترميم", "اليد والحروق", "الوجه والفكين"] } },
  { slug: "womens-health", system: "women", icon: "women", short: { en: "Women’s health", ar: "صحة المرأة" }, facets: { en: ["Obstetrics", "Gynecology", "Pelvic surgery"], ar: ["التوليد", "أمراض النساء", "جراحات الحوض"] } },
];

/** Body system and icon of a care area (by slug); undefined for an unknown slug. */
export function careAreaMeta(slug: string): { system: CareSystem; icon: CareAreaIconName } | undefined {
  const entry = CATALOG.find((item) => item.slug === slug);
  return entry ? { system: entry.system, icon: entry.icon } : undefined;
}

export type AtlasArea = {
  slug: string;
  title: string;
  body: string;
  short: string;
  facets: readonly string[];
  icon: CareAreaIconName;
  system: CareSystem;
  consultants: readonly ConsultantProfile[];
};

export type AtlasSystem = { key: CareSystem; title: string; body: string; areas: readonly AtlasArea[] };

/** Every public care area with its copy, presentation metadata and attached consultants, in wheel order. */
export function careAreaAtlas(locale: Locale, d: Dictionary): readonly AtlasArea[] {
  const copy = new Map<string, { title: string; body: string }>([
    ...CARE_AREA_SLUGS.map((slug, index) => [slug, d.home.areas[index]] as const),
    ...additionalCareAreas(locale).map((area) => [area.slug, area] as const),
  ]);
  const consultants = getConsultants(locale);
  return CATALOG.flatMap((entry) => {
    const text = copy.get(entry.slug);
    if (!text) return [];
    return [{
      slug: entry.slug,
      title: text.title,
      body: text.body,
      short: entry.short[locale],
      facets: entry.facets[locale],
      icon: entry.icon,
      system: entry.system,
      consultants: consultants.filter((profile) => profile.careAreaHref === entry.slug),
    }];
  });
}

/** The atlas grouped by body system; systems without a public area are dropped. */
export function careAtlasSystems(areas: readonly AtlasArea[], d: Dictionary): readonly AtlasSystem[] {
  return CARE_SYSTEMS.map((key) => ({ key, ...d.careAreasPage.systems[key], areas: areas.filter((area) => area.system === key) }))
    .filter((system) => system.areas.length > 0);
}
