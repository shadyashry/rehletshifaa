-- Work items carry their wording as a code plus parameters (docs/ux-redesign/STATUS.md pass 3), so the portal words
-- them in the reader's language from its message files. The English title and description stay for e-mail, audit and
-- any client that does not know the code. Parameters can hold names and patient comments, so they are encrypted like
-- the title (an "enc:" JSON object of strings).

ALTER TABLE case_tasks ADD COLUMN copy_code VARCHAR(80);
ALTER TABLE case_tasks ADD COLUMN copy_params TEXT;
