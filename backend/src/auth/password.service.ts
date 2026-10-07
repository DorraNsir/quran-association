import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

/**
 * Argon2id hashing (OWASP baseline: 19 MiB memory, 2 iterations, 1 lane).
 * The only place that touches argon2; passwords are never logged or stored.
 */
@Injectable()
export class PasswordService {
  private static readonly OPTIONS = {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  } as const;

  /** Verified against when the username is unknown, to keep timing uniform. */
  private dummyHash?: Promise<string>;

  hash(password: string): Promise<string> {
    return argon2.hash(password, PasswordService.OPTIONS);
  }

  /** False on mismatch or on a malformed hash (never throws for bad input). */
  async verify(hash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }

  /** Burns comparable CPU time when no user matched (no username oracle by timing). */
  async verifyAgainstDummy(password: string): Promise<void> {
    this.dummyHash ??= this.hash('dummy-password-for-timing-equalisation');
    await this.verify(await this.dummyHash, password);
  }
}
