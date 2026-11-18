-- Work Program 2.0 — structured Quranic assignments on work items.
-- ADDITIVE ONLY: one enum, nullable columns, one CHECK. Existing rows keep every column NULL
-- (free-text items); nothing is backfilled or rewritten.

-- CreateEnum
CREATE TYPE "WorkAssignmentKind" AS ENUM ('AYAH_RANGE', 'PAGE_RANGE', 'SURAH_RANGE');

-- AlterTable
ALTER TABLE "work_items"
    ADD COLUMN "quranAssignmentKind" "WorkAssignmentKind",
    ADD COLUMN "quranEditionId" TEXT,
    ADD COLUMN "quranFromSurah" SMALLINT,
    ADD COLUMN "quranFromAyah" SMALLINT,
    ADD COLUMN "quranToSurah" SMALLINT,
    ADD COLUMN "quranToAyah" SMALLINT,
    ADD COLUMN "quranFromPage" SMALLINT,
    ADD COLUMN "quranToPage" SMALLINT,
    ADD COLUMN "quranWorkload" JSONB;

-- Integrity rules the API also enforces (a last line of defence; the API validates each verse
-- against the edition's reference data, which SQL cannot see)
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_quran_assignment_check" CHECK (
    (
        "quranAssignmentKind" IS NULL
        AND "quranEditionId" IS NULL
        AND "quranFromSurah" IS NULL AND "quranFromAyah" IS NULL
        AND "quranToSurah" IS NULL AND "quranToAyah" IS NULL
        AND "quranFromPage" IS NULL AND "quranToPage" IS NULL
        AND "quranWorkload" IS NULL
    )
    OR (
        "quranAssignmentKind" IS NOT NULL
        AND char_length(btrim("quranEditionId")) > 0
        AND "quranFromSurah" BETWEEN 1 AND 114 AND "quranToSurah" BETWEEN 1 AND 114
        AND "quranFromAyah" >= 1 AND "quranToAyah" >= 1
        -- canonical range in Mushaf order
        AND ("quranFromSurah" < "quranToSurah"
             OR ("quranFromSurah" = "quranToSurah" AND "quranFromAyah" <= "quranToAyah"))
        AND "quranWorkload" IS NOT NULL
        -- pages exactly for a page range
        AND (("quranAssignmentKind" = 'PAGE_RANGE')
             = ("quranFromPage" IS NOT NULL AND "quranToPage" IS NOT NULL))
        AND ("quranFromPage" IS NULL OR "quranFromPage" <= "quranToPage")
        AND ("quranFromPage" IS NOT NULL OR "quranToPage" IS NULL)
        -- formats per work type: حفظ by ayahs (one surah) or pages; مراجعة / اختبار / عرضة by surahs
        AND (
            ("type" = 'MEMORIZATION' AND "quranAssignmentKind" = 'PAGE_RANGE')
            OR ("type" = 'MEMORIZATION' AND "quranAssignmentKind" = 'AYAH_RANGE' AND "quranFromSurah" = "quranToSurah")
            OR ("type" IN ('REVISION', 'EXAM') AND "quranAssignmentKind" = 'SURAH_RANGE')
            OR ("type" = 'RECITATION' AND "quranAssignmentKind" = 'SURAH_RANGE' AND "quranFromSurah" = "quranToSurah"
                AND "quranFromAyah" = 1)
        )
    )
);
