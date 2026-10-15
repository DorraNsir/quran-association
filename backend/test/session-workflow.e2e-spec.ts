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
const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;
const weekdayOf = (d: string) =>
  WEEKDAYS[new Date(`${d}T00:00:00Z`).getUTCDay()];
const TOMORROW = addDays(TODAY, 1);
const FROM = addDays(TODAY, -7);
const TO = addDays(TODAY, 20);

interface SessionBody {
  id: string;
  date: string;
  startTime: string;
  status: string;
  weeklyScheduleId: string | null;
  room: { id: string };
}

/**
 * The weekly schedule → dated session → attendance workflow behind
 * /admin/sessions and /admin/attendance: weekly slots alone are a plan (no
 * session exists until generation); generation creates the dated sessions
 * (Africa/Tunis dates, slot rooms) idempotently; the list filters used by
 * the pages (today, upcoming, all, pending) return them; attendance is
 * recorded on a session and reported by the admin summary.
 */
describe('Weekly schedule → sessions → attendance workflow (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let admin = '';
  const id: Record<string, string> = {};

  const http = () => request(app.getHttpServer());
  const as = () => ({ Authorization: `Bearer ${admin}` });
  const post = (path: string, body: object) =>
    http().post(`/api/admin/${path}`).set(as()).send(body);
  const put = (path: string, body: object) =>
    http().put(`/api/admin/${path}`).set(as()).send(body);
  const patch = (path: string, body: object) =>
    http().patch(`/api/admin/${path}`).set(as()).send(body);
  const get = (path: string, query: object = {}) =>
    http().get(`/api/admin/${path}`).query(query).set(as());
  /** The sessions page's request, limited to this run's class. */
  const list = async (query: object) =>
    (
      await get('sessions', {
        groupClassId: id.cls,
        page: 1,
        pageSize: 100,
        ...query,
      }).expect(200)
    ).body as { data: SessionBody[]; meta: { total: number } };
  const generate = (body: object = {}) =>
    post('sessions/generate', {
      from: FROM,
      to: TO,
      groupClassId: id.cls,
      ...body,
    }).expect(200);

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
    for (const r of ['R1', 'R2', 'R3'])
      id[r] = (
        await post('rooms', {
          branchId: id.branch,
          name: tag(`القاعة ${r}`),
        }).expect(201)
      ).body.id;
    id.group = (
      await post('groups', { name: tag('مجموعة الماهر') }).expect(201)
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
  });

  afterAll(async () => {
    const classes = { group: { name: { endsWith: RUN } } };
    const persons = (
      await prisma.person.findMany({
        where: { lastName: { endsWith: RUN } },
        select: { id: true },
      })
    ).map((p) => p.id);
    await prisma.studentAttendance.deleteMany({
      where: { student: { personId: { in: persons } } },
    });
    await prisma.session.deleteMany({ where: { groupClass: classes } });
    await prisma.weeklySchedule.deleteMany({ where: { groupClass: classes } });
    await prisma.studentEnrollment.deleteMany({
      where: { student: { personId: { in: persons } } },
    });
    await prisma.studentStatusChange.deleteMany({
      where: { student: { personId: { in: persons } } },
    });
    await prisma.student.deleteMany({ where: { personId: { in: persons } } });
    await prisma.groupClass.deleteMany({ where: classes });
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

  it('a class with weekly slots is persisted, but has no dated session before generation', async () => {
    id.cls = (
      await post('group-classes', {
        groupId: id.group,
        branchId: id.branch,
        supervisorId: id.teacher,
      }).expect(201)
    ).body.id;
    // Today's weekday (an early slot, already over), tomorrow's, and another day — each in its own room
    const days = [
      [weekdayOf(TODAY), '00:10', '00:40', 'R1'],
      [weekdayOf(TOMORROW), '09:00', '11:00', 'R3'],
      [weekdayOf(addDays(TODAY, 3)), '14:00', '16:00', 'R2'],
    ] as const;
    for (const [day, start, end, room] of days)
      id[`slot${room}`] = (
        await post(`group-classes/${id.cls}/schedules`, {
          dayOfWeek: day,
          startTime: start,
          endTime: end,
          roomId: id[room],
        }).expect(201)
      ).body.id;
    const slots = (await get(`group-classes/${id.cls}/schedules`).expect(200))
      .body;
    expect(slots).toHaveLength(3);
    // The weekly plan is NOT a session: the pages are legitimately empty until generation
    expect((await list({})).meta.total).toBe(0);
    expect((await list({ from: TODAY, to: TODAY })).meta.total).toBe(0);
  });

  it('generation creates the dated sessions on the right Tunis dates, each in its slot room', async () => {
    const res = (await generate()).body;
    const days = 28; // FROM..TO inclusive
    expect(res).toMatchObject({ from: FROM, to: TO, skippedConflicts: [] });
    // 3 weekly slots over 4 weeks: 12 occurrences
    expect(res.created).toBe((3 * days) / 7);
    const all = (await list({ order: 'asc' })).data;
    expect(all).toHaveLength(res.created);
    for (const s of all) {
      expect(s.status).toBe('SCHEDULED');
      const slotRoom = {
        [weekdayOf(TODAY)]: id.R1,
        [weekdayOf(TOMORROW)]: id.R3,
        [weekdayOf(addDays(TODAY, 3))]: id.R2,
      }[weekdayOf(s.date)];
      // Date-only, the weekday of its slot in Africa/Tunis (no UTC shift), in its slot's room
      expect(s.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(s.room.id).toBe(slotRoom);
    }
  });

  it('the page filters: today, upcoming, all, pending attendance', async () => {
    const today = await list({ from: TODAY, to: TODAY, order: 'asc' });
    expect(today.data.map((s) => [s.date, s.startTime, s.room.id])).toEqual([
      [TODAY, '00:10', id.R1],
    ]);
    const upcoming = await list({
      from: TOMORROW,
      status: 'SCHEDULED',
      order: 'asc',
    });
    expect(upcoming.data[0]).toMatchObject({
      date: TOMORROW,
      room: { id: id.R3 },
    });
    expect(upcoming.data.every((s) => s.date > TODAY)).toBe(true);
    const all = await list({});
    expect(all.data.some((s) => s.date < TODAY)).toBe(true);
    expect(all.data.some((s) => s.date > TODAY)).toBe(true);
    // Totals come from the server (meta.total), not from one page
    const firstPage = await list({ pageSize: 2 });
    expect(firstPage.data).toHaveLength(2);
    expect(firstPage.meta.total).toBe(all.meta.total);
    const pending = await list({ to: TODAY, status: 'SCHEDULED' });
    expect(pending.data.every((s) => s.date <= TODAY)).toBe(true);
    expect(pending.meta.total).toBeGreaterThan(0);
  });

  it('repeated generation never duplicates', async () => {
    const before = (await list({})).meta.total;
    const again = (await generate()).body;
    expect(again).toMatchObject({ created: 0, skippedExisting: before });
    // Over every class (default scope) too
    await post('sessions/generate', { from: FROM, to: TO }).expect(200);
    expect((await list({})).meta.total).toBe(before);
    expect(
      await prisma.session.count({
        where: { groupClassId: id.cls },
      }),
    ).toBe(before);
  });

  it('attendance on a session: recorded, completes it, appears in the admin overview and history', async () => {
    id.student = (
      await post('students', {
        person: {
          firstName: 'يوسف',
          lastName: tag('طالب'),
          gender: 'MALE',
          dateOfBirth: '2015-01-01',
          address: 'نابل',
        },
        groupClassId: id.cls,
        registrationDate: addDays(TODAY, -30),
        guardianPhone: '98765432',
      }).expect(201)
    ).body.id;
    const past = (await list({ to: addDays(TODAY, -1), order: 'desc' }))
      .data[0];
    id.past = past.id;
    // Nothing recorded yet: no automatic absence
    const summaryBefore = (
      await get('attendance/students-summary', {
        from: FROM,
        to: TODAY,
        groupId: id.group,
      }).expect(200)
    ).body;
    // (lines exist only for recorded attendance — none yet, so no absence either)
    expect(
      summaryBefore.filter(
        (l: { studentId: string; absent: number; recorded: number }) =>
          l.studentId === id.student && (l.absent > 0 || l.recorded > 0),
      ),
    ).toEqual([]);

    await put(`sessions/${past.id}/attendance`, {
      records: [{ studentId: id.student, status: 'ABSENT' }],
    }).expect(200);
    expect((await get(`sessions/${past.id}`).expect(200)).body.status).toBe(
      'COMPLETED',
    );
    // Overview counters used by /admin/attendance
    expect(
      (await list({ from: FROM, to: TODAY, status: 'COMPLETED' })).meta.total,
    ).toBe(1);
    const summary = (
      await get('attendance/students-summary', {
        from: FROM,
        to: TODAY,
        groupId: id.group,
      }).expect(200)
    ).body;
    expect(summary).toEqual([
      expect.objectContaining({
        studentId: id.student,
        recorded: 1,
        absent: 1,
      }),
    ]);
    const history = (
      await get(`students/${id.student}/attendance`).expect(200)
    ).body;
    expect(history.data).toEqual([
      expect.objectContaining({ sessionId: past.id, status: 'ABSENT' }),
    ]);
  });

  it('changing a weekly slot never corrupts completed sessions; regenerating keeps history', async () => {
    const slotOfPast = (await get(`sessions/${id.past}`).expect(200)).body
      .weeklyScheduleId as string;
    const slots = (await get(`group-classes/${id.cls}/schedules`).expect(200))
      .body as { id: string; room: { id: string } }[];
    const other = [id.R1, id.R2, id.R3].find(
      (r) => !slots.some((s) => s.room.id === r),
    );
    // Move the slot to a later time and (if free) another room
    await patch(`group-classes/${id.cls}/schedules/${slotOfPast}`, {
      startTime: '20:00',
      endTime: '21:00',
      ...(other ? { roomId: other } : {}),
    }).expect(200);
    await generate();
    const kept = (await get(`sessions/${id.past}`).expect(200)).body;
    expect(kept.status).toBe('COMPLETED');
    expect(kept.startTime).not.toBe('20:00');
    const history = (
      await get(`students/${id.student}/attendance`).expect(200)
    ).body;
    expect(history.data).toEqual([
      expect.objectContaining({ sessionId: id.past, status: 'ABSENT' }),
    ]);
    // Still one session per slot and date
    const rows = await prisma.session.groupBy({
      by: ['weeklyScheduleId', 'date'],
      where: { groupClassId: id.cls },
      _count: true,
    });
    expect(rows.every((r) => r._count === 1)).toBe(true);
  });
});
