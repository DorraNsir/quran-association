/**
 * Usernames are case-insensitive identities: stored and compared as
 * trim + lowercase (Ahmed / AHMED / ahmed are the same account). The database
 * enforces the stored form with a CHECK constraint (users_username_normalized_check)
 * on top of the unique index.
 */
export function normalizeUsername(value: string): string {
  return value.normalize('NFKC').trim().toLowerCase();
}

/** 3–32 characters: latin letters, digits, ".", "_" or "-" (not at the ends). */
export const USERNAME_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{1,30})[a-z0-9]$/;
export const USERNAME_RULE_MESSAGE =
  'اسم المستخدم: من 3 إلى 32 حرفًا لاتينيًا أو رقمًا، ويمكن أن يتضمن . أو _ أو - في الوسط';

/** class-transformer helper for DTOs. */
export const toNormalizedUsername = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? normalizeUsername(value) : value;
