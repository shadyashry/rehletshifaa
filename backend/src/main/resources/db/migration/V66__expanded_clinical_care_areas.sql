-- Reference categories for the expanded public clinical directory and case intake.
-- Public CV profiles do not create practitioner identities, credentials or assignments.
INSERT INTO care_categories(slug, name_en, name_ar, sort_order) VALUES
('gastroenterology-hepatology', 'Digestive & Liver Care', 'الجهاز الهضمي والكبد', 40),
('interventional-neuroradiology', 'Interventional Neuroradiology', 'الأشعة العصبية التداخلية', 50),
('womens-health', 'Women''s Health', 'صحة المرأة', 60),
('general-surgery', 'General & Metabolic Surgery', 'الجراحة العامة وجراحات السمنة', 70),
('plastic-reconstructive-surgery', 'Plastic & Reconstructive Surgery', 'جراحة التجميل والترميم', 80);
