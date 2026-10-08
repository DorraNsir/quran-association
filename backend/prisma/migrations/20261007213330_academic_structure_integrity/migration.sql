-- DropForeignKey
ALTER TABLE "group_classes" DROP CONSTRAINT "group_classes_roomId_fkey";

-- CreateIndex
CREATE UNIQUE INDEX "rooms_id_branchId_key" ON "rooms"("id", "branchId");

-- AddForeignKey
ALTER TABLE "group_classes" ADD CONSTRAINT "group_classes_roomId_branchId_fkey" FOREIGN KEY ("roomId", "branchId") REFERENCES "rooms"("id", "branchId") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- ─────────────────────────────────────────────────────────────────────────────
-- Invariants Prisma cannot express (Prisma Migrate leaves them untouched).
-- ─────────────────────────────────────────────────────────────────────────────

-- Academic years never overlap (inclusive date ranges). Plain GiST on a range
-- expression — no extension needed.
ALTER TABLE "academic_years" ADD CONSTRAINT "academic_years_no_overlap"
  EXCLUDE USING gist (daterange("startDate", "endDate", '[]') WITH &&);

-- A class's supervisor is never also one of its assistants (checked from both
-- sides: adding an assistant, or changing the supervisor).
CREATE FUNCTION "enforce_supervisor_not_assistant"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'group_class_assistants' THEN
    IF EXISTS (SELECT 1 FROM "group_classes" c WHERE c."id" = NEW."groupClassId" AND c."supervisorId" = NEW."teacherId") THEN
      RAISE EXCEPTION 'supervisor cannot also be an assistant of the same class'
        USING ERRCODE = '23514', CONSTRAINT = 'group_class_supervisor_not_assistant';
    END IF;
  ELSIF EXISTS (SELECT 1 FROM "group_class_assistants" a WHERE a."groupClassId" = NEW."id" AND a."teacherId" = NEW."supervisorId") THEN
    RAISE EXCEPTION 'supervisor cannot also be an assistant of the same class'
      USING ERRCODE = '23514', CONSTRAINT = 'group_class_supervisor_not_assistant';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "group_class_assistants_supervisor_check"
  BEFORE INSERT OR UPDATE ON "group_class_assistants"
  FOR EACH ROW EXECUTE FUNCTION "enforce_supervisor_not_assistant"();

CREATE TRIGGER "group_classes_supervisor_check"
  BEFORE UPDATE OF "supervisorId" ON "group_classes"
  FOR EACH ROW EXECUTE FUNCTION "enforce_supervisor_not_assistant"();
