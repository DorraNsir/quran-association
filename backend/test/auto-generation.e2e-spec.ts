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

const RUN = randomUUID().slice(0, 8);
const PASSWORD = 'initial-pass-123';
const tag = (s: string) => `${s} ${RUN}`;
const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const TODAY = todayIn('Africa/Tunis');
const YEAR_END = addDays(TODAY, 34); // 5 weeks of sessions
const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;
const weekdayOf = (d: string) =>
  WEEKDAYS[new Date(`${d}T00:00:00Z`).getUTCDay()];
const DAY_A = weekdayOf(addDays(TODAY, 2));
const DAY_B = weekdayOf(addDays(TODAY, 4));

interface Row {
  id: string;
  date: string;
  startTime: string;
  status: string;
}

/**
 * Sessions are generated automatically (no admin step) until the end of the
 * CURRENT academic year: when a weekly slot is created, when its day/time
 * changes (never-held lessons are planned again; history is kept), when a
 * class or group is (re)activated, and when an academic year becomes current.
 */
describe('Automatic session generation (e2e)', () => {
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
  /** Sessions of one class, from the database (every status). */
  const sessionsOf = async (cls: string): Promise<Row[]> =>
    (
      await prisma.session.findMany({
        where: { groupClassId: id[cls] },
        orderBy: { date: 'asc' },
        select: { id: true, date: true, startTime: true, status: true },
      })
    ).map((s) => ({
      ...s,
      date: s.date.toISOString().slice(0, 10),
      startTime: s.startTime.toISOString().slice(11, 16),
    }));
  /** The dates of a weekday between today and the year's end. */
  const datesOf = (weekday: string) => {
    const out: string[] = [];
    for (let d = TODAY; d <= YEAR_END; d = addDays(d, 1))
      if (weekdayOf(d) === weekday) out.push(d);
    return out;
  };
  const slot = (cls: string, dayOfWeek: string, start: string, end: string) =>
    post(`group-classes/${id[cls]}/schedules`, {
      dayOfWeek,
      startTime: start,
      endTime: end,
      roomId: id.room,
    });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    previousCurrent =
      (
        await prisma.academicYear.findFirst({
          where: { isCurrent: true },
          select: { id: true },
        })
      )?.id ?? null;

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
    id.group = (
      await post('groups', { name: tag('مجموعة') }).expect(201)
    ).body.id;
    id.teacher = (
      await post('teachers', {
        person: {
          firstName: 'T',
          lastName: tag('معلم'),
          gender: 'MALE',
          phone: '22345678',
        },
        joinedAt: '2024-09-01',
      }).expect(201)
    ).body.id;
    id.A = (
      await post('group-classes', {
        groupId: id.group,
        branchId: id.branch,
        supervisorId: id.teacher,
      }).expect(201)
    ).body.id;
    id.year = (
      await post('academic-years', {
        label: tag('سنة'),
        startDate: TODAY,
        endDate: YEAR_END,
        semester2StartDate: addDays(TODAY, 14),
      }).expect(201)
    ).body.id;
  });

  afterAll(async () => {
    const classes = { group: { name: { endsWith: RUN } } };
    await prisma.session.deleteMany({ where: { groupClass: classes } });
    await prisma.weeklySchedule.deleteMany({ where: { groupClass: classes } });
    await prisma.groupClass.deleteMany({ where: classes });
    // Put the platform's current year back as it was
    await prisma.academicYear.updateMany({
      where: { id: id.year },
      data: { isCurrent: false },
    });
    if (previousCurrent)
      await prisma.academicYear.update({
        where: { id: previousCurrent },
        data: { isCurrent: true },
      });
    await prisma.academicYear.deleteMany({ where: { id: id.year } });
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

  it('a new academic year becoming current generates the sessions of running classes', async () => {
    if (previousCurrent) {
      // Another year is current in this database: leave it, the year-switch case below covers it
      await prisma.academicYear.update({
        where: { id: previousCurrent },
        data: { isCurrent: false },
      });
    }
    // A slot added while no year is current: nothing to generate yet
    await slot('A', DAY_A, '09:00', '10:00').expect(201);
    expect(await sessionsOf('A')).toEqual([]);
    await post(`academic-years/${id.year}/set-current`).expect(200);
    const rows = await sessionsOf('A');
    expect(rows.map((r) => r.date)).toEqual(datesOf(DAY_A));
    expect(rows.every((r) => r.status === 'SCHEDULED')).toBe(true);
  });

  it('a new weekly slot generates its sessions at once (until the year ends, in its room)', async () => {
    id.slotB = (await slot('A', DAY_B, '16:00', '17:00').expect(201)).body.id;
    const rows = await prisma.session.findMany({
      where: { weeklyScheduleId: id.slotB },
      select: { date: true, roomId: true },
      orderBy: { date: 'asc' },
    });
    expect(rows.map((r) => r.date.toISOString().slice(0, 10))).toEqual(
      datesOf(DAY_B),
    );
    expect(rows.every((r) => r.roomId === id.room)).toBe(true);
    // Running the manual generator afterwards adds nothing
    expect(
      (
        await post('sessions/generate', {
          from: TODAY,
          to: YEAR_END,
          groupClassId: id.A,
        }).expect(200)
      ).body.created,
    ).toBe(0);
  });

  it('a new time moves the never-held lessons; a cancelled one stays as history', async () => {
    const before = await prisma.session.findMany({
      where: { weeklyScheduleId: id.slotB },
      orderBy: { date: 'asc' },
      select: { id: true },
    });
    // One lesson was cancelled: history, never touched
    await patch(`sessions/${before[1].id}/status`, {
      status: 'CANCELLED',
      cancellationReason: 'عطلة',
    }).expect(200);
    await patch(`group-classes/${id.A}/schedules/${id.slotB}`, {
      startTime: '18:00',
      endTime: '19:00',
    }).expect(200);
    const rows = (await sessionsOf('A')).filter((r) =>
      datesOf(DAY_B).includes(r.date),
    );
    const cancelled = rows.filter((r) => r.status === 'CANCELLED');
    expect(cancelled.map((r) => [r.id, r.startTime])).toEqual([
      [before[1].id, '16:00'],
    ]);
    const scheduled = rows.filter((r) => r.status === 'SCHEDULED');
    // Every other date: one lesson, at the new time
    expect(scheduled.map((r) => r.date)).toEqual(
      datesOf(DAY_B).filter((d) => d !== cancelled[0].date),
    );
    expect(scheduled.every((r) => r.startTime === '18:00')).toBe(true);
  });

  it('a new day moves the never-held lessons to that weekday', async () => {
    const DAY_C = weekdayOf(addDays(TODAY, 5));
    await patch(`group-classes/${id.A}/schedules/${id.slotB}`, {
      dayOfWeek: DAY_C,
    }).expect(200);
    const ofSlot = await prisma.session.findMany({
      where: { weeklyScheduleId: id.slotB, status: 'SCHEDULED' },
      select: { date: true },
      orderBy: { date: 'asc' },
    });
    expect(ofSlot.map((r) => r.date.toISOString().slice(0, 10))).toEqual(
      datesOf(DAY_C),
    );
    // The cancelled lesson of the old day is still there
    expect(
      (await sessionsOf('A')).filter((r) => r.status === 'CANCELLED'),
    ).toHaveLength(1);
  });

  it('(re)activating a class generates its sessions', async () => {
    id.B = (
      await post('group-classes', {
        groupId: id.group,
        branchId: id.branch,
        supervisorId: id.teacher,
      }).expect(201)
    ).body.id;
    await patch(`group-classes/${id.B}/status`, { status: 'INACTIVE' }).expect(
      200,
    );
    // An inactive class occupies nothing: its slot generates nothing
    await slot('B', DAY_A, '11:00', '12:00').expect(201);
    expect(await sessionsOf('B')).toEqual([]);
    await patch(`group-classes/${id.B}/status`, { status: 'ACTIVE' }).expect(
      200,
    );
    expect((await sessionsOf('B')).map((r) => r.date)).toEqual(datesOf(DAY_A));
  });

  it('(re)activating a group generates the sessions of its active classes', async () => {
    id.group2 = (
      await post('groups', { name: tag('مجموعة ثانية') }).expect(201)
    ).body.id;
    id.C = (
      await post('group-classes', {
        groupId: id.group2,
        branchId: id.branch,
        supervisorId: id.teacher,
      }).expect(201)
    ).body.id;
    await patch(`groups/${id.group2}/status`, { status: 'INACTIVE' }).expect(
      200,
    );
    await slot('C', DAY_A, '13:00', '14:00').expect(201);
    expect(await sessionsOf('C')).toEqual([]);
    await patch(`groups/${id.group2}/status`, { status: 'ACTIVE' }).expect(200);
    expect((await sessionsOf('C')).map((r) => r.date)).toEqual(datesOf(DAY_A));
  });
});
