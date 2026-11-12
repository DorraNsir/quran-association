import { formatDateAr } from '../common/dates.js';
import type { Gender } from '../generated/prisma/enums.js';
import type { Prisma } from '../generated/prisma/client.js';

type Db = Prisma.TransactionClient;

/** Who did something, as a notification names them (a snapshot: later renames do not rewrite it). */
export interface NotificationActor {
  userId: string;
  /** "First Last", or the username when the person has no name */
  name: string;
  gender: Gender | null;
}

/** In which capacity they acted: the title before their name. */
export type ActorCapacity = 'ADMIN' | 'TEACHER';

const TITLES: Record<ActorCapacity, Record<Gender, string>> = {
  ADMIN: { MALE: 'المسؤول الإداري', FEMALE: 'المسؤولة الإدارية' },
  TEACHER: { MALE: 'المعلم', FEMALE: 'المعلمة' },
};

/** The account's person, read in the caller's transaction; null if it no longer exists. */
export async function loadActor(
  db: Db,
  userId: string,
): Promise<NotificationActor | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      username: true,
      person: { select: { firstName: true, lastName: true, gender: true } },
    },
  });
  if (!user) return null;
  const name = `${user.person.firstName} ${user.person.lastName}`.trim();
  return {
    userId,
    name: name || user.username,
    gender: user.person.gender,
  };
}

/** The signed-in account doing something now (it exists: it is authenticated). */
export async function requireActor(
  db: Db,
  userId: string,
): Promise<NotificationActor> {
  const actor = await loadActor(db, userId);
  if (!actor) throw new Error(`Unknown actor account ${userId}`);
  return actor;
}

/**
 * A sentence about what the actor did, its verb agreeing with their gender:
 * «نشر المعلم أحمد بن علي …» / «نشرت المعلمة …». Without a known gender
 * neither verb nor title can agree, so the passive form names them:
 * «نُشر … من طرف أحمد بن علي».
 */
export function actorSentence(
  actor: NotificationActor,
  capacity: ActorCapacity,
  forms: {
    male: (who: string) => string;
    female: (who: string) => string;
    passive: (by: string) => string;
  },
): string {
  if (actor.gender === 'MALE')
    return forms.male(`${TITLES[capacity].MALE} ${actor.name}`);
  if (actor.gender === 'FEMALE')
    return forms.female(`${TITLES[capacity].FEMALE} ${actor.name}`);
  return forms.passive(`من طرف ${actor.name}`);
}

/** Arabic count agreement (same forms as the frontend's pluralize). */
export function pluralAr(
  count: number,
  forms: { one: string; two: string; few: string; many: string },
) {
  if (count === 1) return forms.one;
  if (count === 2) return forms.two;
  if (count >= 3 && count <= 10) return `${count} ${forms.few}`;
  return `${count} ${forms.many}`;
}

/** «أحمد، سلمى، يوسف وطالبان آخران»: at most `max` names, then how many more. */
export function studentNamesAr(names: string[], max = 3) {
  const shown = names.slice(0, max).join('، ');
  const more = names.length - max;
  if (more <= 0) return shown;
  return `${shown} و${pluralAr(more, {
    one: 'طالب آخر',
    two: 'طالبان آخران',
    few: 'طلبة آخرين',
    many: 'طالبًا آخر',
  })}`;
}

const weekdayAr = new Intl.DateTimeFormat('ar-TN-u-nu-latn', {
  weekday: 'long',
  timeZone: 'UTC',
});

/** «يوم الخميس 6 نوفمبر 2026 من 17:00 إلى 18:30» (date "YYYY-MM-DD", times "HH:mm"). */
export function sessionWhenAr(date: string, start: string, end: string) {
  const day = weekdayAr.format(new Date(`${date}T00:00:00Z`));
  return `يوم ${day} ${formatDateAr(date)} من ${start} إلى ${end}`;
}

/** A class as people know it: «مجموعة الماهر — فرع المركز». */
export const classNameAr = (c: { group: string; branch: string }) =>
  `${c.group} — ${c.branch}`;

/**
 * The classes of a session as people know them: «مجموعة الماهر — فرع المركز»,
 * shared ones joined by « + » (one branch named once when they share it).
 */
export function sessionClassesAr(classes: { group: string; branch: string }[]) {
  const branches = [...new Set(classes.map((c) => c.branch))];
  if (branches.length === 1)
    return `${classes.map((c) => c.group).join(' + ')} — ${branches[0]}`;
  return classes.map((c) => `${c.group} — ${c.branch}`).join(' + ');
}

/**
 * A registration request from the public website: nobody signed in sent it,
 * so it names the applicant as entered (and the group asked for, if any).
 */
export function registrationRequestMessage(r: {
  firstName: string;
  lastName: string;
  group?: string | null;
}) {
  const name = `${r.firstName} ${r.lastName}`.trim();
  return `وصل طلب تسجيل جديد من الموقع باسم ${name}${r.group ? `، للمجموعة: ${r.group}` : ''}.`;
}

/**
 * An onboarding submission: who sent it as they declared it (the student, or
 * a guardian of the student), and the class of the link it came through.
 */
export function onboardingSubmissionMessage(s: {
  submittedBy: 'STUDENT' | 'GUARDIAN';
  gender: Gender;
  firstName: string;
  lastName: string;
  className: string;
}) {
  const name = `${s.firstName} ${s.lastName}`.trim();
  const female = s.gender === 'FEMALE';
  const via = `عبر رابط الاستكمال لقسم ${s.className}`;
  if (s.submittedBy === 'GUARDIAN')
    return `أرسل وليّ أمر ${female ? 'الطالبة' : 'الطالب'} ${name} ${female ? 'بياناتها' : 'بياناته'} ${via}.`;
  return female
    ? `أرسلت الطالبة ${name} بياناتها ${via}.`
    : `أرسل الطالب ${name} بياناته ${via}.`;
}
