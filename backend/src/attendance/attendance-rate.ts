import { AttendanceStatus } from '../generated/prisma/enums.js';

export type StatusCounts = Record<AttendanceStatus, number>;

export const emptyCounts = (): StatusCounts => ({
  PRESENT: 0,
  ABSENT: 0,
  LATE: 0,
  EXCUSED: 0,
});

/**
 * THE attendance rule, for students and teachers alike (the frontend only
 * displays these numbers). Only RECORDED statuses count — "not recorded yet"
 * is never an absence — and the callers pass statuses of non-cancelled
 * sessions only (attendance cannot be saved for a future session).
 *   attended = PRESENT + LATE              (late still counts as attended)
 *   eligible = PRESENT + LATE + ABSENT     (EXCUSED is shown, but left out)
 *   rate     = attended / eligible × 100, one decimal; null when eligible = 0
 */
export function attendanceTotals(c: StatusCounts) {
  const attended = c.PRESENT + c.LATE;
  const eligible = attended + c.ABSENT;
  return {
    recorded: eligible + c.EXCUSED,
    present: c.PRESENT,
    absent: c.ABSENT,
    late: c.LATE,
    excused: c.EXCUSED,
    attended,
    eligible,
    rate: eligible > 0 ? Math.round((attended / eligible) * 1000) / 10 : null,
  };
}
