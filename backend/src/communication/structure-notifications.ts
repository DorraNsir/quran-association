import { fromDbDate } from '../common/dates.js';
import {
  ActivationStatus,
  NotificationEntity,
  NotificationType,
  type Prisma,
  type RecordStatus,
  type Weekday,
} from '../generated/prisma/client.js';
import { fromDbTime } from '../scheduling/time.js';
import {
  actorSentence,
  classNameAr,
  type ActorCapacity,
  loadActor,
  type NotificationActor,
  sessionClassesAr,
  sessionWhenAr,
} from './notification-text.js';

type Tx = Prisma.TransactionClient;

/**
 * Groups, classes and upcoming lessons changed by an admin. Each completed
 * operation (one endpoint call, or one «حفظ القسم») compares the state before
 * and after, groups what changed by person and writes AT MOST ONE
 * notification per person — in the operation's own transaction, so a refused
 * operation notifies nobody and a no-op (nothing changed) notifies nobody.
 * Only the public operations call this, never the shared `…InTx` steps, so a
 * step reused by a larger operation never notifies on its own.
 *
 * Recipients: other active admins (creation and structure), the class's
 * active teachers (before and after: a removed teacher is told too, nothing
 * more), and the active students of the classes whose weekly slots changed
 * (shared slots: every class taking part). Never the admin who did it.
 */

const DAY_AR: Record<Weekday, string> = {
  MON: 'الاثنين',
  TUE: 'الثلاثاء',
  WED: 'الأربعاء',
  THU: 'الخميس',
  FRI: 'الجمعة',
  SAT: 'السبت',
  SUN: 'الأحد',
};
const CLASS_STATUS_AR: Record<RecordStatus, string> = {
  ACTIVE: 'نشط',
  INACTIVE: 'غير نشط',
  ARCHIVED: 'مؤرشف',
};
const GROUP_STATUS_AR: Record<RecordStatus, string> = {
  ACTIVE: 'نشطة',
  INACTIVE: 'غير نشطة',
  ARCHIVED: 'مؤرشفة',
};

/* ───────────────────────────── snapshots ───────────────────────────── */

interface SlotSnapshot {
  day: Weekday;
  start: string;
  end: string;
  room: string;
}

/** A class as its people know it, at one moment of an operation. */
export interface ClassSnapshot {
  id: string;
  group: { id: string; name: string };
  branch: { id: string; name: string };
  status: RecordStatus;
  supervisorId: string;
  assistantIds: string[];
  /** Every weekly slot it takes part in (hosted, or as an additional class) */
  slots: Map<string, SlotSnapshot>;
}
export type ClassSnapshots = Map<string, ClassSnapshot>;

const slotSelect = {
  id: true,
  dayOfWeek: true,
  startTime: true,
  endTime: true,
  room: { select: { name: true } },
} satisfies Prisma.WeeklyScheduleSelect;

const toSlot = (
  s: Prisma.WeeklyScheduleGetPayload<{ select: typeof slotSelect }>,
): SlotSnapshot => ({
  day: s.dayOfWeek,
  start: fromDbTime(s.startTime),
  end: fromDbTime(s.endTime),
  room: s.room.name,
});

/** The classes (present ones) as they are now, read in the operation's transaction. */
export async function snapshotClasses(
  tx: Tx,
  classIds: Iterable<string>,
): Promise<ClassSnapshots> {
  const ids = [...new Set(classIds)];
  const rows = ids.length
    ? await tx.groupClass.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          status: true,
          supervisorId: true,
          group: { select: { id: true, name: true } },
          branch: { select: { id: true, name: true } },
          assistants: { select: { teacherId: true } },
          schedules: { select: slotSelect },
          sharedSchedules: {
            select: { weeklySchedule: { select: slotSelect } },
          },
        },
      })
    : [];
  return new Map(
    rows.map((c) => [
      c.id,
      {
        id: c.id,
        group: c.group,
        branch: c.branch,
        status: c.status,
        supervisorId: c.supervisorId,
        assistantIds: c.assistants.map((a) => a.teacherId),
        slots: new Map([
          ...c.schedules.map((s) => [s.id, toSlot(s)] as const),
          ...c.sharedSchedules.map(
            (x) => [x.weeklySchedule.id, toSlot(x.weeklySchedule)] as const,
          ),
        ]),
      },
    ]),
  );
}

/**
 * The classes one operation on `classId` can touch: the class and every class
 * sharing one of its hosted slots (plus `extra`, e.g. a slot's new participants).
 */
export async function classesConcerned(
  tx: Tx,
  classId: string,
  extra: Iterable<string> = [],
): Promise<string[]> {
  const shared = await tx.weeklyScheduleClass.findMany({
    where: { weeklySchedule: { groupClassId: classId } },
    select: { groupClassId: true },
  });
  return [
    ...new Set([classId, ...shared.map((s) => s.groupClassId), ...extra]),
  ];
}

/* ───────────────────────────── recipients ───────────────────────────── */

const teacherAccount = {
  id: true,
  status: true,
  person: {
    select: {
      firstName: true,
      lastName: true,
      user: { select: { id: true, isActive: true } },
    },
  },
} satisfies Prisma.TeacherSelect;

/** Teachers by id: their name, and their active account (null: no account, inactive). */
async function teachersById(tx: Tx, ids: Iterable<string>) {
  const list = [...new Set(ids)];
  const rows = list.length
    ? await tx.teacher.findMany({
        where: { id: { in: list } },
        select: teacherAccount,
      })
    : [];
  return new Map(
    rows.map((t) => [
      t.id,
      {
        name: `${t.person.firstName} ${t.person.lastName}`.trim(),
        userId:
          t.status === ActivationStatus.ACTIVE && t.person.user?.isActive
            ? t.person.user.id
            : null,
      },
    ]),
  );
}

/** Active student accounts of these classes (current members). */
async function studentAccountsOf(tx: Tx, classIds: string[]) {
  if (!classIds.length) return new Map<string, string>();
  const rows = await tx.student.findMany({
    where: {
      groupClassId: { in: classIds },
      status: 'ACTIVE',
      person: { user: { isActive: true } },
    },
    select: {
      groupClassId: true,
      person: { select: { user: { select: { id: true } } } },
    },
  });
  // account → its class
  return new Map(rows.map((r) => [r.person.user!.id, r.groupClassId!]));
}

/** Other active admin accounts. */
async function adminAccounts(tx: Tx, actorUserId?: string) {
  const rows = await tx.user.findMany({
    where: {
      isActive: true,
      roles: { some: { role: 'ADMIN' } },
      ...(actorUserId ? { id: { not: actorUserId } } : {}),
    },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

/* ───────────────────────────── wording ───────────────────────────── */

type Forms = {
  male: (who: string) => string;
  female: (who: string) => string;
  passive: (by: string) => string;
};

/** The lead of a sentence: who did it (or nobody named, for an automated path). */
const lead = (
  actor: NotificationActor | null,
  forms: Forms,
  capacity: ActorCapacity = 'ADMIN',
) =>
  actor ? actorSentence(actor, capacity, forms) : forms.passive('').trimEnd();

const slotAr = (s: SlotSnapshot) =>
  `${DAY_AR[s.day]} من ${s.start} إلى ${s.end} (${s.room})`;
const sameSlot = (a: SlotSnapshot, b: SlotSnapshot) =>
  a.day === b.day &&
  a.start === b.start &&
  a.end === b.end &&
  a.room === b.room;

/** «موعد جديد: …»: what changed in the weekly slots of one class. */
export function slotLines(
  before: ClassSnapshot | undefined,
  after: ClassSnapshot | undefined,
) {
  const was = before?.slots ?? new Map<string, SlotSnapshot>();
  const now = after?.slots ?? new Map<string, SlotSnapshot>();
  const lines: string[] = [];
  for (const [id, s] of now)
    if (!was.has(id)) lines.push(`موعد جديد: ${slotAr(s)}`);
  for (const [id, s] of now) {
    const old = was.get(id);
    if (old && !sameSlot(old, s))
      lines.push(`تغيّر موعد: من ${slotAr(old)} إلى ${slotAr(s)}`);
  }
  for (const [id, s] of was)
    if (!now.has(id)) lines.push(`موعد محذوف: ${slotAr(s)}`);
  return lines;
}

/** Branch, status, group: what admins and the class's teachers are told. */
export function structureLines(
  before: ClassSnapshot | undefined,
  after: ClassSnapshot,
) {
  if (!before) return [];
  const lines: string[] = [];
  if (before.group.id !== after.group.id)
    lines.push(`المجموعة: من ${before.group.name} إلى ${after.group.name}`);
  if (before.branch.id !== after.branch.id)
    lines.push(`الفرع: من ${before.branch.name} إلى ${after.branch.name}`);
  if (before.status !== after.status)
    lines.push(
      `الحالة: من ${CLASS_STATUS_AR[before.status]} إلى ${CLASS_STATUS_AR[after.status]}`,
    );
  return lines;
}

type Lead =
  | 'CREATED'
  | 'CREATED_SUPERVISOR'
  | 'CREATED_ASSISTANT'
  | 'ASSIGNED_SUPERVISOR'
  | 'ASSIGNED_ASSISTANT'
  | 'REMOVED_SUPERVISOR'
  | 'REMOVED_ASSISTANT'
  | 'CHANGED'
  | 'SCHEDULE';

const TITLES: Record<Lead, string> = {
  CREATED: 'قسم جديد',
  CREATED_SUPERVISOR: 'تكليف جديد',
  CREATED_ASSISTANT: 'تكليف جديد',
  ASSIGNED_SUPERVISOR: 'تكليف جديد',
  ASSIGNED_ASSISTANT: 'تكليف جديد',
  REMOVED_SUPERVISOR: 'إنهاء تكليف',
  REMOVED_ASSISTANT: 'إنهاء تكليف',
  CHANGED: 'تعديل على القسم',
  SCHEDULE: 'تعديل المواعيد',
};

/** The opening sentence for one person, agreeing with the actor's gender. */
export function classLead(
  kind: Lead,
  actor: NotificationActor | null,
  c: string,
) {
  const forms: Record<Lead, Forms> = {
    CREATED: {
      male: (w) => `أنشأ ${w} قسم ${c}`,
      female: (w) => `أنشأت ${w} قسم ${c}`,
      passive: (by) => `أُنشئ قسم ${c} ${by}`,
    },
    CREATED_SUPERVISOR: {
      male: (w) => `أنشأ ${w} قسم ${c} وعيّنك مشرفًا عليه`,
      female: (w) => `أنشأت ${w} قسم ${c} وعيّنتك مشرفًا عليه`,
      passive: (by) => `أُنشئ قسم ${c} ${by} وعُيّنت مشرفًا عليه`,
    },
    CREATED_ASSISTANT: {
      male: (w) => `أنشأ ${w} قسم ${c} وأضافك معلمًا مساعدًا فيه`,
      female: (w) => `أنشأت ${w} قسم ${c} وأضافتك معلمًا مساعدًا فيه`,
      passive: (by) => `أُنشئ قسم ${c} ${by} وأُضفت معلمًا مساعدًا فيه`,
    },
    ASSIGNED_SUPERVISOR: {
      male: (w) => `عيّنك ${w} مشرفًا على قسم ${c}`,
      female: (w) => `عيّنتك ${w} مشرفًا على قسم ${c}`,
      passive: (by) => `عُيّنت مشرفًا على قسم ${c} ${by}`,
    },
    ASSIGNED_ASSISTANT: {
      male: (w) => `أضافك ${w} معلمًا مساعدًا في قسم ${c}`,
      female: (w) => `أضافتك ${w} معلمًا مساعدًا في قسم ${c}`,
      passive: (by) => `أُضفت معلمًا مساعدًا في قسم ${c} ${by}`,
    },
    REMOVED_SUPERVISOR: {
      male: (w) => `أعفاك ${w} من الإشراف على قسم ${c}`,
      female: (w) => `أعفتك ${w} من الإشراف على قسم ${c}`,
      passive: (by) => `أُعفيت من الإشراف على قسم ${c} ${by}`,
    },
    REMOVED_ASSISTANT: {
      male: (w) => `أزالك ${w} من فريق قسم ${c}`,
      female: (w) => `أزالتك ${w} من فريق قسم ${c}`,
      passive: (by) => `أُزلت من فريق قسم ${c} ${by}`,
    },
    CHANGED: {
      male: (w) => `عدّل ${w} قسم ${c}`,
      female: (w) => `عدّلت ${w} قسم ${c}`,
      passive: (by) => `عُدّل قسم ${c} ${by}`,
    },
    SCHEDULE: {
      male: (w) => `عدّل ${w} مواعيد قسم ${c}`,
      female: (w) => `عدّلت ${w} مواعيد قسم ${c}`,
      passive: (by) => `عُدّلت مواعيد قسم ${c} ${by}`,
    },
  };
  return lead(actor, forms[kind]);
}

const sentence = (head: string, lines: string[]) =>
  `${head}${lines.length ? `: ${lines.join('؛ ')}` : ''}.`;

/* ───────────────────────────── classes ───────────────────────────── */

interface Pending {
  title: string;
  message: string;
  entityId: string;
}

/**
 * One operation's notifications about classes: `before` / `after` hold the
 * classes it touched (a class missing from `before` was created by it).
 */
export async function notifyClassChanges(
  tx: Tx,
  input: {
    actorUserId?: string;
    before: ClassSnapshots;
    after: ClassSnapshots;
  },
) {
  const { before, after, actorUserId } = input;
  const teamIds = new Set<string>();
  for (const c of [...before.values(), ...after.values()])
    for (const t of [c.supervisorId, ...c.assistantIds]) teamIds.add(t);
  const teachers = await teachersById(tx, teamIds);
  const actor = actorUserId ? await loadActor(tx, actorUserId) : null;
  const out = new Map<string, Pending>();
  const covered = new Map<string, Set<string>>();
  /**
   * One per person: their first message about a class wins (a teacher's,
   * written first, over the admins' one for an admin who also teaches it);
   * another class of the same operation is added to it.
   */
  const add = (
    userId: string | null | undefined,
    classId: string,
    n: Pending,
    more: string,
  ) => {
    if (!userId || userId === actorUserId) return;
    const classes = covered.get(userId) ?? new Set<string>();
    if (classes.has(classId)) return;
    covered.set(userId, classes.add(classId));
    const had = out.get(userId);
    if (!had) out.set(userId, n);
    else had.message = `${had.message.slice(0, -1)}؛ ${more}.`;
  };
  const nameOf = (id: string) => teachers.get(id)?.name ?? '—';

  for (const [id, now] of after) {
    const was = before.get(id);
    const name = classNameAr({
      group: now.group.name,
      branch: now.branch.name,
    });
    const structure = structureLines(was, now);
    const slots = slotLines(was, now);
    const created = !was;

    // The class's teachers, before and after
    const wasTeam = was ? [was.supervisorId, ...was.assistantIds] : [];
    for (const t of new Set([
      ...wasTeam,
      now.supervisorId,
      ...now.assistantIds,
    ])) {
      const supervisorNow = now.supervisorId === t;
      const assistantNow = now.assistantIds.includes(t);
      const supervisorBefore = was?.supervisorId === t;
      const assistantBefore = was?.assistantIds.includes(t) ?? false;
      let kind: Lead;
      const lines: string[] = [];
      // The supervisor is told who joins or leaves the team
      const team: string[] = [];
      if (supervisorNow && was) {
        for (const a of now.assistantIds)
          if (!was.assistantIds.includes(a) && a !== was.supervisorId)
            team.push(`معلم مساعد جديد: ${nameOf(a)}`);
        for (const a of was.assistantIds)
          if (!now.assistantIds.includes(a) && a !== now.supervisorId)
            team.push(`لم يعد معلمًا مساعدًا: ${nameOf(a)}`);
      }
      if (created)
        kind = supervisorNow ? 'CREATED_SUPERVISOR' : 'CREATED_ASSISTANT';
      else if (supervisorNow && !supervisorBefore) kind = 'ASSIGNED_SUPERVISOR';
      else if (assistantNow && !assistantBefore && !supervisorBefore)
        kind = 'ASSIGNED_ASSISTANT';
      // A supervisor made an assistant is told they no longer supervise it
      else if (supervisorBefore && !supervisorNow) kind = 'REMOVED_SUPERVISOR';
      else if (assistantBefore && !assistantNow && !supervisorNow)
        kind = 'REMOVED_ASSISTANT';
      // Only the weekly slots changed: «… مواعيد قسم …»; anything more: «… قسم …»
      else
        kind =
          slots.length && !structure.length && !team.length
            ? 'SCHEDULE'
            : 'CHANGED';
      const removed =
        kind === 'REMOVED_SUPERVISOR' || kind === 'REMOVED_ASSISTANT';
      if (kind === 'REMOVED_SUPERVISOR' && assistantNow)
        lines.push('تبقى معلمًا مساعدًا فيه');
      if (!removed) {
        lines.push(...structure, ...team, ...slots);
      }
      if (!removed && !created && kind === 'CHANGED' && !lines.length) continue;
      if (kind === 'SCHEDULE' && !lines.length) continue;
      add(
        teachers.get(t)?.userId,
        id,
        {
          title: TITLES[kind],
          message: sentence(classLead(kind, actor, name), lines),
          entityId: id,
        },
        lines.length ? `وفي قسم ${name}: ${lines.join('؛ ')}` : `وقسم ${name}`,
      );
    }

    // Other admins: a created class, its branch, status or group
    if (created || structure.length)
      for (const userId of await adminAccounts(tx, actorUserId)) {
        const head = classLead(created ? 'CREATED' : 'CHANGED', actor, name);
        add(
          userId,
          id,
          {
            title: TITLES[created ? 'CREATED' : 'CHANGED'],
            message: sentence(head, structure),
            entityId: id,
          },
          `وفي قسم ${name}: ${structure.join('؛ ')}`,
        );
      }

    // Its students: only what changes in their weekly slots
    if (slots.length && was) {
      for (const [userId] of await studentAccountsOf(tx, [id]))
        add(
          userId,
          id,
          {
            title: TITLES.SCHEDULE,
            message: sentence(classLead('SCHEDULE', actor, name), slots),
            entityId: id,
          },
          `وفي قسم ${name}: ${slots.join('؛ ')}`,
        );
    }
  }
  await write(
    tx,
    out,
    NotificationType.CLASS_CHANGED,
    NotificationEntity.GROUP_CLASS,
    actor,
  );
}

async function write(
  tx: Tx,
  out: Map<string, Pending>,
  type: NotificationType,
  entityType: NotificationEntity,
  actor: NotificationActor | null,
  sessionId?: string,
) {
  if (!out.size) return;
  await tx.notification.createMany({
    data: [...out].map(([userId, n]) => ({
      userId,
      type,
      title: n.title,
      message: n.message,
      entityType,
      entityId: n.entityId,
      ...(sessionId ? { sessionId } : {}),
      actorUserId: actor?.userId ?? null,
    })),
  });
}

/* ───────────────────────────── groups ───────────────────────────── */

export interface GroupSnapshot {
  id: string;
  name: string;
  audience: string | null;
  status: RecordStatus;
}

/**
 * A group created (other admins), or renamed / re-described / (de)activated
 * (other admins and the teachers of its classes).
 */
export async function notifyGroupChange(
  tx: Tx,
  input: {
    actorUserId?: string;
    before: GroupSnapshot | null;
    after: GroupSnapshot;
  },
) {
  const { before, after, actorUserId } = input;
  const lines: string[] = [];
  if (before) {
    if (before.name !== after.name)
      lines.push(`الاسم: من ${before.name} إلى ${after.name}`);
    if ((before.audience ?? '') !== (after.audience ?? ''))
      lines.push(
        `الفئة المستهدفة: ${after.audience ? `«${after.audience}»` : 'بلا تحديد'}`,
      );
    if (before.status !== after.status)
      lines.push(
        `الحالة: من ${GROUP_STATUS_AR[before.status]} إلى ${GROUP_STATUS_AR[after.status]}`,
      );
    if (!lines.length) return;
  }
  const actor = actorUserId ? await loadActor(tx, actorUserId) : null;
  const g = `مجموعة ${after.name}`;
  const head = before
    ? lead(actor, {
        male: (w) => `عدّل ${w} ${g}`,
        female: (w) => `عدّلت ${w} ${g}`,
        passive: (by) => `عُدّلت ${g} ${by}`,
      })
    : lead(actor, {
        male: (w) => `أنشأ ${w} ${g}`,
        female: (w) => `أنشأت ${w} ${g}`,
        passive: (by) => `أُنشئت ${g} ${by}`,
      });
  const recipients = new Set(await adminAccounts(tx, actorUserId));
  if (before) {
    const classes = await tx.groupClass.findMany({
      where: { groupId: after.id },
      select: {
        supervisorId: true,
        assistants: { select: { teacherId: true } },
      },
    });
    const teachers = await teachersById(
      tx,
      classes.flatMap((c) => [
        c.supervisorId,
        ...c.assistants.map((a) => a.teacherId),
      ]),
    );
    for (const t of teachers.values())
      if (t.userId && t.userId !== actorUserId) recipients.add(t.userId);
  }
  const out = new Map<string, Pending>(
    [...recipients].map((userId) => [
      userId,
      {
        title: before ? 'تعديل على المجموعة' : 'مجموعة جديدة',
        message: sentence(head, lines),
        entityId: after.id,
      },
    ]),
  );
  await write(
    tx,
    out,
    NotificationType.GROUP_CHANGED,
    NotificationEntity.GROUP,
    actor,
  );
}

/* ───────────────────────────── lessons ───────────────────────────── */

export interface SessionSnapshot {
  id: string;
  date: string;
  start: string;
  end: string;
  room: string;
  status: string;
  classIds: string[];
  classes: { group: string; branch: string }[];
  teacherIds: string[];
}

/** A lesson as its people know it (its team snapshot, its classes). */
export async function snapshotSession(
  tx: Tx,
  id: string,
): Promise<SessionSnapshot> {
  const s = await tx.session.findUniqueOrThrow({
    where: { id },
    select: {
      id: true,
      date: true,
      startTime: true,
      endTime: true,
      status: true,
      room: { select: { name: true } },
      teachers: { select: { teacherId: true } },
      groupClass: {
        select: {
          id: true,
          group: { select: { name: true } },
          branch: { select: { name: true } },
        },
      },
      extraClasses: {
        select: {
          groupClass: {
            select: {
              id: true,
              group: { select: { name: true } },
              branch: { select: { name: true } },
            },
          },
        },
      },
    },
  });
  const classes = [s.groupClass, ...s.extraClasses.map((e) => e.groupClass)];
  return {
    id: s.id,
    date: fromDbDate(s.date),
    start: fromDbTime(s.startTime),
    end: fromDbTime(s.endTime),
    room: s.room.name,
    status: s.status,
    classIds: classes.map((c) => c.id),
    classes: classes.map((c) => ({
      group: c.group.name,
      branch: c.branch.name,
    })),
    teacherIds: s.teachers.map((t) => t.teacherId),
  };
}

/** What happened to an upcoming lesson. */
export type SessionEvent =
  'ADDED' | 'RESCHEDULED' | 'CANCELLED' | 'RESTORED' | 'DELETED';

export function sessionMessage(
  event: SessionEvent,
  actor: NotificationActor | null,
  before: SessionSnapshot | null,
  after: SessionSnapshot,
  reason?: string | null,
  capacity: ActorCapacity = 'ADMIN',
) {
  const c = sessionClassesAr(after.classes);
  const when = (s: SessionSnapshot) =>
    `${sessionWhenAr(s.date, s.start, s.end)} (${s.room})`;
  const by = (forms: Forms) => lead(actor, forms, capacity);
  switch (event) {
    case 'ADDED':
      return `${by({
        male: (w) => `أضاف ${w} حصة إضافية لقسم ${c}`,
        female: (w) => `أضافت ${w} حصة إضافية لقسم ${c}`,
        passive: (by) => `أُضيفت حصة إضافية لقسم ${c} ${by}`,
      })}: ${when(after)}.`;
    case 'RESCHEDULED':
      return `${by({
        male: (w) => `غيّر ${w} موعد حصة قسم ${c}`,
        female: (w) => `غيّرت ${w} موعد حصة قسم ${c}`,
        passive: (by) => `تغيّر موعد حصة قسم ${c} ${by}`,
      })}: من ${when(before!)} إلى ${when(after)}.`;
    case 'CANCELLED':
      return `${by({
        male: (w) => `ألغى ${w} حصة قسم ${c}`,
        female: (w) => `ألغت ${w} حصة قسم ${c}`,
        passive: (by) => `أُلغيت حصة قسم ${c} ${by}`,
      })}: ${when(after)}${reason ? `، السبب: ${reason}` : ''}.`;
    case 'RESTORED':
      return `${by({
        male: (w) => `أعاد ${w} برمجة حصة قسم ${c}`,
        female: (w) => `أعادت ${w} برمجة حصة قسم ${c}`,
        passive: (by) => `أُعيدت برمجة حصة قسم ${c} ${by}`,
      })}: ${when(after)}.`;
    case 'DELETED':
      return `${by({
        male: (w) => `حذف ${w} الحصة الإضافية لقسم ${c} المبرمجة`,
        female: (w) => `حذفت ${w} الحصة الإضافية لقسم ${c} المبرمجة`,
        passive: (by) => `حُذفت الحصة الإضافية لقسم ${c} المبرمجة ${by}`,
      })}: ${when(after)}.`;
  }
}

const SESSION_TITLES: Record<SessionEvent, string> = {
  ADDED: 'حصة إضافية',
  RESCHEDULED: 'تغيير موعد حصة',
  CANCELLED: 'إلغاء حصة',
  RESTORED: 'إعادة برمجة حصة',
  DELETED: 'تم حذف حصة إضافية',
};

/**
 * An UPCOMING lesson changed by hand: its teachers (team before and after)
 * and the students of its classes (before and after). A lesson entirely in
 * the past (before and after) notifies nobody; generated lessons never reach here.
 *
 * A SUPERVISOR TEACHER acting from the teacher workspace (`capacity:
 * 'TEACHER'`) is named as a teacher, and the active admins are told too
 * (`notifyAdmins`) — once each, an admin who also teaches the lesson
 * included, never the teacher who did it.
 *
 * DELETED (a lesson removed from the database): the recipients are the
 * accounts that were told about this lesson before (its earlier
 * notifications) — nobody else; the notification carries the lesson as its
 * subject but no link (the row is gone), so it opens nothing.
 */
export async function notifySessionChange(
  tx: Tx,
  input: {
    actorUserId?: string;
    event: SessionEvent;
    before: SessionSnapshot | null;
    after: SessionSnapshot;
    today: string;
    reason?: string | null;
    capacity?: ActorCapacity;
    notifyAdmins?: boolean;
  },
) {
  const { before, after, actorUserId, today } = input;
  if (after.date < today && (!before || before.date < today)) return;
  const actor = actorUserId ? await loadActor(tx, actorUserId) : null;
  const recipients = new Set<string>();
  if (input.event === 'DELETED') {
    // Told before: the earlier notifications about this lesson (any type)
    const told = await tx.notification.findMany({
      where: {
        entityType: NotificationEntity.SESSION,
        entityId: after.id,
        user: { isActive: true },
      },
      select: { userId: true },
      distinct: ['userId'],
    });
    for (const n of told) recipients.add(n.userId);
  } else {
    const teachers = await teachersById(tx, [
      ...(before?.teacherIds ?? []),
      ...after.teacherIds,
    ]);
    const students = await studentAccountsOf(tx, [
      ...new Set([...(before?.classIds ?? []), ...after.classIds]),
    ]);
    for (const t of teachers.values()) if (t.userId) recipients.add(t.userId);
    for (const userId of students.keys()) recipients.add(userId);
  }
  if (input.notifyAdmins)
    for (const userId of await adminAccounts(tx, actorUserId))
      recipients.add(userId);
  if (actorUserId) recipients.delete(actorUserId);
  const message = sessionMessage(
    input.event,
    actor,
    before,
    after,
    input.reason,
    input.capacity,
  );
  const out = new Map<string, Pending>(
    [...recipients].map((userId) => [
      userId,
      { title: SESSION_TITLES[input.event], message, entityId: after.id },
    ]),
  );
  await write(
    tx,
    out,
    NotificationType.SESSION_CHANGED,
    NotificationEntity.SESSION,
    actor,
    // A deleted lesson: its subject only, never a link to the removed row
    input.event === 'DELETED' ? undefined : after.id,
  );
}
