import type { Locale } from "./i18n";

export const CONSULTANT_SLUGS = ["ahmed-alashry", "hanan-elshoura", "hossam-kibba"] as const;
export type ConsultantSlug = (typeof CONSULTANT_SLUGS)[number];

export type ConsultantProfile = {
  slug: ConsultantSlug;
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
  /** The expertise map: one central clinical anchor and its verified related areas (from focusAreas / summary), in map order: top, start, end, bottom. Qualitative only. */
  expertise: { anchor: string; areas: readonly string[] };
  /** A verified professional distinction (appointment or role) from appointments/qualifications — shown only when it adds value. */
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
  portrait?: { src: string; alt: string };
};

export const consultantUi = {
  en: {
    eyebrow: "Senior clinical authority",
    pageTitle: "Meet the Consultants behind your care",
    pageIntro: "Every case is matched to the appropriate Consultant according to clinical need. You do not need to choose a Consultant before you start.",
    matching: ["Your case", "Clinical matching", "Appropriate Consultant"],
    rail: ["Credentials verified before matching", "Consultant-owned clinical decision", "Arabic & English coordination"],
    verificationEyebrow: "Profile verification",
    verificationTitle: "Credentials are verified before a patient is matched.",
    notice: "Profile information is based on consultant-provided CVs and official institutional sources.",
    viewProfile: "View full profile",
    viewProfileOf: (name: string) => `View ${name}'s full profile`,
    clinicalExpertise: "Clinical expertise",
    verifiedRole: "Verified professional role",
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
    rail: ["مؤهلات موثّقة قبل التوجيه", "قرار سريري يملكه الاستشاري", "تنسيق بالعربية والإنجليزية"],
    verificationEyebrow: "التحقق من الملفات",
    verificationTitle: "يجري التحقق من المؤهلات قبل توجيه أي مريض.",
    notice: "تستند معلومات الملفات إلى السير الذاتية المقدمة من الاستشاريين والمصادر المؤسسية الرسمية.",
    viewProfile: "عرض الملف الكامل",
    viewProfileOf: (name: string) => `عرض الملف الكامل: ${name}`,
    clinicalExpertise: "الخبرة السريرية",
    verifiedRole: "دور مهني موثّق",
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

const profiles: Record<Locale, readonly ConsultantProfile[]> = {
  en: [
    {
      slug: "ahmed-alashry",
      initials: "AA",
      name: "Dr Ahmed AlAshry",
      credentials: "Medical Doctorate (MD) in General and Interventional Cardiology",
      achievementBadges: ["MD", "EBAC", "FEBIC", "European Society of Cardiology"],
      specialty: "General and Interventional Cardiology",
      role: "Associate Professor and Head of Cardiac Catheterization Laboratory, Capital University Hospital",
      location: "Cairo, Egypt",
      summary: "An interventional cardiologist with university-hospital experience in coronary intervention, cardiac imaging, rhythm devices, emergency cardiac care, and selected structural-heart procedures.",
      cardSummary: "Associate Professor with university-hospital experience in complex and primary PCI, pacemaker implantation and emergency cardiac care.",
      expertise: { anchor: "Interventional cardiology", areas: ["Structural heart", "Coronary intervention", "Cardiac imaging", "Rhythm devices"] },
      distinction: "Head of Cardiac Catheterization Laboratory, Capital University Hospital",
      signals: ["MD", "EBAC", "FEBIC"],
      focusAreas: [
        "Coronary angiography and percutaneous coronary intervention (PCI)",
        "Complex PCI, including bifurcation and left-main intervention",
        "Emergency and primary PCI for acute coronary syndromes",
        "Pacemaker implantation and selected structural-heart interventions",
      ],
      qualifications: [
        "Medical Doctorate in General and Interventional Cardiology, Ain Shams University, 2019",
        "Master of Medicine in General and Interventional Cardiology, Ain Shams University, 2013",
        "Bachelor of Medicine and Surgery with honours, Ain Shams University, 2008",
        "Fellow of the Egyptian Board of Interventional Cardiology (FEBIC), 2026",
      ],
      appointments: [
        "Associate Professor of General and Interventional Cardiology, Capital University",
        "Head of the Cardiac Catheterization Laboratory, Capital University Hospital",
        "Consultant cardiologist across university and specialist hospital settings in Cairo",
      ],
      professionalStanding: [
        "The European Board for Accreditation in Cardiology (EBAC)",
        "Fellow of the Egyptian Board of Interventional Cardiology (FEBIC), 2026",
        "Member, European Society of Cardiology",
        "Egyptian medical licence",
        "Member, Egyptian Society of Cardiology",
      ],
      careAreaHref: "cardiology",
      careAreaLabel: "Cardiology",
      verification: "Profile prepared from the consultant-supplied curriculum vitae dated 2026.",
    },
    {
      slug: "hanan-elshoura",
      initials: "HE",
      name: "Dr Hanan Elshoura",
      credentials: "Medical Doctorate (MD) in Rheumatology, Rehabilitation and Physical Medicine",
      achievementBadges: ["MD", "Dysphagia Clinic Founder", "Ain Shams University"],
      specialty: "Rheumatology, Rehabilitation and Physical Medicine",
      role: "Lecturer and Consultant in Rheumatology, Rehabilitation and Physical Medicine, Ain Shams University",
      location: "Cairo, Egypt",
      summary: "A rehabilitation physician with a distinctive clinical and research focus on adult and pediatric dysphagia, supported by broader experience in neurological, pediatric, cardiopulmonary, rheumatological, and peri-operative rehabilitation.",
      cardSummary: "Lecturer and Consultant at Ain Shams University, with clinical and research work in swallowing rehabilitation and cardiopulmonary rehabilitation.",
      expertise: { anchor: "Dysphagia rehabilitation", areas: ["Adult dysphagia", "Pediatric dysphagia", "Neurological rehabilitation", "Peri-operative rehabilitation"] },
      distinction: "Founder, Dysphagia Rehabilitation Clinic, Ain Shams University",
      signals: ["MD", "Ain Shams University"],
      focusAreas: [
        "Adult and pediatric dysphagia (swallowing) rehabilitation",
        "Neurological, geriatric and pediatric rehabilitation",
        "Cardiac and pulmonary rehabilitation",
        "Rheumatology, musculoskeletal ultrasound and electrophysiological assessment",
      ],
      qualifications: [
        "Medical Doctorate in Rheumatology, Rehabilitation and Physical Medicine, Ain Shams University, 2021",
        "Master's degree in Rheumatology, Rehabilitation and Physical Medicine, Ain Shams University, 2017",
        "Bachelor of Medicine and Surgery with honours, Ain Shams University, 2012",
      ],
      appointments: [
        "Lecturer of Rheumatology, Rehabilitation and Physical Medicine, Ain Shams University",
        "Founder of the Dysphagia Rehabilitation Clinic within the Ain Shams University department",
        "Consultant and departmental leadership experience across specialist rehabilitation settings",
      ],
      professionalStanding: [
        "Egyptian medical licence",
        "Egyptian Society of Rheumatology",
        "American Association of Cardiovascular and Pulmonary Rehabilitation",
        "Japanese Society of Dysphagia Rehabilitation",
      ],
      careAreaHref: "rheumatology-rehabilitation",
      careAreaLabel: "Rehabilitation & Dysphagia",
      verification: "Profile prepared from the consultant-supplied curriculum vitae updated in 2026.",
    },
    {
      slug: "hossam-kibba",
      initials: "HK",
      name: "Dr Hossam Kibba",
      credentials: "Medical Doctorate (Dr. med.) · Orthopedics & Trauma Surgery",
      achievementBadges: ["Dr. med.", "Germany-based Consultant", "Senior Principal Surgeon", "GFFC Certified"],
      specialty: "Orthopedics, Trauma and Joint Replacement",
      role: "Lead Senior Physician, Orthopedics and Trauma Surgery, Krankenhaus Rummelsberg",
      location: "Bavaria, Germany",
      summary: "A Germany-based orthopedic and trauma surgeon focused on lower-extremity care, hip and knee arthroplasty, foot surgery, and complex trauma, with a senior operating role in a maximum-care endoprosthetics centre.",
      cardSummary: "German specialist in orthopedics and trauma surgery, with an additional qualification in special trauma surgery and GFFC foot-surgery certification.",
      expertise: { anchor: "Orthopedic & trauma surgery", areas: ["Hip replacement", "Knee replacement", "Foot & ankle surgery", "Complex lower-extremity trauma"] },
      distinction: "Senior Principal Surgeon, Endoprosthetics Centre, Krankenhaus Rummelsberg",
      signals: ["Dr. med.", "GFFC Certified"],
      focusAreas: [
        "Hip and knee replacement",
        "Lower-extremity orthopedics",
        "Foot and ankle surgery",
        "Special trauma surgery",
      ],
      qualifications: [
        "Medical Doctorate (Dr. med.)",
        "Specialist in Orthopedics and Trauma Surgery",
        "Additional qualification in Special Trauma Surgery",
        "Certified Foot Surgeon (GFFC)",
        "Master of Health Business Administration",
      ],
      appointments: [
        "Lead Senior Physician, Orthopedic Surgery of the Lower Extremities and Endoprosthetics, Krankenhaus Rummelsberg",
        "Senior principal surgeon within the maximum-care Endoprosthetics Centre",
      ],
      professionalStanding: [
        "Certified principal surgeon for hip and knee endoprosthetic care",
        "ATLS provider",
        "German specialist practice in orthopedics and trauma surgery",
      ],
      careAreaHref: "orthopedics",
      careAreaLabel: "Orthopedics",
      verification: "Current institutional role and endoprosthetics certification checked against official public sources in August 2026.",
      externalLinks: [
        { label: "LinkedIn", href: "https://www.linkedin.com/in/hossam-kibba-716711245/" },
        { label: "Krankenhaus Rummelsberg", href: "https://www.sana.de/rummelsberg/medizin-pflege/orthopaedische-chirurgie-der-unteren-extremitaeten-und-endoprothetik/unser-team" },
      ],
    },
  ],
  ar: [
    {
      slug: "ahmed-alashry",
      initials: "AA",
      name: "د. أحمد العشري",
      credentials: "دكتوراه أمراض القلب العامة والتداخلية",
      achievementBadges: ["دكتوراه", "اعتماد EBAC الأوروبي", "زمالة FEBIC", "عضو الجمعية الأوروبية للقلب"],
      specialty: "أمراض القلب العامة والتداخلية",
      role: "أستاذ مساعد ورئيس معمل قسطرة القلب بمستشفى جامعة العاصمة",
      location: "القاهرة، مصر",
      summary: "استشاري قلب تداخلي بخبرة في المستشفيات الجامعية تشمل التدخلات التاجية وتصوير القلب وأجهزة تنظيم النبض ورعاية حالات القلب العاجلة وبعض تدخلات القلب الهيكلي.",
      cardSummary: "أستاذ مساعد بخبرة في المستشفيات الجامعية تشمل القسطرة المعقدة والأولية وزراعة منظمات القلب ورعاية حالات القلب العاجلة.",
      expertise: { anchor: "القلب التداخلي", areas: ["القلب الهيكلي", "التدخلات التاجية", "تصوير القلب", "أجهزة تنظيم النبض"] },
      distinction: "رئيس معمل قسطرة القلب بمستشفى جامعة العاصمة",
      signals: ["دكتوراه", "EBAC", "FEBIC"],
      focusAreas: ["تصوير الشرايين التاجية والقسطرة التداخلية", "القسطرة المعقدة وتدخلات التفرعات والجذع الرئيسي", "القسطرة الطارئة والأولية لمتلازمات الشريان التاجي الحادة", "زراعة منظمات القلب وبعض تدخلات القلب الهيكلي"],
      qualifications: ["دكتوراه أمراض القلب العامة والتداخلية، جامعة عين شمس، 2019", "ماجستير أمراض القلب العامة والتداخلية، جامعة عين شمس، 2013", "بكالوريوس الطب والجراحة بمرتبة الشرف، جامعة عين شمس، 2008", "زميل البورد المصري للقلب التداخلي، 2026"],
      appointments: ["أستاذ مساعد أمراض القلب العامة والتداخلية بجامعة العاصمة", "رئيس معمل قسطرة القلب بمستشفى جامعة العاصمة", "خبرة استشارية في مستشفيات جامعية وتخصصية بالقاهرة"],
      professionalStanding: ["البورد الأوروبي لاعتماد طب القلب (EBAC)", "زميل البورد المصري للقلب التداخلي (FEBIC)، 2026", "عضو الجمعية الأوروبية لأمراض القلب", "ترخيص مزاولة المهنة المصري", "عضو الجمعية المصرية لأمراض القلب"],
      careAreaHref: "cardiology",
      careAreaLabel: "أمراض القلب",
      verification: "أُعد الملف من السيرة الذاتية المقدمة من الاستشاري والمؤرخة في 2026.",
    },
    {
      slug: "hanan-elshoura",
      initials: "HE",
      name: "د. حنان الشورى",
      credentials: "دكتوراه الروماتيزم والتأهيل والطب الطبيعي",
      achievementBadges: ["دكتوراه", "مؤسسة عيادة تأهيل عُسر البلع", "جامعة عين شمس"],
      specialty: "الروماتيزم والتأهيل والطب الطبيعي",
      role: "مدرس واستشاري الروماتيزم والتأهيل والطب الطبيعي بجامعة عين شمس",
      location: "القاهرة، مصر",
      summary: "طبيبة تأهيل تتميز بتركيز سريري وبحثي على تأهيل عُسر البلع للبالغين والأطفال، إلى جانب خبرة أوسع في التأهيل العصبي وتأهيل الأطفال والقلب والرئة والروماتيزم وما حول العمليات الجراحية.",
      cardSummary: "مدرس واستشاري بجامعة عين شمس، بعمل سريري وبحثي في تأهيل البلع وتأهيل القلب والرئة.",
      expertise: { anchor: "تأهيل عُسر البلع", areas: ["عُسر البلع للبالغين", "عُسر البلع للأطفال", "التأهيل العصبي", "التأهيل حول الجراحة"] },
      distinction: "مؤسسة عيادة تأهيل عُسر البلع بجامعة عين شمس",
      signals: ["دكتوراه", "جامعة عين شمس"],
      focusAreas: ["تأهيل عُسر البلع للبالغين والأطفال", "التأهيل العصبي وتأهيل كبار السن والأطفال", "تأهيل القلب والرئة", "الروماتيزم والموجات فوق الصوتية للعضلات والمفاصل والفحوص الكهروفسيولوجية"],
      qualifications: ["دكتوراه الروماتيزم والتأهيل والطب الطبيعي، جامعة عين شمس، 2021", "ماجستير الروماتيزم والتأهيل والطب الطبيعي، جامعة عين شمس، 2017", "بكالوريوس الطب والجراحة بمرتبة الشرف، جامعة عين شمس، 2012"],
      appointments: ["مدرس الروماتيزم والتأهيل والطب الطبيعي بجامعة عين شمس", "مؤسسة عيادة تأهيل عُسر البلع بقسم الروماتيزم والتأهيل والطب الطبيعي بجامعة عين شمس", "خبرة استشارية وقيادية في جهات متخصصة في التأهيل"],
      professionalStanding: ["ترخيص مزاولة المهنة المصري", "الجمعية المصرية للروماتيزم", "الجمعية الأمريكية لتأهيل القلب والرئة", "الجمعية اليابانية لتأهيل عُسر البلع"],
      careAreaHref: "rheumatology-rehabilitation",
      careAreaLabel: "التأهيل وعلاج البلع",
      verification: "أُعد الملف من السيرة الذاتية المحدثة المقدمة من الاستشارية في 2026.",
    },
    {
      slug: "hossam-kibba",
      initials: "HK",
      name: "د. حسام كيبا",
      credentials: "دكتوراه في الطب (Dr. med.) · جراحة العظام والإصابات",
      achievementBadges: ["دكتوراه في الطب", "استشاري في ألمانيا", "جراح رئيسي أول", "معتمد من GFFC"],
      specialty: "جراحة العظام والإصابات واستبدال المفاصل",
      role: "طبيب أول قيادي لجراحة العظام والإصابات بمستشفى روميلسبيرغ",
      location: "بافاريا، ألمانيا",
      summary: "جراح عظام وإصابات يعمل في ألمانيا ويركز على الطرف السفلي واستبدال مفصلي الورك والركبة وجراحة القدم والإصابات المعقدة، مع دور جراحي قيادي في مركز متقدم لاستبدال المفاصل.",
      cardSummary: "اختصاصي ألماني في جراحة العظام والإصابات، بتأهيل إضافي في جراحة الإصابات المتخصصة واعتماد GFFC في جراحة القدم.",
      expertise: { anchor: "جراحة العظام والإصابات", areas: ["استبدال مفصل الورك", "استبدال مفصل الركبة", "جراحة القدم والكاحل", "إصابات الطرف السفلي المعقدة"] },
      distinction: "جراح رئيسي أول، مركز استبدال المفاصل، مستشفى روميلسبيرغ",
      signals: ["Dr. med.", "معتمد من GFFC"],
      focusAreas: ["استبدال مفصلي الورك والركبة", "جراحة عظام الطرف السفلي", "جراحة القدم والكاحل", "جراحة الإصابات المتخصصة"],
      qualifications: ["دكتوراه في الطب (Dr. med.)", "اختصاصي جراحة العظام والإصابات", "تأهيل إضافي في جراحة الإصابات المتخصصة", "جراح قدم معتمد من GFFC", "ماجستير إدارة الأعمال الصحية"],
      appointments: ["طبيب أول قيادي بقسم جراحة عظام الطرف السفلي واستبدال المفاصل في مستشفى روميلسبيرغ", "جراح رئيسي أول في مركز استبدال المفاصل للرعاية القصوى"],
      professionalStanding: ["جراح رئيسي معتمد لرعاية استبدال مفصلي الورك والركبة", "مقدم معتمد لبرنامج ATLS", "ممارسة تخصصية ألمانية في جراحة العظام والإصابات"],
      careAreaHref: "orthopedics",
      careAreaLabel: "جراحة العظام",
      verification: "جرى التحقق من المنصب المؤسسي واعتماد استبدال المفاصل من المصادر الرسمية العامة في أغسطس 2026.",
      externalLinks: [
        { label: "LinkedIn", href: "https://www.linkedin.com/in/hossam-kibba-716711245/" },
        { label: "مستشفى روميلسبيرغ", href: "https://www.sana.de/rummelsberg/medizin-pflege/orthopaedische-chirurgie-der-unteren-extremitaeten-und-endoprothetik/unser-team" },
      ],
    },
  ],
};

export function getConsultants(locale: Locale): readonly ConsultantProfile[] {
  return profiles[locale];
}

export function getConsultant(locale: Locale, slug: string): ConsultantProfile | undefined {
  return profiles[locale].find((profile) => profile.slug === slug);
}
