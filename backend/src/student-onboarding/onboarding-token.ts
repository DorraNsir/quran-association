import {
  createCipheriv,
  createDecipheriv,
  createHash,
  hkdfSync,
  randomBytes,
} from 'node:crypto';

/**
 * Public link tokens of the TEMPORARY onboarding module.
 *  - 32 random bytes (256 bits, base64url): unguessable, never a class id;
 *  - looked up by their SHA-256 hash (the only searchable form);
 *  - also kept SEALED (AES-256-GCM) so an admin can copy the link / QR again;
 *    the key is derived (HKDF) from JWT_ACCESS_SECRET with a dedicated label.
 *    If that secret is rotated, old links can no longer be revealed (an admin
 *    then creates a replacement link) — they still work for submitters.
 */
export const newToken = () => randomBytes(32).toString('base64url');

export const hashToken = (token: string) =>
  createHash('sha256').update(token, 'utf8').digest('hex');

/** A well-formed token (43 base64url characters) — anything else is rejected without a lookup. */
export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function keyFrom(secret: string) {
  return Buffer.from(
    hkdfSync(
      'sha256',
      secret,
      'quran-association',
      'student-onboarding-link',
      32,
    ),
  );
}

export function sealToken(token: string, secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyFrom(secret), iv);
  const data = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data]
    .map((b) => b.toString('base64url'))
    .join('.');
}

/** The token, or null when it cannot be opened (e.g. the secret was rotated). */
export function unsealToken(sealed: string, secret: string): string | null {
  try {
    const [iv, tag, data] = sealed
      .split('.')
      .map((p) => Buffer.from(p, 'base64url'));
    const decipher = createDecipheriv('aes-256-gcm', keyFrom(secret), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString(
      'utf8',
    );
  } catch {
    return null;
  }
}
