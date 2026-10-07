-- Usernames are case-insensitive: stored as trim + lowercase.
-- 1) Normalize existing rows (non-destructive; fails loudly — instead of
--    silently merging accounts — if two usernames only differed by case).
UPDATE "users" SET "username" = lower(btrim("username")) WHERE "username" <> lower(btrim("username"));

-- 2) The existing unique index ("users_username_key") now guarantees
--    case-insensitive uniqueness, because only the normalized form can be stored.
ALTER TABLE "users" ADD CONSTRAINT "users_username_normalized_check"
  CHECK ("username" = lower(btrim("username")) AND length("username") BETWEEN 3 AND 32);
