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
const byText = (a: unknown, b: unknown) =>
  JSON.stringify(a).localeCompare(JSON.stringify(b));

/**
 * Teacher attendance + audit + supervisor notifications + statistics.
 * Team: SUP supervises, A1 and A2 assist; OTHER teaches another class.
 */
describe('Attendance — teachers, audit, notifications, statistics (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const id: Record<string, string> = {};
  const token: Record<string, string> = {};

  const http = () => request(app.getHttpServer());
  const as = (who: string) => ({ Authorization: `Bearer ${token[who]}` });
  const admin = {
    get: (path: string, query: object = {}) =>
      http().get(`/api/admin/${path}`).query(query).set(as('admin')),
    post: (path: string, body: object = {}) =>
      http().post(`/api/admin/${path}`).set(as('admin')).send(body),
    put: (path: string, body: object) =>
      http().put(`/api/admin/${path}`).set(as('admin')).send(body),
    patch: (path: string, body: object) =>
      http().patch(`/api/admin/${path}`).set(as('admin')).send(body),
  };
  const teacherSave = (who: string, sessionId: string, body: object) =>
    http()
      .put(`/api/teacher/sessions/${sessionId}/attendance`)
      .set(as(who))
      .send(body);
  const notificationsOf = async (who: string) =>
    (
      await http()
        .get('/api/notifications')
        .query({ pageSize: 100 })
        .set(as(who))
        .expect(200)
    ).body.data as {
      type: string;
      title: string;
      message: string;
      entityType: string;
      entityId: string;
    }[];
  const changesOf = (sessionId: string) =>
    prisma.attendanceChange.count({ where: { sessionId } });

  /** A person with an account (and optionally a teacher profile), logged in. */
  async function account(
    key: string,
    roles: Role[],
    opts: { teacher?: boolean; gender?: 'MALE' | 'FEMALE' } = {},
  ) {
    const person = await prisma.person.create({
      data: {
        firstName: key,
        lastName: tag('حساب'),
        gender: opts.gender ?? null,
        ...(opts.teacher
          ? { teacher: { create: { joinedAt: new Date('2024-09-01') } } }
          : {}),
        user: {
          create: {
            username: `e2e-${RUN}-${key}`.toLowerCase(),
            passwordHash: await new PasswordService().hash(PASSWORD),
            mustChangePassword: false,
            roles: { create: roles.map((role) => ({ role })) },
          },
        },
      },
      select: { id: true, teacher: { select: { id: true } } },
    });
    if (opts.teacher) id[key] = person.teacher!.id;
    id[`person:${key}`] = person.id;
    token[key] = (
      await http()
        .post('/api/auth/login')
        .send({
          username: `e2e-${RUN}-${key}`.toLowerCase(),
          password: PASSWORD,
        })
        .expect(200)
    ).body.accessToken;
  }

  const session = async (classKey: string, date: string, start = '17:00') =>
    (
      await admin
        .post('sessions', {
          groupClassId: id[classKey],
          roomId: id.room,
          date,
          startTime: start,
          endTime: `${String(Number(start.slice(0, 2)) + 1).padStart(2, '0')}:00`,
        })
        .expect(201)
    ).body.id as string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    await account('admin', [Role.ADMIN]);
    await account('sup', [Role.TEACHER], { teacher: true, gender: 'FEMALE' });
    await account('a1', [Role.TEACHER], { teacher: true, gender: 'FEMALE' });
    await account('a2', [Role.TEACHER], { teacher: true, gender: 'MALE' });
    await account('a3', [Role.TEACHER], { teacher: true });
    await account('other', [Role.TEACHER], { teacher: true });
    // A supervisor without any account (notifications cannot reach them)
    id.noAccount = (
      await prisma.person.create({
        data: {
          firstName: 'بدون',
          lastName: tag('حساب'),
          teacher: { create: { joinedAt: new Date('2024-09-01') } },
        },
        select: { teacher: { select: { id: true } } },
      })
    ).teacher!.id;

    id.branch = (
      await admin
        .post('branches', { name: tag('فرع'), address: 'نابل' })
        .expect(201)
    ).body.id;
    id.room = (
      await admin
        .post('rooms', { branchId: id.branch, name: tag('قاعة') })
        .expect(201)
    ).body.id;
    id.group = (
      await admin.post('groups', { name: tag('مجموعة الماهر') }).expect(201)
    ).body.id;
    const cls = async (
      key: string,
      supervisor: string,
      assistants: string[],
    ) => {
      id[key] = (
        await admin
          .post('group-classes', {
            groupId: id.group,
            branchId: id.branch,
            supervisorId: id[supervisor],
            assistantTeacherIds: assistants.map((a) => id[a]),
          })
          .expect(201)
      ).body.id;
    };
    await cls('C', 'sup', ['a1', 'a2']);
    await cls('X', 'other', []);
    await cls('N', 'noAccount', ['a1']);
    for (const s of ['s1', 's2', 's3'])
      id[s] = (
        await admin
          .post('students', {
            person: {
              firstName: s,
              lastName: tag('طالب'),
              gender: 'MALE',
              dateOfBirth: '2014-05-01',
              address: 'نابل',
            },
            groupClassId: id.C,
            registrationDate: addDays(TODAY, -60),
            guardianPhone: '98765432',
          })
          .expect(201)
      ).body.id;
    // A student account (s1)
    const s1Person = await prisma.student.findUniqueOrThrow({
      where: { id: id.s1 },
      select: { personId: true },
    });
    await prisma.user.create({
      data: {
        personId: s1Person.personId,
        username: `e2e-${RUN}-pupil`,
        passwordHash: await new PasswordService().hash(PASSWORD),
        mustChangePassword: false,
        roles: { create: [{ role: Role.STUDENT }] },
      },
    });
    token.pupil = (
      await http()
        .post('/api/auth/login')
        .send({ username: `e2e-${RUN}-pupil`, password: PASSWORD })
        .expect(200)
    ).body.accessToken;

    id.d1 = await session('C', addDays(TODAY, -1));
    id.d2 = await session('C', addDays(TODAY, -2));
    id.d3 = await session('C', addDays(TODAY, -3));
    id.n1 = await session('N', addDays(TODAY, -1), '09:00');
  });

  afterAll(async () => {
    const classes = { group: { name: { endsWith: RUN } } };
    const persons = (
      await prisma.person.findMany({
        where: { lastName: { endsWith: RUN } },
        select: { id: true },
      })
    ).map((p) => p.id);
    await prisma.attendanceChange.deleteMany({
      where: { session: { groupClass: classes } },
    });
    await prisma.studentAttendance.deleteMany({
      where: { session: { groupClass: classes } },
    });
    await prisma.teacherAttendance.deleteMany({
      where: { session: { groupClass: classes } },
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
    await prisma.groupClassAssistant.deleteMany({
      where: { groupClass: classes },
    });
    await prisma.groupClass.deleteMany({ where: classes });
    await prisma.teacher.deleteMany({ where: { personId: { in: persons } } });
    await prisma.user.deleteMany({ where: { personId: { in: persons } } });
    await prisma.person.deleteMany({ where: { id: { in: persons } } });
    await prisma.academicYear.deleteMany({
      where: { label: { endsWith: RUN.slice(0, 6) } },
    });
    await prisma.room.deleteMany({
      where: { branch: { name: { endsWith: RUN } } },
    });
    await prisma.branch.deleteMany({ where: { name: { endsWith: RUN } } });
    await prisma.group.deleteMany({ where: { name: { endsWith: RUN } } });
    await app.close();
  });

  describe('teacher roster and permissions', () => {
    it('lists the session team first-supervisor, unrecorded = null (لم يسجل بعد)', async () => {
      const roster = (
        await admin.get(`sessions/${id.d1}/attendance`).expect(200)
      ).body;
      expect(
        roster.teachers.map((t: { teacherId: string; role: string }) => [
          t.teacherId,
          t.role,
        ]),
      ).toEqual(
        [
          [id.sup, 'SUPERVISOR'],
          ...[
            [id.a1, 'ASSISTANT'],
            [id.a2, 'ASSISTANT'],
          ].sort(byText),
        ].map((x) => x),
      );
      expect(
        roster.teachers.every(
          (t: { status: unknown; recorded: boolean }) =>
            t.status === null && t.recorded === false,
        ),
      ).toBe(true);
      expect(roster).toMatchObject({
        teacherExpectedCount: 3,
        teacherRecordedCount: 0,
      });
    });

    it('each assigned teacher records teacher attendance (own and others); outsiders and students cannot', async () => {
      // Assistant records the supervisor and themself
      const r = await teacherSave('a1', id.d3, {
        teachers: [
          { teacherId: id.sup, status: 'PRESENT' },
          { teacherId: id.a1, status: 'PRESENT' },
        ],
      }).expect(200);
      expect(r.body.teacherRecordedCount).toBe(2);
      // Supervisor records an assistant
      await teacherSave('sup', id.d3, {
        teachers: [{ teacherId: id.a2, status: 'LATE' }],
      }).expect(200);
      // Admin records too
      await admin
        .put(`sessions/${id.d2}/attendance`, {
          teachers: [{ teacherId: id.sup, status: 'PRESENT' }],
        })
        .expect(200);
      // Another class's teacher / a student / a non-member teacher: refused
      await teacherSave('other', id.d3, {
        teachers: [{ teacherId: id.sup, status: 'ABSENT' }],
      }).expect(403);
      await http()
        .put(`/api/teacher/sessions/${id.d3}/attendance`)
        .set(as('pupil'))
        .send({ teachers: [{ teacherId: id.sup, status: 'ABSENT' }] })
        .expect(403);
      await http()
        .get(`/api/teacher/sessions/${id.d3}/attendance/history`)
        .set(as('other'))
        .expect(403);
      await http()
        .get(`/api/admin/sessions/${id.d3}/attendance/history`)
        .set(as('a1'))
        .expect(403);
      // Only teachers of the session's team are accepted
      expect(
        (
          await admin
            .put(`sessions/${id.d3}/attendance`, {
              teachers: [{ teacherId: id.other, status: 'PRESENT' }],
            })
            .expect(400)
        ).body.code,
      ).toBe('ATTENDANCE_TEACHER_NOT_IN_SESSION');
      expect(
        (await admin.put(`sessions/${id.d3}/attendance`, {}).expect(400)).body
          .code,
      ).toBe('ATTENDANCE_EMPTY');
    });

    it('saving teachers only never touches students (no default absence, no completion)', async () => {
      const roster = (
        await admin.get(`sessions/${id.d3}/attendance`).expect(200)
      ).body;
      expect(roster.recordedCount).toBe(0);
      expect(roster.sessionStatus).toBe('SCHEDULED');
      expect(
        await prisma.studentAttendance.count({ where: { sessionId: id.d3 } }),
      ).toBe(0);
    });

    it('a past session keeps the team that taught it; a later assistant gets no access to it', async () => {
      // A2 leaves the class, A3 joins (today): d1 (yesterday) keeps A2, never shows A3
      await admin
        .patch(`group-classes/${id.C}`, {
          supervisorId: id.sup,
          assistantTeacherIds: [id.a1, id.a3],
        })
        .expect(200);
      const team = (
        await admin.get(`sessions/${id.d1}/attendance`).expect(200)
      ).body.teachers.map((t: { teacherId: string }) => t.teacherId);
      expect(team).toContain(id.a2);
      expect(team).not.toContain(id.a3);
      await teacherSave('a3', id.d1, {
        teachers: [{ teacherId: id.a3, status: 'PRESENT' }],
      }).expect(403);
      // The former assistant can still record the session they taught
      await teacherSave('a2', id.d1, {
        teachers: [{ teacherId: id.a2, status: 'PRESENT' }],
      }).expect(200);
    });
  });

  describe('audit and notifications', () => {
    it('initial recording: audited as CREATED, no notification (by an assistant)', async () => {
      const before = (await notificationsOf('sup')).length;
      await teacherSave('a1', id.d2, {
        records: [
          { studentId: id.s1, status: 'PRESENT' },
          { studentId: id.s2, status: 'PRESENT' },
        ],
        teachers: [{ teacherId: id.a1, status: 'PRESENT' }],
      }).expect(200);
      expect((await notificationsOf('sup')).length).toBe(before);
      const changes = await prisma.attendanceChange.findMany({
        where: { sessionId: id.d2, actorUserId: { not: null } },
        orderBy: { createdAt: 'asc' },
      });
      // Admin's earlier teacher record + these three
      expect(changes.filter((c) => c.kind === 'CREATED')).toHaveLength(4);
      expect(changes.every((c) => c.previousStatus === null)).toBe(true);
    });

    it('an assistant changing saved statuses → ONE aggregated notification to the supervisor, linked to the session', async () => {
      const before = (await notificationsOf('sup')).length;
      // A2 changes two students (recorded by A1) and the supervisor's own attendance (recorded by admin)
      await teacherSave('a2', id.d2, {
        records: [
          { studentId: id.s1, status: 'ABSENT' },
          { studentId: id.s2, status: 'LATE' },
        ],
        teachers: [{ teacherId: id.sup, status: 'ABSENT' }],
      }).expect(200);
      const after = await notificationsOf('sup');
      expect(after.length).toBe(before + 1);
      const n = after[0];
      expect(n).toMatchObject({
        type: 'ATTENDANCE_MODIFIED',
        title: 'تعديل على سجل الحضور',
        entityType: 'SESSION',
        entityId: id.d2,
      });
      expect(n.message).toContain('قام المعلم a2');
      expect(n.message).toContain('طالبين ومعلم واحد');
      expect(n.message).toContain(tag('مجموعة الماهر'));
      // Nothing for the assistants, nothing for the actor
      expect(
        (await notificationsOf('a2')).filter(
          (x) => x.type === 'ATTENDANCE_MODIFIED',
        ),
      ).toHaveLength(0);
      const modified = await prisma.attendanceChange.findMany({
        where: { sessionId: id.d2, kind: 'MODIFIED' },
      });
      expect(
        modified.map((m) => [m.previousStatus, m.newStatus]).sort(byText),
      ).toEqual(
        [
          ['PRESENT', 'ABSENT'],
          ['PRESENT', 'LATE'],
          ['PRESENT', 'ABSENT'],
        ].sort(byText),
      );
    });

    it('the supervisor and the admin correct without notifying anyone (still audited)', async () => {
      const a1Before = (await notificationsOf('a1')).length;
      const supBefore = (await notificationsOf('sup')).length;
      const changesBefore = await changesOf(id.d2);
      await teacherSave('sup', id.d2, {
        records: [{ studentId: id.s1, status: 'EXCUSED' }],
      }).expect(200);
      await admin
        .put(`sessions/${id.d2}/attendance`, {
          records: [{ studentId: id.s2, status: 'PRESENT' }],
        })
        .expect(200);
      expect((await notificationsOf('a1')).length).toBe(a1Before);
      expect((await notificationsOf('sup')).length).toBe(supBefore);
      expect(await changesOf(id.d2)).toBe(changesBefore + 2);
    });

    it('a save without real changes creates no audit entry and no notification', async () => {
      const changesBefore = await changesOf(id.d2);
      const supBefore = (await notificationsOf('sup')).length;
      await teacherSave('a2', id.d2, {
        records: [
          { studentId: id.s1, status: 'EXCUSED' },
          { studentId: id.s2, status: 'PRESENT' },
        ],
        teachers: [{ teacherId: id.sup, status: 'ABSENT' }],
      }).expect(200);
      expect(await changesOf(id.d2)).toBe(changesBefore);
      expect((await notificationsOf('sup')).length).toBe(supBefore);
    });

    it('a stale value is refused instead of silently overwritten (optimistic concurrency)', async () => {
      // A1 opened the page when s2 was LATE; the admin has since set PRESENT
      const res = await teacherSave('a1', id.d2, {
        records: [
          { studentId: id.s2, status: 'ABSENT', expectedStatus: 'LATE' },
        ],
      }).expect(409);
      expect(res.body.code).toBe('ATTENDANCE_CHANGED');
      expect(res.body.conflicts).toEqual([{ subject: 'STUDENT', id: id.s2 }]);
      expect(
        (
          await prisma.studentAttendance.findFirstOrThrow({
            where: { sessionId: id.d2, studentId: id.s2 },
          })
        ).status,
      ).toBe('PRESENT');
      // With the right base value it goes through
      await teacherSave('a1', id.d2, {
        records: [
          { studentId: id.s2, status: 'ABSENT', expectedStatus: 'PRESENT' },
          { studentId: id.s3, status: 'PRESENT', expectedStatus: null },
        ],
      }).expect(200);
    });

    it('no supervisor account: the assistant still saves (audited, nobody notified)', async () => {
      await teacherSave('a1', id.n1, {
        teachers: [{ teacherId: id.a1, status: 'PRESENT' }],
      }).expect(200);
      await teacherSave('a1', id.n1, {
        teachers: [{ teacherId: id.a1, status: 'LATE' }],
      }).expect(200);
      expect(await changesOf(id.n1)).toBe(2);
      expect(
        await prisma.notification.count({ where: { sessionId: id.n1 } }),
      ).toBe(0);
    });

    it('the HISTORICAL supervisor of the session is notified, not the class’s new one', async () => {
      // d3 was supervised by SUP; the class now gets another supervisor
      await admin
        .patch(`group-classes/${id.C}`, {
          supervisorId: id.a3,
          assistantTeacherIds: [id.a1, id.sup],
        })
        .expect(200);
      const supBefore = (await notificationsOf('sup')).length;
      const a3Before = (await notificationsOf('a3')).length;
      // A1 (assistant of d3) changes SUP's saved attendance on d3
      await teacherSave('a1', id.d3, {
        teachers: [{ teacherId: id.sup, status: 'LATE' }],
      }).expect(200);
      expect((await notificationsOf('sup')).length).toBe(supBefore + 1);
      expect((await notificationsOf('a3')).length).toBe(a3Before);
    });

    it('history: newest first, readable by the session team and the admin; append-only', async () => {
      const h = (
        await http()
          .get(`/api/teacher/sessions/${id.d2}/attendance/history`)
          .set(as('a1'))
          .expect(200)
      ).body;
      expect(h.length).toBe(await changesOf(id.d2));
      expect(h[0]).toMatchObject({
        subject: 'STUDENT',
        kind: expect.stringMatching(/CREATED|MODIFIED/),
        actorName: expect.any(String),
      });
      const times = h.map((c: { createdAt: string }) => c.createdAt);
      expect([...times].sort(byText).reverse()).toEqual(times);
      const one = await prisma.attendanceChange.findFirstOrThrow({
        where: { sessionId: id.d2 },
      });
      await expect(
        prisma.attendanceChange.update({
          where: { id: one.id },
          data: { actorName: 'x' },
        }),
      ).rejects.toThrow(/attendance_changes_immutable/);
    });
  });

  describe('statistics (one rule for students and teachers)', () => {
    it('student: (present + late) / (present + late + absent); excused shown apart; unrecorded and cancelled left out', async () => {
      // s1: d2 EXCUSED; add d1 PRESENT, d3 LATE, and an ABSENT on a cancelled session
      await admin
        .put(`sessions/${id.d1}/attendance`, {
          records: [{ studentId: id.s1, status: 'PRESENT' }],
        })
        .expect(200);
      await admin
        .put(`sessions/${id.d3}/attendance`, {
          records: [{ studentId: id.s1, status: 'LATE' }],
        })
        .expect(200);
      const cancelled = await session('C', addDays(TODAY, -4));
      await admin
        .put(`sessions/${cancelled}/attendance`, {
          records: [{ studentId: id.s1, status: 'ABSENT' }],
        })
        .expect(200);
      await prisma.session.update({
        where: { id: cancelled },
        data: {
          status: 'CANCELLED',
          completedAt: null,
          completedByUserId: null,
          completionSource: null,
        },
      });
      const sum = (
        await admin
          .get(`students/${id.s1}/attendance/summary`, {
            from: addDays(TODAY, -10),
            to: TODAY,
          })
          .expect(200)
      ).body;
      expect(sum).toMatchObject({
        present: 1,
        late: 1,
        absent: 0,
        excused: 1,
        attended: 2,
        eligible: 2,
        rate: 100,
      });
      // The student reads their own; zero denominator → rate null (never 0% / 100%)
      const own = (
        await http()
          .get('/api/student/attendance/summary')
          .query({ from: '2000-01-01', to: '2000-01-31' })
          .set(as('pupil'))
          .expect(200)
      ).body;
      expect(own).toMatchObject({ recorded: 0, eligible: 0, rate: null });
    });

    it('month boundaries are date-only (Tunis): a session on the last day of a month counts in that month only', async () => {
      const firstOfMonth = `${TODAY.slice(0, 8)}01`;
      const lastOfPrev = addDays(firstOfMonth, -1);
      const prev = await session('C', lastOfPrev, '08:00');
      await admin
        .put(`sessions/${prev}/attendance`, {
          records: [{ studentId: id.s3, status: 'ABSENT' }],
        })
        .expect(200);
      const month = (from: string, to: string) =>
        admin
          .get(`students/${id.s3}/attendance/summary`, { from, to })
          .expect(200)
          .then((r) => r.body);
      const before = await month(`${lastOfPrev.slice(0, 8)}01`, lastOfPrev);
      expect(before.absent).toBe(1);
      const current = await month(firstOfMonth, TODAY);
      expect(current.absent).toBe(0);
    });

    it('teacher: own totals over the sessions they taught (each counted once), admin and teacher self', async () => {
      const range = { from: addDays(TODAY, -10), to: TODAY };
      const bySup = (
        await admin
          .get(`teachers/${id.sup}/attendance/summary`, range)
          .expect(200)
      ).body;
      // SUP: d2 ABSENT, d3 LATE → 1 / 2
      expect(bySup).toMatchObject({
        late: 1,
        absent: 1,
        attended: 1,
        eligible: 2,
        rate: 50,
      });
      const self = (
        await http()
          .get('/api/teacher/attendance/summary')
          .query(range)
          .set(as('sup'))
          .expect(200)
      ).body;
      expect(self).toMatchObject({ attended: 1, eligible: 2, rate: 50 });
      const records = (
        await http()
          .get('/api/teacher/attendance')
          .query(range)
          .set(as('sup'))
          .expect(200)
      ).body.data;
      expect(
        records
          .map((r: { sessionId: string; role: string }) => [
            r.sessionId,
            r.role,
          ])
          .sort(byText),
      ).toEqual(
        [
          [id.d2, 'SUPERVISOR'],
          [id.d3, 'SUPERVISOR'],
        ].sort(byText),
      );
      // Association-wide, one line per teacher (filtered by group)
      const lines = (
        await admin
          .get('attendance/teachers-summary', { ...range, groupId: id.group })
          .expect(200)
      ).body as { teacherId: string; eligible: number }[];
      const ids = lines.map((l) => l.teacherId);
      expect(new Set(ids).size).toBe(ids.length);
      expect(lines.find((l) => l.teacherId === id.sup)?.eligible).toBe(2);
      // A student cannot read teacher statistics
      await http()
        .get(`/api/admin/teachers/${id.sup}/attendance/summary`)
        .set(as('pupil'))
        .expect(403);
    });

    it('academic-year filter uses the year’s own dates', async () => {
      const year = (
        await admin
          .post('academic-years', {
            label: `سنة-${RUN.slice(0, 6)}`,
            startDate: addDays(TODAY, -2),
            endDate: addDays(TODAY, 30),
            semester2StartDate: addDays(TODAY, 10),
          })
          .expect(201)
      ).body.id;
      // SUP inside the year: only d2 (−2) counts, d3 (−3) is before it
      const sum = (
        await admin
          .get(`teachers/${id.sup}/attendance/summary`, {
            academicYearId: year,
          })
          .expect(200)
      ).body;
      expect(sum).toMatchObject({ absent: 1, late: 0, eligible: 1, rate: 0 });
    });
  });
});
