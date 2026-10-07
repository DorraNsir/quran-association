import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { durationToMs } from '../common/duration.js';
import type { EnvironmentVariables } from '../config/env.validation.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Refresh token = "<sessionId>.<256-bit random secret>" (opaque, never a JWT). */
function splitToken(token: string | undefined) {
  const [sessionId, secret, extra] = (token ?? '').split('.');
  if (
    extra !== undefined ||
    !sessionId ||
    !secret ||
    !UUID.test(sessionId) ||
    secret.length < 40
  ) {
    return undefined;
  }
  return { sessionId, secret };
}

/** SHA-256 is right here: the secret is random and high-entropy (no brute-force risk). */
const digest = (secret: string) =>
  createHash('sha256').update(secret).digest('base64url');
const newSecret = () => randomBytes(32).toString('base64url');

function sameDigest(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export interface IssuedRefreshToken {
  sessionId: string;
  userId: string;
  token: string;
  expiresAt: Date;
}

/**
 * Refresh sessions (AuthSession rows). Rotation replaces the stored digest
 * atomically; presenting a previous token of a live session means it was
 * copied, so the whole session is revoked (reuse detection).
 */
@Injectable()
export class SessionService {
  readonly ttlMs: number;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.ttlMs = durationToMs(
      config.get('REFRESH_TOKEN_EXPIRES_IN', { infer: true }),
    );
  }

  async create(userId: string): Promise<IssuedRefreshToken> {
    const secret = newSecret();
    const expiresAt = new Date(Date.now() + this.ttlMs);
    const session = await this.prisma.authSession.create({
      data: { userId, refreshTokenHash: digest(secret), expiresAt },
      select: { id: true },
    });
    return {
      sessionId: session.id,
      userId,
      token: `${session.id}.${secret}`,
      expiresAt,
    };
  }

  /** Validates and rotates a refresh token; undefined when it is not usable. */
  async rotate(
    token: string | undefined,
  ): Promise<IssuedRefreshToken | undefined> {
    const parts = splitToken(token);
    if (!parts) return undefined;
    const session = await this.prisma.authSession.findUnique({
      where: { id: parts.sessionId },
    });
    if (!session || session.revokedAt || session.expiresAt <= new Date())
      return undefined;

    const presented = digest(parts.secret);
    if (!sameDigest(presented, session.refreshTokenHash)) {
      // An older token of this session was replayed → treat as stolen
      await this.revoke(session.id);
      return undefined;
    }

    const secret = newSecret();
    const expiresAt = new Date(Date.now() + this.ttlMs);
    // Conditional update: two concurrent refreshes cannot both succeed
    const { count } = await this.prisma.authSession.updateMany({
      where: { id: session.id, refreshTokenHash: presented, revokedAt: null },
      data: {
        refreshTokenHash: digest(secret),
        expiresAt,
        lastUsedAt: new Date(),
      },
    });
    if (count === 0) return undefined;
    return {
      sessionId: session.id,
      userId: session.userId,
      token: `${session.id}.${secret}`,
      expiresAt,
    };
  }

  /** Session id owning this refresh token, only if the token is the current one. */
  async resolve(token: string | undefined): Promise<string | undefined> {
    const parts = splitToken(token);
    if (!parts) return undefined;
    const session = await this.prisma.authSession.findUnique({
      where: { id: parts.sessionId },
      select: { id: true, refreshTokenHash: true },
    });
    return session && sameDigest(digest(parts.secret), session.refreshTokenHash)
      ? session.id
      : undefined;
  }

  async revoke(sessionId: string) {
    await this.prisma.authSession.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Revokes every live session of a user, optionally keeping one (the current). */
  async revokeAllForUser(
    userId: string,
    exceptSessionId?: string,
    /** Pass the transaction client to revoke atomically with another change */
    db: Pick<Prisma.TransactionClient, 'authSession'> = this.prisma,
  ) {
    await db.authSession.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}),
      },
      data: { revokedAt: new Date() },
    });
  }
}
