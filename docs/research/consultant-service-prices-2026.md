# Consultant starter services and Egyptian price evidence — 2026

Research/access date: **2026-10-17**. Currency: **EGP**, with no currency conversion. This is a research worksheet for a starter catalogue, not a tariff agreed with any of the 13 Consultants.

## Method and interpretation

The Consultant roster, slugs, specialties and service-selection rationale come only from `backend/src/main/resources/db/migration/V105__consultant_directory_profiles.sql`. The UUID below is the migration's **fallback practitioner UUID**: V105 reuses a pre-existing matching Consultant, so the deployed UUID must be resolved from the database rather than assumed. The migration lists these profiles under credential review; a research candidate does not establish clinical eligibility or a Consultant's acceptance of that service.

There are **five starter candidates for each of 13 Consultants**, covering all **nine care areas**. Shared service codes intentionally repeat across relevant Consultants. Codes identify services independently of a practitioner and use uppercase ASCII, hyphens and at most 60 characters. Arabic names are proposed catalogue translations.

Searches prioritized Egyptian private providers' own pages, followed by live provider offers on CliniDo/Vezeeta and medical-tourism sources. Clinic articles often publish indicative Egyptian market estimates rather than their own binding fees. A 2025/2026 heading or update is recorded as a publisher claim; crawling/access dates do not prove that the price was recently reconfirmed. No contacted-provider quotation was obtained.

**Low/high are evidence bounds, not a statistical market survey.** A published starting price has a numeric low and `OPEN` high. A single listed fee has equal low/high and is explicitly described as a point price. `OPEN / OPEN` means no sufficiently specific, current Egyptian private-sector EGP price was established; it must remain unpriced. No price is extrapolated from a different procedure, subsidized copayment, public hospital tariff, foreign country, implant-only charge or foreign-currency package.

**Included/excluded columns define the proposed service boundary**, not a claim that a benchmark provider includes those items in its fee. Unless a source note explicitly confirms a bundle, the cost of surgeon, anaesthesia, hospital, implants, pathology, tests and follow-up remains to be confirmed in a written quote. Travel, accommodation, complications and unrelated treatment are outside every candidate. A clinical operation's name is not a standardized all-inclusive package.

Confidence applies to the price evidence: **Medium** = a specific 2025/2026 provider-published indicative EGP range; **Low** = an undated live listing, unclear bundle, mixed scope or source-date limitation; **Open** = no usable numeric price. No row earns High confidence without a current itemized provider quote.

Source identifiers in every row are clickable URLs, defined in the source register. The row's date is the access date; rejected or non-price sources are explicitly marked.

## Reusable care-area coverage

| Care category from V105 | Code prefix | Reusable starter examples | Evidence position |
|---|---|---|---|
| `cardiology` | `CARD` | Coronary angiography, PCI | Numeric private-provider listings; complex/device procedures remain open |
| `rheumatology-rehabilitation` | `REHAB` | Assessment, swallowing rehabilitation, NCS/EMG | Assessment and selected sessions/tests have evidence; swallowing prices open |
| `orthopedics` | `ORTH` | Knee/hip replacement, ankle surgery, spine surgery, pediatric assessment | Adult surgery ranges available; pediatric reconstruction largely open |
| `vascular-endovascular-surgery` | `VASC` | Varicose-vein laser, peripheral angioplasty, EVAR, dialysis access | Specific laser range; major arterial/access prices open |
| `plastic-reconstructive-surgery` | `PLAST` | Rhinoplasty, liposuction, breast reduction, burn/hand reconstruction | Cosmetic ranges available; reconstructive operations open |
| `gastroenterology-hepatology` | `GI` | Gastroscopy, colonoscopy, EUS, ERCP, liver review | Endoscopy ranges; specialist liver-review price open |
| `interventional-neuroradiology` | `NEURO` | Aneurysm intervention, AVM embolization, thrombectomy, venous sinus stent, DSA | Procedure-specific current EGP prices remain open |
| `womens-health` | `WH` | Antenatal assessment, ultrasound, hysteroscopy, pelvic surgery | Hysteroscopy range; complex obstetric/pelvic operations open |
| `general-surgery` | `GS` | Sleeve gastrectomy, cholecystectomy, thyroid/breast surgery, HPB review | Several operation ranges/starting prices; HPB-review price open |

## 1. Dr Ahmed AlAshry

Slug: `ahmed-alashry` · fallback practitioner: `649ae588-0f5d-58f6-a2a3-606a57e2c4ce` · care area: `cardiology`.

V105: General and Interventional Cardiology; coronary angiography/PCI, complex bifurcation/left-main PCI, emergency/primary PCI, pacemakers and selected structural interventions.

| Service code | English name / Arabic name | Included boundary | Excluded boundary | Low EGP | High EGP | Source / access | Confidence | Rationale / evidence limitation |
|---|---|---|---|---:|---:|---|---|---|
| `CARD-CORONARY-ANGIOGRAPHY` | Coronary angiography / تصوير الشرايين التاجية بالقسطرة | One diagnostic coronary study | PCI, stents, admission beyond planned observation | 15,000 | 21,250 | [S01] · 2026-10-17 | Low | Explicit V105 skill. Spread of live listed offers, not one provider's range; consultation listed separately. |
| `CARD-PCI` | Coronary angioplasty with stent / توسيع الشرايين التاجية وتركيب دعامة | PCI episode; device specification required | Additional/complex lesions, emergency ICU, unspecified extra stents | 70,000 | 85,000 | [S02], [S03] · 2026-10-17 | Medium | Direct V105 coronary focus. Clinic market range corroborated by an 81,000 offer including one drug-eluting stent. |
| `CARD-COMPLEX-PCI` | Complex coronary PCI assessment and intervention / تقييم وتدخل للشرايين التاجية المعقدة | Case-specific bifurcation/left-main plan and intervention | Routine PCI price assumption; unspecified adjunctive devices | OPEN | OPEN | [S02] (insufficient scope) · 2026-10-17 | Open | Explicit V105 focus. Generic PCI range cannot price left-main/bifurcation complexity. |
| `CARD-PACEMAKER` | Pacemaker implantation / زراعة منظم ضربات القلب | Implantation episode with device type defined | ICD/CRT, generator replacement, unplanned lead work | OPEN | OPEN | [S04] (rejected conflict) · 2026-10-17 | Open | V105 rhythm-device focus. Same page reports incompatible 90–120k and 300–350k scopes; no coherent bundle. |
| `CARD-STRUCTURAL-ASSESSMENT` | Structural-heart intervention assessment / تقييم التدخلات الهيكلية للقلب | Review of reports and intervention options | Valve/device implantation, imaging performed separately | OPEN | OPEN | [S03] (procedure listing only) · 2026-10-17 | Open | V105 says selected structural interventions; assessment avoids assuming a specific valve/device service or fee. |

## 2. Dr Hanan Elshoura

Slug: `hanan-elshoura` · fallback practitioner: `f03f297d-baa6-5b37-a8f4-fe3d2c10ad02` · care area: `rheumatology-rehabilitation`.

V105: Rheumatology, Rehabilitation and Physical Medicine; adult/pediatric dysphagia, neurological/geriatric/pediatric and cardiopulmonary rehabilitation, musculoskeletal ultrasound and electrophysiology.

| Service code | English name / Arabic name | Included boundary | Excluded boundary | Low EGP | High EGP | Source / access | Confidence | Rationale / evidence limitation |
|---|---|---|---|---:|---:|---|---|---|
| `REHAB-INITIAL-ASSESSMENT` | Rheumatology and rehabilitation assessment / تقييم الروماتيزم والتأهيل | One specialist clinical consultation | Ultrasound, EMG, treatment sessions | 886 | 886 | [S05] · 2026-10-17 | Low | Specialty match. Live Hanan Elshoura listing point fee; no publication date, membership discount excluded. |
| `REHAB-ADULT-SWALLOW` | Adult swallowing assessment and rehabilitation plan / تقييم البلع وتأهيله للبالغين | Clinical assessment and individualized plan | Instrumental swallow study, feeding supplies, subsequent sessions | OPEN | OPEN | [S06] (service only) · 2026-10-17 | Open | V105's anchor expertise. Egyptian rehabilitation provider confirms service but publishes no eligible EGP tariff. |
| `REHAB-PEDIATRIC-SWALLOW` | Pediatric swallowing assessment and rehabilitation plan / تقييم البلع وتأهيله للأطفال | Child-specific clinical assessment and family plan | Instrumental studies, tube feeding, a multi-session course | OPEN | OPEN | [S06] (no pediatric price) · 2026-10-17 | Open | Explicit V105 focus. Adult swallowing or ordinary speech-session prices are not valid pediatric dysphagia proxies. |
| `REHAB-GERIATRIC-HOME-SESSION` | Geriatric rehabilitation home session / جلسة تأهيل منزلي لكبار السن | One home rehabilitation session | Full multidisciplinary/inpatient program, equipment | 900 | 1,200 | [S07] · 2026-10-17 | Medium | V105 geriatric rehabilitation. Provider's 2025 home-session range; not an in-clinic fee or dysphagia price. |
| `REHAB-NCS-EMG-ONE-SIDE` | Nerve conduction and EMG, one side / رسم أعصاب وعضلات لناحية واحدة | One-side electrophysiological study | Additional sides, home travel, repeat studies | 900 | 900 | [S08] · 2026-10-17 | Low | Explicit electrophysiology focus. Published 2026 average point price; archive metadata shows older article dates. |

## 3. Dr Hossam Kibba

Slug: `hossam-kibba` · fallback practitioner: `4d1a13ea-09b4-5a8f-ae20-0d99acf5a710` · care area: `orthopedics`.

V105: Orthopedics, Trauma and Joint Replacement; hip/knee replacement, lower extremity, foot/ankle and special trauma surgery.

| Service code | English name / Arabic name | Included boundary | Excluded boundary | Low EGP | High EGP | Source / access | Confidence | Rationale / evidence limitation |
|---|---|---|---|---:|---:|---|---|---|
| `ORTH-TOTAL-KNEE` | Total knee replacement / تغيير مفصل الركبة الكلي | One primary total knee operation | Partial/revision/bilateral/robotic replacement, extended rehabilitation | 150,000 | 260,000 | [S09] · 2026-10-17 | Medium | Exact V105 focus; use source's total-knee table, not mixed total/partial headline. Implant/team/hospital/anaesthesia included there. |
| `ORTH-HIP-REPLACEMENT` | Hip replacement / تغيير مفصل الفخذ | One hip replacement, type specified at quote | Revision/bilateral surgery; prolonged rehabilitation | 100,000 | 220,000 | [S10] · 2026-10-17 | Medium | Exact V105 focus. 2025 provider range includes diagnostics, clinician and hospital; implant specification needs confirmation. |
| `ORTH-BUNION-CORRECTION` | Bunion correction / تصحيح انحراف إبهام القدم | One-foot bunion correction | Bilateral surgery, complex combined reconstruction | 40,000 | 90,000 | [S11] · 2026-10-17 | Medium | Foot/ankle focus. Provider explicitly identifies 2026 Egyptian private-sector one-foot range. |
| `ORTH-ANKLE-ARTHROSCOPY` | Ankle arthroscopy / منظار الكاحل | One ankle arthroscopy | Major combined reconstruction, premium cartilage materials | 40,000 | 85,000 | [S11] · 2026-10-17 | Medium | Foot/ankle focus. Range spans simple debridement through more involved cartilage work. |
| `ORTH-ANKLE-FRACTURE-FIXATION` | Ankle fracture fixation / تثبيت كسور الكاحل | One ankle fracture fixation episode | Open-fracture reconstruction, unrelated fractures, later implant removal | 50,000 | 120,000 | [S11] · 2026-10-17 | Medium | Lower-extremity trauma focus. Implant origin and fracture pattern materially change the quote. |

## 4. Dr Hamdy AbdelAzeem AboElNeel AbdelHameed

Slug: `hamdy-abdelazeem` · fallback practitioner: `53e47359-242d-54d5-a8fc-35ade8fa5e7e` · care area: `vascular-endovascular-surgery`.

V105: Peripheral arterial angioplasty/bypass, aortic aneurysm repair including EVAR/TEVAR, venous/varicose treatment, hemodialysis access and venous interventions.

| Service code | English name / Arabic name | Included boundary | Excluded boundary | Low EGP | High EGP | Source / access | Confidence | Rationale / evidence limitation |
|---|---|---|---|---:|---:|---|---|---|
| `VASC-VARICOSE-EVLA-ONE-LEG` | Varicose-vein endovenous laser, one leg / علاج دوالي ساق واحدة بالليزر داخل الوريد | One-leg laser ablation | Other leg, additional foam/phlebectomy unless quoted | 15,000 | 35,000 | [S12] · 2026-10-17 | Medium | Explicit venous focus. One-leg paragraph supplies 15–35k; separate 2026 summary says 15–30k, so scope confirmation remains necessary. |
| `VASC-PERIPHERAL-ANGIOPLASTY` | Peripheral arterial angioplasty / توسيع الشرايين الطرفية بالقسطرة | Defined limb/lesion endovascular episode | Unspecified stents, multilevel work, bypass, wound care | OPEN | OPEN | [S13] (no price) · 2026-10-17 | Open | Explicit V105 focus. Provider explains determinants but no current EGP figure; coronary PCI is not a proxy. |
| `VASC-PERIPHERAL-BYPASS` | Peripheral arterial bypass / جراحة تحويل مسار الشرايين الطرفية | Defined arterial bypass and graft plan | Other limbs, diabetic-foot reconstruction, prolonged ICU | OPEN | OPEN | [S14] (rejected scope/currency) · 2026-10-17 | Open | Explicit V105 focus. Available grouped vascular estimates use USD and heterogeneous operations. |
| `VASC-AORTIC-ENDOVASCULAR-REPAIR` | Endovascular aortic aneurysm repair / إصلاح تمدد الشريان الأورطي بالقسطرة | Case-specific EVAR/TEVAR plan; site/device defined | Open repair, assuming abdominal and thoracic devices share a tariff | OPEN | OPEN | [S15] (no price) · 2026-10-17 | Open | Explicit EVAR/TEVAR focus. Clinic's 2025 cost article gives determinants but no numeric price. |
| `VASC-DIALYSIS-ACCESS` | Hemodialysis vascular-access creation / إنشاء وصلة وعائية للغسيل الكلوي | Defined primary access-creation episode | Dialysis sessions, access salvage, graft unless specified | OPEN | OPEN | [S14] (rejected grouping) · 2026-10-17 | Open | Explicit V105 focus. Basic fistula and complex prosthetic access cannot share an invented range. |

## 5. Dr Ahmed Magdy Mahmoud

Slug: `ahmed-magdy-mahmoud` · fallback practitioner: `6b92a5a3-8614-5a81-a2a0-30ce55f6a45e` · care area: `plastic-reconstructive-surgery`.

V105: Plastic, Reconstructive & Burns Surgery; aesthetic face/breast surgery, body contouring, burn reconstruction, hand/maxillofacial surgery.

| Service code | English name / Arabic name | Included boundary | Excluded boundary | Low EGP | High EGP | Source / access | Confidence | Rationale / evidence limitation |
|---|---|---|---|---:|---:|---|---|---|
| `PLAST-RHINOPLASTY` | Rhinoplasty / تجميل الأنف | Defined primary aesthetic nasal operation | Revision, major reconstruction, separate ENT work | 30,000 | 100,000 | [S16] · 2026-10-17 | Medium | Aesthetic facial focus. Provider's 2025 indicative range; package components not itemized. |
| `PLAST-LIPOSUCTION` | Liposuction and body contouring / شفط الدهون وتنسيق القوام | Specified anatomical areas and technique | Unspecified extra areas, skin excision, staged surgery | 25,000 | 80,000 | [S16] · 2026-10-17 | Medium | Direct body-contouring match. Source range varies by technique; area count must be defined before use. |
| `PLAST-BREAST-REDUCTION` | Breast reduction / تصغير الثدي | Defined breast-reduction operation | Augmentation implants, cancer treatment, reconstruction | 45,000 | 120,000 | [S16] · 2026-10-17 | Low | Breast aesthetic focus. Source groups augmentation and reduction; retain as provisional broad comparator only. |
| `PLAST-BURN-RECONSTRUCTION` | Burn reconstruction assessment and surgery / تقييم وجراحة ترميم الحروق | Defined scar/contracture reconstructive episode | Acute burn ICU, unspecified grafts/flaps, serial procedures | OPEN | OPEN | [S17] (quote on request) · 2026-10-17 | Open | Explicit V105 focus. No current procedure-specific Egyptian EGP reconstruction price established. |
| `PLAST-HAND-RECONSTRUCTION` | Reconstructive hand surgery / جراحة ترميم اليد | Defined reconstructive hand procedure | Unspecified tendon/nerve/bone work, multiple stages | OPEN | OPEN | [S17] (no matching price) · 2026-10-17 | Open | Explicit V105 hand focus. Ordinary scar-laser or consultation prices cannot price reconstructive surgery. |

## 6. Dr Amr Abdelazeem

Slug: `amr-abdelazeem` · fallback practitioner: `ec27545d-18fd-5d21-a0f0-c1879c085abd` · care area: `gastroenterology-hepatology`.

V105: Gastroenterology, Hepatology & Advanced Endoscopy; ERCP, EUS, liver disease and inflammatory bowel disease.

| Service code | English name / Arabic name | Included boundary | Excluded boundary | Low EGP | High EGP | Source / access | Confidence | Rationale / evidence limitation |
|---|---|---|---|---:|---:|---|---|---|
| `GI-DIAGNOSTIC-GASTROSCOPY` | Diagnostic upper GI endoscopy / منظار الجهاز الهضمي العلوي التشخيصي | One diagnostic upper-GI scope | Therapeutic work, pathology, pre-tests | 3,000 | 5,500 | [S18] · 2026-10-17 | Medium | Gastroenterology/endoscopy specialty. Source explicitly labels this private-sector diagnostic range. |
| `GI-COLONOSCOPY` | Colonoscopy / منظار القولون | One colonoscopy; diagnostic/therapeutic extent specified | Pathology and additional intervention unless priced | 3,000 | 10,000 | [S18] · 2026-10-17 | Medium | Endoscopic evaluation relevant to IBD focus. Range mixes diagnostic/therapeutic scope; no fixed biopsy/polypectomy bundle inferred. |
| `GI-EUS` | Endoscopic ultrasound / منظار الموجات فوق الصوتية | One EUS examination | Needle sampling, pathology, drainage unless quoted | 10,000 | 22,000 | [S18] · 2026-10-17 | Medium | Exact V105 focus. Source's 2026 EUS range; sampling/anaesthesia details require quote. |
| `GI-ERCP` | ERCP / منظار القنوات المرارية والبنكرياسية | Defined biliary/pancreatic endoscopic episode | Metal stents, complex stone therapy, prolonged admission | 18,000 | OPEN | [S19], [S20] · 2026-10-17 | Medium | Exact V105 focus. Latest provider page gives starting price only; plastic-stent offer is a different scope, not an upper bound. |
| `GI-LIVER-DISEASE-REVIEW` | Hepatology assessment / تقييم أمراض الكبد | One specialist review and management plan | FibroScan, imaging, labs, endoscopy, medication | OPEN | OPEN | [S18] (not a consultation tariff) · 2026-10-17 | Open | Explicit liver-disease focus. Endoscopy prices cannot be reused as a hepatology consultation price. |

## 7. Dr Ahmed Khaled

Slug: `ahmed-khaled` · fallback practitioner: `b6a82ee9-90c8-51c8-afe9-b0caf978fd78` · care area: `orthopedics`.

V105: Joint Replacement & Orthopedic Surgery; hip/knee replacement, robotic knee arthroplasty, shoulder reconstruction, sports injuries and trauma.

| Service code | English name / Arabic name | Included boundary | Excluded boundary | Low EGP | High EGP | Source / access | Confidence | Rationale / evidence limitation |
|---|---|---|---|---:|---:|---|---|---|
| `ORTH-TOTAL-KNEE` | Total knee replacement / تغيير مفصل الركبة الكلي | One primary total knee operation | Partial/revision/bilateral/robotic replacement, extended rehabilitation | 150,000 | 260,000 | [S09] · 2026-10-17 | Medium | Explicit V105 focus; same reusable service and benchmark as Kibba, not a Khaled-specific tariff. |
| `ORTH-HIP-REPLACEMENT` | Hip replacement / تغيير مفصل الفخذ | One hip replacement, type specified at quote | Revision/bilateral surgery; prolonged rehabilitation | 100,000 | 220,000 | [S10] · 2026-10-17 | Medium | Explicit V105 focus; same reusable benchmark as Kibba. |
| `ORTH-ROBOTIC-TOTAL-KNEE` | Robotic total knee replacement / تغيير مفصل الركبة الكلي بمساعدة الروبوت | One robotic primary knee procedure | Conventional replacement price assumption, bilateral/revision work | OPEN | OPEN | [S21] (no Egyptian EGP price) · 2026-10-17 | Open | Explicit V105 focus. No verified Egyptian 2025–2026 robot-specific EGP package; no arbitrary uplift added. |
| `ORTH-ROTATOR-CUFF-REPAIR` | Arthroscopic rotator-cuff repair / إصلاح أوتار الكفة المدورة بالمنظار | Defined shoulder tendon repair | Multiple/revision repairs, major bone reconstruction | 40,000 | 75,000 | [S22] · 2026-10-17 | Medium | Shoulder reconstruction focus. Use specific 2026 cuff-repair table rather than generic shoulder-arthroscopy range. |
| `ORTH-ACL-RECONSTRUCTION` | Arthroscopic ACL reconstruction / إعادة بناء الرباط الصليبي الأمامي بالمنظار | One ACL reconstruction | Revision, multiligament or added meniscal procedures | 40,000 | 80,000 | [S23] · 2026-10-17 | Medium | Sports-injury focus. Provider describes usual team/anaesthesia/hospital/fixation inclusions; case-specific confirmation needed. |

## 8. Dr Mostafa Farid

Slug: `mostafa-farid` · fallback practitioner: `16d603df-9d1b-56ae-a523-a0bfcc7c9431` · care area: `interventional-neuroradiology`.

V105: Brain aneurysm intervention, AVM embolization, stroke thrombectomy and venous sinus stenting.

| Service code | English name / Arabic name | Included boundary | Excluded boundary | Low EGP | High EGP | Source / access | Confidence | Rationale / evidence limitation |
|---|---|---|---|---:|---:|---|---|---|
| `NEURO-ANEURYSM-INTERVENTION` | Endovascular brain aneurysm treatment / علاج تمدد شرايين المخ بالقسطرة | Defined aneurysm/device strategy and episode | Unspecified coils/flow diverters, multiple aneurysms, prolonged ICU | OPEN | OPEN | [S24], [S25] (insufficient scope) · 2026-10-17 | Open | Exact V105 focus. Generic cerebral-catheter ranges do not identify aneurysm/device costs. |
| `NEURO-AVM-EMBOLIZATION` | Brain AVM embolization / غلق التشوه الشرياني الوريدي بالمخ بالقسطرة | One explicitly defined embolization stage | Later stages, surgery/radiosurgery, unspecified embolic materials | OPEN | OPEN | [S24], [S25] (insufficient scope) · 2026-10-17 | Open | Exact V105 focus. No current Egyptian private EGP stage-specific price established. |
| `NEURO-STROKE-THROMBECTOMY` | Mechanical stroke thrombectomy / سحب الجلطة المخية بالقسطرة | Emergency thrombectomy episode | Transport, thrombolytic medication, prolonged ICU/rehabilitation | OPEN | OPEN | [S24], [S25] (insufficient scope) · 2026-10-17 | Open | Exact V105 focus. Emergency care cannot inherit an elective generic catheter price. |
| `NEURO-VENOUS-SINUS-STENT` | Venous sinus stenting / تركيب دعامة بالجيوب الوريدية للمخ | Defined venous stent episode | Unspecified stent count, shunt surgery, prolonged follow-up | OPEN | OPEN | [S25] (no price) · 2026-10-17 | Open | Exact V105 focus. No verified current Egyptian private-sector EGP package found. |
| `NEURO-CEREBRAL-DSA` | Diagnostic cerebral angiography / القسطرة التشخيصية لشرايين المخ | One diagnostic catheter angiogram | Embolization, thrombectomy, coils/stents | OPEN | OPEN | [S24] (rejected mixed range) · 2026-10-17 | Open | Core interventional-neuroradiology diagnostic candidate. Published range mixes diagnostic and therapeutic cases; cannot isolate DSA bounds. |

## 9. Dr Mustafa Mohammed Abbas

Slug: `mustafa-mohammed-abbas` · fallback practitioner: `a0218907-8ab2-5b51-ad6e-38dad284b553` · care area: `womens-health`.

V105: Obstetrics, Gynecology & Maternal Health; maternal health, obstetric ultrasound, gynecological surgery and fertility care.

| Service code | English name / Arabic name | Included boundary | Excluded boundary | Low EGP | High EGP | Source / access | Confidence | Rationale / evidence limitation |
|---|---|---|---|---:|---:|---|---|---|
| `WH-ANTENATAL-ASSESSMENT` | Antenatal clinical assessment / تقييم ومتابعة الحمل | One antenatal consultation | Ultrasound, labs, delivery, whole-pregnancy package | OPEN | OPEN | [S26] (rejected combined offer) · 2026-10-17 | Open | Maternal-health focus. Live 500 EGP offer combines visit/scan; cannot isolate consultation-only price. |
| `WH-OBSTETRIC-ULTRASOUND` | Routine obstetric ultrasound / سونار الحمل الروتيني | One routine 2D pregnancy scan | 3D/4D, detailed anomaly/Doppler studies, consultation | 180 | 450 | [S27] · 2026-10-17 | Low | Exact V105 focus. Provider page is live but undated; do not treat as a confirmed 2026 tariff. |
| `WH-FERTILITY-ASSESSMENT` | Fertility assessment and plan / تقييم الخصوبة وخطة العلاج | One clinical fertility review | Labs, semen analysis, stimulation, IVF/ICSI | OPEN | OPEN | [S28] (package contents only) · 2026-10-17 | Open | Explicit fertility-care focus. Hospital publishes bundles but no public numeric fee; IVF competence not inferred from broad focus. |
| `WH-DIAG-HYSTEROSCOPY` | Diagnostic hysteroscopy / منظار الرحم التشخيصي | One diagnostic uterine-cavity examination | Operative resection, pathology, other fertility procedures | 8,000 | 12,000 | [S29] · 2026-10-17 | Medium | Gynecological-surgery/fertility focus. Specific 2026 diagnostic range, distinct from operative hysteroscopy. |
| `WH-OPERATIVE-HYSTEROSCOPY` | Operative hysteroscopy / منظار الرحم العلاجي | Defined intrauterine treatment in one episode | Complex/multiple lesions, laparoscopy, hysterectomy | 15,000 | 25,000 | [S29] · 2026-10-17 | Medium | Gynecological-surgery focus. Provider's operative range; complexity and facility change final fee. |

## 10. Prof Mohamed Hamdy Zaid

Slug: `mohamed-hamdy-zaid` · fallback practitioner: `49f3540c-4a4d-52df-a99b-321a02e8a0b4` · care area: `general-surgery`.

V105: General, Bariatric & Hepatobiliary Surgery; bariatric/metabolic, HPB/pancreas, breast/thyroid, laparoscopic/oncologic surgery.

| Service code | English name / Arabic name | Included boundary | Excluded boundary | Low EGP | High EGP | Source / access | Confidence | Rationale / evidence limitation |
|---|---|---|---|---:|---:|---|---|---|
| `GS-SLEEVE-GASTRECTOMY` | Laparoscopic sleeve gastrectomy / تكميم المعدة بالمنظار | One primary sleeve procedure | Revision/bypass, unplanned ICU, unspecified follow-up program | 75,000 | 150,000 | [S30] · 2026-10-17 | Medium | Bariatric focus. Uses explicit private mid/premium strata; excludes source's mixed public/small-private 55–75k economy band. |
| `GS-LAP-CHOLECYSTECTOMY` | Laparoscopic cholecystectomy / استئصال المرارة بالمنظار | One planned gallbladder removal | ERCP, bile-duct exploration, complications | 19,800 | 25,000 | [S31], [S32] · 2026-10-17 | Low | HPB/laparoscopic focus. Observed private listing/offer spread, not a representative market range; inclusions unclear. |
| `GS-THYROIDECTOMY` | Thyroidectomy / استئصال الغدة الدرقية | Defined routine thyroid resection extent | Neck-node dissection, redo/advanced oncology, medication | 17,000 | 22,000 | [S33] · 2026-10-17 | Medium | Exact thyroid-surgery focus. 2026 provider's routine-case range; total/partial extent must be specified. |
| `GS-BREAST-CONSERVING-SURGERY` | Breast-conserving cancer surgery / استئصال ورم الثدي مع الحفاظ على الثدي | Defined breast-conserving operation | Radiotherapy, systemic treatment, reconstruction unless quoted | 50,000 | OPEN | [S34] · 2026-10-17 | Low | Breast/oncologic focus. Private provider's live starting price; undated and no published upper bound. |
| `GS-HPB-SURGICAL-ASSESSMENT` | Hepatobiliary and pancreatic surgical assessment / تقييم جراحة الكبد والقنوات المرارية والبنكرياس | One surgical report review and plan | Major resection, imaging, biopsy, oncology treatment | OPEN | OPEN | [S15] (not a matching price) · 2026-10-17 | Open | Explicit V105 HPB/pancreatic focus. No current comparable assessment tariff established; major operation not assumed. |

## 11. Dr Mohammed Ali Ibrahim Hussien

Slug: `mohammed-ali` · fallback practitioner: `09f4b9df-bf44-5538-a972-b4d0ff02fad6` · care area: `orthopedics`.

V105: Spine & Orthopedic Surgery; spine surgery, complex spinal disorders, orthopedic trauma, spinal trauma/degeneration.

| Service code | English name / Arabic name | Included boundary | Excluded boundary | Low EGP | High EGP | Source / access | Confidence | Rationale / evidence limitation |
|---|---|---|---|---:|---:|---|---|---|
| `ORTH-LUMBAR-DISCECTOMY` | Lumbar discectomy / استئصال الغضروف القطني | Defined lumbar disc operation; technique specified | Fusion, revision/multilevel surgery, unspecified decompression | 30,000 | 80,000 | [S35] · 2026-10-17 | Low | Spine-degeneration focus. Live provider market range spans techniques; article-level date not established. |
| `ORTH-LIMITED-SPINAL-FUSION` | Limited spinal fixation/fusion / تثبيت ودمج محدود للفقرات | Source's limited one/two-vertebra category, anatomy defined | Multiple-level/complex/revision surgery, premium devices | 80,000 | 120,000 | [S36] · 2026-10-17 | Medium | Spine-surgery focus. 2026 provider category; vertebra count is not silently relabeled as disc-level count. |
| `ORTH-MULTILEVEL-SPINAL-FUSION` | Multilevel spinal fixation/fusion / تثبيت ودمج عدة فقرات | Defined intermediate-complexity multivertebral procedure | Severe deformity, major revision, extensive reconstruction | 120,000 | 180,000 | [S36] · 2026-10-17 | Medium | Complex-spine focus. Uses provider's intermediate category; very complex cases exceed this range. |
| `ORTH-SPINAL-DEFORMITY-SURGERY` | Complex spinal deformity surgery / جراحة تشوهات العمود الفقري المعقدة | Patient-specific deformity correction plan | Generic fusion pricing, unspecified implant/osteotomy stages | OPEN | OPEN | [S36] (insufficient procedure detail) · 2026-10-17 | Open | Explicit complex-spinal-disorder focus. General statement of costs over 250k is not a specific deformity quote. |
| `ORTH-SPINAL-TRAUMA-SURGERY` | Spinal trauma stabilization / تثبيت إصابات العمود الفقري | Defined traumatic injury and stabilization episode | Polytrauma care, unrelated fractures, prolonged ICU | OPEN | OPEN | [S36] (insufficient trauma scope) · 2026-10-17 | Open | Explicit spinal-trauma focus. Elective fusion range does not establish emergency trauma package cost. |

## 12. Dr Mostafa Baraka

Slug: `mostafa-baraka` · fallback practitioner: `fa83e1ac-19a8-5834-a13e-565ee6115a27` · care area: `orthopedics`.

V105: Pediatric Orthopedics & Limb Reconstruction; pediatric orthopedics, limb lengthening/reconstruction, hip preservation, cerebral-palsy orthopedics.

| Service code | English name / Arabic name | Included boundary | Excluded boundary | Low EGP | High EGP | Source / access | Confidence | Rationale / evidence limitation |
|---|---|---|---|---:|---:|---|---|---|
| `ORTH-PEDIATRIC-ASSESSMENT` | Pediatric orthopedic assessment / تقييم عظام الأطفال | One pediatric orthopedic consultation | Imaging, casts, surgery, therapy sessions | 400 | 400 | [S37] · 2026-10-17 | Low | Exact specialty. Live Mostafa Baraka listing point fee, undated; older alternative directory price not blended. |
| `ORTH-LIMB-LENGTHENING` | Limb lengthening / إطالة الأطراف | Defined limb/bone, technique, device and treatment phase | Cosmetic bilateral package assumption, device removal, lengthy rehab | OPEN | OPEN | [S38], [S39] (foreign currency) · 2026-10-17 | Open | Exact V105 focus. Egyptian provider uses EUR; tourism site uses USD with inconsistent rendered fields; no EGP conversion invented. |
| `ORTH-LIMB-RECONSTRUCTION` | Limb deformity reconstruction / إعادة بناء الأطراف وتصحيح التشوهات | Defined deformity-correction episode | Multiple limbs/stages, lengthening device unless specified | OPEN | OPEN | [S40] (quote required) · 2026-10-17 | Open | Exact V105 reconstruction focus. Technique/device selection prevents a single unqualified benchmark. |
| `ORTH-HIP-PRESERVATION` | Pediatric hip-preservation surgery / جراحة الحفاظ على مفصل الورك للأطفال | Defined hip-preserving procedure | Hip replacement, unspecified bilateral or staged surgery | OPEN | OPEN | [S41] (service only) · 2026-10-17 | Open | Exact V105 focus. No reliable current Egyptian EGP procedure tariff established; adult replacement is not a proxy. |
| `ORTH-CP-ORTHOPEDIC-SURGERY` | Cerebral-palsy orthopedic surgery / جراحة العظام لحالات الشلل الدماغي | Defined orthopedic soft-tissue/bone procedure | Neurological surgery, indefinite rehab, unspecified multilevel program | OPEN | OPEN | [S42] (quote on request) · 2026-10-17 | Open | Exact V105 focus. General cerebral-palsy treatment directories do not price the orthopedic operation. |

## 13. Dr Mahmoud Mohamed Ghaleb

Slug: `mahmoud-ghaleb` · fallback practitioner: `0a21e201-0bea-5f86-a519-50ddfd7971a9` · care area: `womens-health`.

V105: Obstetrics, Gynecology & Pelvic Surgery; high-risk obstetric surgery, placenta accreta spectrum, gynecological endoscopy, pelvic floor/oncologic surgery.

| Service code | English name / Arabic name | Included boundary | Excluded boundary | Low EGP | High EGP | Source / access | Confidence | Rationale / evidence limitation |
|---|---|---|---|---:|---:|---|---|---|
| `WH-HIGH-RISK-OBSTETRIC-SURGERY` | High-risk obstetric surgery / جراحة التوليد عالي الخطورة | Defined maternal surgical episode and care plan | Routine-delivery tariff assumption, neonatal ICU, blood/critical care unless quoted | OPEN | OPEN | [S43] (rejected routine scope) · 2026-10-17 | Open | Exact V105 focus. Routine cesarean offer cannot establish high-risk obstetric cost. |
| `WH-PLACENTA-ACCRETA-SURGERY` | Placenta accreta spectrum surgery / جراحة المشيمة الملتصقة | Defined multidisciplinary placenta-accreta surgical episode | Unspecified hysterectomy, urological work, blood products/ICU | OPEN | OPEN | [S44] (rejected age), [S45] (unverified upload) · 2026-10-17 | Open | Exact V105 focus. Old quoted costs and third-party hospital-package uploads are insufficient for a current private EGP range. |
| `WH-OPERATIVE-HYSTEROSCOPY` | Operative hysteroscopy / منظار الرحم العلاجي | Defined intrauterine treatment in one episode | Complex/multiple lesions, laparoscopy, hysterectomy | 15,000 | 25,000 | [S29] · 2026-10-17 | Medium | Gynecological-endoscopy focus. Same reusable service/benchmark as Abbas. |
| `WH-PELVIC-PROLAPSE-REPAIR` | Pelvic organ prolapse repair / إصلاح هبوط أعضاء الحوض | Defined pelvic-floor repair and surgical route | Unspecified mesh, continence surgery, additional compartments | OPEN | OPEN | [S46] (quote on request) · 2026-10-17 | Open | Pelvic-floor focus. Egypt entry explicitly requests a quote; foreign-country tables are not Egypt prices. |
| `WH-GYNECOLOGIC-ONCOLOGY-SURGERY` | Gynecologic oncology surgery / جراحة أورام النساء | Defined oncologic operation/staging plan | Routine benign hysterectomy proxy, chemo/radiotherapy, advanced cytoreduction | OPEN | OPEN | [S47] (rejected benign/unspecified scope) · 2026-10-17 | Open | Explicit oncologic focus. Generic laparoscopic hysterectomy offer cannot price cancer surgery. |

## Source register and price extraction notes

All sources were accessed **2026-10-17**. These notes identify what was actually evidenced, including limitations. A URL's year is not independent proof of a tariff's validity.

| ID | Publisher / evidence | Date/scope and extracted price evidence |
|---|---|---|
| [S01] | CliniDo, coronary catheter-surgery offers | Live private clinic listings: Tarek El Khouly angiography 15,000; Bahreya Osman 21,250 promotional price against 25,000, valid through 2026-11-01. Separate consultation 400/700. |
| [S02] | Dr Mohamed Fouad, PCI cost | Updated 2025-09-30. PCI/stent indicative range 70,000–85,000; scope changes with stent number/type and setting. Not a complex-PCI tariff. |
| [S03] | CliniDo, cardiothoracic procedure offers | Bahreya Osman single drug-eluting coronary stent offer 81,000 versus 90,000, through 2026-11-01. Other device procedures have exclusions; not adopted as structural-assessment prices. |
| [S04] | Cardiofit / Dr Amr Emam, pacemaker costs | 2025 heading. Page states device cost 300,000–350,000 and elsewhere implantation 90,000–120,000. Device class and inclusions do not reconcile; no value adopted. |
| [S05] | Vezeeta, Hanan Elshoura profile | Live consultation listing: 886; membership rate 615 not adopted. Name/specialty match, but availability and current fee need confirmation. |
| [S06] | Al Manara rehabilitation center, Egypt | Provider describes swallowing/speech unit. No public EGP price established; supports search coverage only. |
| [S07] | Dr Yasser Reda, home physical-therapy fees | Dated 2025-10-29. Geriatric home session 900–1,200. This is one home session, not an inpatient or swallowing program. |
| [S08] | Dr Moamen Nada, NCS/EMG article | Text labels a 2026 survey: one-side hospital/radiology-center test averages 900; home test is separate. Archive metadata carries 2022/2023 dates; confidence lowered. |
| [S09] | Dr Ziad Khaled, knee replacement 2026 | Detailed table: total 150,000–260,000; partial 110,000–180,000. Headline's 130,000–260,000 is mixed. Source describes implant, surgical team, anaesthesia and hospital; tests/long-term rehab may be extra. |
| [S10] | Dr Yasser Reda, hip replacement | Dated 2025-07-02. Egypt range 100,000–220,000 includes diagnosis/tests, clinician, hospital. Source does not clearly itemize implant type or revision status. |
| [S11] | Bone Art / Dr Ahmed Ekram, foot/ankle surgery | Dated 2026-08-20; explicitly Egyptian private sector. Typical bundle covers team, anaesthesia, theatre, standard fixation, planned stay; tests, premium imported fixation, boots, therapy and later removal may be extra. |
| [S12] | Dr Khaled Tarek, laser varicose surgery | 2026 content: one-leg range 15,000–35,000, while another summary says 15,000–30,000. One-leg scope retained; ancillary services not itemized. |
| [S13] | Dr Hussein Elwan, peripheral artery opening | Provider explains intervention and cost factors; original page is older and no numeric current tariff established. No price adopted. |
| [S14] | Pharmatop, vascular procedures | Grouped estimates, partly USD, covering diverse operations and surgeon/material components. No procedure-specific current EGP package adopted. |
| [S15] | Dr Hossam Elmahdy, aortic surgery cost | 2025 heading; provider describes hospital, imaging, catheter/device and anaesthesia determinants without a number. No aortic or unrelated assessment price inferred. |
| [S16] | Dr Yasser Badi, cosmetic-surgery 2025 guide | Published market ranges for rhinoplasty, liposuction and combined breast augmentation/reduction category. Not itemized quotes and not Ahmed Magdy's own fees. |
| [S17] | Macrocare, Prof Fouad Ghareeb profile | Egyptian reconstructive/burn service context, price confirmed on request. No burn- or hand-operation tariff established. |
| [S18] | Dr Mahmoud Farouk, endoscopy prices 2026 | Updated August 2026; private gastroscopy 3,000–5,500; colonoscopy 3,000–10,000; EUS 10,000–22,000. Generally described basic sedation/device/consultation/follow-up, tests/pathology and added treatment extra. These are approximate market ranges. |
| [S19] | Dr Khaled El Sherif, ERCP | Explicit price update 2026-08-09: starts around 18,000. No upper limit; complex stones, dilation, metal stents/admission add cost. |
| [S20] | Vezeeta, Mohamed Dewidar ERCP offer | Live one ERCP with plastic stent: list 22,000, offer 17,600. No appointments shown; no dated validity. Different scope from S19 and not a general ERCP ceiling. |
| [S21] | MediGence, robotic knee arthroplasty | Updated 2026-06-12. General technology/cost context, no verified Egypt-specific EGP package adopted. |
| [S22] | Dr Amr Nagy, shoulder arthroscopy | 2026 table differentiates rotator cuff repair 40,000–75,000 from other shoulder operations. Generic overall range is not used for this specific row. Anchors/materials change fee. |
| [S23] | JointCure / Dr Mohamed Labib, ACL 2026 | 40,000–80,000 indicative. Usual quoted components described: team, anaesthesia, theatre/stay, fixation materials and intraoperative medicines; associated injuries increase cost. |
| [S24] | Dr Ahmed Sameh Nada, cerebral catheter cost | 2026 heading, broad 10,000–100,000 mixing diagnostic/therapeutic indications. Not adopted for any specific neurovascular procedure. |
| [S25] | Dr Ahmed El Ghoul, therapeutic cerebral catheter | Explains aneurysm/AVM/stroke uses and cost determinants. No price sufficiently specific to the five neuro candidates established. |
| [S26] | Vezeeta, antenatal/TVUS offer | Live combined consultation/scan/follow-up listing shows 500; consultation-only component cannot be isolated. No number adopted. |
| [S27] | Farah Fertility, obstetric ultrasound costs | Live undated provider article: routine pregnancy ultrasound 180–450; advanced 3D/4D pricing is a separate category. Low-confidence comparator only. |
| [S28] | Bedaya Hospital treatment plans | Official private hospital lists fertility assessment/ICSI package contents without a visible numeric tariff. No cost or individual Consultant IVF qualification inferred. |
| [S29] | Dr Ayman Nagm / IVF Egypt, hysteroscopy 2026 | Diagnostic 8,000–12,000; operative 15,000–25,000. Provider calls these approximate 2026 Egypt market values; final fee depends on tests, complexity and hospital. |
| [S30] | Dr Mahmoud Zakaria, sleeve costs 2026 | Dated 2026-07-05. Private mid-tier 75,000–110,000; premium 110,000–150,000. Economy combines public and small-private hospitals, so excluded. No implant/device brand inferred. |
| [S31] | CliniDo, Youssef Medhat Ali cholecystectomy | Live 22,000 list / 19,800 promotional operation price, valid through 2026-10-31. Separate consultation 600; bundle details not itemized. |
| [S32] | Vezeeta, laparoscopic cholecystectomy offer | Live offer lists 25,000; no validity date established. Used with S31 as an observed private offer spread, not a population estimate. |
| [S33] | Dr Ahmed Yousry Awad, thyroidectomy 2026 | Routine cases 17,000–22,000. Extent, gland size, disease, lymph-node work and tests change total. No precise total/partial tariff inferred. |
| [S34] | Dr Mostafa Sedky, breast cancer surgery | Official private clinic live page: breast-conserving surgery from 50,000; mastectomy from 65,000. Written quote depends on hospital, anaesthesia, pathology, devices and stay. Undated; no ceiling. |
| [S35] | Dr Hussein Zakaria, spine-cost article via provider blog | Live article summary: lumbar disc surgery 30,000–80,000, techniques vary. Lower confidence because specific article date and bundle are not established. |
| [S36] | Dr Ibrahim Abdel Mohsen, spinal fixation 2026 | Limited one/two vertebrae 80,000–120,000; intermediate multivertebral 120,000–180,000; very complex cases can exceed 250,000. No trauma/deformity-specific range inferred. |
| [S37] | CliniDo, Mostafa Baraka | Live pediatric orthopedic consultation fee 400. No publication date, appointments unavailable during displayed month. Point price only. |
| [S38] | CICLLR / Prof Yasser Elbatrawy, LON | Egyptian private provider publishes one-bone LON price in EUR, not EGP. Not converted and not equated to pediatric reconstruction. |
| [S39] | MediGence, limb lengthening Egypt | Foreign-currency tourism estimate; rendered sections also contain placeholder/zero values. Insufficiently coherent EGP evidence; not adopted. |
| [S40] | CICLLR FAQs | Provider explicitly requires case/device/hospital selection before precise price. Supports open status, not an amount. |
| [S41] | Dr Mostafa Baraka official site | Lists pediatric orthopedics, lengthening and hip-related services. No numeric price adopted; V105 remains source of candidate selection. |
| [S42] | Vaidam, cerebral-palsy treatment Egypt | Egypt treatment listing requests a quotation and mixes specialties. No orthopedic operation-specific EGP price. |
| [S43] | Vezeeta, El Gezira Hospital routine cesarean offer | Lists routine cesarean 10,000; high-risk and placenta-accreta scope not established. Rejected as proxy. |
| [S44] | Al Ahram Al Arabi, cesarean complications | Approximately 2017 reporting quotes accreta costs. Too old for 2025–2026 benchmark, public tertiary-care context; rejected. |
| [S45] | Scribd, purported Al Nada Hospital 2026 package | User-uploaded package document; official origin/full inclusions unverified. Do not copy a hospital facility fee as total Consultant/surgery cost. |
| [S46] | Bookimed, uterine prolapse Egypt | Updated 2026-10-10; Egypt price explicitly on request. Neighboring Turkey/Spain figures rejected for Egypt. |
| [S47] | Vezeeta, Ahmed Arafat laparoscopic hysterectomy | Live generic hysterectomy 60,000; indication and oncologic staging not established. Rejected as cancer-surgery price. |

## Open evidence and follow-up

The research deliberately retains unpriced candidates. Highest-priority provider quotations are neurovascular interventions, pediatric reconstruction/hip preservation/CP surgery, high-risk obstetrics and accreta, pelvic-floor/oncologic operations, aortic/peripheral arterial procedures and dialysis access. Request the precise procedure, unit/laterality/stage, device/implant type/count, surgeon/anaesthesia/hospital components, planned stay, tests/pathology, follow-up and quote validity date. This closes the actual evidence gaps rather than manufacturing a plausible-looking range.

Search coverage included Arabic/English procedure names combined with Egypt/Cairo, 2025/2026, price/cost/EGP/جنيه, and targeted private-clinic, hospital, Vezeeta, CliniDo, MediGence, Vaidam and Bookimed results. Public-sector fee schedules, professional-syndicate reimbursement tables, insurance copayments, stale news, forums/Reddit, and other countries' prices were not used as Egyptian private-sector prices. The availability of a source on the access date does not make a 2026 price independently verified.

Before any numeric value becomes an active catalogue price, resolve the scope limitations above and preserve whether the evidence is a range, starting price or point listing. `OPEN` is missing evidence, never zero and never a guessed midpoint.

[S01]: https://clinido.com/ar/operation/search/جراحات-القلب-و-الصدر/جراحة-القسطرة-القلبية/كل-المناطق/كل-المناطق
[S02]: https://dr-fouad.com/2024/07/تكلفة-عملية-القسطرة-وتركيب-دعامة/
[S03]: https://clinido.com/ar/operation/search/Cardiothoracic-Surgery/All-services-/all-cities/all-areas?page=1
[S04]: https://cardiofitclinic.com/اسعار-جهاز-تنظيم-ضربات-القلب-فى-مصر/
[S05]: https://www.vezeeta.com/ar/dr/دكتورة-حنان-الشورى-روماتيزم
[S06]: https://almanara-eg.com/
[S07]: https://dryasserreda.com/price-of-a-physical-therapy-session/
[S08]: https://drmoamenada.com/مدونة/
[S09]: https://drziadkhaled.com/blog/knee-replacement-surgery-price
[S10]: https://dryasserreda.com/pelvic-joint-replacement-2/
[S11]: https://www.boneartclinic.com/ar/blog/foot-ankle-surgery-cost-egypt-2026
[S12]: https://drkhaledtarek.com/تكلفة-عملية-الدوالي-بالليزر-في-مصر/
[S13]: https://drhusseinelwan.com/تكلفة-عملية-تسليك-شرايين-القدم/
[S14]: https://www.pharmatop1.com/vascular-sergical-procedure/
[S15]: https://elmahdyclinic.com/blog/تكلفة-عملية-الشريان-الأورطي-2023/
[S16]: https://dryasserbadi.net/د-ياسر-بادى-أفضل-دكتور-تجميل/
[S17]: https://macro.care/ar/partners/dr-fouad-mohamed-ghareeb
[S18]: https://mahmoudfarouk.com/اسعار-مناظير-الجهاز-الهضمى/
[S19]: https://drkhaledelsherif.com/تكلفة-منظار-القنوات-المرارية/
[S20]: https://www.vezeeta.com/en/bundleprofile/PBpi4BOL2ziUOdxUocd4wZsQ
[S21]: https://medigence.com/ar/blog/robotic-total-knee-replacement-what-patients-should-know-before-surgery/
[S22]: https://dramrnagy.com/عملية-منظار-الكتف/
[S23]: https://jointcure.net/تكلفة-عملية-الرباط-الصليبي-في-مصر.html
[S24]: https://drahmednada.com/تكلفة-عملية-قسطرة-المخ/
[S25]: https://drahmedelghoulclinic.com/قسطرة-المخ-العلاجية/
[S26]: https://www.vezeeta.com/ar/bundleprofile/PBN6pM1F0XUuScEJb4HTgEg
[S27]: https://www.farahfertility.com/ar/blog/سعر-سونار-ثلاثي-الابعاد
[S28]: https://www.bedayahospitals.com/bedaya-offers
[S29]: https://ivfeg.net/تكلفة-المنظار-الرحمي-في-مصر/
[S30]: https://drsemna.com/مقالات/سعر-تكميم-المعدة-مصر-2026-دليل-التكاليف/
[S31]: https://www.clinido.com/ar/services/profile/40378/3309
[S32]: https://www.vezeeta.com/ar/bundleprofile/PB1mrsIZzzp0GxwxwlG5GfYg
[S33]: https://drahmed-yousry.com/سعر-عملية-استئصال-الغدة-الدرقية/
[S34]: https://www.drmostafasedky.com/services/breast-cancer-surgery
[S35]: https://drhusseinzakaria.com/المدونة/
[S36]: https://spine-neurosurgery.com/سعر-عملية-تثبيت-الفقرات/
[S37]: https://clinido.com/en/drprofile/400891/16318
[S38]: https://cicllr.com/ar/lon/
[S39]: https://medigence.com/ar/hospitals/orthopedics/limb-lengthening-shortening/egypt
[S40]: https://cicllr.com/ar/faqs/
[S41]: https://drmostafabaraka.com/en
[S42]: https://www.vaidam.com/ar/search/cerebral-palsy/egypt
[S43]: https://www.vezeeta.com/ar/bundleprofile/PBwjpzW8LtEU24SsbfXu8XHw
[S44]: https://arabi.ahram.org.eg/News/99311.aspx
[S45]: https://www.scribd.com/document/1046761632/باكيدج-الولادات-2026-1-1
[S46]: https://ar.bookimed.com/clinics/country%3Degypt/illness%3Duterine-prolapse/
[S47]: https://www.vezeeta.com/ar/bundleprofile/PBuxrxDCrO0WdHqIPrMEGNg
