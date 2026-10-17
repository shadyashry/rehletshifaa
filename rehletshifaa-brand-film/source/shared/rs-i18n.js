/*
 * On-screen copy for both masters. Labels reuse the live site's wording (frontend/src/messages/{en,ar}.json)
 * wherever one exists, so the film shows the interface a patient will actually meet.
 * Names, dates, case numbers and amounts are illustrative and marked as such on screen.
 */
(function () {
  const RS = window.RS;
  RS.STRINGS = {
    en: {
      dir: "ltr",
      brand: "RehletShifaa", brandLead: "Rehlet", brandAccent: "Shifaa", brandAr: "رحلة شفاء", brandArLead: "رحلة ", brandArAccent: "شفاء",
      titles: {
        2: "Start With What You Have.", 3: "One Dedicated Coordinator.", 4: "Consultant-Led Review.",
        5: "Clarity Before Commitment.", 6: "You Decide.", 7: "Your Medical Plan Comes First.",
        8: "Coordinated Around Your Care.", 9: "Professional Care. Personal Support.",
      },
      rail: ["Your case", "Coordinator", "Consultant", "Recommendation", "Your decision", "Appointments", "Care", "Follow-up"],
      phone: {
        eyebrow: "A SECURE FIRST STEP", heading: "Send your medical case",
        sub: "Send what you already have.", step: "Medical information",
        upload: "Upload medical reports or images",
        files: ["Knee MRI report.pdf", "X-ray images · 6", "Doctor's letter.jpg"],
        consent: "I agree that RehletShifaa may process my health information to coordinate my care.",
        send: "Send my case", received: "Your case is received", caseNo: "RS-2026-000421", stamp: "RECEIVED",
        receivedSub: "Your coordinator will contact you shortly.", private: "Private to your care team",
      },
      office: {
        caseFile: "CASE FILE", patient: "Amal M. · Knee", status: ["Received", "Organized", "Ready for Consultant"],
        docs: ["Knee MRI report", "X-ray images · 6", "Doctor's letter", "Medication list"],
        check: "Coordinator check: nothing missing", msgTo: "To Amal", msg: "Hello Amal, I'm Nour, your coordinator. I've organized your reports and will guide you through each next step.",
        assign: "Assigned to Consultant · Orthopedics",
      },
      consult: { review: "Consultant review", findings: "Relevant findings", rec: "Clinical recommendation", note: "In-person assessment recommended before any treatment decision." },
      proposal: {
        title: "Your recommendation & proposal", recLabel: "Clinical recommendation", rec: "In-person orthopaedic assessment in Cairo, then confirm the treatment plan.",
        steps: "Proposed next steps", stepsList: ["Assessment appointment", "Imaging review with your Consultant", "Treatment plan confirmed after assessment"],
        est: "Preliminary estimate", range: "USD 3,900 – 5,400", estNote: "Non-binding. The final quote follows your in-person assessment.",
        example: "Illustrative example", question: "Does the estimate include the follow-up review?", answer: "Yes — one follow-up review is included. Nour",
        continue: "Continue journey", notNow: "Not now",
      },
      decision: { done: "Next step requested", note: "Nour will contact you to arrange your assessment appointment." },
      plan: {
        title: "Journey plan", medical: "Medical appointments", requested: "Requested", optNote: "Arranged only at your request",
        appt: "Consultation · Orthopaedics", apptWhen: "Tue 14 Oct · 10:00", confirmed: "Confirmed",
        optional: "Optional support", services: ["Flights", "Accommodation", "Visa support", "Airport transfer"], ops: "Operations team",
      },
      arrival: { hall: "Arrivals", welcome: "Welcome, Amal", driver: "Your driver · Karim", to: "To: Hotel · Zamalek", appt: "Appointment tomorrow · 10:00" },
      care: { plan: "Care plan", items: ["Treatment confirmed by your treating team", "Physiotherapy plan", "Follow-up review"], confirmed: "Confirmed after in-person assessment", nour: "Nour: I'm here if you need anything during your stay." },
      follow: { notif: "Follow-up review scheduled", when: "Thu 6 Nov · 18:00 · Video call", from: "RehletShifaa · Nour" },
      end: { tagline: "Understand Your Treatment Options Before You Travel.", cta: "Send my case", url: "dev.rehletshifaa.com/en/send-my-case" },
    },
    ar: {
      dir: "rtl",
      brand: "رحلة شفاء", brandLead: "Rehlet", brandAccent: "Shifaa", brandAr: "رحلة شفاء", brandArLead: "رحلة ", brandArAccent: "شفاء",
      titles: {
        2: "ابدأ بما لديك.", 3: "منسّقٌ واحد مخصّص لك.", 4: "مراجعةٌ يقودها استشاري.",
        5: "وضوحٌ قبل الالتزام.", 6: "أنت تقرّر.", 7: "خطتك الطبية أولًا.",
        8: "تنسيقٌ حول رعايتك.", 9: "رعايةٌ مهنية. ودعمٌ شخصي.",
      },
      rail: ["حالتك", "المنسّق", "الاستشاري", "التوصية", "قرارك", "المواعيد", "الرعاية", "المتابعة"],
      phone: {
        eyebrow: "خطوة أولى آمنة", heading: "أرسل حالتك الطبية",
        sub: "أرسل ما هو متوفر لديك.", step: "المعلومات الطبية",
        upload: "ارفع التقارير أو الصور الطبية",
        files: ["تقرير الرنين للركبة.pdf", "صور الأشعة · 6", "خطاب الطبيب.jpg"],
        consent: "أوافق على أن تعالج رحلة شفاء معلوماتي الصحية لتنسيق رعايتي.",
        send: "أرسل حالتي", received: "استُلمت حالتك", caseNo: "RS-2026-000421", stamp: "استُلمت",
        receivedSub: "سيتواصل معك منسّقك قريبًا.", private: "خاصة بفريق رعايتك",
      },
      office: {
        caseFile: "ملف الحالة", patient: "أمل م. · الركبة", status: ["استُلمت", "نُظّمت", "جاهزة للاستشاري"],
        docs: ["تقرير الرنين للركبة", "صور الأشعة · 6", "خطاب الطبيب", "قائمة الأدوية"],
        check: "مراجعة المنسّق: لا شيء ناقص", msgTo: "إلى أمل", msg: "مرحبًا أمل، أنا نور منسّقة حالتك. نظّمتُ تقاريرك وسأرافقك في كل خطوة قادمة.",
        assign: "أُسندت إلى استشاري · العظام",
      },
      consult: { review: "مراجعة الاستشاري", findings: "النتائج ذات الصلة", rec: "التوصية السريرية", note: "يوصى بفحصٍ مباشر قبل أي قرار علاجي." },
      proposal: {
        title: "توصيتك وعرضك", recLabel: "التوصية السريرية", rec: "فحص مباشر لدى استشاري العظام في القاهرة، ثم تأكيد خطة العلاج.",
        steps: "الخطوات المقترحة", stepsList: ["موعد الفحص", "مراجعة الأشعة مع استشاريك", "تأكيد خطة العلاج بعد الفحص"],
        est: "التقدير المبدئي", range: "3,900 – 5,400 دولار", estNote: "غير ملزم. العرض النهائي يُعدّ بعد فحصك المباشر.",
        example: "مثال توضيحي", question: "هل يشمل التقدير زيارة المتابعة؟", answer: "نعم، تشمل مراجعة متابعة واحدة. نور",
        continue: "متابعة الرحلة", notNow: "ليس الآن",
      },
      decision: { done: "تم طلب الخطوة التالية", note: "ستتواصل معك نور لترتيب موعد الفحص." },
      plan: {
        title: "خطة الرحلة", medical: "المواعيد الطبية", requested: "قيد الطلب", optNote: "تُرتَّب فقط بناءً على طلبك",
        appt: "استشارة · العظام", apptWhen: "الثلاثاء 14 أكتوبر · 10:00", confirmed: "مؤكَّد",
        optional: "دعم اختياري", services: ["الطيران", "الإقامة", "دعم التأشيرة", "الاستقبال من المطار"], ops: "فريق العمليات",
      },
      arrival: { hall: "الوصول", welcome: "أهلًا بك يا أمل", driver: "سائقك · كريم", to: "إلى: الفندق · الزمالك", appt: "موعدك غدًا · 10:00" },
      care: { plan: "خطة الرعاية", items: ["علاج يؤكّده فريقك المعالج", "خطة العلاج الطبيعي", "مراجعة المتابعة"], confirmed: "أُكّدت بعد الفحص المباشر", nour: "نور: أنا هنا إن احتجتِ أي شيء خلال إقامتك." },
      follow: { notif: "تم تحديد موعد المتابعة", when: "الخميس 6 نوفمبر · 18:00 · مكالمة فيديو", from: "رحلة شفاء · نور" },
      end: { tagline: "افهم خيارات علاجك قبل أن تسافر", cta: "أرسل حالتي", url: "dev.rehletshifaa.com/ar/send-my-case" },
    },
  };
})();
