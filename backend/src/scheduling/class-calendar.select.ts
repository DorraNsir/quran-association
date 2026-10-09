import type { Prisma } from '../generated/prisma/client.js';
import type { ScheduleClassDto } from './schedule.dto.js';

const teacher = {
  select: { id: true, person: { select: { firstName: true, lastName: true } } },
} as const;

/** Compact class shape shared by schedule and session responses (no deep graphs). */
export const classCalendarSelect = {
  id: true,
  status: true,
  group: { select: { id: true, name: true } },
  branch: { select: { id: true, name: true } },
  supervisor: teacher,
  assistants: { select: { teacher }, orderBy: { assignedAt: 'asc' } },
} satisfies Prisma.GroupClassSelect;

type Row = Prisma.GroupClassGetPayload<{ select: typeof classCalendarSelect }>;

const brief = (t: {
  id: string;
  person: { firstName: string; lastName: string };
}) => ({ id: t.id, ...t.person });

export const toScheduleClass = (c: Row): ScheduleClassDto => ({
  id: c.id,
  status: c.status,
  group: c.group,
  branch: c.branch,
  supervisor: brief(c.supervisor),
  assistants: c.assistants.map((a) => brief(a.teacher)),
});
