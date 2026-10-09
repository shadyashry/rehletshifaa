import type { ConsultantProfile } from "./consultants";
import type { Locale } from "./i18n";

export const ATTACHED_CONSULTANT_SLUGS = ["ahmed-magdy-mahmoud", "amr-abdelazeem", "ahmed-khaled", "mostafa-farid", "mustafa-mohammed-abbas", "mohamed-hamdy-zaid", "mohammed-ali", "mostafa-baraka", "mahmoud-ghaleb", "hamdy-abdelazeem"] as const;

/** Editorial profiles only; this catalogue grants no clinical or platform authority. */
export const attachedConsultants: Record<Locale, readonly ConsultantProfile[]> = {
  "en": [
{
  "slug": "hamdy-abdelazeem",
  "initials": "HA",
  "sourceFile": "Curriculum Vitæ (Dec. 2025) - Adobe cloud storage.pdf",
  "careAreaHref": "vascular-endovascular-surgery",
  "name": "Dr Hamdy AbdelAzeem AboElNeel AbdelHameed",
  "specialty": "Vascular & Endovascular Surgery",
  "role": "Associate Professor of Vascular Surgery, Ain Shams University",
  "summary": "Vascular and endovascular surgeon with expertise in peripheral arterial disease, aortic aneurysm repair, venous disease and hemodialysis access. His December 2025 CV describes university-hospital clinical practice, surgical training and research.",
  "cardSummary": "Associate professor and vascular surgeon focused on arterial and venous interventions, aortic aneurysm repair and dialysis access, with university-hospital leadership and research experience.",
  "credentials": "MD in Vascular Surgery, Ain Shams University, 2017",
  "qualifications": [
    "MD in Vascular Surgery, Ain Shams University, 2017",
    "MSc in General Surgery, Ain Shams University, 2013",
    "Bachelor of Medicine & Surgery, Ain Shams University, 2008"
  ],
  "focusAreas": [
    "Peripheral arterial angioplasty and bypass",
    "Aortic aneurysm repair, including EVAR and TEVAR",
    "Venous disease and varicose vein treatment",
    "Hemodialysis access and venous interventions"
  ],
  "distinction": "Associate Professor at Ain Shams University since June 2023",
  "achievements": [
    "Associate Professor of Vascular Surgery since June 2023, with supervision and training of residents, interns and medical students",
    "Director of Vascular Surgery at Ain Shams University Specialized Hospital in 2023 and Demerdash Hospital in 2021",
    "CV-listed research in the Journal of Vascular Surgery: Venous and Lymphatic Disorders on chronic iliofemoral obstruction, 2021"
  ],
  "professionalStanding": [
    "Clinical and academic appointments reported in the December 2025 CV"
  ],
  "appointments": [
    "Associate Professor of Vascular Surgery, Ain Shams University, since June 2023",
    "Consultant of Vascular & Endovascular Surgery, Ain Shams University Hospitals, since October 2017"
  ],
  "achievementBadges": [
    "MD in Vascular Surgery",
    "Associate Professor"
  ],
  "signals": [
    "MD in Vascular Surgery",
    "Ain Shams University"
  ],
  "location": "Cairo, Egypt",
  "careAreaLabel": "Vascular & Endovascular Surgery",
  "verification": "Prepared from the supplied December 2025 CV. Qualifications, appointments and research are CV-reported and are subject to credential review before clinical matching.",
  "expertise": {
    "anchor": "Vascular & Endovascular Surgery",
    "areas": [
      "Peripheral arterial angioplasty and bypass",
      "Aortic aneurysm repair, including EVAR and TEVAR",
      "Venous disease and varicose vein treatment",
      "Hemodialysis access and venous interventions"
    ]
  }
},
    {
      "slug": "ahmed-magdy-mahmoud",
      "initials": "AM",
      "sourceFile": "Ahmed_Saleh_CV.docx",
      "name": "Dr Ahmed Magdy Mahmoud",
      "specialty": "Plastic, Reconstructive & Burns Surgery",
      "role": "Lecturer of Plastic Surgery, Helwan University",
      "summary": "Plastic and reconstructive surgeon with university-hospital experience in aesthetic surgery, burn reconstruction, hand surgery and maxillofacial care.",
      "cardSummary": "Plastic and reconstructive surgeon with university-hospital experience in aesthetic surgery, burn reconstruction, hand surgery and maxillofacial care.",
      "credentials": "MD in Plastic, Burn & Maxillofacial Surgery, Helwan University",
      "qualifications": [
        "MD in Plastic, Burn & Maxillofacial Surgery, Helwan University",
        "MSc in General Surgery, Ain Shams University",
        "Bachelor of Medicine & Surgery, Ain Shams University"
      ],
      "focusAreas": [
        "Aesthetic facial and breast surgery",
        "Body contouring",
        "Burn reconstruction",
        "Hand and maxillofacial surgery"
      ],
      "distinction": "University teaching and reconstructive surgery practice since 2017",
      "achievements": [
        "Lecturer of Plastic Surgery at Helwan University since April 2017",
        "Department representative on university-hospital quality and medical committees",
        "Training in oncoplastic breast reconstruction and orthoplastic limb reconstruction"
      ],
      "professionalStanding": [
        "Continuing training with the Egyptian Society of Plastic & Reconstructive Surgery"
      ],
      "appointments": [
        "Lecturer of Plastic Surgery, Helwan University"
      ],
      "achievementBadges": [
        "MD in Plastic"
      ],
      "signals": [
        "MD in Plastic"
      ],
      "expertise": {
        "anchor": "Plastic, Reconstructive & Burns Surgery",
        "areas": [
          "Aesthetic facial and breast surgery",
          "Body contouring",
          "Burn reconstruction",
          "Hand and maxillofacial surgery"
        ]
      },
      "location": "Cairo, Egypt",
      "careAreaHref": "plastic-reconstructive-surgery",
      "careAreaLabel": "Plastic & Reconstructive Surgery",
      "verification": "Prepared from the supplied CV. Qualifications, appointments and memberships are CV-reported and are subject to credential review before clinical matching."
    },
    {
      "slug": "amr-abdelazeem",
      "initials": "AA",
      "sourceFile": "Amr Abdelazeem CV.docx",
      "name": "Dr Amr Abdelazeem",
      "specialty": "Gastroenterology, Hepatology & Advanced Endoscopy",
      "role": "Lecturer of Endemic Medicine and Hepato-Gastroenterology, Helwan University",
      "summary": "Hepatology and gastroenterology consultant focused on diagnostic and therapeutic endoscopy, ERCP, endoscopic ultrasound and inflammatory bowel disease, with liver-transplant team experience.",
      "cardSummary": "Hepatology and gastroenterology consultant focused on diagnostic and therapeutic endoscopy, ERCP, endoscopic ultrasound and inflammatory bowel disease, with liver-transplant team experience.",
      "credentials": "MD in Endemic Hepatology & Gastroenterology, Cairo University, 2021",
      "qualifications": [
        "MD in Endemic Hepatology & Gastroenterology, Cairo University, 2021",
        "Master in Tropical Medicine, Ain Shams University, 2015",
        "Medicine & Surgery, Zagazig University, 2010",
        "Endoscopic ultrasound fellowship, Erzurum University, Turkey, 2026"
      ],
      "focusAreas": [
        "Advanced endoscopy and ERCP",
        "Endoscopic ultrasound",
        "Liver disease",
        "Inflammatory bowel disease"
      ],
      "distinction": "Endoscopic ultrasound fellowship in Turkey, 2026",
      "achievements": [
        "Endoscopic ultrasound fellowship, Erzurum University, 2026",
        "Coordinator of the inflammatory bowel disease group, Capital University",
        "Liver-transplant team experience at Wadi El Nile Hospital, 2017–2022"
      ],
      "professionalStanding": [
        "United European Gastroenterology membership, as listed in the CV",
        "Egyptian Association for Research and Training in Hepato-Gastroenterology"
      ],
      "appointments": [
        "Lecturer of Endemic Medicine and Hepato-Gastroenterology, Helwan University"
      ],
      "achievementBadges": [
        "MD in Endemic Hepatology & Gastroenterology"
      ],
      "signals": [
        "MD in Endemic Hepatology & Gastroenterology"
      ],
      "expertise": {
        "anchor": "Gastroenterology, Hepatology & Advanced Endoscopy",
        "areas": [
          "Advanced endoscopy and ERCP",
          "Endoscopic ultrasound",
          "Liver disease",
          "Inflammatory bowel disease"
        ]
      },
      "location": "Cairo, Egypt",
      "careAreaHref": "gastroenterology-hepatology",
      "careAreaLabel": "Digestive & Liver Care",
      "verification": "Prepared from the supplied CV. Qualifications, appointments and memberships are CV-reported and are subject to credential review before clinical matching."
    },
    {
      "slug": "ahmed-khaled",
      "initials": "AK",
      "sourceFile": "Curriculum Vitae (ahmed khaled)-2.docx",
      "name": "Dr Ahmed Khaled",
      "specialty": "Joint Replacement & Orthopedic Surgery",
      "role": "Assistant Professor of Orthopedic Surgery, Ain Shams University",
      "summary": "Orthopedic consultant with a focus on primary and complex joint replacement, robotic knee arthroplasty, orthopedic trauma and arthroscopic sports surgery.",
      "cardSummary": "Orthopedic consultant with a focus on primary and complex joint replacement, robotic knee arthroplasty, orthopedic trauma and arthroscopic sports surgery.",
      "credentials": "PhD in Trauma & Orthopedics, Ain Shams University, 2018",
      "qualifications": [
        "PhD in Trauma & Orthopedics, Ain Shams University, 2018",
        "MSc in Orthopedic Surgery, Ain Shams University, 2012",
        "MBBCh with honours, Ain Shams University, 2008"
      ],
      "focusAreas": [
        "Hip and knee replacement",
        "Robotic knee arthroplasty",
        "Shoulder reconstruction",
        "Sports injuries and trauma"
      ],
      "distinction": "Robotic knee arthroplasty training, Mumbai, 2026",
      "achievements": [
        "Assistant Professor at Ain Shams University since January 2025",
        "Misso robotic total knee arthroplasty training and licence, as listed in the CV, 2026",
        "Doctoral research on complex hip replacement in severe hip dysplasia"
      ],
      "professionalStanding": [
        "Egyptian Medical Union membership",
        "STEPS trauma training, University of Maryland School of Medicine"
      ],
      "appointments": [
        "Assistant Professor of Orthopedic Surgery, Ain Shams University"
      ],
      "achievementBadges": [
        "PhD in Trauma & Orthopedics"
      ],
      "signals": [
        "PhD in Trauma & Orthopedics"
      ],
      "expertise": {
        "anchor": "Joint Replacement & Orthopedic Surgery",
        "areas": [
          "Hip and knee replacement",
          "Robotic knee arthroplasty",
          "Shoulder reconstruction",
          "Sports injuries and trauma"
        ]
      },
      "location": "Cairo, Egypt",
      "careAreaHref": "orthopedics",
      "careAreaLabel": "Orthopedics",
      "verification": "Prepared from the supplied CV. Qualifications, appointments and memberships are CV-reported and are subject to credential review before clinical matching."
    },
    {
      "slug": "mostafa-farid",
      "initials": "MF",
      "sourceFile": "CV2026.pdf",
      "name": "Dr Mostafa Farid",
      "specialty": "Interventional Neuroradiology",
      "role": "Lecturer of Radiology, Interventional Neuroradiology Unit, Ain Shams University Hospitals",
      "summary": "Interventional neuroradiologist focused on minimally invasive neurovascular procedures, including aneurysm treatment, AVM embolization, stroke thrombectomy and venous sinus stenting.",
      "cardSummary": "Interventional neuroradiologist focused on minimally invasive neurovascular procedures, including aneurysm treatment, AVM embolization, stroke thrombectomy and venous sinus stenting.",
      "credentials": "MD in Radiology, Ain Shams University, 2017",
      "qualifications": [
        "MD in Radiology, Ain Shams University, 2017",
        "MSc in Radiology, Ain Shams University, 2012",
        "European Diploma in Neuroradiology (EDiNR), 2014–2017",
        "MBBCh, Ain Shams University, 2008"
      ],
      "focusAreas": [
        "Brain aneurysm intervention",
        "AVM embolization",
        "Stroke thrombectomy",
        "Venous sinus stenting"
      ],
      "distinction": "European Diploma in Neuroradiology (EDiNR)",
      "achievements": [
        "European Diploma in Neuroradiology",
        "NEURO-PAIRS faculty and speaker participation, 2019–2024",
        "Published research on flow diversion, venous sinus stenting and spinal vascular fistulae"
      ],
      "professionalStanding": [
        "International training including Oxford Aneurysm Treatment School and the Pierre Lasjaunias European Course"
      ],
      "appointments": [
        "Lecturer of Radiology, Interventional Neuroradiology Unit, Ain Shams University Hospitals"
      ],
      "achievementBadges": [
        "MD in Radiology"
      ],
      "signals": [
        "MD in Radiology"
      ],
      "expertise": {
        "anchor": "Interventional Neuroradiology",
        "areas": [
          "Brain aneurysm intervention",
          "AVM embolization",
          "Stroke thrombectomy",
          "Venous sinus stenting"
        ]
      },
      "location": "Cairo, Egypt",
      "careAreaHref": "interventional-neuroradiology",
      "careAreaLabel": "Interventional Neuroradiology",
      "verification": "Prepared from the supplied CV. Qualifications, appointments and memberships are CV-reported and are subject to credential review before clinical matching."
    },
    {
      "slug": "mustafa-mohammed-abbas",
      "initials": "MA",
      "sourceFile": "Dr_Mustafa_Mohammed_Abbas_CV_Professional_Summary_Updated.docx",
      "name": "Dr Mustafa Mohammed Abbas",
      "specialty": "Obstetrics, Gynecology & Maternal Health",
      "role": "Lecturer of Obstetrics & Gynecology, Ain Shams University",
      "summary": "Obstetrician and gynecologist combining maternal health program development with obstetric ultrasound, gynecological surgery, fertility care and clinical training.",
      "cardSummary": "Obstetrician and gynecologist combining maternal health program development with obstetric ultrasound, gynecological surgery, fertility care and clinical training.",
      "credentials": "MD in Obstetrics & Gynecology, Ain Shams University, 2017–2021",
      "qualifications": [
        "MD in Obstetrics & Gynecology, Ain Shams University, 2017–2021",
        "MSc in Obstetrics & Gynecology, Ain Shams University, 2014–2016",
        "MBBCh, Ain Shams University, 2006–2012",
        "RCOG Part 1, 2014 (examination stage)"
      ],
      "focusAreas": [
        "Maternal health",
        "Obstetric ultrasound",
        "Gynecological surgery",
        "Fertility care"
      ],
      "distinction": "UNFPA Senior National Technical Consultant, 2026 (CV-reported)",
      "achievements": [
        "UNFPA Senior National Technical Consultant and advisor to the Deputy Minister of Health and Population, 2026, as listed in the CV",
        "Head of Obstetrics & Gynecology, Abd El Kader Fahmy Hospital",
        "USAID-certified OSRA Project trainer, 2023"
      ],
      "professionalStanding": [
        "Egyptian Midwifery Board member",
        "Egyptian OG Guidelines Committee–EHC member, 2026"
      ],
      "appointments": [
        "Lecturer of Obstetrics & Gynecology, Ain Shams University"
      ],
      "achievementBadges": [
        "MD in Obstetrics & Gynecology"
      ],
      "signals": [
        "MD in Obstetrics & Gynecology"
      ],
      "expertise": {
        "anchor": "Obstetrics, Gynecology & Maternal Health",
        "areas": [
          "Maternal health",
          "Obstetric ultrasound",
          "Gynecological surgery",
          "Fertility care"
        ]
      },
      "location": "Cairo, Egypt",
      "careAreaHref": "womens-health",
      "careAreaLabel": "Women’s Health",
      "verification": "Prepared from the supplied CV. Qualifications, appointments and memberships are CV-reported and are subject to credential review before clinical matching."
    },
    {
      "slug": "mohamed-hamdy-zaid",
      "initials": "MZ",
      "sourceFile": "Mohamed_Hamdy_Zaid_Professional_CV.pdf",
      "name": "Prof Mohamed Hamdy Zaid",
      "specialty": "General, Bariatric & Hepatobiliary Surgery",
      "role": "Professor of General Surgery, Ain Shams University",
      "summary": "Professor of general surgery with clinical and academic experience in minimally invasive surgery, bariatric and metabolic surgery, hepatobiliary and pancreatic surgery, and breast and thyroid surgery.",
      "cardSummary": "Professor of general surgery with clinical and academic experience in minimally invasive surgery, bariatric and metabolic surgery, hepatobiliary and pancreatic surgery, and breast and thyroid surgery.",
      "credentials": "MD in General Surgery",
      "qualifications": [
        "MD in General Surgery",
        "MSc in General Surgery"
      ],
      "focusAreas": [
        "Bariatric and metabolic surgery",
        "Hepatobiliary and pancreatic surgery",
        "Breast and thyroid surgery",
        "Laparoscopic and oncologic surgery"
      ],
      "distinction": "Professor of General Surgery, Ain Shams University",
      "achievements": [
        "Professorial appointment at Ain Shams University",
        "More than 15 years of surgical and academic experience, as reported in the CV",
        "Author and co-author of national and international surgical publications; detailed bibliography available on request"
      ],
      "professionalStanding": [
        "Academic practice and multidisciplinary surgical case assessment"
      ],
      "appointments": [
        "Professor of General Surgery, Ain Shams University"
      ],
      "achievementBadges": [
        "MD in General Surgery"
      ],
      "signals": [
        "MD in General Surgery"
      ],
      "expertise": {
        "anchor": "General, Bariatric & Hepatobiliary Surgery",
        "areas": [
          "Bariatric and metabolic surgery",
          "Hepatobiliary and pancreatic surgery",
          "Breast and thyroid surgery",
          "Laparoscopic and oncologic surgery"
        ]
      },
      "location": "Cairo, Egypt",
      "careAreaHref": "general-surgery",
      "careAreaLabel": "General & Metabolic Surgery",
      "verification": "Prepared from the supplied CV. Qualifications, appointments and memberships are CV-reported and are subject to credential review before clinical matching."
    },
    {
      "slug": "mohammed-ali",
      "initials": "MI",
      "sourceFile": "Mohammed Ali CV 2024.pdf",
      "name": "Dr Mohammed Ali Ibrahim Hussien",
      "specialty": "Spine & Orthopedic Surgery",
      "role": "Associate Professor of Orthopedic and Spine Surgery, Ain Shams University",
      "summary": "Orthopedic and spine surgeon with doctoral research on complex spinal disorders, university teaching experience and an AO Spine fellowship in Munich.",
      "cardSummary": "Orthopedic and spine surgeon with doctoral research on complex spinal disorders, university teaching experience and an AO Spine fellowship in Munich.",
      "credentials": "PhD in Trauma & Orthopedics, Ain Shams University, 2017",
      "qualifications": [
        "PhD in Trauma & Orthopedics, Ain Shams University, 2017",
        "MSc in Trauma & Orthopedics, Ain Shams University, 2012",
        "MBBCh with honours, Ain Shams University, 2008"
      ],
      "focusAreas": [
        "Spine surgery",
        "Complex spinal disorders",
        "Orthopedic trauma",
        "Spinal trauma and degeneration training"
      ],
      "distinction": "AO Spine fellowship, Technical University of Munich, 2018",
      "achievements": [
        "AO Spine fellowship in the neurosurgical department, Technical University of Munich, July–August 2018",
        "Doctoral research on posterior vertebral column resection in complex spinal disorders",
        "Speaker at Ain Shams spine teaching workshops and ArabSpine meetings"
      ],
      "professionalStanding": [
        "AO Spine advanced course in trauma and degeneration",
        "ArabSpine Course Diploma modules 1 and 4 (course modules)"
      ],
      "appointments": [
        "Associate Professor of Orthopedic and Spine Surgery, Ain Shams University"
      ],
      "achievementBadges": [
        "PhD in Trauma & Orthopedics"
      ],
      "signals": [
        "PhD in Trauma & Orthopedics"
      ],
      "expertise": {
        "anchor": "Spine & Orthopedic Surgery",
        "areas": [
          "Spine surgery",
          "Complex spinal disorders",
          "Orthopedic trauma",
          "Spinal trauma and degeneration training"
        ]
      },
      "location": "Cairo, Egypt",
      "careAreaHref": "orthopedics",
      "careAreaLabel": "Orthopedics",
      "verification": "Prepared from the supplied CV. Qualifications, appointments and memberships are CV-reported and are subject to credential review before clinical matching."
    },
    {
      "slug": "mostafa-baraka",
      "initials": "MB",
      "sourceFile": "Mostafa_Baraka_CV_Updated_Sep_2026_EPOS.docx",
      "name": "Dr Mostafa Baraka",
      "specialty": "Pediatric Orthopedics & Limb Reconstruction",
      "role": "Associate Professor, Pediatric & Limb Reconstruction Surgery, Ain Shams University",
      "summary": "Pediatric orthopedic surgeon focused on hip preservation, limb lengthening and reconstruction, cerebral palsy orthopedics, and pediatric foot and ankle surgery, with international research and teaching participation.",
      "cardSummary": "Pediatric orthopedic surgeon focused on hip preservation, limb lengthening and reconstruction, cerebral palsy orthopedics, and pediatric foot and ankle surgery, with international research and teaching participation.",
      "credentials": "MD in Orthopedics, Ain Shams University, 2017; hip preservation dissertation",
      "qualifications": [
        "MD in Orthopedics, Ain Shams University, 2017; hip preservation dissertation",
        "MSc in Orthopedic Surgery, Ain Shams University, 2012",
        "MBBCh with honours, Ain Shams University, 2008"
      ],
      "focusAreas": [
        "Pediatric orthopedics",
        "Limb lengthening and reconstruction",
        "Hip preservation",
        "Cerebral palsy orthopedics"
      ],
      "distinction": "EPOS oral research presentations, Seville, 2026",
      "achievements": [
        "Two oral research presentations at the 44th EPOS Annual Meeting, Seville, April 2026",
        "Published pediatric hip-preservation and deformity research in Journal of Children’s Orthopaedics and SICOT-J",
        "AO Trauma Egypt faculty and ATLS instructor, as listed in the CV"
      ],
      "professionalStanding": [
        "European Paediatric Orthopaedic Society (EPOS)",
        "American Academy for Cerebral Palsy and Developmental Medicine (AACPDM), listed in the CV",
        "AO Trauma and ASAMI Egypt"
      ],
      "appointments": [
        "Associate Professor, Pediatric & Limb Reconstruction Surgery, Ain Shams University"
      ],
      "achievementBadges": [
        "MD in Orthopedics"
      ],
      "signals": [
        "MD in Orthopedics"
      ],
      "expertise": {
        "anchor": "Pediatric Orthopedics & Limb Reconstruction",
        "areas": [
          "Pediatric orthopedics",
          "Limb lengthening and reconstruction",
          "Hip preservation",
          "Cerebral palsy orthopedics"
        ]
      },
      "location": "Cairo, Egypt",
      "careAreaHref": "orthopedics",
      "careAreaLabel": "Orthopedics",
      "verification": "Prepared from the supplied CV. Qualifications, appointments and memberships are CV-reported and are subject to credential review before clinical matching."
    },
    {
      "slug": "mahmoud-ghaleb",
      "initials": "MG",
      "sourceFile": "MY CV.docx",
      "name": "Dr Mahmoud Mohamed Ghaleb",
      "specialty": "Obstetrics, Gynecology & Pelvic Surgery",
      "role": "Assistant Professor of Obstetrics & Gynecology, Ain Shams University",
      "summary": "Obstetrician and gynecologist with a focus on high-risk obstetric surgery, placenta accreta spectrum, gynecological endoscopy, pelvic floor surgery and gynecologic oncology.",
      "cardSummary": "Obstetrician and gynecologist with a focus on high-risk obstetric surgery, placenta accreta spectrum, gynecological endoscopy, pelvic floor surgery and gynecologic oncology.",
      "credentials": "MD in Obstetrics & Gynecology, Ain Shams University, 2016",
      "qualifications": [
        "MD in Obstetrics & Gynecology, Ain Shams University, 2016",
        "MSc in Obstetrics & Gynecology, Ain Shams University, 2013",
        "MBBCh with honours, Ain Shams University, 2008"
      ],
      "focusAreas": [
        "High-risk obstetric surgery",
        "Placenta accreta spectrum",
        "Gynecological endoscopy",
        "Pelvic floor and oncologic surgery"
      ],
      "distinction": "Published placenta accreta research, IJGO, 2021",
      "achievements": [
        "Assistant Professor of Obstetrics & Gynecology since February 2022",
        "Research on a conservative stepwise surgical approach to placenta previa accreta, International Journal of Gynecology & Obstetrics, 2021",
        "Trainer in hysteroscopy, colposcopy and advanced pelvic surgery workshops"
      ],
      "professionalStanding": [
        "Consultant experience in gynecological endoscopy, urogynecology and surgical oncology units, Ain Shams University"
      ],
      "appointments": [
        "Assistant Professor of Obstetrics & Gynecology, Ain Shams University"
      ],
      "achievementBadges": [
        "MD in Obstetrics & Gynecology"
      ],
      "signals": [
        "MD in Obstetrics & Gynecology"
      ],
      "expertise": {
        "anchor": "Obstetrics, Gynecology & Pelvic Surgery",
        "areas": [
          "High-risk obstetric surgery",
          "Placenta accreta spectrum",
          "Gynecological endoscopy",
          "Pelvic floor and oncologic surgery"
        ]
      },
      "location": "Cairo, Egypt",
      "careAreaHref": "womens-health",
      "careAreaLabel": "Women’s Health",
      "verification": "Prepared from the supplied CV. Qualifications, appointments and memberships are CV-reported and are subject to credential review before clinical matching."
    }
  ],
  "ar": [
{
  "slug": "hamdy-abdelazeem",
  "initials": "HA",
  "sourceFile": "Curriculum Vitæ (Dec. 2025) - Adobe cloud storage.pdf",
  "careAreaHref": "vascular-endovascular-surgery",
  "name": "د. حمدي عبد العظيم أبو النيل عبد الحميد",
  "specialty": "جراحة الأوعية الدموية والقسطرة الطرفية",
  "role": "أستاذ مساعد جراحة الأوعية الدموية، جامعة عين شمس",
  "summary": "جراح أوعية دموية متخصص في أمراض الشرايين الطرفية وإصلاح تمدد الشريان الأورطي وأمراض الأوردة ووصلات الغسيل الكلوي. تصف سيرته الذاتية المؤرخة في ديسمبر 2025 خبرته السريرية والتدريب الجراحي والبحث العلمي في المستشفيات الجامعية.",
  "cardSummary": "أستاذ مساعد وجراح أوعية دموية يركز على تدخلات الشرايين والأوردة وإصلاح تمدد الأورطي ووصلات الغسيل الكلوي، مع خبرة في قيادة الأقسام الجامعية والبحث العلمي.",
  "credentials": "دكتوراه جراحة الأوعية الدموية، جامعة عين شمس، 2017",
  "qualifications": [
    "دكتوراه جراحة الأوعية الدموية، جامعة عين شمس، 2017",
    "ماجستير الجراحة العامة، جامعة عين شمس، 2013",
    "بكالوريوس الطب والجراحة، جامعة عين شمس، 2008"
  ],
  "focusAreas": [
    "توسيع الشرايين الطرفية وجراحات تحويل المسار",
    "إصلاح تمدد الأورطي بالقسطرة، بما يشمل EVAR و TEVAR",
    "أمراض الأوردة وعلاج الدوالي",
    "وصلات الغسيل الكلوي وتدخلات الأوردة"
  ],
  "distinction": "أستاذ مساعد بجامعة عين شمس منذ يونيو 2023",
  "achievements": [
    "أستاذ مساعد جراحة الأوعية الدموية منذ يونيو 2023، مع الإشراف على تدريب الأطباء المقيمين وأطباء الامتياز وطلاب الطب",
    "مدير قسم جراحة الأوعية الدموية بمستشفى عين شمس التخصصي في 2023 وبمستشفى الدمرداش في 2021",
    "بحث مدرج في السيرة الذاتية بمجلة Journal of Vascular Surgery: Venous and Lymphatic Disorders عن انسداد الأوردة الحرقفية والفخذية المزمن، 2021"
  ],
  "professionalStanding": [
    "المناصب السريرية والأكاديمية بحسب السيرة الذاتية المؤرخة في ديسمبر 2025"
  ],
  "appointments": [
    "أستاذ مساعد جراحة الأوعية الدموية، جامعة عين شمس، منذ يونيو 2023 (بحسب سيرة ديسمبر 2025)",
    "استشاري جراحة الأوعية الدموية والقسطرة الطرفية، مستشفيات جامعة عين شمس، منذ أكتوبر 2017 (بحسب سيرة ديسمبر 2025)"
  ],
  "achievementBadges": [
    "دكتوراه جراحة الأوعية الدموية",
    "أستاذ مساعد"
  ],
  "signals": [
    "دكتوراه جراحة الأوعية الدموية",
    "جامعة عين شمس"
  ],
  "location": "القاهرة، مصر",
  "careAreaLabel": "جراحة الأوعية الدموية والقسطرة الطرفية",
  "verification": "أُعد هذا الملف من السيرة الذاتية المقدمة والمؤرخة في ديسمبر 2025. المؤهلات والمناصب والأبحاث مذكورة في السيرة وتخضع لمراجعة الاعتماد قبل توجيه الحالات السريرية.",
  "expertise": {
    "anchor": "جراحة الأوعية الدموية والقسطرة الطرفية",
    "areas": [
      "توسيع الشرايين الطرفية وجراحات تحويل المسار",
      "إصلاح تمدد الأورطي بالقسطرة، بما يشمل EVAR و TEVAR",
      "أمراض الأوردة وعلاج الدوالي",
      "وصلات الغسيل الكلوي وتدخلات الأوردة"
    ]
  }
},
    {
      "slug": "ahmed-magdy-mahmoud",
      "initials": "AM",
      "sourceFile": "Ahmed_Saleh_CV.docx",
      "name": "د. أحمد مجدي محمود",
      "specialty": "جراحة التجميل والترميم والحروق",
      "role": "مدرس جراحة التجميل، جامعة حلوان",
      "summary": "جراح تجميل وترميم بخبرة في المستشفيات الجامعية تشمل جراحة التجميل وترميم الحروق وجراحة اليد والوجه والفكين.",
      "cardSummary": "جراح تجميل وترميم بخبرة في المستشفيات الجامعية تشمل جراحة التجميل وترميم الحروق وجراحة اليد والوجه والفكين.",
      "credentials": "دكتوراه جراحة التجميل والحروق والوجه والفكين، جامعة حلوان",
      "qualifications": [
        "دكتوراه جراحة التجميل والحروق والوجه والفكين، جامعة حلوان",
        "ماجستير الجراحة العامة، جامعة عين شمس",
        "بكالوريوس الطب والجراحة، جامعة عين شمس"
      ],
      "focusAreas": [
        "تجميل الوجه والثدي",
        "نحت الجسم",
        "ترميم الحروق",
        "جراحة اليد والوجه والفكين"
      ],
      "distinction": "تدريس جامعي وممارسة جراحة الترميم منذ 2017",
      "achievements": [
        "مدرس جراحة التجميل بجامعة حلوان منذ أبريل 2017",
        "ممثل القسم في لجان الجودة واللجان الطبية بالمستشفى الجامعي",
        "تدريب في ترميم الثدي وترميم الأطراف بالتعاون بين جراحة العظام والتجميل"
      ],
      "professionalStanding": [
        "تدريب مستمر مع الجمعية المصرية لجراحة التجميل والترميم"
      ],
      "appointments": [
        "مدرس جراحة التجميل، جامعة حلوان"
      ],
      "achievementBadges": [
        "دكتوراه جراحة التجميل والحروق والوجه والفكين، جامعة حلوان"
      ],
      "signals": [
        "دكتوراه جراحة التجميل والحروق والوجه والفكين، جامعة حلوان"
      ],
      "expertise": {
        "anchor": "جراحة التجميل والترميم والحروق",
        "areas": [
          "تجميل الوجه والثدي",
          "نحت الجسم",
          "ترميم الحروق",
          "جراحة اليد والوجه والفكين"
        ]
      },
      "location": "القاهرة، مصر",
      "careAreaHref": "plastic-reconstructive-surgery",
      "careAreaLabel": "جراحة التجميل والترميم",
      "verification": "أُعد الملف من السيرة الذاتية المقدمة. المؤهلات والمناصب والعضويات واردة في السيرة الذاتية وتخضع لمراجعة الاعتماد قبل التوجيه السريري."
    },
    {
      "slug": "amr-abdelazeem",
      "initials": "AA",
      "sourceFile": "Amr Abdelazeem CV.docx",
      "name": "د. عمرو عبد العظيم",
      "specialty": "الجهاز الهضمي والكبد والمناظير المتقدمة",
      "role": "مدرس الأمراض المتوطنة والكبد والجهاز الهضمي، جامعة حلوان",
      "summary": "استشاري كبد وجهاز هضمي يركز على المناظير التشخيصية والعلاجية ومناظير القنوات المرارية والموجات فوق الصوتية بالمنظار والتهاب الأمعاء، مع خبرة ضمن فريق زراعة الكبد.",
      "cardSummary": "استشاري كبد وجهاز هضمي يركز على المناظير التشخيصية والعلاجية ومناظير القنوات المرارية والموجات فوق الصوتية بالمنظار والتهاب الأمعاء، مع خبرة ضمن فريق زراعة الكبد.",
      "credentials": "دكتوراه أمراض الكبد والجهاز الهضمي المتوطنة، جامعة القاهرة، 2021",
      "qualifications": [
        "دكتوراه أمراض الكبد والجهاز الهضمي المتوطنة، جامعة القاهرة، 2021",
        "ماجستير طب المناطق الحارة، جامعة عين شمس، 2015",
        "الطب والجراحة، جامعة الزقازيق، 2010",
        "زمالة الموجات فوق الصوتية بالمنظار، جامعة أرضروم، تركيا، 2026"
      ],
      "focusAreas": [
        "المناظير المتقدمة والقنوات المرارية",
        "الموجات فوق الصوتية بالمنظار",
        "أمراض الكبد",
        "التهاب الأمعاء"
      ],
      "distinction": "زمالة الموجات فوق الصوتية بالمنظار في تركيا، 2026",
      "achievements": [
        "زمالة الموجات فوق الصوتية بالمنظار، جامعة أرضروم، 2026",
        "منسق مجموعة التهاب الأمعاء بجامعة العاصمة",
        "خبرة ضمن فريق زراعة الكبد بمستشفى وادي النيل، 2017–2022"
      ],
      "professionalStanding": [
        "عضوية المجموعة الأوروبية للجهاز الهضمي وفق السيرة الذاتية",
        "الجمعية المصرية للبحث والتدريب في أمراض الكبد والجهاز الهضمي"
      ],
      "appointments": [
        "مدرس الأمراض المتوطنة والكبد والجهاز الهضمي، جامعة حلوان"
      ],
      "achievementBadges": [
        "دكتوراه أمراض الكبد والجهاز الهضمي المتوطنة، جامعة القاهرة، 2021"
      ],
      "signals": [
        "دكتوراه أمراض الكبد والجهاز الهضمي المتوطنة، جامعة القاهرة، 2021"
      ],
      "expertise": {
        "anchor": "الجهاز الهضمي والكبد والمناظير المتقدمة",
        "areas": [
          "المناظير المتقدمة والقنوات المرارية",
          "الموجات فوق الصوتية بالمنظار",
          "أمراض الكبد",
          "التهاب الأمعاء"
        ]
      },
      "location": "القاهرة، مصر",
      "careAreaHref": "gastroenterology-hepatology",
      "careAreaLabel": "الجهاز الهضمي والكبد",
      "verification": "أُعد الملف من السيرة الذاتية المقدمة. المؤهلات والمناصب والعضويات واردة في السيرة الذاتية وتخضع لمراجعة الاعتماد قبل التوجيه السريري."
    },
    {
      "slug": "ahmed-khaled",
      "initials": "AK",
      "sourceFile": "Curriculum Vitae (ahmed khaled)-2.docx",
      "name": "د. أحمد خالد",
      "specialty": "استبدال المفاصل وجراحة العظام",
      "role": "أستاذ مساعد جراحة العظام، جامعة عين شمس",
      "summary": "استشاري عظام يركز على استبدال المفاصل الأولي والمعقد واستبدال الركبة بمساعدة الروبوت وإصابات العظام وجراحة الإصابات الرياضية بالمنظار.",
      "cardSummary": "استشاري عظام يركز على استبدال المفاصل الأولي والمعقد واستبدال الركبة بمساعدة الروبوت وإصابات العظام وجراحة الإصابات الرياضية بالمنظار.",
      "credentials": "دكتوراه الإصابات وجراحة العظام، جامعة عين شمس، 2018",
      "qualifications": [
        "دكتوراه الإصابات وجراحة العظام، جامعة عين شمس، 2018",
        "ماجستير جراحة العظام، جامعة عين شمس، 2012",
        "بكالوريوس الطب والجراحة بمرتبة الشرف، جامعة عين شمس، 2008"
      ],
      "focusAreas": [
        "استبدال الورك والركبة",
        "استبدال الركبة بمساعدة الروبوت",
        "جراحة الكتف",
        "الإصابات الرياضية والكسور"
      ],
      "distinction": "تدريب استبدال الركبة بمساعدة الروبوت، مومباي، 2026",
      "achievements": [
        "أستاذ مساعد بجامعة عين شمس منذ يناير 2025",
        "تدريب وترخيص استبدال الركبة باستخدام روبوت Misso وفق السيرة الذاتية، 2026",
        "بحث الدكتوراه عن استبدال الورك المعقد في خلل التنسج الشديد"
      ],
      "professionalStanding": [
        "عضوية نقابة الأطباء المصرية",
        "تدريب الإصابات STEPS، كلية الطب بجامعة ميريلاند"
      ],
      "appointments": [
        "أستاذ مساعد جراحة العظام، جامعة عين شمس"
      ],
      "achievementBadges": [
        "دكتوراه الإصابات وجراحة العظام، جامعة عين شمس، 2018"
      ],
      "signals": [
        "دكتوراه الإصابات وجراحة العظام، جامعة عين شمس، 2018"
      ],
      "expertise": {
        "anchor": "استبدال المفاصل وجراحة العظام",
        "areas": [
          "استبدال الورك والركبة",
          "استبدال الركبة بمساعدة الروبوت",
          "جراحة الكتف",
          "الإصابات الرياضية والكسور"
        ]
      },
      "location": "القاهرة، مصر",
      "careAreaHref": "orthopedics",
      "careAreaLabel": "جراحة العظام",
      "verification": "أُعد الملف من السيرة الذاتية المقدمة. المؤهلات والمناصب والعضويات واردة في السيرة الذاتية وتخضع لمراجعة الاعتماد قبل التوجيه السريري."
    },
    {
      "slug": "mostafa-farid",
      "initials": "MF",
      "sourceFile": "CV2026.pdf",
      "name": "د. مصطفى فريد",
      "specialty": "الأشعة العصبية التداخلية",
      "role": "مدرس الأشعة، وحدة الأشعة العصبية التداخلية، مستشفيات جامعة عين شمس",
      "summary": "استشاري أشعة عصبية تداخلية يركز على تدخلات الأوعية العصبية محدودة التدخل، بما يشمل تمدد الشرايين وتشوهات الأوعية وسحب الجلطات وتركيب دعامات الجيوب الوريدية.",
      "cardSummary": "استشاري أشعة عصبية تداخلية يركز على تدخلات الأوعية العصبية محدودة التدخل، بما يشمل تمدد الشرايين وتشوهات الأوعية وسحب الجلطات وتركيب دعامات الجيوب الوريدية.",
      "credentials": "دكتوراه الأشعة، جامعة عين شمس، 2017",
      "qualifications": [
        "دكتوراه الأشعة، جامعة عين شمس، 2017",
        "ماجستير الأشعة، جامعة عين شمس، 2012",
        "الدبلوم الأوروبي للأشعة العصبية EDiNR، 2014–2017",
        "بكالوريوس الطب والجراحة، جامعة عين شمس، 2008"
      ],
      "focusAreas": [
        "تدخلات تمدد شرايين المخ",
        "قسطرة التشوهات الوعائية",
        "سحب جلطات المخ",
        "دعامات الجيوب الوريدية"
      ],
      "distinction": "الدبلوم الأوروبي للأشعة العصبية EDiNR",
      "achievements": [
        "الدبلوم الأوروبي للأشعة العصبية",
        "مشاركة كعضو هيئة تدريب ومتحدث في NEURO-PAIRS، 2019–2024",
        "أبحاث منشورة عن محولات التدفق ودعامات الجيوب الوريدية والنواسير الوعائية الشوكية"
      ],
      "professionalStanding": [
        "تدريب دولي يشمل مدرسة أكسفورد لعلاج تمدد الشرايين ودورة بيير لاسجونياس الأوروبية"
      ],
      "appointments": [
        "مدرس الأشعة، وحدة الأشعة العصبية التداخلية، مستشفيات جامعة عين شمس"
      ],
      "achievementBadges": [
        "دكتوراه الأشعة، جامعة عين شمس، 2017"
      ],
      "signals": [
        "دكتوراه الأشعة، جامعة عين شمس، 2017"
      ],
      "expertise": {
        "anchor": "الأشعة العصبية التداخلية",
        "areas": [
          "تدخلات تمدد شرايين المخ",
          "قسطرة التشوهات الوعائية",
          "سحب جلطات المخ",
          "دعامات الجيوب الوريدية"
        ]
      },
      "location": "القاهرة، مصر",
      "careAreaHref": "interventional-neuroradiology",
      "careAreaLabel": "الأشعة العصبية التداخلية",
      "verification": "أُعد الملف من السيرة الذاتية المقدمة. المؤهلات والمناصب والعضويات واردة في السيرة الذاتية وتخضع لمراجعة الاعتماد قبل التوجيه السريري."
    },
    {
      "slug": "mustafa-mohammed-abbas",
      "initials": "MA",
      "sourceFile": "Dr_Mustafa_Mohammed_Abbas_CV_Professional_Summary_Updated.docx",
      "name": "د. مصطفى محمد عباس",
      "specialty": "النساء والتوليد وصحة الأم",
      "role": "مدرس النساء والتوليد، جامعة عين شمس",
      "summary": "طبيب نساء وتوليد يجمع بين تطوير برامج صحة الأم والموجات فوق الصوتية التوليدية وجراحات النساء ورعاية الخصوبة والتدريب السريري.",
      "cardSummary": "طبيب نساء وتوليد يجمع بين تطوير برامج صحة الأم والموجات فوق الصوتية التوليدية وجراحات النساء ورعاية الخصوبة والتدريب السريري.",
      "credentials": "دكتوراه النساء والتوليد، جامعة عين شمس، 2017–2021",
      "qualifications": [
        "دكتوراه النساء والتوليد، جامعة عين شمس، 2017–2021",
        "ماجستير النساء والتوليد، جامعة عين شمس، 2014–2016",
        "بكالوريوس الطب والجراحة، جامعة عين شمس، 2006–2012",
        "الجزء الأول من امتحان RCOG، 2014"
      ],
      "focusAreas": [
        "صحة الأم",
        "الموجات فوق الصوتية التوليدية",
        "جراحات النساء",
        "رعاية الخصوبة"
      ],
      "distinction": "استشاري تقني وطني أول لصندوق الأمم المتحدة للسكان، 2026، وفق السيرة الذاتية",
      "achievements": [
        "استشاري تقني وطني أول لصندوق الأمم المتحدة للسكان ومستشار لنائب وزير الصحة والسكان، 2026، وفق السيرة الذاتية",
        "رئيس قسم النساء والتوليد بمستشفى عبد القادر فهمي",
        "مدرب معتمد من USAID بمشروع أسرة، 2023"
      ],
      "professionalStanding": [
        "عضو البورد المصري للقبالة",
        "عضو لجنة إرشادات النساء والتوليد بالهيئة المصرية للرعاية الصحية، 2026"
      ],
      "appointments": [
        "مدرس النساء والتوليد، جامعة عين شمس"
      ],
      "achievementBadges": [
        "دكتوراه النساء والتوليد، جامعة عين شمس، 2017–2021"
      ],
      "signals": [
        "دكتوراه النساء والتوليد، جامعة عين شمس، 2017–2021"
      ],
      "expertise": {
        "anchor": "النساء والتوليد وصحة الأم",
        "areas": [
          "صحة الأم",
          "الموجات فوق الصوتية التوليدية",
          "جراحات النساء",
          "رعاية الخصوبة"
        ]
      },
      "location": "القاهرة، مصر",
      "careAreaHref": "womens-health",
      "careAreaLabel": "صحة المرأة",
      "verification": "أُعد الملف من السيرة الذاتية المقدمة. المؤهلات والمناصب والعضويات واردة في السيرة الذاتية وتخضع لمراجعة الاعتماد قبل التوجيه السريري."
    },
    {
      "slug": "mohamed-hamdy-zaid",
      "initials": "MZ",
      "sourceFile": "Mohamed_Hamdy_Zaid_Professional_CV.pdf",
      "name": "أ.د. محمد حمدي زايد",
      "specialty": "الجراحة العامة وجراحات السمنة والكبد والقنوات المرارية",
      "role": "أستاذ الجراحة العامة، جامعة عين شمس",
      "summary": "أستاذ جراحة عامة بخبرة سريرية وأكاديمية في الجراحة محدودة التدخل وجراحات السمنة والتمثيل الغذائي والكبد والبنكرياس والثدي والغدة الدرقية.",
      "cardSummary": "أستاذ جراحة عامة بخبرة سريرية وأكاديمية في الجراحة محدودة التدخل وجراحات السمنة والتمثيل الغذائي والكبد والبنكرياس والثدي والغدة الدرقية.",
      "credentials": "دكتوراه الجراحة العامة",
      "qualifications": [
        "دكتوراه الجراحة العامة",
        "ماجستير الجراحة العامة"
      ],
      "focusAreas": [
        "جراحة السمنة والتمثيل الغذائي",
        "جراحة الكبد والقنوات المرارية والبنكرياس",
        "جراحة الثدي والغدة الدرقية",
        "جراحة المناظير والأورام"
      ],
      "distinction": "أستاذ الجراحة العامة بجامعة عين شمس",
      "achievements": [
        "منصب أستاذ بجامعة عين شمس",
        "أكثر من 15 عاماً من الخبرة الجراحية والأكاديمية وفق السيرة الذاتية",
        "مؤلف ومشارك في أبحاث جراحية محلية ودولية؛ قائمة الأبحاث التفصيلية متاحة عند الطلب"
      ],
      "professionalStanding": [
        "ممارسة أكاديمية وتقييم متعدد التخصصات للحالات الجراحية"
      ],
      "appointments": [
        "أستاذ الجراحة العامة، جامعة عين شمس"
      ],
      "achievementBadges": [
        "دكتوراه الجراحة العامة"
      ],
      "signals": [
        "دكتوراه الجراحة العامة"
      ],
      "expertise": {
        "anchor": "الجراحة العامة وجراحات السمنة والكبد والقنوات المرارية",
        "areas": [
          "جراحة السمنة والتمثيل الغذائي",
          "جراحة الكبد والقنوات المرارية والبنكرياس",
          "جراحة الثدي والغدة الدرقية",
          "جراحة المناظير والأورام"
        ]
      },
      "location": "القاهرة، مصر",
      "careAreaHref": "general-surgery",
      "careAreaLabel": "الجراحة العامة وجراحات السمنة",
      "verification": "أُعد الملف من السيرة الذاتية المقدمة. المؤهلات والمناصب والعضويات واردة في السيرة الذاتية وتخضع لمراجعة الاعتماد قبل التوجيه السريري."
    },
    {
      "slug": "mohammed-ali",
      "initials": "MI",
      "sourceFile": "Mohammed Ali CV 2024.pdf",
      "name": "د. محمد علي إبراهيم حسين",
      "specialty": "جراحة العمود الفقري والعظام",
      "role": "أستاذ مشارك جراحة العظام والعمود الفقري، جامعة عين شمس، وفق سيرة 2024",
      "summary": "جراح عظام وعمود فقري مع بحث دكتوراه عن اضطرابات العمود الفقري المعقدة وخبرة تدريس جامعي وزمالة AO Spine في ميونخ.",
      "cardSummary": "جراح عظام وعمود فقري مع بحث دكتوراه عن اضطرابات العمود الفقري المعقدة وخبرة تدريس جامعي وزمالة AO Spine في ميونخ.",
      "credentials": "دكتوراه الإصابات وجراحة العظام، جامعة عين شمس، 2017",
      "qualifications": [
        "دكتوراه الإصابات وجراحة العظام، جامعة عين شمس، 2017",
        "ماجستير الإصابات وجراحة العظام، جامعة عين شمس، 2012",
        "بكالوريوس الطب والجراحة بمرتبة الشرف، جامعة عين شمس، 2008"
      ],
      "focusAreas": [
        "جراحة العمود الفقري",
        "اضطرابات العمود الفقري المعقدة",
        "إصابات العظام",
        "تدريب إصابات وتنكس العمود الفقري"
      ],
      "distinction": "زمالة AO Spine، جامعة ميونخ التقنية، 2018",
      "achievements": [
        "زمالة AO Spine بقسم جراحة الأعصاب في جامعة ميونخ التقنية، يوليو–أغسطس 2018",
        "بحث الدكتوراه عن استئصال جسم الفقرة الخلفي في اضطرابات العمود الفقري المعقدة",
        "متحدث في ورش تعليم جراحة العمود الفقري بجامعة عين شمس واجتماعات ArabSpine"
      ],
      "professionalStanding": [
        "دورة AO Spine المتقدمة في الإصابات والتنكس",
        "الوحدتان 1 و4 من برنامج دورات ArabSpine"
      ],
      "appointments": [
        "أستاذ مشارك جراحة العظام والعمود الفقري، جامعة عين شمس، وفق سيرة 2024"
      ],
      "achievementBadges": [
        "دكتوراه الإصابات وجراحة العظام، جامعة عين شمس، 2017"
      ],
      "signals": [
        "دكتوراه الإصابات وجراحة العظام، جامعة عين شمس، 2017"
      ],
      "expertise": {
        "anchor": "جراحة العمود الفقري والعظام",
        "areas": [
          "جراحة العمود الفقري",
          "اضطرابات العمود الفقري المعقدة",
          "إصابات العظام",
          "تدريب إصابات وتنكس العمود الفقري"
        ]
      },
      "location": "القاهرة، مصر",
      "careAreaHref": "orthopedics",
      "careAreaLabel": "جراحة العظام",
      "verification": "أُعد الملف من السيرة الذاتية المقدمة. المؤهلات والمناصب والعضويات واردة في السيرة الذاتية وتخضع لمراجعة الاعتماد قبل التوجيه السريري."
    },
    {
      "slug": "mostafa-baraka",
      "initials": "MB",
      "sourceFile": "Mostafa_Baraka_CV_Updated_Sep_2026_EPOS.docx",
      "name": "د. مصطفى بركة",
      "specialty": "عظام الأطفال وإعادة بناء الأطراف",
      "role": "أستاذ مشارك جراحة عظام الأطفال وإعادة بناء الأطراف، جامعة عين شمس",
      "summary": "جراح عظام أطفال يركز على الحفاظ على مفصل الورك وإطالة وإعادة بناء الأطراف وعظام الشلل الدماغي وجراحة القدم والكاحل لدى الأطفال، مع مشاركة بحثية وتعليمية دولية.",
      "cardSummary": "جراح عظام أطفال يركز على الحفاظ على مفصل الورك وإطالة وإعادة بناء الأطراف وعظام الشلل الدماغي وجراحة القدم والكاحل لدى الأطفال، مع مشاركة بحثية وتعليمية دولية.",
      "credentials": "دكتوراه جراحة العظام، جامعة عين شمس، 2017؛ بحث الحفاظ على مفصل الورك",
      "qualifications": [
        "دكتوراه جراحة العظام، جامعة عين شمس، 2017؛ بحث الحفاظ على مفصل الورك",
        "ماجستير جراحة العظام، جامعة عين شمس، 2012",
        "بكالوريوس الطب والجراحة بمرتبة الشرف، جامعة عين شمس، 2008"
      ],
      "focusAreas": [
        "عظام الأطفال",
        "إطالة وإعادة بناء الأطراف",
        "الحفاظ على مفصل الورك",
        "عظام الشلل الدماغي"
      ],
      "distinction": "عروض بحثية شفوية في مؤتمر EPOS، إشبيلية، 2026",
      "achievements": [
        "عرضان بحثيان شفويان بالمؤتمر السنوي الرابع والأربعين لـ EPOS، إشبيلية، أبريل 2026",
        "أبحاث منشورة عن الحفاظ على الورك والتشوهات لدى الأطفال في Journal of Children’s Orthopaedics وSICOT-J",
        "عضو هيئة تدريب AO Trauma مصر ومدرب ATLS وفق السيرة الذاتية"
      ],
      "professionalStanding": [
        "الجمعية الأوروبية لعظام الأطفال EPOS",
        "الأكاديمية الأمريكية للشلل الدماغي وطب النمو AACPDM وفق السيرة الذاتية",
        "AO Trauma وASAMI مصر"
      ],
      "appointments": [
        "أستاذ مشارك جراحة عظام الأطفال وإعادة بناء الأطراف، جامعة عين شمس"
      ],
      "achievementBadges": [
        "دكتوراه جراحة العظام، جامعة عين شمس، 2017؛ بحث الحفاظ على مفصل الورك"
      ],
      "signals": [
        "دكتوراه جراحة العظام، جامعة عين شمس، 2017؛ بحث الحفاظ على مفصل الورك"
      ],
      "expertise": {
        "anchor": "عظام الأطفال وإعادة بناء الأطراف",
        "areas": [
          "عظام الأطفال",
          "إطالة وإعادة بناء الأطراف",
          "الحفاظ على مفصل الورك",
          "عظام الشلل الدماغي"
        ]
      },
      "location": "القاهرة، مصر",
      "careAreaHref": "orthopedics",
      "careAreaLabel": "جراحة العظام",
      "verification": "أُعد الملف من السيرة الذاتية المقدمة. المؤهلات والمناصب والعضويات واردة في السيرة الذاتية وتخضع لمراجعة الاعتماد قبل التوجيه السريري."
    },
    {
      "slug": "mahmoud-ghaleb",
      "initials": "MG",
      "sourceFile": "MY CV.docx",
      "name": "د. محمود محمد غالب",
      "specialty": "النساء والتوليد وجراحات الحوض",
      "role": "أستاذ مساعد النساء والتوليد، جامعة عين شمس",
      "summary": "طبيب نساء وتوليد يركز على جراحات الحمل عالي الخطورة والمشيمة الملتصقة ومناظير النساء وجراحات قاع الحوض وأورام النساء.",
      "cardSummary": "طبيب نساء وتوليد يركز على جراحات الحمل عالي الخطورة والمشيمة الملتصقة ومناظير النساء وجراحات قاع الحوض وأورام النساء.",
      "credentials": "دكتوراه النساء والتوليد، جامعة عين شمس، 2016",
      "qualifications": [
        "دكتوراه النساء والتوليد، جامعة عين شمس، 2016",
        "ماجستير النساء والتوليد، جامعة عين شمس، 2013",
        "بكالوريوس الطب والجراحة بمرتبة الشرف، جامعة عين شمس، 2008"
      ],
      "focusAreas": [
        "جراحات الحمل عالي الخطورة",
        "المشيمة الملتصقة",
        "مناظير النساء",
        "جراحة قاع الحوض والأورام"
      ],
      "distinction": "بحث منشور عن المشيمة الملتصقة، IJGO، 2021",
      "achievements": [
        "أستاذ مساعد النساء والتوليد منذ فبراير 2022",
        "بحث عن نهج جراحي تحفظي تدريجي للمشيمة المنزاحة الملتصقة، International Journal of Gynecology & Obstetrics، 2021",
        "مدرب في ورش منظار الرحم ومنظار عنق الرحم وجراحات الحوض المتقدمة"
      ],
      "professionalStanding": [
        "خبرة استشارية بوحدات مناظير النساء والمسالك النسائية والأورام الجراحية، جامعة عين شمس"
      ],
      "appointments": [
        "أستاذ مساعد النساء والتوليد، جامعة عين شمس"
      ],
      "achievementBadges": [
        "دكتوراه النساء والتوليد، جامعة عين شمس، 2016"
      ],
      "signals": [
        "دكتوراه النساء والتوليد، جامعة عين شمس، 2016"
      ],
      "expertise": {
        "anchor": "النساء والتوليد وجراحات الحوض",
        "areas": [
          "جراحات الحمل عالي الخطورة",
          "المشيمة الملتصقة",
          "مناظير النساء",
          "جراحة قاع الحوض والأورام"
        ]
      },
      "location": "القاهرة، مصر",
      "careAreaHref": "womens-health",
      "careAreaLabel": "صحة المرأة",
      "verification": "أُعد الملف من السيرة الذاتية المقدمة. المؤهلات والمناصب والعضويات واردة في السيرة الذاتية وتخضع لمراجعة الاعتماد قبل التوجيه السريري."
    }
  ]
};
