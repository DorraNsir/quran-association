-- «متابعة العرضات» — chronology audit (READ ONLY: one SELECT, changes nothing).
--
-- Numbers follow the chronology: a PERFORMED recitation (منجز، جزئي، غير منجز، ملغى) keeps its
-- number for good; every other number (planned, awaiting evaluation, postponed) is provisional and
-- recalculated by the server at each change. So only performed numbers can be inconsistent: this
-- lists every pair of performed recitations of the same student and surah where the LATER one
-- (by the session's actual date and start time) does not have a HIGHER number.
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
    AND wi.status IN ('COMPLETED', 'PARTIAL', 'NOT_COMPLETED', 'CANCELLED')
    AND wi."quranAssignmentKind" = 'SURAH_RANGE'
    AND wi."quranFromSurah" IS NOT NULL
    AND wi."recitationNumber" IS NOT NULL
)
SELECT
  p."firstName" || ' ' || p."lastName"         AS student,
  lo.student_id,
  lo.surah,
  lo.number                                    AS earlier_number,
  to_char(lo.starts_at, 'YYYY-MM-DD HH24:MI')  AS earlier_starts_at,
  lo.status                                    AS earlier_status,
  hi.number                                    AS later_number,
  to_char(hi.starts_at, 'YYYY-MM-DD HH24:MI')  AS later_starts_at,
  hi.status                                    AS later_status,
  lo.item_id                                   AS earlier_item_id,
  hi.item_id                                   AS later_item_id,
  lo.program_id                                AS earlier_program_id,
  hi.program_id                                AS later_program_id
FROM numbered lo
JOIN numbered hi
  ON hi.student_id = lo.student_id
 AND hi.surah = lo.surah
 AND hi.starts_at > lo.starts_at
 AND hi.number <= lo.number
JOIN students st ON st.id = lo.student_id
JOIN persons p ON p.id = st."personId"
ORDER BY student, lo.surah, lo.number, hi.number;
