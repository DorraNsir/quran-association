import type { Prisma } from '../generated/prisma/client.js';

/**
 * "Which GroupClasses is this teacher EXPLICITLY assigned to?" — as supervisor
 * (GroupClass.supervisorId) or assistant (GroupClassAssistant). This is the
 * basis of future teacher-workspace RESOURCE authorization; the TEACHER role
 * alone never grants access to a class.
 */
export const assignedToTeacher = (
  teacherId: string,
): Prisma.GroupClassWhereInput => ({
  OR: [{ supervisorId: teacherId }, { assistants: { some: { teacherId } } }],
});

/** Brief class shape reused by teacher / student / class responses. */
export const classBriefSelect = {
  id: true,
  status: true,
  group: { select: { id: true, name: true } },
  branch: { select: { id: true, name: true } },
  // Rooms are per weekly slot: the class shows the distinct rooms it uses
  schedules: {
    select: { room: { select: { id: true, name: true } } },
    orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
  },
} satisfies Prisma.GroupClassSelect;

/** Distinct rooms of a class's weekly slots, in schedule order. */
export function roomsOfSlots(
  schedules: { room: { id: string; name: string } }[],
) {
  return [...new Map(schedules.map((s) => [s.room.id, s.room])).values()];
}

/** Brief class → its API shape (rooms derived from its weekly slots). */
export function toClassRef<
  T extends {
    schedules: { room: { id: string; name: string } }[];
  },
>({ schedules, ...c }: T) {
  return { ...c, rooms: roomsOfSlots(schedules) };
}

export const personNameSelect = {
  id: true,
  firstName: true,
  lastName: true,
  photoUrl: true,
} satisfies Prisma.PersonSelect;

/** Account summary of a person (never hashes/sessions). */
export const accountSummarySelect = {
  id: true,
  username: true,
  isActive: true,
  roles: { select: { role: true }, orderBy: { role: 'asc' } },
} satisfies Prisma.UserSelect;
