import { ar } from '@/i18n/ar';

/** Same policy as backend/src/auth/password-policy.ts (8–128 characters). */
export function passwordPolicyError(value: string): string | undefined {
  if (value.length < 8) return ar.auth.passwordTooShort;
  if (value.length > 128) return ar.auth.passwordTooLong;
  return undefined;
}
