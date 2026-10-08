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
  room: { select: { id: true, name: true } },
} satisfies Prisma.GroupClassSelect;

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
