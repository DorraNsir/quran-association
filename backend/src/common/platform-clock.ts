import type { Prisma } from '../generated/prisma/client.js';
import { todayIn } from './dates.js';

type Db = Pick<Prisma.TransactionClient, 'platformSettings'>;

/** The platform IANA timezone (PlatformSettings, Africa/Tunis by default). */
export async function platformTimezone(db: Db) {
  const settings = await db.platformSettings.findUnique({
    where: { id: 1 },
    select: { timezone: true },
  });
  return settings?.timezone ?? 'Africa/Tunis';
}

/** "Today" as a calendar date in the platform timezone. */
export async function platformToday(db: Db) {
  return todayIn(await platformTimezone(db));
}

/**
 * Instant bounds of calendar days in the platform timezone, for filtering a
 * TIMESTAMPTZ column: [start of `from`, start of the day after `to`).
 */
export async function platformDayBounds(
  db: Db & Pick<Prisma.TransactionClient, '$queryRaw'>,
  from?: string,
  to?: string,
): Promise<{ gte?: Date; lt?: Date }> {
  if (!from && !to) return {};
  const timezone = await platformTimezone(db);
  const [row] = await db.$queryRaw<{ gte: Date | null; lt: Date | null }[]>`
    SELECT (${from ?? null}::date)::timestamp AT TIME ZONE ${timezone} AS gte,
           (${to ?? null}::date + 1)::timestamp AT TIME ZONE ${timezone} AS lt`;
  return {
    ...(row.gte ? { gte: row.gte } : {}),
    ...(row.lt ? { lt: row.lt } : {}),
  };
}

/**
 * Wall-clock "YYYY-MM-DDTHH:mm" in the platform timezone → instant. Done by
 * PostgreSQL (timestamp AT TIME ZONE), which applies the zone's offset/DST
 * rules for that very date.
 */
export async function localDateTimeToInstant(
  db: Db & Pick<Prisma.TransactionClient, '$queryRaw'>,
  local: string,
): Promise<Date> {
  const timezone = await platformTimezone(db);
  const [row] = await db.$queryRaw<{ instant: Date }[]>`
    SELECT (${local}::timestamp AT TIME ZONE ${timezone}) AS instant`;
  return row.instant;
}
