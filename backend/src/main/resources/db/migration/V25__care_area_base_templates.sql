ALTER TABLE service_templates ADD COLUMN reference_standard VARCHAR(300);
ALTER TABLE service_templates ADD COLUMN guidance_note VARCHAR(1000);
ALTER TABLE service_template_items ADD COLUMN active BOOLEAN NOT NULL DEFAULT TRUE;

UPDATE service_templates SET reference_standard='WHO ICHI structure; specialty society guidance must be locally validated', guidance_note='Reference service catalogue only. It does not prescribe care. A credentialed consultant selects clinically appropriate services and Finance validates local prices.' WHERE care_category='cardiology';

INSERT INTO service_templates(id,care_category,name,reference_standard,guidance_note) VALUES
('a1000000-0000-0000-0000-000000000002','rheumatology-rehabilitation','Rehabilitation, rheumatology and dysphagia base services','WHO Package of Interventions for Rehabilitation; WHO ICF/ICHI','Reference service catalogue only. Individual assessment determines appropriate interventions, frequency and duration.'),
('a1000000-0000-0000-0000-000000000003','orthopedics','Orthopedics base services','WHO ICHI structure; applicable orthopedic society guidance','Reference service catalogue only. It is not a diagnosis or surgical recommendation; local clinical and financial validation is mandatory.');

INSERT INTO service_template_items(id,template_id,service_code,service_name,category,suggested_price_egp,sort_order) VALUES
('a1000000-0000-0000-0000-000000000201','a1000000-0000-0000-0000-000000000002','REHAB-MED-ASSESS','Physical and rehabilitation medicine assessment','Assessment',NULL,1),
('a1000000-0000-0000-0000-000000000202','a1000000-0000-0000-0000-000000000002','REHAB-FUNCTION','Standardized functional assessment','Assessment',NULL,2),
('a1000000-0000-0000-0000-000000000203','a1000000-0000-0000-0000-000000000002','DYSPH-ASSESS','Clinical swallowing assessment','Dysphagia assessment',NULL,3),
('a1000000-0000-0000-0000-000000000204','a1000000-0000-0000-0000-000000000002','DYSPH-VFSS','Videofluoroscopic swallowing study','Dysphagia diagnostics',NULL,4),
('a1000000-0000-0000-0000-000000000205','a1000000-0000-0000-0000-000000000002','DYSPH-FEES','Fiberoptic endoscopic evaluation of swallowing','Dysphagia diagnostics',NULL,5),
('a1000000-0000-0000-0000-000000000206','a1000000-0000-0000-0000-000000000002','DYSPH-THERAPY','Individual swallowing therapy session','Rehabilitation',NULL,6),
('a1000000-0000-0000-0000-000000000207','a1000000-0000-0000-0000-000000000002','REHAB-PT','Individual physiotherapy session','Rehabilitation',NULL,7),
('a1000000-0000-0000-0000-000000000208','a1000000-0000-0000-0000-000000000002','REHAB-OT','Individual occupational therapy session','Rehabilitation',NULL,8),
('a1000000-0000-0000-0000-000000000209','a1000000-0000-0000-0000-000000000002','REHAB-HOME','Home programme education and caregiver training','Education',NULL,9),
('a1000000-0000-0000-0000-000000000210','a1000000-0000-0000-0000-000000000002','REHAB-FOLLOWUP','Rehabilitation follow-up review','Follow-up',NULL,10),
('a1000000-0000-0000-0000-000000000301','a1000000-0000-0000-0000-000000000003','ORTHO-CONSULT','Orthopedic consultant assessment','Assessment',NULL,1),
('a1000000-0000-0000-0000-000000000302','a1000000-0000-0000-0000-000000000003','ORTHO-IMAGING-REVIEW','Musculoskeletal imaging review','Diagnostics',NULL,2),
('a1000000-0000-0000-0000-000000000303','a1000000-0000-0000-0000-000000000003','ORTHO-PREOP','Pre-operative clinical assessment','Assessment',NULL,3),
('a1000000-0000-0000-0000-000000000304','a1000000-0000-0000-0000-000000000003','ORTHO-ARTHROSCOPY','Arthroscopic procedure package','Procedure',NULL,4),
('a1000000-0000-0000-0000-000000000305','a1000000-0000-0000-0000-000000000003','ORTHO-JOINT-REPLACE','Joint replacement procedure package','Procedure',NULL,5),
('a1000000-0000-0000-0000-000000000306','a1000000-0000-0000-0000-000000000003','ORTHO-SPINE','Spine procedure package','Procedure',NULL,6),
('a1000000-0000-0000-0000-000000000307','a1000000-0000-0000-0000-000000000003','ORTHO-TRAUMA','Orthopedic trauma procedure package','Procedure',NULL,7),
('a1000000-0000-0000-0000-000000000308','a1000000-0000-0000-0000-000000000003','ORTHO-INPATIENT','Standard inpatient day','Inpatient',NULL,8),
('a1000000-0000-0000-0000-000000000309','a1000000-0000-0000-0000-000000000003','ORTHO-REHAB','Post-treatment rehabilitation session','Rehabilitation',NULL,9),
('a1000000-0000-0000-0000-000000000310','a1000000-0000-0000-0000-000000000003','ORTHO-FOLLOWUP','Post-treatment orthopedic follow-up','Follow-up',NULL,10);

