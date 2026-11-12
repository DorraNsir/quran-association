import { formatDateAr } from '../common/dates.js';
import {
  ActivationStatus,
  type Gender,
  NotificationEntity,
  NotificationType,
  type Prisma,
  RecordStatus,
} from '../generated/prisma/client.js';
import {
  actorSentence,
  classNameAr,
  loadActor,
  type NotificationActor,
} from './notification-text.js';

type Tx = Prisma.TransactionClient;

/**
 * A student joining, moving between or leaving classes: the teachers of the
 * class(es) concerned are told, inside the transaction of the change itself
 * (a refused change notifies nobody). Only ACTIVE teachers with an active
 * account, never the admin who did it, each ONE notification per operation —
 * a teacher of both classes of a move gets a single one. A no-op (already in
 * that class, status unchanged) never reaches here, so a repeated request
 * notifies nobody again. The actor is the signed-in admin; without one (an
 * automated path) the sentence names nobody.
 */

/** How the student joined: the sentence names what the admin did. */
export type JoinOrigin = 'DIRECT' | 'REGISTRATION' | 'ONBOARDING';

const teacherAccount = {
  status: true,
  person: { select: { user: { select: { id: true, isActive: true } } } },
} satisfies Prisma.TeacherSelect;

/** A class as notifications name it, and its teachers' active accounts (the actor excluded). */
async function classOf(tx: Tx, groupClassId: string, actorUserId?: string) {
  const c = await tx.groupClass.findUniqueOrThrow({
    where: { id: groupClassId },
    select: {
      group: { select: { name: true } },
      branch: { select: { name: true } },
      supervisor: { select: teacherAccount },
      assistants: { select: { teacher: { select: teacherAccount } } },
    },
  });
  const teachers = new Set<string>();
  for (const t of [c.supervisor, ...c.assistants.map((a) => a.teacher)]) {
    const user = t.person.user;
    if (
      t.status === ActivationStatus.ACTIVE &&
      user?.isActive &&
      user.id !== actorUserId
    )
      teachers.add(user.id);
  }
  return {
    name: classNameAr({ group: c.group.name, branch: c.branch.name }),
    teachers,
  };
}

/** «الطالب محمد القاسمي» / «الطالبة …», and the pronoun and verb endings agreeing with them. */
async function studentOf(tx: Tx, studentId: string) {
  const s = await tx.student.findUniqueOrThrow({
    where: { id: studentId },
    select: {
      person: { select: { firstName: true, lastName: true, gender: true } },
    },
  });
  return studentWords(
    `${s.person.firstName} ${s.person.lastName}`.trim(),
    s.person.gender,
  );
}

export function studentWords(name: string, gender: Gender | null) {
  const f = gender === 'FEMALE';
  return {
    /** «الطالب محمد القاسمي» */
    ref: `${f ? 'الطالبة' : 'الطالب'} ${name}`,
    /** object pronoun: «وأضافه» / «وأضافها» */
    him: f ? 'ها' : 'ه',
    /** passive / intransitive verb ending: «أُضيف» / «أُضيفت» */
    t: f ? 'ت' : '',
  };
}

const actorOf = async (tx: Tx, actorUserId?: string) =>
  actorUserId ? loadActor(tx, actorUserId) : null;

/** «المسؤول الإداري أحمد بن علي» (title when the gender is known), as a complement. */
export function actorRef(actor: NotificationActor) {
  if (actor.gender === 'MALE') return `المسؤول الإداري ${actor.name}`;
  if (actor.gender === 'FEMALE') return `المسؤولة الإدارية ${actor.name}`;
  return actor.name;
}

/** « ابتداءً من 20 أكتوبر 2026» for a back-dated change, nothing for today's. */
const fromDate = (effective?: string, today?: string) =>
  effective && today && effective < today
    ? ` ابتداءً من ${formatDateAr(effective)}`
    : '';

export function joinedMessage(
  actor: NotificationActor | null,
  student: ReturnType<typeof studentWords>,
  className: string,
  origin: JoinOrigin,
) {
  const { ref, him, t } = student;
  if (!actor) return `انضم${t} ${ref} إلى قسم ${className}.`;
  switch (origin) {
    case 'REGISTRATION':
      return actorSentence(actor, 'ADMIN', {
        male: (who) =>
          `قبل ${who} طلب تسجيل ${ref} وأضاف${him} إلى قسم ${className}.`,
        female: (who) =>
          `قبلت ${who} طلب تسجيل ${ref} وأضافت${him} إلى قسم ${className}.`,
        passive: (by) =>
          `قُبل طلب تسجيل ${ref} وأُضيف${t} إلى قسم ${className} ${by}.`,
      });
    case 'ONBOARDING':
      return actorSentence(actor, 'ADMIN', {
        male: (who) =>
          `اعتمد ${who} بيانات ${ref} وأضاف${him} إلى قسم ${className}.`,
        female: (who) =>
          `اعتمدت ${who} بيانات ${ref} وأضافت${him} إلى قسم ${className}.`,
        passive: (by) =>
          `اعتُمدت بيانات ${ref} وأُضيف${t} إلى قسم ${className} ${by}.`,
      });
    default:
      return actorSentence(actor, 'ADMIN', {
        male: (who) => `أضاف ${who} ${ref} إلى قسم ${className}.`,
        female: (who) => `أضافت ${who} ${ref} إلى قسم ${className}.`,
        passive: (by) => `أُضيف${t} ${ref} إلى قسم ${className} ${by}.`,
      });
  }
}

export function transferredMessage(
  actor: NotificationActor | null,
  student: ReturnType<typeof studentWords>,
  from: string,
  to: string,
  since = '',
) {
  const { ref, t } = student;
  const move = `من قسم ${from} إلى قسم ${to}${since}`;
  if (!actor) return `انتقل${t} ${ref} ${move}.`;
  return actorSentence(actor, 'ADMIN', {
    male: (who) => `نقل ${who} ${ref} ${move}.`,
    female: (who) => `نقلت ${who} ${ref} ${move}.`,
    passive: (by) => `نُقل${t} ${ref} ${move} ${by}.`,
  });
}

/** Left by a move: the previous class's teachers are not told where to (only that they left). */
export function leftByTransferMessage(
  actor: NotificationActor | null,
  student: ReturnType<typeof studentWords>,
  from: string,
  since = '',
) {
  const { ref, him, t } = student;
  return `غادر${t} ${ref} قسم ${from}${since} بعد نقل${him}${actor ? ` من طرف ${actorRef(actor)}` : ''}.`;
}

/** Left by a status change: made inactive, or archived. */
export function leftByStatusMessage(
  actor: NotificationActor | null,
  student: ReturnType<typeof studentWords>,
  className: string,
  status: RecordStatus,
  since = '',
) {
  const { ref, t } = student;
  if (status === RecordStatus.ARCHIVED) {
    const noLonger = `فلم ${t ? 'تعد' : 'يعد'} ضمن طلبة قسم ${className}`;
    if (!actor) return `أُرشف${t} ${ref}${since}، ${noLonger}.`;
    return actorSentence(actor, 'ADMIN', {
      male: (who) => `أرشف ${who} ${ref}${since}، ${noLonger}.`,
      female: (who) => `أرشفت ${who} ${ref}${since}، ${noLonger}.`,
      passive: (by) => `أُرشف${t} ${ref}${since} ${by}، ${noLonger}.`,
    });
  }
  const what = `نشاط ${ref} في قسم ${className}${since}`;
  if (!actor) return `أُوقف ${what}.`;
  return actorSentence(actor, 'ADMIN', {
    male: (who) => `أوقف ${who} ${what}.`,
    female: (who) => `أوقفت ${who} ${what}.`,
    passive: (by) => `أُوقف ${what} ${by}.`,
  });
}

/** Back in the class's roster (an inactive or archived student made active again). */
export function reactivatedMessage(
  actor: NotificationActor | null,
  student: ReturnType<typeof studentWords>,
  className: string,
  since = '',
) {
  const what = `تفعيل ${student.ref} في قسم ${className}${since}`;
  if (!actor) return `أُعيد ${what}.`;
  return actorSentence(actor, 'ADMIN', {
    male: (who) => `أعاد ${who} ${what}.`,
    female: (who) => `أعادت ${who} ${what}.`,
    passive: (by) => `أُعيد ${what} ${by}.`,
  });
}

const insert = (
  tx: Tx,
  recipients: Iterable<string>,
  n: {
    type: NotificationType;
    title: string;
    message: string;
    entityType: NotificationEntity;
    entityId: string;
    actorUserId?: string;
  },
) => {
  const userIds = [...recipients];
  if (!userIds.length) return Promise.resolve();
  return tx.notification.createMany({
    data: userIds.map((userId) => ({
      userId,
      type: n.type,
      title: n.title,
      message: n.message,
      entityType: n.entityType,
      entityId: n.entityId,
      actorUserId: n.actorUserId ?? null,
    })),
  });
};

/** A new student in a class (created directly, from a request, from a submission). */
export async function notifyStudentJoined(
  tx: Tx,
  input: {
    studentId: string;
    groupClassId: string;
    actorUserId?: string;
    origin: JoinOrigin;
  },
) {
  const cls = await classOf(tx, input.groupClassId, input.actorUserId);
  if (!cls.teachers.size) return;
  const [student, actor] = await Promise.all([
    studentOf(tx, input.studentId),
    actorOf(tx, input.actorUserId),
  ]);
  await insert(tx, cls.teachers, {
    type: NotificationType.STUDENT_JOINED_CLASS,
    title: 'طالب جديد في القسم',
    message: joinedMessage(actor, student, cls.name, input.origin),
    entityType: NotificationEntity.STUDENT,
    entityId: input.studentId,
    actorUserId: actor?.userId,
  });
}

/**
 * A move between classes: the new class's teachers (and a teacher of both)
 * get the whole move and open the student; the previous class's other
 * teachers only learn that the student left, and open their class.
 */
export async function notifyStudentTransferred(
  tx: Tx,
  input: {
    studentId: string;
    fromGroupClassId: string;
    toGroupClassId: string;
    actorUserId?: string;
    effectiveDate?: string;
    today?: string;
  },
) {
  const [from, to] = await Promise.all([
    classOf(tx, input.fromGroupClassId, input.actorUserId),
    classOf(tx, input.toGroupClassId, input.actorUserId),
  ]);
  const leftOnly = [...from.teachers].filter((u) => !to.teachers.has(u));
  if (!leftOnly.length && !to.teachers.size) return;
  const [student, actor] = await Promise.all([
    studentOf(tx, input.studentId),
    actorOf(tx, input.actorUserId),
  ]);
  const since = fromDate(input.effectiveDate, input.today);
  await insert(tx, to.teachers, {
    type: NotificationType.STUDENT_TRANSFERRED,
    title: 'نقل طالب',
    message: transferredMessage(actor, student, from.name, to.name, since),
    entityType: NotificationEntity.STUDENT,
    entityId: input.studentId,
    actorUserId: actor?.userId,
  });
  await insert(tx, leftOnly, {
    type: NotificationType.STUDENT_LEFT_CLASS,
    title: 'مغادرة طالب',
    message: leftByTransferMessage(actor, student, from.name, since),
    entityType: NotificationEntity.GROUP_CLASS,
    entityId: input.fromGroupClassId,
    actorUserId: actor?.userId,
  });
}

/** An inactive or archived student made active again: back in their class's roster. */
export async function notifyStudentReactivated(
  tx: Tx,
  input: {
    studentId: string;
    groupClassId: string;
    actorUserId?: string;
    effectiveDate?: string;
    today?: string;
  },
) {
  const cls = await classOf(tx, input.groupClassId, input.actorUserId);
  if (!cls.teachers.size) return;
  const [student, actor] = await Promise.all([
    studentOf(tx, input.studentId),
    actorOf(tx, input.actorUserId),
  ]);
  await insert(tx, cls.teachers, {
    type: NotificationType.STUDENT_JOINED_CLASS,
    title: 'عودة طالب إلى القسم',
    message: reactivatedMessage(
      actor,
      student,
      cls.name,
      fromDate(input.effectiveDate, input.today),
    ),
    entityType: NotificationEntity.STUDENT,
    entityId: input.studentId,
    actorUserId: actor?.userId,
  });
}

/** A student made inactive or archived: no longer in their class's roster. */
export async function notifyStudentLeft(
  tx: Tx,
  input: {
    studentId: string;
    groupClassId: string;
    status: RecordStatus;
    actorUserId?: string;
    effectiveDate?: string;
    today?: string;
  },
) {
  const cls = await classOf(tx, input.groupClassId, input.actorUserId);
  if (!cls.teachers.size) return;
  const [student, actor] = await Promise.all([
    studentOf(tx, input.studentId),
    actorOf(tx, input.actorUserId),
  ]);
  await insert(tx, cls.teachers, {
    type: NotificationType.STUDENT_LEFT_CLASS,
    title: 'مغادرة طالب',
    message: leftByStatusMessage(
      actor,
      student,
      cls.name,
      input.status,
      fromDate(input.effectiveDate, input.today),
    ),
    entityType: NotificationEntity.GROUP_CLASS,
    entityId: input.groupClassId,
    actorUserId: actor?.userId,
  });
}
