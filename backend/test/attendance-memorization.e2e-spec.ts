import { randomUUID } from 'node:crypto';

import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';

import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { PasswordService } from '../src/auth/password.service.js';
import { todayIn } from '../src/common/dates.js';
import { Role } from '../src/generated/prisma/enums.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { classRooms } from './class-rooms.js';

const RUN = randomUUID().slice(0, 8);
const PASSWORD = 'initial-pass-123';
const tag = (s: string) => `${s} ${RUN}`;
const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const TODAY = todayIn('Africa/Tunis');

describe('Attendance & memorization (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const token: Record<string, string> = {};
  const id: Record<string, string> = {};

  const http = () => request(app.getHttpServer());
  const as = (t: string) => ({ Authorization: `Bearer ${t}` });
  // Each class's usual room: applied to its weekly slots / ad-hoc sessions (rooms are per slot)
  const rooms = classRooms();
  const admin = {
    get: (path: string, query: object = {}) =>
      http().get(`/api/admin/${path}`).query(query).set(as(token.admin)),
    post: (path: string, body: object) =>
      rooms.post(path, body, (b) =>
        http().post(`/api/admin/${path}`).set(as(token.admin)).send(b),
      ),
    put: (path: string, body: object) =>
      http().put(`/api/admin/${path}`).set(as(token.admin)).send(body),
    patch: (path: string, body: object) =>
      http().patch(`/api/admin/${path}`).set(as(token.admin)).send(body),
  };
  const teacher = (who: string) => ({
    get: (path: string, query: object = {}) =>
      http().get(`/api/teacher/${path}`).query(query).set(as(token[who])),
    put: (path: string, body: object) =>
      http().put(`/api/teacher/${path}`).set(as(token[who])).send(body),
  });
  const statusOf = async (sessionId: string) =>
    (await prisma.session.findUniqueOrThrow({ where: { id: sessionId } }))
      .status;

  async function account(key: string, roles: Role[], withTeacher = false) {
    const person = await prisma.person.create({
      data: {
        firstName: key,
        lastName: tag('حساب'),
        ...(withTeacher
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
      select: { teacher: { select: { id: true } } },
    });
    if (withTeacher) id[key] = person.teacher!.id;
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

  async function student(
    key: string,
    groupClassKey: string,
    registrationDate: string,
  ) {
    id[key] = (
      await admin
        .post('students', {
          person: {
            firstName: key,
            lastName: tag('طالب'),
            gender: 'MALE',
            dateOfBirth: '2014-05-01',
            address: 'نابل',
          },
          groupClassId: id[groupClassKey],
          registrationDate,
          guardianPhone: '98765432',
        })
        .expect(201)
    ).body.id;
  }

  const session = async (
    classKey: string,
    date: string,
    start = '17:00',
    end = '18:00',
  ) =>
    (
      await admin
        .post('sessions', {
          groupClassId: id[classKey],
          date,
          startTime: start,
          endTime: end,
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
    await account('sup', [Role.TEACHER], true);
    await account('asst', [Role.TEACHER], true);
    await account('other', [Role.TEACHER], true);
    await account('pupil', [Role.STUDENT]);

    id.branch = (
      await admin
        .post('branches', { name: tag('فرع'), address: 'نابل' })
        .expect(201)
    ).body.id;
    id.R1 = (
      await admin
        .post('rooms', { branchId: id.branch, name: tag('R1') })
        .expect(201)
    ).body.id;
    id.R2 = (
      await admin
        .post('rooms', { branchId: id.branch, name: tag('R2') })
        .expect(201)
    ).body.id;
    id.R3 = (
      await admin
        .post('rooms', { branchId: id.branch, name: tag('R3') })
        .expect(201)
    ).body.id;
    id.group = (
      await admin
        .post('groups', { name: tag('مجموعة'), audience: 'أطفال' })
        .expect(201)
    ).body.id;
    const cls = async (
      key: string,
      roomKey: string,
      supervisor: string,
      assistants: string[] = [],
    ) =>
      (id[key] = (
        await admin
          .post('group-classes', {
            groupId: id.group,
            branchId: id.branch,
            roomId: id[roomKey],
            supervisorId: id[supervisor],
            assistantTeacherIds: assistants.map((a) => id[a]),
          })
          .expect(201)
      ).body.id);
    await cls('A', 'R1', 'sup', ['asst']);
    await cls('B', 'R2', 'other');
    await cls('C', 'R3', 'sup'); // stays without students

    for (const s of ['s1', 's2', 's3', 's5'])
      await student(s, 'A', addDays(TODAY, -60));
    await student('s4', 'B', addDays(TODAY, -60));
    await student('s6', 'A', addDays(TODAY, -400));
    await admin
      // Inactive since registration (back-dated): never expected on any roster
      .patch(`students/${id.s5}/status`, {
        status: 'INACTIVE',
        effectiveDate: addDays(TODAY, -60),
      })
      .expect(200);

    id.past1 = await session('A', addDays(TODAY, -3));
    id.past2 = await session('A', addDays(TODAY, -1));
    id.old = await session('A', addDays(TODAY, -20));
    id.future = await session('A', addDays(TODAY, 5));
    id.toCancel = await session('A', addDays(TODAY, -2));
    id.bPast = await session('B', addDays(TODAY, -1));
    id.emptyC = await session('C', addDays(TODAY, -3), '09:00', '10:00');

    // Academic years (test DB only): current one around today, and a previous one
    const yearLabel = (n: string) => `${n}-${RUN.slice(0, 6)}`;
    id.year = (
      await admin
        .post('academic-years', {
          label: yearLabel('Y1'),
          startDate: addDays(TODAY, -120),
          endDate: addDays(TODAY, 200),
          semester2StartDate: addDays(TODAY, 30),
        })
        .expect(201)
    ).body.id;
    id.prevYear = (
      await admin
        .post('academic-years', {
          label: yearLabel('Y0'),
          startDate: addDays(TODAY, -480),
          endDate: addDays(TODAY, -130),
          semester2StartDate: addDays(TODAY, -300),
        })
        .expect(201)
    ).body.id;
  });

  afterAll(async () => {
    const persons = (
      await prisma.person.findMany({
        where: { lastName: { endsWith: RUN } },
        select: { id: true },
      })
    ).map((p) => p.id);
    const studentWhere = { personId: { in: persons } };
    await prisma.memorizationProgress.deleteMany({
      where: { student: studentWhere },
    });
    await prisma.studentAttendance.deleteMany({
      where: { student: studentWhere },
    });
    const classes = { group: { name: { endsWith: RUN } } };
    await prisma.session.deleteMany({ where: { groupClass: classes } });
    await prisma.weeklySchedule.deleteMany({ where: { groupClass: classes } });
    await prisma.studentEnrollment.deleteMany({
      where: { student: studentWhere },
    });
    await prisma.studentStatusChange.deleteMany({
      where: { student: studentWhere },
    });
    await prisma.student.deleteMany({ where: studentWhere });
    await prisma.groupClassAssistant.deleteMany({
      where: { groupClass: classes },
    });
    await prisma.groupClass.deleteMany({ where: classes });
    await prisma.academicYear.deleteMany({
      where: { label: { endsWith: RUN.slice(0, 6) } },
    });
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

  // ───────────────────────── attendance: access ─────────────────────────

  describe('attendance access', () => {
    it('admin, supervisor and assistant see the roster; others are refused', async () => {
      const roster = await admin
        .get(`sessions/${id.past1}/attendance`)
        .expect(200);
      expect(roster.body).toMatchObject({
        sessionStatus: 'SCHEDULED',
        expectedCount: 4,
        recordedCount: 0,
        complete: false,
        editable: true,
      });
      expect(
        roster.body.students
          .map((s: { studentId: string }) => s.studentId)
          .sort(),
      ).toEqual([id.s1, id.s2, id.s3, id.s6].sort());
      expect(
        roster.body.students.every(
          (s: { status: unknown; recorded: boolean }) =>
            s.status === null && !s.recorded,
        ),
      ).toBe(true);

      await teacher('sup').get(`sessions/${id.past1}/attendance`).expect(200);
      await teacher('asst').get(`sessions/${id.past1}/attendance`).expect(200);
      expect(
        (
          await teacher('other')
            .get(`sessions/${id.past1}/attendance`)
            .expect(403)
        ).body.code,
      ).toBe('TEACHER_CLASS_ACCESS_DENIED');
      expect(
        (
          await teacher('pupil')
            .get(`sessions/${id.past1}/attendance`)
            .expect(403)
        ).body.code,
      ).toBe('FORBIDDEN_ROLE');
      await http()
        .get(`/api/admin/sessions/${id.past1}/attendance`)
        .set(as(token.sup))
        .expect(403);
      await teacher('other')
        .put(`sessions/${id.past1}/attendance`, {
          records: [{ studentId: id.s1, status: 'PRESENT' }],
        })
        .expect(403);
      await admin.get(`sessions/${randomUUID()}/attendance`).expect(404);
    });
  });

  // ───────────────────────── attendance: recording ─────────────────────────

  describe('recording attendance', () => {
    it('the roster uses enrollment on the date and active students (s6 joined earlier, s5 inactive, s4 elsewhere)', async () => {
      const ids = (
        await admin.get(`sessions/${id.past1}/attendance`).expect(200)
      ).body.students.map((s: { studentId: string }) => s.studentId);
      expect(ids).toContain(id.s6); // enrolled long before
      expect(ids).not.toContain(id.s5); // inactive
      expect(ids).not.toContain(id.s4); // another class
    });

    it('partial save creates records without completing the session', async () => {
      const res = await teacher('asst')
        .put(`sessions/${id.past1}/attendance`, {
          records: [
            { studentId: id.s1, status: 'PRESENT' },
            { studentId: id.s2, status: 'ABSENT', note: 'مريض' },
          ],
        })
        .expect(200);
      expect(res.body).toMatchObject({
        sessionStatus: 'SCHEDULED',
        recordedCount: 2,
        complete: false,
      });
      const s2 = res.body.students.find(
        (s: { studentId: string }) => s.studentId === id.s2,
      );
      expect(s2).toMatchObject({
        status: 'ABSENT',
        note: 'مريض',
        recorded: true,
        recordedBy: `e2e-${RUN}-asst`,
      });
      expect(await statusOf(id.past1)).toBe('SCHEDULED');
    });

    it('rejects duplicates, invalid statuses and students outside the session — atomically', async () => {
      const put = (records: object[]) =>
        admin.put(`sessions/${id.past1}/attendance`, { records });
      expect(
        (
          await put([
            { studentId: id.s3, status: 'PRESENT' },
            { studentId: id.s3, status: 'LATE' },
          ]).expect(400)
        ).body.code,
      ).toBe('ATTENDANCE_DUPLICATE_STUDENT');
      await put([{ studentId: id.s3, status: 'HERE' }]).expect(400);
      await put([
        { studentId: id.s3, status: 'PRESENT', note: 'x'.repeat(301) },
      ]).expect(400);
      await put([]).expect(400);
      expect(
        (
          await put([
            { studentId: id.s3, status: 'PRESENT' },
            { studentId: id.s4, status: 'PRESENT' },
          ]).expect(400)
        ).body.code,
      ).toBe('ATTENDANCE_STUDENT_NOT_IN_SESSION');
      expect(
        await prisma.studentAttendance.count({
          where: { sessionId: id.past1, studentId: id.s3 },
        }),
      ).toBe(0); // nothing saved
    });

    it('recording every expected student completes the session (source ATTENDANCE), atomically', async () => {
      const res = await teacher('sup')
        .put(`sessions/${id.past1}/attendance`, {
          records: [
            { studentId: id.s3, status: 'LATE' },
            { studentId: id.s6, status: 'EXCUSED' },
          ],
        })
        .expect(200);
      expect(res.body).toMatchObject({
        sessionStatus: 'COMPLETED',
        completionSource: 'ATTENDANCE',
        complete: true,
        recordedCount: 4,
      });
      const s = await prisma.session.findUniqueOrThrow({
        where: { id: id.past1 },
      });
      expect(s.completionSource).toBe('ATTENDANCE');
    });

    it('repeated saves never duplicate; a correction updates the same row and does not reopen', async () => {
      const before = await prisma.studentAttendance.findUniqueOrThrow({
        where: {
          sessionId_studentId: { sessionId: id.past1, studentId: id.s2 },
        },
      });
      await teacher('sup')
        .put(`sessions/${id.past1}/attendance`, {
          records: [{ studentId: id.s1, status: 'PRESENT' }],
        })
        .expect(200);
      const corrected = await teacher('sup')
        .put(`sessions/${id.past1}/attendance`, {
          records: [{ studentId: id.s2, status: 'LATE' }],
        })
        .expect(200);
      expect(corrected.body.sessionStatus).toBe('COMPLETED');
      const after = await prisma.studentAttendance.findUniqueOrThrow({
        where: {
          sessionId_studentId: { sessionId: id.past1, studentId: id.s2 },
        },
      });
      expect(after).toMatchObject({
        id: before.id,
        status: 'LATE',
        note: 'مريض',
      }); // note kept when omitted
      expect(after.createdAt.getTime()).toBe(before.createdAt.getTime());
      expect(after.updatedAt.getTime()).toBeGreaterThan(
        before.updatedAt.getTime(),
      );
      expect(
        await prisma.studentAttendance.count({
          where: { sessionId: id.past1 },
        }),
      ).toBe(4);
      await teacher('sup')
        .put(`sessions/${id.past1}/attendance`, {
          records: [{ studentId: id.s2, status: 'LATE', note: null }],
        })
        .expect(200);
      expect(
        (
          await prisma.studentAttendance.findUniqueOrThrow({
            where: { id: before.id },
          })
        ).note,
      ).toBeNull();
    });

    it('cancelled and future sessions refuse attendance; an empty roster never auto-completes', async () => {
      await admin
        .patch(`sessions/${id.toCancel}/status`, { status: 'CANCELLED' })
        .expect(200);
      expect(
        (
          await admin
            .put(`sessions/${id.toCancel}/attendance`, {
              records: [{ studentId: id.s1, status: 'PRESENT' }],
            })
            .expect(409)
        ).body.code,
      ).toBe('ATTENDANCE_SESSION_CANCELLED');
      expect(
        (
          await admin
            .put(`sessions/${id.future}/attendance`, {
              records: [{ studentId: id.s1, status: 'PRESENT' }],
            })
            .expect(409)
        ).body.code,
      ).toBe('ATTENDANCE_SESSION_FUTURE');
      expect(await statusOf(id.future)).toBe('SCHEDULED');
      expect(
        (await admin.get(`sessions/${id.future}/attendance`).expect(200)).body
          .editable,
      ).toBe(false);

      const empty = await admin
        .get(`sessions/${id.emptyC}/attendance`)
        .expect(200);
      expect(empty.body).toMatchObject({
        expectedCount: 0,
        complete: false,
        sessionStatus: 'SCHEDULED',
      });
      await admin
        .put(`sessions/${id.emptyC}/attendance`, {
          records: [{ studentId: id.s1, status: 'PRESENT' }],
        })
        .expect(400);
      expect(await statusOf(id.emptyC)).toBe('SCHEDULED'); // explicit admin override needed
    });

    it('teachers are limited to recent sessions; admins are not', async () => {
      expect(
        (
          await teacher('sup')
            .put(`sessions/${id.old}/attendance`, {
              records: [{ studentId: id.s1, status: 'PRESENT' }],
            })
            .expect(409)
        ).body.code,
      ).toBe('ATTENDANCE_CORRECTION_WINDOW_CLOSED');
      expect(
        (await teacher('sup').get(`sessions/${id.old}/attendance`).expect(200))
          .body.editable,
      ).toBe(false);
      await admin
        .put(`sessions/${id.old}/attendance`, {
          records: [{ studentId: id.s1, status: 'ABSENT' }],
        })
        .expect(200);
    });

    it('a session with attendance can no longer be cancelled or rescheduled', async () => {
      await admin
        .put(`sessions/${id.past2}/attendance`, {
          records: [{ studentId: id.s1, status: 'PRESENT' }],
        })
        .expect(200);
      expect(
        (
          await admin
            .patch(`sessions/${id.past2}/status`, { status: 'CANCELLED' })
            .expect(409)
        ).body.code,
      ).toBe('SESSION_HAS_ATTENDANCE');
      expect(
        (
          await admin
            .patch(`sessions/${id.past2}`, { startTime: '16:00' })
            .expect(409)
        ).body.code,
      ).toBe('SESSION_HAS_ATTENDANCE');
    });

    it('simultaneous saves of the same session never create duplicate rows', async () => {
      const records = [
        { studentId: id.s3, status: 'PRESENT' },
        { studentId: id.s6, status: 'PRESENT' },
      ];
      const results = await Promise.all([
        admin.put(`sessions/${id.past2}/attendance`, { records }),
        teacher('sup').put(`sessions/${id.past2}/attendance`, { records }),
      ]);
      expect(results.map((r) => r.status)).toEqual([200, 200]);
      expect(
        await prisma.studentAttendance.count({
          where: { sessionId: id.past2 },
        }),
      ).toBe(3);
    });
  });

  // ───────────────────────── history & snapshots ─────────────────────────

  describe('historical status (regression: deactivated after attending)', () => {
    it('a student deactivated today stays expected — with their record — on past rosters', async () => {
      await student('s7', 'A', addDays(TODAY, -60));
      const past = await session('A', addDays(TODAY, -4), '17:00', '18:00');
      await admin
        .put(`sessions/${past}/attendance`, {
          records: [{ studentId: id.s7, status: 'PRESENT' }],
        })
        .expect(200);

      await admin
        .patch(`students/${id.s7}/status`, { status: 'INACTIVE' })
        .expect(200);
      const roster = (
        await admin.get(`sessions/${past}/attendance`).expect(200)
      ).body;
      expect(
        roster.students.find(
          (s: { studentId: string }) => s.studentId === id.s7,
        ),
      ).toMatchObject({
        expected: true, // was ACTIVE on that date
        status: 'PRESENT',
      });
      // …and is no longer expected from today on
      const upcomingToday = await session('A', TODAY, '20:00', '21:00');
      const today = (
        await admin.get(`sessions/${upcomingToday}/attendance`).expect(200)
      ).body;
      expect(
        today.students.map((s: { studentId: string }) => s.studentId),
      ).not.toContain(id.s7);
      expect(
        (
          await admin.get(`students/${id.s7}/status-history`).expect(200)
        ).body.map((h: { status: string }) => h.status),
      ).toEqual(['INACTIVE', 'ACTIVE']);
    });

    it('a back-dated deactivation applies from its effective date only', async () => {
      await student('s8', 'A', addDays(TODAY, -60));
      const before = await session('A', addDays(TODAY, -6), '17:00', '18:00');
      const after = await session('A', addDays(TODAY, -5), '17:00', '18:00');
      const res = await admin
        .patch(`students/${id.s8}/status`, {
          status: 'INACTIVE',
          effectiveDate: addDays(TODAY, -5),
        })
        .expect(200);
      expect(res.body.status).toBe('INACTIVE');
      const ids = async (sid: string) =>
        (
          await admin.get(`sessions/${sid}/attendance`).expect(200)
        ).body.students
          .filter((s: { expected: boolean }) => s.expected)
          .map((s: { studentId: string }) => s.studentId);
      expect(await ids(before)).toContain(id.s8);
      expect(await ids(after)).not.toContain(id.s8);
    });

    it('validates the effective date', async () => {
      expect(
        (
          await admin
            .patch(`students/${id.s8}/status`, {
              status: 'ACTIVE',
              effectiveDate: addDays(TODAY, 3),
            })
            .expect(400)
        ).body.code,
      ).toBe('FUTURE_EFFECTIVE_DATE');
      expect(
        (
          await admin
            .patch(`students/${id.s8}/status`, {
              status: 'ACTIVE',
              effectiveDate: addDays(TODAY, -100),
            })
            .expect(400)
        ).body.code,
      ).toBe('EFFECTIVE_DATE_BEFORE_REGISTRATION');
    });
  });

  describe('historical membership and teacher snapshots', () => {
    it('a moved student stays on the old class’s past rosters and appears on the new class’s', async () => {
      await admin
        .patch(`students/${id.s3}/group-class`, {
          groupClassId: id.B,
          effectiveDate: addDays(TODAY, -2),
        })
        .expect(200);
      const before = (
        await admin.get(`sessions/${id.past1}/attendance`).expect(200)
      ).body; // day −3: still in A
      expect(
        before.students.find(
          (s: { studentId: string }) => s.studentId === id.s3,
        ),
      ).toMatchObject({ expected: true, status: 'LATE' });
      const after = (
        await admin.get(`sessions/${id.past2}/attendance`).expect(200)
      ).body; // day −1: in B
      expect(
        after.students.find(
          (s: { studentId: string }) => s.studentId === id.s3,
        ),
      ).toMatchObject({ expected: false, recorded: true }); // recorded before the move: kept visible
      const inB = (
        await admin.get(`sessions/${id.bPast}/attendance`).expect(200)
      ).body;
      expect(
        inB.students.map((s: { studentId: string }) => s.studentId).sort(),
      ).toEqual([id.s3, id.s4].sort());
    });

    it('a removed assistant keeps access to past lessons they taught, not to upcoming ones', async () => {
      await admin
        .patch(`group-classes/${id.A}`, { assistantTeacherIds: [] })
        .expect(200);
      await teacher('asst').get(`sessions/${id.past1}/attendance`).expect(200); // snapshot of a past lesson
      expect(
        (
          await teacher('asst')
            .get(`sessions/${id.future}/attendance`)
            .expect(403)
        ).body.code,
      ).toBe('TEACHER_CLASS_ACCESS_DENIED');
      await admin
        .patch(`group-classes/${id.A}`, { assistantTeacherIds: [id.asst] })
        .expect(200);
    });
  });

  // ───────────────────────── statistics ─────────────────────────

  describe('attendance summary', () => {
    it('counts recorded statuses only, excludes cancelled sessions, rate excludes EXCUSED', async () => {
      // s1: past1 PRESENT, past2 PRESENT, old ABSENT; unrecorded sessions (future, emptyC…) never count
      const res = await admin
        .get(`students/${id.s1}/attendance/summary`)
        .expect(200);
      expect(res.body).toMatchObject({
        recorded: 3,
        present: 2,
        absent: 1,
        late: 0,
        excused: 0,
        rate: 66.7,
      });
      const s6 = await admin
        .get(`students/${id.s6}/attendance/summary`)
        .expect(200); // EXCUSED + PRESENT
      expect(s6.body).toMatchObject({
        recorded: 2,
        excused: 1,
        present: 1,
        rate: 100,
      });

      // A session cancelled outside the normal API (legacy data) no longer counts
      await prisma.session.update({
        where: { id: id.old },
        data: { status: 'CANCELLED' },
      });
      expect(
        (await admin.get(`students/${id.s1}/attendance/summary`).expect(200))
          .body,
      ).toMatchObject({ recorded: 2, absent: 0, rate: 100 });
      await prisma.session.update({
        where: { id: id.old },
        data: { status: 'SCHEDULED' },
      });

      const ranged = await admin
        .get(`students/${id.s1}/attendance/summary`, {
          from: addDays(TODAY, -2),
        })
        .expect(200);
      expect(ranged.body).toMatchObject({
        recorded: 1,
        from: addDays(TODAY, -2),
      });
      const byYear = await admin
        .get(`students/${id.s1}/attendance/summary`, {
          academicYearId: id.prevYear,
        })
        .expect(200);
      expect(byYear.body.recorded).toBe(0);
      await admin
        .get(`students/${id.s1}/attendance/summary`, {
          academicYearId: randomUUID(),
        })
        .expect(404);

      const list = await admin
        .get(`students/${id.s1}/attendance`, { academicYearId: id.year })
        .expect(200);
      expect(list.body.meta.total).toBe(3);
      expect(list.body.data[0].date >= list.body.data[1].date).toBe(true);
    });
  });

  // ───────────────────────── memorization ─────────────────────────

  describe('memorization', () => {
    const put = (who: string, studentKey: string, body: object) =>
      who === 'admin'
        ? admin.put(`students/${id[studentKey]}/memorization`, body)
        : teacher(who).put(`students/${id[studentKey]}/memorization`, body);

    it('admin upserts ONE record per student/year/semester', async () => {
      const first = await put('admin', 's1', {
        academicYearId: id.year,
        semester: 'FIRST',
        lastMemorizedSurahNumber: 78,
      }).expect(200);
      expect(first.body).toMatchObject({
        lastMemorizedSurahNumber: 78,
        surahName: 'النبأ',
        semester: 'FIRST',
        updatedBy: `e2e-${RUN}-admin`,
      });
      await put('admin', 's1', {
        academicYearId: id.year,
        semester: 'FIRST',
        lastMemorizedSurahNumber: 80,
      }).expect(200);
      await put('admin', 's1', {
        academicYearId: id.year,
        semester: 'SECOND',
        lastMemorizedSurahNumber: 114,
      }).expect(200);
      const rows = await prisma.memorizationProgress.findMany({
        where: { studentId: id.s1 },
      });
      expect(
        rows
          .map((r) => [r.semester, r.lastMemorizedSurahNumber])
          .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
      ).toEqual([
        ['FIRST', 80],
        ['SECOND', 114],
      ]);
    });

    it('validates surah, semester, year and enrollment', async () => {
      const body = {
        academicYearId: id.year,
        semester: 'FIRST',
        lastMemorizedSurahNumber: 1,
      };
      await put('admin', 's2', { ...body, lastMemorizedSurahNumber: 0 }).expect(
        400,
      );
      await put('admin', 's2', {
        ...body,
        lastMemorizedSurahNumber: 115,
      }).expect(400);
      await put('admin', 's2', {
        ...body,
        lastMemorizedSurahNumber: 2.5,
      }).expect(400);
      await put('admin', 's2', { ...body, semester: 'THIRD' }).expect(400);
      expect(
        (
          await put('admin', 's2', {
            ...body,
            academicYearId: randomUUID(),
          }).expect(404)
        ).body.code,
      ).toBe('ACADEMIC_YEAR_NOT_FOUND');
      await put('admin', 's2', {
        ...body,
        updatedByUserId: randomUUID(),
      }).expect(400); // never from the client
      expect(
        (
          await put('admin', 's2', {
            ...body,
            academicYearId: id.prevYear,
          }).expect(409)
        ).body.code,
      ).toBe('MEMORIZATION_STUDENT_NOT_ENROLLED');
      await put('admin', 's2', body).expect(200); // surah 1 is valid
    });

    it('years and semesters stay separate; no progression rule is imposed', async () => {
      await put('admin', 's6', {
        academicYearId: id.prevYear,
        semester: 'SECOND',
        lastMemorizedSurahNumber: 100,
      }).expect(200);
      await put('admin', 's6', {
        academicYearId: id.year,
        semester: 'FIRST',
        lastMemorizedSurahNumber: 5,
      }).expect(200); // "lower" is fine
      const all = await admin.get(`students/${id.s6}/memorization`).expect(200);
      expect(
        all.body.map(
          (r: {
            academicYear: { id: string };
            lastMemorizedSurahNumber: number;
          }) => [r.academicYear.id, r.lastMemorizedSurahNumber],
        ),
      ).toEqual([
        [id.year, 5],
        [id.prevYear, 100],
      ]);
      expect(
        (
          await admin
            .get(`students/${id.s6}/memorization`, {
              academicYearId: id.prevYear,
            })
            .expect(200)
        ).body,
      ).toHaveLength(1);
    });

    it('teachers: only students of their classes for that semester', async () => {
      const body = {
        academicYearId: id.year,
        semester: 'FIRST',
        lastMemorizedSurahNumber: 67,
      };
      const res = await put('sup', 's2', body).expect(200);
      expect(res.body.updatedBy).toBe(`e2e-${RUN}-sup`);
      expect((await put('other', 's2', body).expect(403)).body.code).toBe(
        'TEACHER_CLASS_ACCESS_DENIED',
      );
      await put('sup', 's4', body).expect(403); // s4 is in B
      expect(
        (
          await teacher('sup')
            .get(`students/${id.s2}/memorization`, {
              academicYearId: id.year,
              semester: 'FIRST',
            })
            .expect(200)
        ).body.lastMemorizedSurahNumber,
      ).toBe(67);
      await teacher('other')
        .get(`students/${id.s2}/memorization`, {
          academicYearId: id.year,
          semester: 'FIRST',
        })
        .expect(403);
      await teacher('pupil')
        .get(`students/${id.s2}/memorization`, {
          academicYearId: id.year,
          semester: 'FIRST',
        })
        .expect(403);
      // s3 moved to B during this semester: both A's and B's teachers may record it
      await put('other', 's3', body).expect(200);
      await put('sup', 's3', body).expect(200);
    });

    it('class list: students of the class during the semester, missing values as null', async () => {
      const res = await teacher('sup')
        .get(`group-classes/${id.A}/memorization`, {
          academicYearId: id.year,
          semester: 'FIRST',
        })
        .expect(200);
      const byId = new Map(
        res.body.students.map((s: { studentId: string }) => [s.studentId, s]),
      );
      expect(
        [...byId.keys()].sort((a, b) => String(a).localeCompare(String(b))),
      ).toEqual([id.s1, id.s2, id.s3, id.s5, id.s6, id.s7, id.s8].sort());
      expect(byId.get(id.s1)).toMatchObject({
        lastMemorizedSurahNumber: 80,
        surahName: 'عبس',
        currentMember: true,
      });
      expect(byId.get(id.s3)).toMatchObject({ currentMember: false });
      expect(byId.get(id.s5)).toMatchObject({
        lastMemorizedSurahNumber: null,
        surahName: null,
        updatedAt: null,
        studentStatus: 'INACTIVE',
      });
      expect(res.body.period).toEqual({
        from: addDays(TODAY, -120),
        to: addDays(TODAY, 29),
      });
      expect(
        (
          await teacher('other')
            .get(`group-classes/${id.A}/memorization`, {
              academicYearId: id.year,
              semester: 'FIRST',
            })
            .expect(403)
        ).body.code,
      ).toBe('TEACHER_CLASS_ACCESS_DENIED');
      await admin
        .get(`group-classes/${id.B}/memorization`, {
          academicYearId: id.year,
          semester: 'SECOND',
        })
        .expect(200);
      await admin
        .get(`group-classes/${id.B}/memorization`, { academicYearId: id.year })
        .expect(400);
    });

    it('simultaneous first writes converge on one record', async () => {
      const body = {
        academicYearId: id.year,
        semester: 'SECOND',
        lastMemorizedSurahNumber: 10,
      };
      const results = await Promise.all([
        put('admin', 's5', body),
        put('admin', 's5', { ...body, lastMemorizedSurahNumber: 11 }),
      ]);
      expect(results.map((r) => r.status)).toEqual([200, 200]);
      expect(
        await prisma.memorizationProgress.count({
          where: { studentId: id.s5, semester: 'SECOND' },
        }),
      ).toBe(1);
    });
  });

  it('the teacher window is configurable (TEACHER_ATTENDANCE_WINDOW_DAYS)', async () => {
    const real = app.get(ConfigService);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ConfigService)
      .useValue({
        get: (key: string, options?: unknown) =>
          key === 'TEACHER_ATTENDANCE_WINDOW_DAYS'
            ? 30
            : real.get(key, options as never),
      })
      .compile();
    const wide = moduleRef.createNestApplication();
    configureApp(wide);
    await wide.init();
    try {
      // 20 days ago: closed with the default 7, open with 30
      await request(wide.getHttpServer())
        .put(`/api/teacher/sessions/${id.old}/attendance`)
        .set(as(token.sup))
        .send({ records: [{ studentId: id.s2, status: 'PRESENT' }] })
        .expect(200);
    } finally {
      await wide.close();
    }
    await teacher('sup')
      .put(`sessions/${id.old}/attendance`, {
        records: [{ studentId: id.s2, status: 'ABSENT' }],
      })
      .expect(409);
  });

  it('Swagger documents attendance and memorization', async () => {
    const doc = (await http().get('/api/docs-json').expect(200)).body;
    for (const path of [
      '/api/admin/sessions/{sessionId}/attendance',
      '/api/teacher/sessions/{sessionId}/attendance',
      '/api/admin/students/{studentId}/attendance/summary',
      '/api/admin/students/{studentId}/memorization',
      '/api/teacher/students/{studentId}/memorization',
      '/api/teacher/group-classes/{groupClassId}/memorization',
    ]) {
      expect(doc.paths).toHaveProperty([path]);
    }
  });
});
