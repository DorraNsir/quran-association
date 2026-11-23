-- «متابعة العرضات» — chronology audit (READ ONLY: one SELECT, changes nothing).
--
-- Lists every pair of numbered whole-surah recitations of the same student and surah whose numbers
-- contradict their sessions' actual date and start time: a LOWER number that does not take place
-- strictly BEFORE a higher one. Entries sharing a number (a postponed recitation and its
-- rescheduled continuation) are never compared with each other.
--
-- Run it read-only, e.g.:
--   PGOPTIONS='-c default_transaction_read_only=on' psql "$DATABASE_URL" -f scripts/audit-recitation-order.sql
-- No row = a consistent history. Nothing is renumbered or reordered automatically: each pair is for
-- a person to review.
WITH numbered AS (
  SELECT
    wi.id                         AS item_id,
    wp.id                         AS program_id,
    wp."studentId"                AS student_id,
    wi."quranFromSurah"           AS surah,
    wi."recitationNumber"         AS number,
    wi.status::text               AS status,
    (s.date + s."startTime")      AS starts_at
  FROM work_items wi
  JOIN work_programs wp ON wp.id = wi."workProgramId"
  JOIN sessions s ON s.id = wp."sessionId"
  WHERE wi.type = 'RECITATION'
    AND wi."quranAssignmentKind" = 'SURAH_RANGE'
    AND wi."quranFromSurah" IS NOT NULL
    AND wi."recitationNumber" IS NOT NULL
)
SELECT
  p."firstName" || ' ' || p."lastName"         AS student,
  lo.student_id,
  lo.surah,
  lo.number                                    AS lower_number,
  to_char(lo.starts_at, 'YYYY-MM-DD HH24:MI')  AS lower_starts_at,
  lo.status                                    AS lower_status,
  hi.number                                    AS higher_number,
  to_char(hi.starts_at, 'YYYY-MM-DD HH24:MI')  AS higher_starts_at,
  hi.status                                    AS higher_status,
  lo.item_id                                   AS lower_item_id,
  hi.item_id                                   AS higher_item_id,
  lo.program_id                                AS lower_program_id,
  hi.program_id                                AS higher_program_id
FROM numbered lo
JOIN numbered hi
  ON hi.student_id = lo.student_id
 AND hi.surah = lo.surah
 AND hi.number > lo.number
 AND hi.starts_at <= lo.starts_at
JOIN students st ON st.id = lo.student_id
JOIN persons p ON p.id = st."personId"
ORDER BY student, lo.surah, lo.number, hi.number;
