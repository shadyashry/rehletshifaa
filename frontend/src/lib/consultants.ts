import type { Locale } from "./i18n";
import { API_BASE_URL } from "./api";

/**
 * Consultant profiles come only from the platform (GET /api/v1/public/consultants): the public site keeps no profile
 * data of its own, so a doctor shown here always exists as a platform Consultant profile, with its care area and label
 * from the platform's care-area lookup. Server-side only; read fresh on each request.
 */

export type ConsultantProfile = {
  slug: string;
  initials: string;
  name: string;
  credentials: string;
  achievementBadges: readonly string[];
  specialty: string;
  role: string;
  location: string;
  summary: string;
  /** The listing card's evidence line (≈20–30 words); the full summary lives on the profile page. */
  cardSummary: string;
  /** One clinical anchor and its CV-sourced related areas (from focusAreas / summary); short labels are shown as tags above the profile's focus list. Qualitative only. */
  expertise: { anchor: string; areas: readonly string[] };
  /** A CV-sourced professional distinction (appointment or role) from appointments/qualifications — shown only when it adds value. */
  distinction?: string;
  /** The two or three strongest credibility signals for the card: qualification / certification. */
  signals: readonly string[];
  focusAreas: readonly string[];
  qualifications: readonly string[];
  appointments: readonly string[];
  professionalStanding: readonly string[];
  careAreaHref: string;
  careAreaLabel: string;
  verification: string;
  externalLinks?: readonly { label: string; href: string }[];
  /** An approved portrait (consistent chest-up crop on a neutral ground). Until one exists the monogram is shown. */
  achievements?: readonly string[];
  sourceFile?: string;
  portrait?: { src: string; alt: string };
};

export const consultantUi = {
  en: {
    eyebrow: "Senior clinical authority",
    pageTitle: "Meet the Consultants behind your care",
    pageIntro: "Every case is matched to the appropriate Consultant according to clinical need. You do not need to choose a Consultant before you start.",
    matching: ["Your case", "Clinical matching", "Appropriate Consultant"],
    rail: ["Credentials reviewed before matching", "Consultant-owned clinical decision", "Arabic & English coordination"],
    verificationEyebrow: "Profile review",
    verificationTitle: "Credentials are reviewed before a patient is matched.",
    notice: "Profile information is based on consultant-provided CVs and official institutional sources.",
    viewProfile: "View full profile",
    viewProfileOf: (name: string) => `View ${name}'s full profile`,
    clinicalExpertise: "Clinical expertise",
    verifiedRole: "Professional distinction",
    meetConsultant: "Meet the consultant",
    focus: "Clinical focus",
    qualifications: "Qualifications",
    appointments: "Current and recent appointments",
    standing: "Professional standing",
    sources: "Professional links",
    back: "All consultants",
    careArea: "Explore this care area",
  },
  ar: {
    eyebrow: "مرجعية سريرية أولى",
    pageTitle: "تعرّف على الاستشاريين القائمين على رعايتك",
    pageIntro: "تُوجَّه كل حالة إلى الاستشاري المناسب وفق الحاجة السريرية. لا تحتاج إلى اختيار استشاري قبل أن تبدأ.",
    matching: ["حالتك", "توجيه سريري", "الاستشاري المناسب"],
    rail: ["مراجعة المؤهلات قبل التوجيه", "قرار سريري يملكه الاستشاري", "تنسيق بالعربية والإنجليزية"],
    verificationEyebrow: "مراجعة الملفات",
    verificationTitle: "تُراجَع المؤهلات قبل توجيه أي مريض.",
    notice: "تستند معلومات الملفات إلى السير الذاتية المقدمة من الاستشاريين والمصادر المؤسسية الرسمية.",
    viewProfile: "عرض الملف الكامل",
    viewProfileOf: (name: string) => `عرض الملف الكامل: ${name}`,
    clinicalExpertise: "الخبرة السريرية",
    verifiedRole: "تميز مهني",
    meetConsultant: "تعرّف على الاستشاري",
    focus: "مجالات التركيز السريري",
    qualifications: "المؤهلات",
    appointments: "المناصب الحالية والحديثة",
    standing: "الانتماءات والاعتمادات المهنية",
    sources: "روابط مهنية",
    back: "جميع الاستشاريين",
    careArea: "استكشف مجال الرعاية",
  },
} as const;


/** Server-to-server base: the container network address when set, else the public API address. */
const SERVER_API = (process.env.API_INTERNAL_BASE_URL ?? API_BASE_URL).replace(/\/+$/, "");

async function read<T>(path: string, fallback: T): Promise<T> {
  try {
    const response = await fetch(`${SERVER_API}/api/v1/public/consultants${path}`, { cache: "no-store" });
    if (!response.ok) return fallback;
    return (await response.json()) as T;
  } catch {
    // The directory is unavailable (backend down): pages render without Consultants rather than failing.
    return fallback;
  }
}

/** Published Consultants, in directory order. */
export function getConsultants(locale: Locale): Promise<readonly ConsultantProfile[]> {
  return read<ConsultantProfile[]>(`?locale=${locale}`, []);
}

export function getConsultant(locale: Locale, slug: string): Promise<ConsultantProfile | undefined> {
  return read<ConsultantProfile | undefined>(`/${encodeURIComponent(slug)}?locale=${locale}`, undefined);
}

/** Consultants holding a university faculty appointment, read from the role in either language. */
export function universityFacultySlugs(profiles: readonly ConsultantProfile[]): ReadonlySet<string> {
  return new Set(profiles.filter((profile) => /professor|lecturer|أستاذ|مدرس|محاضر/i.test(profile.role)).map((profile) => profile.slug));
}
