import { PasswordService } from './password.service.js';

describe('PasswordService', () => {
  const passwords = new PasswordService();

  it('hashes with Argon2id (never the plaintext) and verifies', async () => {
    const hash = await passwords.hash('correct horse battery');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(hash).not.toContain('correct horse battery');
    expect(await passwords.verify(hash, 'correct horse battery')).toBe(true);
    expect(await passwords.verify(hash, 'wrong password')).toBe(false);
  });

  it('salts every hash', async () => {
    expect(await passwords.hash('same-password')).not.toBe(
      await passwords.hash('same-password'),
    );
  });

  it('returns false (no throw) for a malformed hash', async () => {
    expect(await passwords.verify('not-a-hash', 'x')).toBe(false);
  });
});
