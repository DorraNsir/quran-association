import { randomUUID } from 'node:crypto';

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';

import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { PasswordService } from '../src/auth/password.service.js';
import { todayIn } from '../src/common/dates.js';
import { Role } from '../src/generated/prisma/enums.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { onlyId } from './cleanup-ids.js';

const RUN = randomUUID().slice(0, 8);
const PASSWORD = 'initial-pass-123';
const tag = (s: string) => `${s} ${RUN}`;
const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const TODAY = todayIn('Africa/Tunis');
const YEAR_START = addDays(TODAY, -35);
const YEAR_END = addDays(TODAY, 34);
const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;
const weekdayOf = (d: string) =>
  WEEKDAYS[new Date(`${d}T00:00:00Z`).getUTCDay()];
/** Its past dates: TODAY-3, -10, -17, -24, -31 */
const DAY = weekdayOf(addDays(TODAY, -3));
const ago = (...n: number[]) => n.map((d) => addDays(TODAY, -d));
const day = (d: Date) => d.toISOString().slice(0, 10);
const dbDate = (d: string) => new Date(`${d}T00:00:00Z`);
const dbTime = (t: string) => new Date(`1970-01-01T${t}:00Z`);

/**
 * «تاريخ بداية الحصص» of an EXISTING weekly slot. Earlier: only the missing
 * lessons of that slot before its previous start are created (pending);
 * existing lessons and their attendance are never touched. Later: refused
 * while real lessons of the slot exist before the new date. One slot at a
 * time — other slots, legacy ones included, are never changed.
 */
describe('Editing a weekly slot start date (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let admin = '';
  let previousCurrent: string | null = null;
  const id: Record<string, string> = {};

  const http = () => request(app.getHttpServer());
  const as = () => ({ Authorization: `Bearer ${admin}` });
  const post = (path: string, body: object = {}) =>
    http().post(`/api/admin/${path}`).set(as()).send(body);
  const patch = (path: string, body: object) =>
    http().patch(`/api/admin/${path}`).set(as()).send(body);
  const slot = (
    cls: string,
    start: string,
    end: string,
    extra: Record<string, unknown> = {},
  ) =>
    post(`group-classes/${id[cls]}/schedules`, {
      dayOfWeek: DAY,
      startTime: start,
      endTime: end,
      roomId: id.room,
      ...extra,
    });
  const edit = (slotId: string, body: object) =>
    patch(`group-classes/${id.A}/schedules/${slotId}`, body);
  const sessionsOfSlot = async (weeklyScheduleId: string) =>
    (
      await prisma.session.findMany({
        where: { weeklyScheduleId },
        orderBy: { date: 'asc' },
        select: {
          id: true,
          date: true,
          status: true,
          updatedAt: true,
          extraClasses: { select: { groupClassId: true } },
          studentAttendance: { select: { id: true, status: true } },
        },
      })
    ).map((s) => ({ ...s, date: day(s.date) }));
  const datesOfSlot = async (slotId: string) =>
    (await sessionsOfSlot(slotId)).map((s) => s.date);
  const storedStart = async (slotId: string) => {
    const s = await prisma.weeklySchedule.findUniqueOrThrow({
      where: { id: slotId },
      select: { startDate: true },
    });
    return s.startDate ? day(s.startDate) : null;
  };
  /** A slot as before «تاريخ بداية الحصص» existed: no stored date, created on `created`. */
  const makeLegacy = (slotId: string, created: string) =>
    prisma.weeklySchedule.update({
      where: { id: slotId },
      data: { startDate: null, createdAt: new Date(`${created}T10:00:00Z`) },
    });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    await prisma.person.create({
      data: {
        firstName: 'admin',
        lastName: tag('حساب'),
        user: {
          create: {
            username: `e2e-${RUN}-admin`,
            passwordHash: await new PasswordService().hash(PASSWORD),
            mustChangePassword: false,
            roles: { create: [{ role: Role.ADMIN }] },
          },
        },
      },
    });
    admin = (
      await http()
        .post('/api/auth/login')
        .send({ username: `e2e-${RUN}-admin`, password: PASSWORD })
        .expect(200)
    ).body.accessToken;

    id.branch = (
      await post('branches', { name: tag('فرع'), address: 'نابل' }).expect(201)
    ).body.id;
    id.room = (
      await post('rooms', { branchId: id.branch, name: tag('قاعة') }).expect(
        201,
      )
    ).body.id;
    const teacher = async (name: string) =>
      (
        await post('teachers', {
          person: {
            firstName: 'T',
            lastName: tag(name),
            gender: 'MALE',
            phone: '22345678',
          },
          joinedAt: '2024-09-01',
        }).expect(201)
      ).body.id as string;
    id.T = await teacher('مشرف');
    id.T2 = await teacher('مشرف آخر');
    for (const [key, name, supervisor] of [
      ['A', 'أركان', id.T],
      ['B', 'الماهر', id.T],
      ['C', 'أخرى', id.T2],
    ]) {
      const groupId = (await post('groups', { name: tag(name) }).expect(201))
        .body.id;
      id[key] = (
        await post('group-classes', {
          groupId,
          branchId: id.branch,
          supervisorId: supervisor,
        }).expect(201)
      ).body.id;
    }
    for (const [key, cls] of [
      ['a1', 'A'],
      ['b1', 'B'],
    ])
      id[key] = (
        await post('students', {
          person: {
            firstName: key,
            lastName: tag('طالب'),
            gender: 'MALE',
            dateOfBirth: '2014-05-01',
            address: 'نابل',
          },
          groupClassId: id[cls],
          registrationDate: YEAR_START,
          guardianPhone: '98765432',
        }).expect(201)
      ).body.id;

    previousCurrent =
      (
        await prisma.academicYear.findFirst({
          where: { isCurrent: true },
          select: { id: true },
        })
      )?.id ?? null;
    if (previousCurrent)
      await prisma.academicYear.update({
        where: { id: previousCurrent },
        data: { isCurrent: false },
      });
    id.year = (
      await prisma.academicYear.create({
        data: {
          label: tag('سنة'),
          startDate: dbDate(YEAR_START),
          endDate: dbDate(YEAR_END),
          semester2StartDate: dbDate(addDays(TODAY, 14)),
          isCurrent: true,
        },
        select: { id: true },
      })
    ).id;
  });

  afterAll(async () => {
    const classes = { group: { name: { endsWith: RUN } } };
    const ofClasses = { session: { groupClass: classes } };
    await prisma.workProgram.deleteMany({ where: ofClasses });
    await prisma.teacherAttendance.deleteMany({ where: ofClasses });
    await prisma.studentAttendance.deleteMany({ where: ofClasses });
    await prisma.session.deleteMany({ where: { groupClass: classes } });
    await prisma.weeklySchedule.deleteMany({ where: { groupClass: classes } });
    const students = { person: { lastName: { endsWith: RUN } } };
    await prisma.paymentObligation.deleteMany({ where: { student: students } });
    await prisma.studentEnrollment.deleteMany({ where: { student: students } });
    await prisma.studentStatusChange.deleteMany({
      where: { student: students },
    });
    await prisma.student.deleteMany({ where: students });
    await prisma.groupClass.deleteMany({ where: classes });
    await prisma.academicYear.deleteMany({ where: onlyId(id.year) });
    if (previousCurrent)
      await prisma.academicYear.update({
        where: { id: previousCurrent },
        data: { isCurrent: true },
      });
    const persons = (
      await prisma.person.findMany({
        where: { lastName: { endsWith: RUN } },
        select: { id: true },
      })
    ).map((p) => p.id);
    await prisma.teacher.deleteMany({ where: { personId: { in: persons } } });
    await prisma.user.deleteMany({ where: { personId: { in: persons } } });
    await prisma.person.deleteMany({ where: { id: { in: persons } } });
    await prisma.room.deleteMany({
      where: { branch: { name: { endsWith: RUN } } },
    });
    await prisma.branch.deleteMany({ where: { name: { endsWith: RUN } } });
    await prisma.group.deleteMany({ where: { name: { endsWith: RUN } } });
    await app.close();
  });

  it('earlier: only the missing lessons are created; completed and cancelled ones untouched', async () => {
    id.s1 = (
      await slot('A', '08:00', '09:00', { startDate: ago(17)[0] }).expect(201)
    ).body.id;
    const [l17, l10, l3] = await sessionsOfSlot(id.s1);
    // 10 days ago: attended (completed); 3 days ago: cancelled
    await http()
      .put(`/api/admin/sessions/${l10.id}/attendance`)
      .set(as())
      .send({ records: [{ studentId: id.a1, status: 'PRESENT' }] })
      .expect(200);
    await patch(`sessions/${l3.id}/status`, {
      status: 'CANCELLED',
      cancellationReason: 'عطلة',
    }).expect(200);
    const before = await sessionsOfSlot(id.s1);
    expect(before.find((s) => s.id === l10.id)!.status).toBe('COMPLETED');

    const res = await edit(id.s1, { startDate: YEAR_START }).expect(200);
    expect(res.body).toMatchObject({
      startDate: YEAR_START,
      startDateSet: true,
    });
    expect(res.body.generation).toMatchObject({
      created: 2,
      skippedConflicts: [],
    });
    const after = await sessionsOfSlot(id.s1);
    expect(after.slice(0, 5).map((s) => s.date)).toEqual(
      ago(31, 24, 17, 10, 3),
    );
    // New ones pending; every existing lesson exactly as it was
    expect(after.slice(0, 2).every((s) => s.status === 'SCHEDULED')).toBe(true);
    for (const old of before)
      expect(after.find((s) => s.id === old.id)).toEqual(old);
    expect(after.find((s) => s.id === l10.id)!.studentAttendance).toHaveLength(
      1,
    );
    expect(after.find((s) => s.id === l3.id)!.status).toBe('CANCELLED');
    expect(l17.status).toBe('SCHEDULED');
  });

  it('the same date again, or an edit without it: nothing generated, no duplicate', async () => {
    const before = await datesOfSlot(id.s1);
    const same = await edit(id.s1, { startDate: YEAR_START }).expect(200);
    expect(same.body.generation).toBeNull();
    // Unrelated edit (the time): the start date stays, no past lesson is planned
    await edit(id.s1, { startTime: '08:15', endTime: '09:15' }).expect(200);
    expect(await storedStart(id.s1)).toBe(YEAR_START);
    expect(await datesOfSlot(id.s1)).toEqual(before);
    // Still one lesson per date
    const dates = await datesOfSlot(id.s1);
    expect(new Set(dates).size).toBe(dates.length);
  });

  it('later: refused while lessons exist before it — nothing in the request is applied', async () => {
    const before = await sessionsOfSlot(id.s1);
    const res = await edit(id.s1, {
      startDate: addDays(YEAR_START, 10),
      startTime: '08:30',
      endTime: '09:30',
    }).expect(409);
    expect(res.body.code).toBe('SCHEDULE_START_HAS_SESSIONS');
    // The lesson before it is unused, but its removal was not confirmed
    expect(res.body.message).toMatch(/يجب تأكيد حذفها/);
    expect(res.body.sessions.map((l: { date: string }) => l.date)).toEqual(
      ago(31),
    );
    expect(await storedStart(id.s1)).toBe(YEAR_START);
    const s = await prisma.weeklySchedule.findUniqueOrThrow({
      where: { id: id.s1 },
      select: { startTime: true },
    });
    expect(s.startTime).toEqual(dbTime('08:15'));
    expect(await sessionsOfSlot(id.s1)).toEqual(before);
  });

  it('later with no lesson before it: allowed, lessons unchanged', async () => {
    // First lesson TODAY+25 (start TODAY+20)
    id.s2 = (
      await slot('A', '10:00', '11:00', {
        startDate: addDays(TODAY, 20),
      }).expect(201)
    ).body.id;
    const before = await sessionsOfSlot(id.s2);
    const res = await edit(id.s2, { startDate: addDays(TODAY, 22) }).expect(
      200,
    );
    expect(res.body.startDate).toBe(addDays(TODAY, 22));
    expect(res.body.generation).toBeNull();
    expect(await sessionsOfSlot(id.s2)).toEqual(before);
  });

  it('a date outside the current year is refused', async () => {
    for (const startDate of [addDays(YEAR_START, -1), addDays(YEAR_END, 1)])
      expect((await edit(id.s2, { startDate }).expect(400)).body.code).toBe(
        'SCHEDULE_START_OUTSIDE_YEAR',
      );
    expect(await storedStart(id.s2)).toBe(addDays(TODAY, 22));
  });

  it('a legacy slot (no stored date): set explicitly, from before its creation day; other legacy slots untouched', async () => {
    id.s3 = (
      await slot('A', '12:00', '13:00', { startDate: TODAY }).expect(201)
    ).body.id;
    id.s4 = (
      await slot('A', '13:00', '14:00', { startDate: TODAY }).expect(201)
    ).body.id;
    await makeLegacy(id.s3, addDays(TODAY, -5));
    await makeLegacy(id.s4, addDays(TODAY, -5));
    const listed = (
      await http()
        .get(`/api/admin/group-classes/${id.A}/schedules`)
        .set(as())
        .expect(200)
    ).body.find((s: { id: string }) => s.id === id.s3);
    expect(listed).toMatchObject({
      startDate: addDays(TODAY, -5),
      startDateSet: false,
    });
    const s4Before = await sessionsOfSlot(id.s4);
    const res = await edit(id.s3, { startDate: YEAR_START }).expect(200);
    // The missing lessons before its creation day (-31 … -10; -3 is after it)
    expect(res.body.generation.created).toBe(4);
    expect((await datesOfSlot(id.s3)).slice(0, 4)).toEqual(ago(31, 24, 17, 10));
    expect(await storedStart(id.s3)).toBe(YEAR_START);
    expect(await storedStart(id.s4)).toBeNull();
    expect(await sessionsOfSlot(id.s4)).toEqual(s4Before);
  });

  it('a legacy slot with real lessons before its creation day cannot move later than them', async () => {
    id.s5 = (await slot('A', '14:00', '15:00').expect(201)).body.id;
    // Lessons since the year's start, then marked legacy (created today)
    await makeLegacy(id.s5, TODAY);
    const res = await edit(id.s5, { startDate: addDays(TODAY, -1) }).expect(
      409,
    );
    expect(res.body.code).toBe('SCHEDULE_START_HAS_SESSIONS');
    expect(await storedStart(id.s5)).toBeNull();
  });

  it('a shared slot: one session per date for both classes; a past conflict is skipped and reported', async () => {
    id.s6 = (
      await slot('A', '16:00', '17:00', {
        startDate: ago(10)[0],
        additionalGroupClassIds: [id.B],
      }).expect(201)
    ).body.id;
    // Another class used the room 24 days ago
    await prisma.session.create({
      data: {
        groupClassId: id.C,
        roomId: id.room,
        date: dbDate(ago(24)[0]),
        startTime: dbTime('16:00'),
        endTime: dbTime('17:00'),
      },
    });
    const res = await edit(id.s6, { startDate: YEAR_START }).expect(200);
    expect(res.body.generation.created).toBe(2);
    expect(
      res.body.generation.skippedConflicts.map((c: { date: string }) => c.date),
    ).toEqual(ago(24));
    const rows = await sessionsOfSlot(id.s6);
    expect(rows.slice(0, 4).map((s) => s.date)).toEqual(ago(31, 17, 10, 3));
    expect(
      rows.every(
        (s) => s.extraClasses.map((c) => c.groupClassId).join() === id.B,
      ),
    ).toBe(true);
    expect(await prisma.session.count({ where: { groupClassId: id.B } })).toBe(
      0,
    );
    // The roster of a new past lesson: both classes' students
    const roster = (
      await http()
        .get(`/api/admin/sessions/${rows[0].id}/attendance`)
        .set(as())
        .expect(200)
    ).body;
    expect(roster.students).toHaveLength(2);
  });

  it('no current academic year: an earlier (past) date is refused; nothing changes', async () => {
    await prisma.academicYear.update({
      where: { id: id.year },
      data: { isCurrent: false },
    });
    try {
      const before = await datesOfSlot(id.s2);
      const res = await edit(id.s2, { startDate: ago(3)[0] }).expect(409);
      expect(res.body.code).toBe('SCHEDULE_START_NO_ACADEMIC_YEAR');
      expect(await storedStart(id.s2)).toBe(addDays(TODAY, 22));
      expect(await datesOfSlot(id.s2)).toEqual(before);
    } finally {
      await prisma.academicYear.update({
        where: { id: id.year },
        data: { isCurrent: true },
      });
    }
  });

  describe('a later start date: removing the unused lessons before it', () => {
    type Lesson = { id: string; date: string; reasons: string[] };
    const impact = async (slotId: string, startDate: string) =>
      (
        await http()
          .get(
            `/api/admin/group-classes/${id.A}/schedules/${slotId}/start-date-impact`,
          )
          .query({ startDate })
          .set(as())
          .expect(200)
      ).body as {
        startDate: string;
        previousStartDate: string;
        removable: Lesson[];
        protected: Lesson[];
      };
    /** Every session row of the slot, with its snapshots (to prove nothing else changed) */
    const rowsOf = (weeklyScheduleId: string) =>
      prisma.session.findMany({
        where: { weeklyScheduleId },
        orderBy: { date: 'asc' },
        include: { teachers: true, extraClasses: true },
      });
    const lessonOn = async (slotId: string, date: string) =>
      (await sessionsOfSlot(slotId)).find((s) => s.date === date)!;

    it('the preview lists the unused lessons; nothing is removed without the exact confirmation', async () => {
      id.p = (
        await slot('A', '18:00', '19:00', { startDate: YEAR_START }).expect(201)
      ).body.id;
      const others = await rowsOf(id.s2);
      const before = await rowsOf(id.p);
      const preview = await impact(id.p, addDays(TODAY, -12));
      expect(preview).toMatchObject({
        startDate: addDays(TODAY, -12),
        previousStartDate: YEAR_START,
        protected: [],
      });
      expect(preview.removable.map((l) => l.date)).toEqual(ago(31, 24, 17));
      const ids = preview.removable.map((l) => l.id);
      // Not confirmed
      const plain = await edit(id.p, { startDate: addDays(TODAY, -12) }).expect(
        409,
      );
      expect(plain.body.code).toBe('SCHEDULE_START_HAS_SESSIONS');
      // Stale: a missing id, an extra id
      for (const removeSessionIds of [
        ids.slice(0, 2),
        [...ids, randomUUID()],
      ]) {
        const stale = await edit(id.p, {
          startDate: addDays(TODAY, -12),
          removeSessionIds,
        }).expect(409);
        expect(stale.body.code).toBe('SCHEDULE_START_CONFIRMATION_STALE');
      }
      expect(await rowsOf(id.p)).toEqual(before);
      expect(await storedStart(id.p)).toBe(YEAR_START);
      expect(await rowsOf(id.s2)).toEqual(others);
    });

    it('confirmed: exactly the previewed lessons are removed, everything else untouched', async () => {
      const others = await rowsOf(id.s2);
      const before = await rowsOf(id.p);
      const preview = await impact(id.p, addDays(TODAY, -12));
      const res = await edit(id.p, {
        startDate: addDays(TODAY, -12),
        removeSessionIds: preview.removable.map((l) => l.id),
      }).expect(200);
      expect(res.body).toMatchObject({
        startDate: addDays(TODAY, -12),
        generation: null,
      });
      const after = await rowsOf(id.p);
      const removed = new Set(preview.removable.map((l) => l.id));
      expect(after).toEqual(before.filter((r) => !removed.has(r.id)));
      // No snapshot row left behind
      expect(
        await prisma.sessionTeacher.count({
          where: { sessionId: { in: [...removed] } },
        }),
      ).toBe(0);
      expect(await rowsOf(id.s2)).toEqual(others);
    });

    it('historical AND upcoming unused lessons; the calendar and the sessions list follow', async () => {
      const target = addDays(TODAY, 12);
      const preview = await impact(id.p, target);
      // -10, -3 (past) and +4, +11 (upcoming)
      expect(preview.removable.map((l) => l.date)).toEqual([
        ...ago(10, 3),
        addDays(TODAY, 4),
        addDays(TODAY, 11),
      ]);
      await edit(id.p, {
        startDate: target,
        removeSessionIds: preview.removable.map((l) => l.id),
      }).expect(200);
      expect((await datesOfSlot(id.p)).every((d) => d >= target)).toBe(true);
      const calendar = (
        await http()
          .get('/api/admin/sessions/calendar')
          .query({ from: YEAR_START, to: addDays(TODAY, 15) })
          .set(as())
          .expect(200)
      ).body as { weeklyScheduleId: string | null }[];
      expect(calendar.filter((s) => s.weeklyScheduleId === id.p)).toEqual([]);
      const listed = (
        await http()
          .get('/api/admin/sessions')
          .query({ groupClassId: id.A, to: addDays(TODAY, 11), pageSize: 100 })
          .set(as())
          .expect(200)
      ).body.data as { id: string }[];
      expect(
        listed.filter((s) => preview.removable.some((l) => l.id === s.id)),
      ).toEqual([]);
      const listedSlot = (
        await http()
          .get(`/api/admin/group-classes/${id.A}/schedules`)
          .set(as())
          .expect(200)
      ).body.find((s: { id: string }) => s.id === id.p);
      expect(listedSlot.startDate).toBe(target);
    });

    it('protected lessons (attendance, teacher attendance, work, cancelled, edited): the whole change is refused and rolled back', async () => {
      id.q = (
        await slot('A', '20:00', '21:00', { startDate: YEAR_START }).expect(201)
      ).body.id;
      const [l31, l24, l17, l10, l3] = await sessionsOfSlot(id.q);
      // -31: student attendance (completes it)
      await http()
        .put(`/api/admin/sessions/${l31.id}/attendance`)
        .set(as())
        .send({ records: [{ studentId: id.a1, status: 'PRESENT' }] })
        .expect(200);
      // -24: teacher attendance only
      await http()
        .put(`/api/admin/sessions/${l24.id}/attendance`)
        .set(as())
        .send({ teachers: [{ teacherId: id.T, status: 'PRESENT' }] })
        .expect(200);
      // -17: «متابعة العمل» only
      await prisma.workProgram.create({
        data: { studentId: id.a1, sessionId: l17.id },
      });
      // -10: cancelled
      await patch(`sessions/${l10.id}/status`, {
        status: 'CANCELLED',
        cancellationReason: 'عطلة',
      }).expect(200);
      // -3: moved to another time (edited by hand)
      await patch(`sessions/${l3.id}`, {
        startTime: '20:15',
        endTime: '21:15',
      }).expect(200);
      const preview = await impact(id.q, addDays(TODAY, 1));
      expect(preview.removable).toEqual([]);
      const reasons = Object.fromEntries(
        preview.protected.map((l) => [l.date, l.reasons]),
      );
      expect(reasons[l31.date]).toEqual(
        expect.arrayContaining(['COMPLETED', 'STUDENT_ATTENDANCE']),
      );
      expect(reasons[l24.date]).toEqual(
        expect.arrayContaining(['TEACHER_ATTENDANCE']),
      );
      expect(reasons[l24.date]).not.toContain('STUDENT_ATTENDANCE');
      expect(reasons[l17.date]).toEqual(['WORK']);
      expect(reasons[l10.date]).toEqual(
        expect.arrayContaining(['CANCELLED', 'MODIFIED']),
      );
      expect(reasons[l3.date]).toEqual(['MODIFIED']);

      const before = await rowsOf(id.q);
      // Also a time change in the same request: nothing of it is applied
      const res = await edit(id.q, {
        startDate: addDays(TODAY, 1),
        removeSessionIds: [],
        startTime: '20:30',
        endTime: '21:30',
      }).expect(409);
      expect(res.body.code).toBe('SCHEDULE_START_PROTECTED_SESSIONS');
      expect(res.body.message).toMatch(/فيها نشاط ولا تُحذف/);
      expect(res.body.sessions).toHaveLength(5);
      expect(await rowsOf(id.q)).toEqual(before);
      expect(await storedStart(id.q)).toBe(YEAR_START);
      const s = await prisma.weeklySchedule.findUniqueOrThrow({
        where: { id: id.q },
        select: { startTime: true },
      });
      expect(s.startTime).toEqual(dbTime('20:00'));
    });

    it('one protected lesson (audit trail, notification) refuses the removal of the unused ones too', async () => {
      id.r = (
        await slot('A', '21:00', '22:00', {
          startDate: YEAR_START,
          additionalGroupClassIds: [id.B],
        }).expect(201)
      ).body.id;
      const [, l24, l17] = await sessionsOfSlot(id.r);
      const adminUser = await prisma.user.findFirstOrThrow({
        where: { username: `e2e-${RUN}-admin` },
        select: { id: true },
      });
      // Rows that only accompany recorded attendance: each protects alone
      await prisma.notification.create({
        data: {
          userId: adminUser.id,
          type: 'ATTENDANCE_MODIFIED',
          title: 'تعديل الحضور',
          message: 'تعديل',
          sessionId: l24.id,
        },
      });
      await prisma.attendanceChange.create({
        data: {
          sessionId: l17.id,
          subject: 'STUDENT',
          studentId: id.b1,
          kind: 'CREATED',
          newStatus: 'PRESENT',
          actorName: 'admin',
        },
      });
      const preview = await impact(id.r, addDays(TODAY, -5));
      expect(preview.removable.map((l) => l.date)).toEqual(ago(31, 10));
      expect(preview.protected.map((l) => [l.date, l.reasons.join()])).toEqual([
        [l24.date, 'NOTIFICATIONS'],
        [l17.date, 'ATTENDANCE_HISTORY'],
      ]);
      const before = await rowsOf(id.r);
      const res = await edit(id.r, {
        startDate: addDays(TODAY, -5),
        removeSessionIds: preview.removable.map((l) => l.id),
      }).expect(409);
      expect(res.body.code).toBe('SCHEDULE_START_PROTECTED_SESSIONS');
      expect(await rowsOf(id.r)).toEqual(before);
      expect(
        await prisma.notification.count({ where: { sessionId: l24.id } }),
      ).toBe(1);
      expect(
        await prisma.attendanceChange.count({ where: { sessionId: l17.id } }),
      ).toBe(1);
    });

    it('a shared slot: its unused shared lessons go with every participant; one with attendance stays and protects', async () => {
      id.sh = (
        await slot('A', '06:00', '07:00', {
          startDate: YEAR_START,
          additionalGroupClassIds: [id.B],
        }).expect(201)
      ).body.id;
      const l17 = await lessonOn(id.sh, ago(17)[0]);
      // الماهر's student only: a partial record (still SCHEDULED)
      await http()
        .put(`/api/admin/sessions/${l17.id}/attendance`)
        .set(as())
        .send({ records: [{ studentId: id.b1, status: 'PRESENT' }] })
        .expect(200);
      const preview = await impact(id.sh, addDays(TODAY, -20));
      expect(preview.removable.map((l) => l.date)).toEqual(ago(31, 24));
      await edit(id.sh, {
        startDate: addDays(TODAY, -20),
        removeSessionIds: preview.removable.map((l) => l.id),
      }).expect(200);
      expect(
        await prisma.sessionClass.count({
          where: { sessionId: { in: preview.removable.map((l) => l.id) } },
        }),
      ).toBe(0);
      expect(
        await prisma.session.count({ where: { groupClassId: id.B } }),
      ).toBe(0);
      const later = await impact(id.sh, addDays(TODAY, -5));
      // Recording attendance also writes its audit trail
      expect(later.protected.map((l) => [l.date, l.reasons])).toEqual([
        [l17.date, ['STUDENT_ATTENDANCE', 'ATTENDANCE_HISTORY']],
      ]);
      expect(
        (
          await edit(id.sh, {
            startDate: addDays(TODAY, -5),
            removeSessionIds: later.removable.map((l) => l.id),
          }).expect(409)
        ).body.code,
      ).toBe('SCHEDULE_START_PROTECTED_SESSIONS');
      expect((await lessonOn(id.sh, l17.date)).studentAttendance).toHaveLength(
        1,
      );
    });

    it('attendance recorded after the preview: the confirmation is refused, nothing removed', async () => {
      id.t = (
        await slot('A', '17:00', '18:00', { startDate: YEAR_START }).expect(201)
      ).body.id;
      const preview = await impact(id.t, addDays(TODAY, -5));
      const victim = preview.removable[1];
      await http()
        .put(`/api/admin/sessions/${victim.id}/attendance`)
        .set(as())
        .send({ records: [{ studentId: id.a1, status: 'ABSENT' }] })
        .expect(200);
      const before = await rowsOf(id.t);
      const res = await edit(id.t, {
        startDate: addDays(TODAY, -5),
        removeSessionIds: preview.removable.map((l) => l.id),
      }).expect(409);
      expect(res.body.code).toBe('SCHEDULE_START_PROTECTED_SESSIONS');
      expect(await rowsOf(id.t)).toEqual(before);
    });

    it('attendance written at the same moment as the removal: never lost, never on a removed lesson', async () => {
      id.u = (
        await slot('A', '19:00', '20:00', { startDate: YEAR_START }).expect(201)
      ).body.id;
      const preview = await impact(id.u, addDays(TODAY, -5));
      const victim = preview.removable[0];
      const [removal, attendance] = await Promise.all([
        edit(id.u, {
          startDate: addDays(TODAY, -5),
          removeSessionIds: preview.removable.map((l) => l.id),
        }),
        http()
          .put(`/api/admin/sessions/${victim.id}/attendance`)
          .set(as())
          .send({ records: [{ studentId: id.a1, status: 'PRESENT' }] }),
      ]);
      const stillThere = await prisma.session.findUnique({
        where: { id: victim.id },
        include: { studentAttendance: true },
      });
      if (removal.status === 200) {
        // The removal won: the attendance write was refused, not saved anywhere
        expect(attendance.status).toBeGreaterThanOrEqual(400);
        expect(stillThere).toBeNull();
        expect(
          await prisma.studentAttendance.count({
            where: { sessionId: victim.id },
          }),
        ).toBe(0);
      } else {
        // The attendance won: kept, and the removal refused as a whole
        expect(attendance.status).toBe(200);
        expect(removal.body.code).toBe('SCHEDULE_START_PROTECTED_SESSIONS');
        expect(stillThere!.studentAttendance).toHaveLength(1);
        expect(await storedStart(id.u)).toBe(YEAR_START);
      }
    });
  });
});
