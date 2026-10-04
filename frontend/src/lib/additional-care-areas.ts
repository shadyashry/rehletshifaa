import type { Locale } from "./i18n";

export const ADDITIONAL_CARE_AREAS = [
{
  "slug": "vascular-endovascular-surgery",
  "en": {
    "title": "Vascular & Endovascular Surgery",
    "body": "Expertise in arterial and venous disease, aortic aneurysm repair and hemodialysis access."
  },
  "ar": {
    "title": "جراحة الأوعية الدموية والقسطرة الطرفية",
    "body": "خبرة في أمراض الشرايين والأوردة وإصلاح تمدد الأورطي ووصلات الغسيل الكلوي."
  }
},
  {
    "slug": "gastroenterology-hepatology",
    "en": {
      "title": "Digestive & Liver Care",
      "body": "Hepatology, inflammatory bowel disease and advanced endoscopy expertise."
    },
    "ar": {
      "title": "الجهاز الهضمي والكبد",
      "body": "خبرة في أمراض الكبد والتهاب الأمعاء والمناظير المتقدمة."
    }
  },
  {
    "slug": "interventional-neuroradiology",
    "en": {
      "title": "Interventional Neuroradiology",
      "body": "Specialist expertise in brain and spinal vascular interventions."
    },
    "ar": {
      "title": "الأشعة العصبية التداخلية",
      "body": "خبرة تخصصية في تدخلات الأوعية الدموية للمخ والحبل الشوكي."
    }
  },
  {
    "slug": "womens-health",
    "en": {
      "title": "Women’s Health",
      "body": "Obstetrics, gynecology, maternal health and pelvic surgery expertise."
    },
    "ar": {
      "title": "صحة المرأة",
      "body": "خبرة في النساء والتوليد وصحة الأم وجراحات الحوض."
    }
  },
  {
    "slug": "general-surgery",
    "en": {
      "title": "General & Metabolic Surgery",
      "body": "General, laparoscopic, bariatric, hepatobiliary and pancreatic surgery expertise."
    },
    "ar": {
      "title": "الجراحة العامة وجراحات السمنة",
      "body": "خبرة في الجراحة العامة والمناظير والسمنة والكبد والقنوات المرارية والبنكرياس."
    }
  },
  {
    "slug": "plastic-reconstructive-surgery",
    "en": {
      "title": "Plastic & Reconstructive Surgery",
      "body": "Aesthetic, reconstructive, burn, hand and maxillofacial surgery expertise."
    },
    "ar": {
      "title": "جراحة التجميل والترميم",
      "body": "خبرة في جراحة التجميل والترميم والحروق واليد والوجه والفكين."
    }
  }
] as const;

export function additionalCareAreas(locale: Locale) {
  return ADDITIONAL_CARE_AREAS.map(area => ({ slug: area.slug, ...area[locale] }));
}
