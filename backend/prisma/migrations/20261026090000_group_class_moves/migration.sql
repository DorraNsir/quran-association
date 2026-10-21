-- «نقل القسم إلى مجموعة أخرى»: audit of a class moved to its correct group.
-- Additive: one new table (plus its check and append-only trigger). No
-- existing table or row is changed.

-- CreateTable
CREATE TABLE "group_class_moves" (
    "id" UUID NOT NULL,
    "groupClassId" UUID NOT NULL,
    "fromGroupId" UUID NOT NULL,
    "toGroupId" UUID NOT NULL,
    "movedByUserId" UUID NOT NULL,
    "movedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_class_moves_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "group_class_moves_groupClassId_movedAt_idx" ON "group_class_moves"("groupClassId", "movedAt");

-- AddForeignKey
ALTER TABLE "group_class_moves" ADD CONSTRAINT "group_class_moves_groupClassId_fkey" FOREIGN KEY ("groupClassId") REFERENCES "group_classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_class_moves" ADD CONSTRAINT "group_class_moves_fromGroupId_fkey" FOREIGN KEY ("fromGroupId") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_class_moves" ADD CONSTRAINT "group_class_moves_toGroupId_fkey" FOREIGN KEY ("toGroupId") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_class_moves" ADD CONSTRAINT "group_class_moves_movedByUserId_fkey" FOREIGN KEY ("movedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- A move goes somewhere else
ALTER TABLE "group_class_moves" ADD CONSTRAINT "group_class_moves_distinct_check"
  CHECK ("fromGroupId" <> "toGroupId");

-- History: a recorded move is never rewritten
CREATE FUNCTION group_class_moves_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'group_class_moves_immutable: a recorded move cannot be rewritten'
    USING ERRCODE = 'check_violation', CONSTRAINT = 'group_class_moves_immutable';
END $$;
CREATE TRIGGER group_class_moves_immutable BEFORE UPDATE ON "group_class_moves"
  FOR EACH ROW EXECUTE FUNCTION group_class_moves_immutable();
