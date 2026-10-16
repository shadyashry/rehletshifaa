package com.rehletshifaa.journey.application;

import com.rehletshifaa.journey.api.DischargeDtos.Implant;
import com.rehletshifaa.journey.api.DischargeDtos.Medication;

import java.time.LocalDate;
import java.util.List;

/**
 * The letter the patient takes to their home doctor (P1-17; design §5 stages 5 and 6; architecture §5.4), written from the
 * structured discharge pack in English and in Arabic. The headings and the sentences around the facts are the platform's; the
 * clinical facts (diagnosis, procedures, medicines, warning signs) are the Consultant's own words as recorded, never free text
 * copied from a conversation. Plain text: the portal shows and prints it.
 */
final class HandoverLetter {
    private HandoverLetter() {}

    /** Everything the letter says; any of it may be missing except the case number. */
    record Facts(String patientName, String caseNumber, String facilityName, String facilityCity, LocalDate admittedOn, LocalDate dischargedOn,
                 String diagnosis, String procedures, String operativeNoteReference, List<Implant> implants, List<Medication> medications,
                 String pendingResults, String warningSigns, LocalDate followUpOn, String followUpMode) {}

    static String english(Facts f) {
        StringBuilder b = new StringBuilder();
        b.append("Handover letter for the patient's doctor at home\n");
        b.append("Patient: ").append(or(f.patientName(), "-")).append("   Case: ").append(f.caseNumber()).append('\n');
        if (f.facilityName() != null) b.append("Treated at: ").append(f.facilityName()).append(f.facilityCity() == null ? "" : ", " + f.facilityCity()).append('\n');
        b.append("Admitted: ").append(date(f.admittedOn())).append("   Discharged: ").append(date(f.dischargedOn())).append("\n\n");
        b.append("Diagnosis: ").append(or(f.diagnosis(), "-")).append('\n');
        if (f.procedures() != null) b.append("Procedures: ").append(f.procedures()).append('\n');
        if (f.operativeNoteReference() != null) b.append("Operative note: on file (reference ").append(f.operativeNoteReference()).append(")\n");
        if (f.implants() != null && !f.implants().isEmpty()) {
            b.append("Implants:\n");
            for (Implant i : f.implants()) b.append("- ").append(implant(i)).append('\n');
        }
        b.append("\nMedicines on discharge:\n");
        for (Medication m : f.medications()) b.append("- ").append(m.name()).append(" — ").append(m.dose()).append(", ").append(m.frequency()).append(", for ").append(m.duration()).append('\n');
        if (f.pendingResults() != null) b.append("\nResults still pending: ").append(f.pendingResults()).append('\n');
        b.append("\nWarning signs — the patient should seek care urgently if: ").append(or(f.warningSigns(), "-")).append('\n');
        if (f.followUpOn() != null) b.append("\nFollow-up: ").append(mode(f.followUpMode(), false)).append(" with the treating Consultant on ").append(date(f.followUpOn())).append('\n');
        b.append("\nThis letter was generated from the discharge documents recorded by the treating Consultant. The full documents are with the patient "
                + "and on their RehletShifaa case; the patient's coordinator can put you in touch with the Consultant.\n");
        return b.toString();
    }

    static String arabic(Facts f) {
        StringBuilder b = new StringBuilder();
        b.append("خطاب تسليم إلى طبيب المريض في بلده\n");
        b.append("المريض: ").append(or(f.patientName(), "-")).append("   رقم الحالة: ").append(f.caseNumber()).append('\n');
        if (f.facilityName() != null) b.append("مكان العلاج: ").append(f.facilityName()).append(f.facilityCity() == null ? "" : "، " + f.facilityCity()).append('\n');
        b.append("تاريخ الدخول: ").append(date(f.admittedOn())).append("   تاريخ الخروج: ").append(date(f.dischargedOn())).append("\n\n");
        b.append("التشخيص: ").append(or(f.diagnosis(), "-")).append('\n');
        if (f.procedures() != null) b.append("الإجراءات: ").append(f.procedures()).append('\n');
        if (f.operativeNoteReference() != null) b.append("تقرير العملية: محفوظ في الملف (المرجع ").append(f.operativeNoteReference()).append(")\n");
        if (f.implants() != null && !f.implants().isEmpty()) {
            b.append("المزروعات الطبية:\n");
            for (Implant i : f.implants()) b.append("- ").append(implant(i)).append('\n');
        }
        b.append("\nالأدوية عند الخروج:\n");
        for (Medication m : f.medications()) b.append("- ").append(m.name()).append(" — ").append(m.dose()).append("، ").append(m.frequency()).append("، لمدة ").append(m.duration()).append('\n');
        if (f.pendingResults() != null) b.append("\nنتائج لم تصدر بعد: ").append(f.pendingResults()).append('\n');
        b.append("\nعلامات الخطر — على المريض طلب الرعاية فورًا إذا ظهرت: ").append(or(f.warningSigns(), "-")).append('\n');
        if (f.followUpOn() != null) b.append("\nالمتابعة: ").append(mode(f.followUpMode(), true)).append(" مع الاستشاري المعالج بتاريخ ").append(date(f.followUpOn())).append('\n');
        b.append("\nأُعدّ هذا الخطاب من وثائق الخروج التي سجّلها الاستشاري المعالج. الوثائق الكاملة مع المريض وفي حالته على رحلة شفاء، "
                + "ويمكن لمنسّق المريض أن يصلك بالاستشاري.\n");
        return b.toString();
    }

    private static String implant(Implant i) {
        StringBuilder b = new StringBuilder(i.description());
        if (i.manufacturer() != null && !i.manufacturer().isBlank()) b.append(" (").append(i.manufacturer().trim()).append(')');
        if (i.reference() != null && !i.reference().isBlank()) b.append(" — ").append(i.reference().trim());
        return b.toString();
    }

    private static String mode(String mode, boolean arabic) {
        if (mode == null) return arabic ? "موعد" : "an appointment";
        return switch (mode) {
            case "VIDEO" -> arabic ? "استشارة مرئية" : "a video consultation";
            case "PHONE" -> arabic ? "مكالمة هاتفية" : "a phone call";
            case "IN_PERSON" -> arabic ? "زيارة حضورية" : "an in-person visit";
            default -> arabic ? "موعد" : "an appointment";
        };
    }

    private static String date(LocalDate d) { return d == null ? "-" : d.toString(); }

    private static String or(String v, String fallback) { return v == null || v.isBlank() ? fallback : v; }
}
