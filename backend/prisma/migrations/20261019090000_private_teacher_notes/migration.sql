-- «ملاحظاتي» becomes a teacher's private personal notebook: a note no longer
-- needs a student, a class or a hand-entered date.
-- Data-safe: NOTHING is dropped, rewritten or deleted. Existing notes keep
-- their content, their author (teacherId, already NOT NULL — every note has
-- exactly one owner) and their historical student / class / date values;
-- only the NOT NULL requirement is lifted so new notes can leave them empty.
ALTER TABLE "teacher_notes" ALTER COLUMN "studentId" DROP NOT NULL;
ALTER TABLE "teacher_notes" ALTER COLUMN "groupClassId" DROP NOT NULL;
ALTER TABLE "teacher_notes" ALTER COLUMN "date" DROP NOT NULL;

-- The notebook lists a teacher's notes, most recently updated first
CREATE INDEX "teacher_notes_teacherId_updatedAt_idx" ON "teacher_notes"("teacherId", "updatedAt");
