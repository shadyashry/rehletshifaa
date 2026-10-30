-- Review 2026-10-30 (truthful trust claims): sourcing notes such as "(CV-reported)", "as listed in the CV" or
-- «وفق السيرة الذاتية» belong on a profile's sources line ("verification"), not in the role, distinction, achievements,
-- appointments or standing a patient reads as fact. Each profile's sources line already says it was prepared from the
-- Consultant's CV and is subject to credential review, so nothing is lost. A standing entry that was only a sourcing
-- note is removed; the profile hides an empty standing list. The order of the replacements matters: the longer
-- phrasing with its comma goes first. Rows that change get a new version, so an editor holding the old text in the
-- Control Center sees a conflict instead of writing it back.

UPDATE consultant_directory_profiles
   SET content_en = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(content_en,
           ' (CV-reported)', ''),
           '"CV-listed research in ', '"Research in '),
           '"professionalStanding":["Clinical and academic appointments reported in the December 2025 CV"]', '"professionalStanding":[]'),
           ', as listed in the CV, ', ', '),
           ', as listed in the CV"', '"'),
           ', listed in the CV"', '"'),
       version = version + 1, updated_at = CURRENT_TIMESTAMP
 WHERE content_en LIKE '% (CV-reported)%' OR content_en LIKE '%"CV-listed research in %'
    OR content_en LIKE '%reported in the December 2025 CV"]%' OR content_en LIKE '%listed in the CV%';

UPDATE consultant_directory_profiles
   SET content_ar = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(content_ar,
           '، وفق سيرة 2024"', '"'),
           '"professionalStanding":["المناصب السريرية والأكاديمية بحسب السيرة الذاتية المؤرخة في ديسمبر 2025"]', '"professionalStanding":[]'),
           ' وفق السيرة الذاتية، ', '، '),
           '، وفق السيرة الذاتية"', '"'),
           ' وفق السيرة الذاتية"', '"'),
       version = version + 1, updated_at = CURRENT_TIMESTAMP
 WHERE content_ar LIKE '%وفق سيرة 2024"%' OR content_ar LIKE '%بحسب السيرة الذاتية المؤرخة%' OR content_ar LIKE '%وفق السيرة الذاتية%';
