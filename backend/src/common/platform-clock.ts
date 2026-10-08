import type { Prisma } from '../generated/prisma/client.js';
import { todayIn } from './dates.js';

/** "Today" as a calendar date in the platform timezone (PlatformSettings, Africa/Tunis by default). */
export async function platformToday(
  db: Pick<Prisma.TransactionClient, 'platformSettings'>,
) {
  const settings = await db.platformSettings.findUnique({
    where: { id: 1 },
    select: { timezone: true },
  });
  return todayIn(settings?.timezone ?? 'Africa/Tunis');
}
