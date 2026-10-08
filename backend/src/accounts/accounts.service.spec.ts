import { ConflictException } from '@nestjs/common';

import type { AuthPrincipal } from '../auth/auth.types.js';
import type { PasswordService } from '../auth/password.service.js';
import type { SessionService } from '../auth/session.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { AccountsService } from './accounts.service.js';

/**
 * Last-active-admin protection, with the locked admin rows mocked (the e2e
 * suite cannot reach the "only one admin" state: the acting admin is one).
 */
describe('AccountsService — last active admin', () => {
  const actor: AuthPrincipal = {
    userId: 'actor',
    sessionId: 's',
    roles: ['ADMIN'],
    mustChangePassword: false,
  };

  function serviceWith(activeAdminIds: string[]) {
    const calls: string[] = [];
    const tx = {
      $queryRaw: () => Promise.resolve(activeAdminIds.map((id) => ({ id }))),
      user: {
        findUnique: () =>
          Promise.resolve({ isActive: true, roles: [{ role: 'ADMIN' }] }),
        update: () => {
          calls.push('update');
          return Promise.resolve({});
        },
      },
      userRole: {
        deleteMany: () => (calls.push('deleteMany'), Promise.resolve({})),
        createMany: () => Promise.resolve({}),
      },
    };
    const prisma = {
      $transaction: (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    } as unknown as PrismaService;
    const sessions = {
      revokeAllForUser: () => Promise.resolve(),
    } as unknown as SessionService;
    const service = new AccountsService(
      prisma,
      {} as PasswordService,
      sessions,
      {} as never,
    );
    // The detail reload after the change is not under test
    service.get = () => Promise.resolve({} as never);
    return { service, calls };
  }

  it('refuses to deactivate the only active admin', async () => {
    const { service, calls } = serviceWith(['target']);
    await expect(service.deactivate(actor, 'target')).rejects.toMatchObject({
      response: { code: 'LAST_ACTIVE_ADMIN' },
    });
    expect(calls).toEqual([]);
  });

  it('refuses to remove ADMIN from the only active admin', async () => {
    const { service, calls } = serviceWith(['target']);
    await expect(
      service.setRoles(actor, 'target', { roles: ['TEACHER'] }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(calls).toEqual([]);
  });

  it('allows both when another active admin remains', async () => {
    const { service, calls } = serviceWith(['target', 'someone-else']);
    await service.deactivate(actor, 'target');
    await service.setRoles(actor, 'target', { roles: ['TEACHER'] });
    expect(calls).toEqual(['update', 'deleteMany']);
  });

  it('never lets an admin lock themselves out', async () => {
    const { service } = serviceWith(['actor', 'someone-else']);
    await expect(service.deactivate(actor, 'actor')).rejects.toMatchObject({
      response: { code: 'SELF_LOCKOUT' },
    });
    await expect(
      service.setRoles(actor, 'actor', { roles: ['TEACHER'] }),
    ).rejects.toMatchObject({
      response: { code: 'SELF_LOCKOUT' },
    });
    await expect(
      service.resetPassword(actor, 'actor', 'temporary-pass'),
    ).rejects.toMatchObject({
      response: { code: 'SELF_LOCKOUT' },
    });
  });
});
