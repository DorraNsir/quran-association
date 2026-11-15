import { ConflictException } from '@nestjs/common';

import { notStartedAt } from '../common/platform-clock.js';
import { Prisma } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { PageSizeService } from '../common/page-size.service.js';
import type { ScheduleConflictService } from './schedule-conflicts.service.js';
import { SessionsService } from './sessions.service.js';

/** A SessionsService whose transaction fails with `error` (the database refused). */
const serviceFailingWith = (error: unknown) =>
  new SessionsService(
    {
      $transaction: () => Promise.reject(error),
    } as unknown as PrismaService,
    {} as ScheduleConflictService,
    {} as PageSizeService,
  );

const prismaError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError('database refused', {
    code,
    clientVersion: 'test',
  });

describe('SessionsService.remove — foreign key refusals', () => {
  it('a foreign key violation (P2003: a protected row appeared) becomes 409 SESSION_HAS_HISTORY, never a 500', async () => {
    const error = await serviceFailingWith(prismaError('P2003'))
      .remove('00000000-0000-0000-0000-000000000000', 'user')
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toEqual({
      code: 'SESSION_HAS_HISTORY',
      message: 'لا يمكن حذف الحصة لوجود بيانات محفوظة مرتبطة بها',
    });
  });

  it('any other error is passed through unchanged', async () => {
    const other = prismaError('P2002');
    await expect(
      serviceFailingWith(other).remove(
        '00000000-0000-0000-0000-000000000000',
        'user',
      ),
    ).rejects.toBe(other);
    const plain = new Error('boom');
    await expect(
      serviceFailingWith(plain).remove(
        '00000000-0000-0000-0000-000000000000',
        'user',
      ),
    ).rejects.toBe(plain);
  });
});

describe('notStartedAt (platform clock)', () => {
  const clock = { today: '2026-11-14', now: '15:30' };
  it('a later day, or later today, has not started', () => {
    expect(notStartedAt(clock, '2026-11-15', '00:00')).toBe(true);
    expect(notStartedAt(clock, '2026-11-14', '15:31')).toBe(true);
  });
  it('the current minute, earlier today or an earlier day has started', () => {
    expect(notStartedAt(clock, '2026-11-14', '15:30')).toBe(false);
    expect(notStartedAt(clock, '2026-11-14', '09:00')).toBe(false);
    expect(notStartedAt(clock, '2026-11-13', '23:59')).toBe(false);
  });
});
