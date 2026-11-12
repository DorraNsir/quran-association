-- «حفظ القسم» in one request: the class form sends the version it was opened
-- with, and a stale one is refused (optimistic concurrency).
-- Additive: one column (every existing class starts at 1) and triggers. No
-- existing row is otherwise updated or deleted.

-- AlterTable
ALTER TABLE "group_classes" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

-- The class row itself: a change of what the form shows (group, branch,
-- supervisor, status) bumps it, unless the statement already did
CREATE FUNCTION "group_class_version_on_update"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."version" = OLD."version"
     AND (NEW."groupId", NEW."branchId", NEW."supervisorId", NEW."status")
         IS DISTINCT FROM (OLD."groupId", OLD."branchId", OLD."supervisorId", OLD."status") THEN
    NEW."version" := OLD."version" + 1;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "group_classes_version" BEFORE UPDATE ON "group_classes"
FOR EACH ROW EXECUTE FUNCTION "group_class_version_on_update"();

-- Bumps the given classes (rows locked in id order: no deadlock between two bumps)
CREATE FUNCTION "group_class_version_bump"(ids UUID[]) RETURNS void
LANGUAGE sql AS $$
  UPDATE "group_classes" SET "version" = "version" + 1
  WHERE "id" IN (SELECT "id" FROM "group_classes" WHERE "id" = ANY(ids) ORDER BY "id" FOR UPDATE);
$$;

-- Its assistants
CREATE FUNCTION "group_class_version_on_assistant"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN PERFORM "group_class_version_bump"(ARRAY[OLD."groupClassId"]); END IF;
  IF TG_OP <> 'DELETE' THEN PERFORM "group_class_version_bump"(ARRAY[NEW."groupClassId"]); END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER "group_class_assistants_version" AFTER INSERT OR UPDATE OR DELETE ON "group_class_assistants"
FOR EACH ROW EXECUTE FUNCTION "group_class_version_on_assistant"();

-- Its weekly slots: the host and every additional class of the slot
CREATE FUNCTION "group_class_version_on_schedule"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  slot UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN slot := OLD."id"; ELSE slot := NEW."id"; END IF;
  IF TG_OP <> 'INSERT' THEN PERFORM "group_class_version_bump"(ARRAY[OLD."groupClassId"]); END IF;
  IF TG_OP <> 'DELETE' AND (TG_OP = 'INSERT' OR NEW."groupClassId" IS DISTINCT FROM OLD."groupClassId") THEN
    PERFORM "group_class_version_bump"(ARRAY[NEW."groupClassId"]);
  END IF;
  -- Its additional classes (a deleted slot's are bumped as their rows go)
  PERFORM "group_class_version_bump"(ARRAY(
    SELECT "groupClassId" FROM "weekly_schedule_classes" WHERE "weeklyScheduleId" = slot));
  RETURN NULL;
END;
$$;
CREATE TRIGGER "weekly_schedules_version" AFTER INSERT OR UPDATE OR DELETE ON "weekly_schedules"
FOR EACH ROW EXECUTE FUNCTION "group_class_version_on_schedule"();

-- A shared slot's additional classes (added or removed): that class and the host
CREATE FUNCTION "group_class_version_on_schedule_class"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  cls UUID;
  slot UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    cls := OLD."groupClassId"; slot := OLD."weeklyScheduleId";
  ELSE
    cls := NEW."groupClassId"; slot := NEW."weeklyScheduleId";
  END IF;
  PERFORM "group_class_version_bump"(ARRAY(
    SELECT cls
    UNION
    SELECT "groupClassId" FROM "weekly_schedules" WHERE "id" = slot));
  RETURN NULL;
END;
$$;
CREATE TRIGGER "weekly_schedule_classes_version" AFTER INSERT OR UPDATE OR DELETE ON "weekly_schedule_classes"
FOR EACH ROW EXECUTE FUNCTION "group_class_version_on_schedule_class"();
