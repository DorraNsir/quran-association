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
const YEAR_START = addDays(TODAY, -35); // the year began 5 weeks ago
const YEAR_END = addDays(TODAY, 34);
const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;
const weekdayOf = (d: string) =>
  WEEKDAYS[new Date(`${d}T00:00:00Z`).getUTCDay()];
/** Its past dates: TODAY-3, -10, -17, -24, -31 */
const DAY = weekdayOf(addDays(TODAY, -3));
const datesOf = (from: string, to: string) => {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1))
    if (weekdayOf(d) === DAY) out.push(d);
  return out;
};
const day = (d: Date) => d.toISOString().slice(0, 10);

/**
 * «تاريخ بداية الحصص»: a new weekly slot's lessons start at the current
 * academic year's start by default (or a later date of the year). Past
 * lessons are created too — pending attendance — for THIS slot only, with
 * the usual conflict rules and the class's current team.
 */
describe('Weekly slot start date (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let admin = '';
  let previousCurrent: string | null = null;
  const id: Record<string, string> = {};

  const http = () => request(app.getHttpServer());
  const as = () => ({ Authorization: `Bearer ${admin}` });
  const post = (path: string, body: object = {}) =>
    http().post(`/api/admin/${path}`).set(as()).send(body);
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
  const sessionsOfSlot = (weeklyScheduleId: string) =>
    prisma.session.findMany({
      where: { weeklyScheduleId },
      orderBy: { date: 'asc' },
      select: {
        id: true,
        date: true,
        status: true,
        teachers: { select: { teacherId: true } },
        extraClasses: { select: { groupClassId: true } },
        studentAttendance: { select: { id: true } },
      },
    });
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
  const groupClass = async (name: string, supervisorId: string) => {
    const groupId = (await post('groups', { name: tag(name) }).expect(201)).body
      .id as string;
    return (
      await post('group-classes', {
        groupId,
        branchId: id.branch,
        supervisorId,
      }).expect(201)
    ).body.id as string;
  };

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
    id.T = await teacher('مشرف');
    id.T2 = await teacher('مشرف آخر');
    id.early = await teacher('مساعد قديم');
    id.late = await teacher('مساعد جديد');
    id.A = await groupClass('الارقم', id.T);
    id.B = await groupClass('الماهر', id.T);
    id.C = await groupClass('أخرى', id.T2);
    // Assistants of A: one since before the year, one since 10 days ago (noon, Tunis)
    await prisma.groupClassAssistant.createMany({
      data: [
        {
          groupClassId: id.A,
          teacherId: id.early,
          assignedAt: new Date(`${addDays(YEAR_START, -30)}T11:00:00Z`),
        },
        {
          groupClassId: id.A,
          teacherId: id.late,
          assignedAt: new Date(`${addDays(TODAY, -10)}T11:00:00Z`),
        },
      ],
    });

    // A current year that began 5 weeks ago — set directly (becoming current
    // through the API would generate lessons for every running class)
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
          startDate: new Date(`${YEAR_START}T00:00:00Z`),
          endDate: new Date(`${YEAR_END}T00:00:00Z`),
          semester2StartDate: new Date(`${addDays(TODAY, 14)}T00:00:00Z`),
          isCurrent: true,
        },
        select: { id: true },
      })
    ).id;
  });

  afterAll(async () => {
    const classes = { group: { name: { endsWith: RUN } } };
    await prisma.session.deleteMany({ where: { groupClass: classes } });
    await prisma.weeklySchedule.deleteMany({ where: { groupClass: classes } });
    await prisma.groupClass.deleteMany({ where: classes });
    // Put the platform's current year back as it was
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

  it('no date given: from the current year start — past lessons created, pending attendance', async () => {
    const res = await slot('A', '08:00', '09:00').expect(201);
    id.slot1 = res.body.id;
    expect(res.body.startDate).toBe(YEAR_START);
    const rows = await sessionsOfSlot(id.slot1);
    expect(rows.map((r) => day(r.date))).toEqual(datesOf(YEAR_START, YEAR_END));
    expect(res.body.generation.created).toBe(rows.length);
    const past = rows.filter((r) => day(r.date) < TODAY);
    expect(past.map((r) => day(r.date))).toEqual(
      datesOf(YEAR_START, addDays(TODAY, -1)),
    );
    // Pending: scheduled, no attendance recorded
    expect(past.every((r) => r.status === 'SCHEDULED')).toBe(true);
    expect(past.every((r) => r.studentAttendance.length === 0)).toBe(true);
  });

  it("a past lesson's team: the class's current team (an assistant entered only recently included)", async () => {
    // assignedAt is when the assistant was entered, not when they began
    // teaching: past lessons take the current team, like upcoming ones
    const rows = await sessionsOfSlot(id.slot1);
    const lateFrom = addDays(TODAY, -10);
    expect(rows.some((r) => day(r.date) < lateFrom)).toBe(true);
    for (const r of rows)
      expect(r.teachers.map((t) => t.teacherId).sort()).toEqual(
        [id.T, id.early, id.late].sort(),
      );
  });

  it('a later date of the year: nothing before it', async () => {
    const start = addDays(YEAR_START, 14);
    const res = await slot('A', '10:00', '11:00', { startDate: start }).expect(
      201,
    );
    expect(res.body.startDate).toBe(start);
    expect((await sessionsOfSlot(res.body.id)).map((r) => day(r.date))).toEqual(
      datesOf(start, YEAR_END),
    );
  });

  it('a future date: no past lesson, the first lesson on or after it', async () => {
    const start = addDays(TODAY, 7);
    const res = await slot('A', '12:00', '13:00', { startDate: start }).expect(
      201,
    );
    expect((await sessionsOfSlot(res.body.id)).map((r) => day(r.date))).toEqual(
      datesOf(start, YEAR_END),
    );
  });

  it('a date outside the current year (or not a date) is refused', async () => {
    for (const startDate of [addDays(YEAR_START, -1), addDays(YEAR_END, 1)]) {
      const res = await slot('A', '17:00', '18:00', { startDate }).expect(400);
      expect(res.body.code).toBe('SCHEDULE_START_OUTSIDE_YEAR');
    }
    await slot('A', '17:00', '18:00', { startDate: '2026-02-30' }).expect(400);
    expect(
      await prisma.weeklySchedule.count({
        where: {
          groupClassId: id.A,
          startTime: new Date('1970-01-01T17:00:00Z'),
        },
      }),
    ).toBe(0);
  });

  it('a shared slot: its past lessons are shared too (one session, every participant)', async () => {
    const res = await slot('A', '14:00', '15:00', {
      additionalGroupClassIds: [id.B],
    }).expect(201);
    const rows = await sessionsOfSlot(res.body.id);
    expect(rows.map((r) => day(r.date))).toEqual(datesOf(YEAR_START, YEAR_END));
    expect(
      rows.every(
        (r) =>
          r.extraClasses.length === 1 &&
          r.extraClasses[0].groupClassId === id.B,
      ),
    ).toBe(true);
    // B has no lesson of its own on those dates (no duplicate)
    expect(await prisma.session.count({ where: { groupClassId: id.B } })).toBe(
      0,
    );
  });

  it('a past conflict is skipped and reported; generating again adds nothing', async () => {
    const busy = addDays(TODAY, -17);
    // Another class already used the room on that past date
    await prisma.session.create({
      data: {
        groupClassId: id.C,
        roomId: id.room,
        date: new Date(`${busy}T00:00:00Z`),
        startTime: new Date('1970-01-01T16:00:00Z'),
        endTime: new Date('1970-01-01T17:00:00Z'),
      },
    });
    const res = await slot('A', '16:00', '17:00').expect(201);
    const dates = (await sessionsOfSlot(res.body.id)).map((r) => day(r.date));
    expect(dates).toEqual(
      datesOf(YEAR_START, YEAR_END).filter((d) => d !== busy),
    );
    expect(
      res.body.generation.skippedConflicts.map(
        (c: { date: string; type?: string }) => c.date,
      ),
    ).toEqual([busy]);
    const again = await post('sessions/generate', {
      from: YEAR_START,
      to: YEAR_END,
      groupClassId: id.A,
    }).expect(200);
    expect(again.body.created).toBe(0);
  });

  it('a slot created before this field (no start date): from its creation day, still unchanged', async () => {
    const created = new Date(`${addDays(TODAY, -20)}T10:00:00Z`);
    await prisma.weeklySchedule.update({
      where: { id: id.slot1 },
      data: { startDate: null, createdAt: created },
    });
    const before = (await sessionsOfSlot(id.slot1)).length;
    const list = await http()
      .get(`/api/admin/group-classes/${id.A}/schedules`)
      .set(as())
      .expect(200);
    expect(
      list.body.find((s: { id: string }) => s.id === id.slot1).startDate,
    ).toBe(addDays(TODAY, -20));
    // No backfill, no removal
    await post('sessions/generate', {
      from: TODAY,
      to: YEAR_END,
      groupClassId: id.A,
    }).expect(200);
    expect((await sessionsOfSlot(id.slot1)).length).toBe(before);
  });

  it('no current academic year: a past date is refused, no date means today', async () => {
    await prisma.academicYear.update({
      where: { id: id.year },
      data: { isCurrent: false },
    });
    try {
      const refused = await slot('C', '19:00', '20:00', {
        startDate: addDays(TODAY, -3),
      }).expect(409);
      expect(refused.body.code).toBe('SCHEDULE_START_NO_ACADEMIC_YEAR');
      const res = await slot('C', '19:00', '20:00').expect(201);
      expect(res.body.startDate).toBe(TODAY);
      expect(await sessionsOfSlot(res.body.id)).toEqual([]);
    } finally {
      await prisma.academicYear.update({
        where: { id: id.year },
        data: { isCurrent: true },
      });
    }
  });
  it('a current year that is already over counts as none', async () => {
    await prisma.academicYear.update({
      where: { id: id.year },
      data: {
        endDate: new Date(`${addDays(TODAY, -1)}T00:00:00Z`),
        semester2StartDate: new Date(`${addDays(TODAY, -2)}T00:00:00Z`),
      },
    });
    try {
      const refused = await slot('C', '21:00', '22:00', {
        startDate: YEAR_START,
      }).expect(409);
      expect(refused.body.code).toBe('SCHEDULE_START_NO_ACADEMIC_YEAR');
      const res = await slot('C', '21:00', '22:00').expect(201);
      expect(res.body.startDate).toBe(TODAY);
      expect(await sessionsOfSlot(res.body.id)).toEqual([]);
    } finally {
      await prisma.academicYear.update({
        where: { id: id.year },
        data: {
          endDate: new Date(`${YEAR_END}T00:00:00Z`),
          semester2StartDate: new Date(`${addDays(TODAY, 14)}T00:00:00Z`),
        },
      });
    }
  });
});
