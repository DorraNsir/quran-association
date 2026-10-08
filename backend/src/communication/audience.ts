import {
  AnnouncementAudience,
  AnnouncementStatus,
  type Prisma,
  ResourceVisibility,
} from '../generated/prisma/client.js';
import type { StudentScope } from '../student-space/student-access.service.js';
import type { TeacherScope } from '../teaching/teacher-access.service.js';

/**
 * THE audience rules of private communication — used by the read filters
 * below AND mirrored by the recipient SQL in NotificationsService, so "who
 * can read it" and "who is notified" stay the same rule.
 *
 * Resources (students only):
 *   ALL_STUDENTS → every active student · GROUP → the group of the student's
 *   CURRENT class is targeted · GROUP_CLASS → their current class is targeted.
 *   Teachers consult what reaches their CURRENT classes (and what they wrote).
 *
 * Announcements (visible only while PUBLISHED and not past expiresAt):
 *   EVERYONE → every account (admins included) · TEACHERS / STUDENTS → that
 *   profile · SPECIFIC_GROUP_CLASSES → students currently in, and teachers
 *   currently assigned to (supervisor or assistant), a targeted class ·
 *   SPECIFIC_BRANCHES → same, for any class of a targeted branch.
 */

export function studentResourceWhere(
  scope: StudentScope,
): Prisma.ResourceWhereInput {
  return {
    OR: [
      { visibility: ResourceVisibility.ALL_STUDENTS },
      ...(scope.groupId
        ? [
            {
              visibility: ResourceVisibility.GROUP,
              targets: { some: { groupId: scope.groupId } },
            },
          ]
        : []),
      ...(scope.groupClassId
        ? [
            {
              visibility: ResourceVisibility.GROUP_CLASS,
              targets: { some: { groupClassId: scope.groupClassId } },
            },
          ]
        : []),
    ],
  };
}

/** What a teacher may consult: their own resources and those reaching their current classes. */
export function teacherResourceWhere(
  scope: TeacherScope,
  userId: string,
): Prisma.ResourceWhereInput {
  return {
    OR: [
      { publishedByUserId: userId },
      { visibility: ResourceVisibility.ALL_STUDENTS },
      {
        visibility: ResourceVisibility.GROUP,
        targets: { some: { groupId: { in: scope.groupIds } } },
      },
      {
        visibility: ResourceVisibility.GROUP_CLASS,
        targets: { some: { groupClassId: { in: scope.classIds } } },
      },
    ],
  };
}

/** Published (actually — a SCHEDULED one is not yet) and not expired on `today`. */
export function announcementVisibleOn(
  today: Date,
): Prisma.AnnouncementWhereInput {
  return {
    status: AnnouncementStatus.PUBLISHED,
    OR: [{ expiresAt: null }, { expiresAt: { gte: today } }],
  };
}

export function studentAnnouncementWhere(
  scope: StudentScope,
  today: Date,
): Prisma.AnnouncementWhereInput {
  return {
    AND: [
      announcementVisibleOn(today),
      {
        OR: [
          {
            audience: {
              in: [
                AnnouncementAudience.EVERYONE,
                AnnouncementAudience.STUDENTS,
              ],
            },
          },
          ...(scope.groupClassId
            ? [
                {
                  audience: AnnouncementAudience.SPECIFIC_GROUP_CLASSES,
                  targets: { some: { groupClassId: scope.groupClassId } },
                },
              ]
            : []),
          ...(scope.branchId
            ? [
                {
                  audience: AnnouncementAudience.SPECIFIC_BRANCHES,
                  branchTargets: { some: { branchId: scope.branchId } },
                },
              ]
            : []),
        ],
      },
    ],
  };
}

/** A teacher reads what is visible to them now, plus their own announcements (any status). */
export function teacherAnnouncementWhere(
  scope: TeacherScope,
  userId: string,
  today: Date,
): Prisma.AnnouncementWhereInput {
  return {
    OR: [
      { publishedByUserId: userId },
      {
        AND: [
          announcementVisibleOn(today),
          {
            OR: [
              {
                audience: {
                  in: [
                    AnnouncementAudience.EVERYONE,
                    AnnouncementAudience.TEACHERS,
                  ],
                },
              },
              {
                audience: AnnouncementAudience.SPECIFIC_GROUP_CLASSES,
                targets: { some: { groupClassId: { in: scope.classIds } } },
              },
              {
                audience: AnnouncementAudience.SPECIFIC_BRANCHES,
                branchTargets: { some: { branchId: { in: scope.branchIds } } },
              },
            ],
          },
        ],
      },
    ],
  };
}
