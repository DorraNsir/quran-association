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

/**
 * Part 10.11 backend additions: teacher / student workspace bundles, scoped
 * sessions, attendance, memorization and finance reads, teacher notes and
 * the admin key figures. Scope always follows the authenticated account.
 */
describe('Workspaces (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const token: Record<string, string> = {};
  const id: Record<string, string> = {};

  const http = () => request(app.getHttpServer());
  const as = (who: string) => ({ Authorization: `Bearer ${token[who]}` });
  const get = (who: string, path: string, query: object = {}) =>
    http().get(`/api/${path}`).query(query).set(as(who));
  const send = (
    who: string,
    method: 'post' | 'patch' | 'put' | 'delete',
    path: string,
    body: object = {},
  ) => http()[method](`/api/${path}`).set(as(who)).send(body);

  async function login(key: string) {
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

  const userData = async (key: string, roles: Role[]) => ({
    username: `e2e-${RUN}-${key}`.toLowerCase(),
    passwordHash: await new PasswordService().hash(PASSWORD),
    mustChangePassword: false,
    roles: { create: roles.map((role) => ({ role })) },
  });

  async function account(key: string, roles: Role[], withTeacher = false) {
    const person = await prisma.person.create({
      data: {
        firstName: key,
        lastName: tag('حساب'),
        ...(withTeacher
          ? { teacher: { create: { joinedAt: new Date('2024-09-01') } } }
          : {}),
        user: { create: await userData(key, roles) },
      },
      select: { teacher: { select: { id: true } } },
    });
    if (withTeacher) id[key] = person.teacher!.id;
    await login(key);
  }

  async function student(key: string, classKey: string) {
    id[key] = (
      await send('admin', 'post', 'admin/students', {
        person: {
          firstName: key,
          lastName: tag('طالب'),
          gender: 'MALE',
          dateOfBirth: '2014-05-01',
          address: 'نابل',
          phone: '22123456',
        },
        groupClassId: id[classKey],
        registrationDate: addDays(TODAY, -60),
        guardianPhone: '98765432',
      }).expect(201)
    ).body.id;
  }

  const session = async (classKey: string, date: string, start = '17:00') =>
    (
      await send('admin', 'post', 'admin/sessions', {
        groupClassId: id[classKey],
        date,
        startTime: start,
        endTime: `${String(Number(start.slice(0, 2)) + 1).padStart(2, '0')}:00`,
      }).expect(201)
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

    id.branch = (
      await send('admin', 'post', 'admin/branches', {
        name: tag('فرع'),
        address: 'نابل',
      }).expect(201)
    ).body.id;
    for (const r of ['R1', 'R2', 'R3'])
      id[r] = (
        await send('admin', 'post', 'admin/rooms', {
          branchId: id.branch,
          name: tag(r),
        }).expect(201)
      ).body.id;
    id.group = (
      await send('admin', 'post', 'admin/groups', {
        name: tag('مجموعة'),
        audience: 'أطفال',
      }).expect(201)
    ).body.id;
    const cls = async (
      key: string,
      room: string,
      sup: string,
      asst: string[] = [],
    ) =>
      (id[key] = (
        await send('admin', 'post', 'admin/group-classes', {
          groupId: id.group,
          branchId: id.branch,
          roomId: id[room],
          supervisorId: id[sup],
          assistantTeacherIds: asst.map((a) => id[a]),
        }).expect(201)
      ).body.id);
    await cls('A', 'R1', 'sup', ['asst']);
    await cls('B', 'R2', 'other');
    await cls('C', 'R3', 'sup');
    await send('admin', 'post', `admin/group-classes/${id.A}/schedules`, {
      dayOfWeek: 'MON',
      startTime: '08:00',
      endTime: '09:00',
    }).expect(201);

    await student('s1', 'A');
    await student('s2', 'A');
    await student('s4', 'B');

    // A login for student s1 (its own Person), and one for an inactive-free STUDENT role without profile
    const s1 = await prisma.student.findUniqueOrThrow({
      where: { id: id.s1 },
      select: { personId: true },
    });
    await prisma.user.create({
      data: {
        personId: s1.personId,
        ...(await userData('pupil', [Role.STUDENT])),
      },
    });
    await login('pupil');
    await account('noprofile', [Role.STUDENT]);

    id.aPast = await session('A', addDays(TODAY, -2));
    id.aFuture = await session('A', addDays(TODAY, 3));
    id.bPast = await session('B', addDays(TODAY, -2), '15:00');
    await send('admin', 'put', `admin/sessions/${id.aPast}/attendance`, {
      records: [
        { studentId: id.s1, status: 'PRESENT' },
        { studentId: id.s2, status: 'ABSENT' },
      ],
    }).expect(200);
  });

  afterAll(async () => {
    const persons = (
      await prisma.person.findMany({
        where: { lastName: { endsWith: RUN } },
        select: { id: true },
      })
    ).map((p) => p.id);
    const studentWhere = { personId: { in: persons } };
    const classes = { group: { name: { endsWith: RUN } } };
    await prisma.teacherNote.deleteMany({ where: { student: studentWhere } });
    await prisma.studentAttendance.deleteMany({
      where: { student: studentWhere },
    });
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

  describe('teacher workspace', () => {
    it('lists only my classes, their references, team, slots and current students', async () => {
      const { body } = await get('sup', 'teacher/workspace').expect(200);
      expect(body.teacher.id).toBe(id.sup);
      expect(body.groupClasses.map((c: { id: string }) => c.id).sort()).toEqual(
        [id.A, id.C].sort(),
      );
      const a = body.groupClasses.find((c: { id: string }) => c.id === id.A);
      expect(a).toMatchObject({
        supervisorId: id.sup,
        assistantIds: [id.asst],
        groupId: id.group,
      });
      expect(body.teachers.map((t: { id: string }) => t.id).sort()).toEqual(
        [id.sup, id.asst].sort(),
      );
      expect(body.schedules).toEqual([
        expect.objectContaining({
          groupClassId: id.A,
          dayOfWeek: 'MON',
          startTime: '08:00',
          endTime: '09:00',
        }),
      ]);
      expect(body.students.map((s: { id: string }) => s.id).sort()).toEqual(
        [id.s1, id.s2].sort(),
      );
      // Teachers never receive a student's CIN or address
      expect(body.students[0]).not.toHaveProperty('cin');
      expect(body.students[0]).not.toHaveProperty('address');
      expect(body.branches).toHaveLength(1);
      expect(body.rooms.map((r: { id: string }) => r.id).sort()).toEqual(
        [id.R1, id.R3].sort(),
      );
    });

    it('an assistant sees the class too; another teacher does not', async () => {
      const asst = await get('asst', 'teacher/workspace').expect(200);
      expect(asst.body.groupClasses.map((c: { id: string }) => c.id)).toEqual([
        id.A,
      ]);
      const other = await get('other', 'teacher/workspace').expect(200);
      expect(other.body.groupClasses.map((c: { id: string }) => c.id)).toEqual([
        id.B,
      ]);
      expect(other.body.students.map((s: { id: string }) => s.id)).toEqual([
        id.s4,
      ]);
    });

    it('requires the TEACHER role', async () => {
      await get('admin', 'teacher/workspace').expect(403);
      await get('pupil', 'teacher/workspace').expect(403);
    });
  });

  describe('teacher sessions', () => {
    it('lists my sessions only — a teacher filter in the query is ignored', async () => {
      const mine = await get('sup', 'teacher/sessions', {
        from: addDays(TODAY, -5),
        to: addDays(TODAY, 5),
        teacherId: id.other,
        pageSize: 100,
      }).expect(200);
      const ids = mine.body.data.map((s: { id: string }) => s.id);
      expect(ids).toEqual(expect.arrayContaining([id.aPast, id.aFuture]));
      expect(ids).not.toContain(id.bPast);
      // Attendance progress per session (roster on the date vs. records), in the list itself
      const past = mine.body.data.find(
        (s: { id: string }) => s.id === id.aPast,
      );
      expect(past.attendance).toEqual({
        expected: 2,
        recorded: 2,
        present: 1,
        absent: 1,
        late: 0,
        excused: 0,
      });
      const latestFirst = await get('sup', 'teacher/sessions', {
        from: addDays(TODAY, -5),
        to: addDays(TODAY, 5),
        order: 'desc',
      }).expect(200);
      expect(latestFirst.body.data[0].id).toBe(id.aFuture);
      const future = mine.body.data.find(
        (s: { id: string }) => s.id === id.aFuture,
      );
      expect(future.attendance).toMatchObject({ expected: 2, recorded: 0 });
      const calendar = await get('other', 'teacher/sessions/calendar', {
        from: addDays(TODAY, -5),
        to: addDays(TODAY, 5),
      }).expect(200);
      expect(calendar.body.map((s: { id: string }) => s.id)).toEqual([
        id.bPast,
      ]);
    });

    it('opens one of my sessions; another class session is refused', async () => {
      await get('asst', `teacher/sessions/${id.aPast}`).expect(200);
      const refused = await get('sup', `teacher/sessions/${id.bPast}`).expect(
        403,
      );
      expect(refused.body.code).toBe('TEACHER_CLASS_ACCESS_DENIED');
      await get('sup', `teacher/sessions/${randomUUID()}`).expect(404);
    });
  });

  describe('teacher reads a student attendance', () => {
    const range = { from: addDays(TODAY, -10), to: TODAY };

    it('for a student I teach', async () => {
      const records = await get(
        'sup',
        `teacher/students/${id.s1}/attendance`,
        range,
      ).expect(200);
      expect(records.body.data).toEqual([
        expect.objectContaining({ sessionId: id.aPast, status: 'PRESENT' }),
      ]);
      const summary = await get(
        'asst',
        `teacher/students/${id.s2}/attendance/summary`,
        range,
      ).expect(200);
      expect(summary.body).toMatchObject({ recorded: 1, absent: 1, rate: 0 });
      // Default period (the current academic year, or today) — still access-checked
      await get('sup', `teacher/students/${id.s1}/attendance`).expect((res) => {
        expect([200, 403]).toContain(res.status);
      });
    });

    it('refused for a student of another class', async () => {
      const res = await get(
        'other',
        `teacher/students/${id.s1}/attendance`,
        range,
      ).expect(403);
      expect(res.body.code).toBe('TEACHER_CLASS_ACCESS_DENIED');
      await get(
        'other',
        `teacher/students/${randomUUID()}/attendance/summary`,
        range,
      ).expect(404);
    });
  });

  describe('teacher notes', () => {
    it('are private to their author', async () => {
      const created = await send('sup', 'post', 'teacher/notes', {
        studentId: id.s1,
        content: '  يحتاج إلى مراجعة سورة النبأ  ',
      }).expect(201);
      expect(created.body).toMatchObject({
        studentId: id.s1,
        groupClassId: id.A,
        date: TODAY,
        content: 'يحتاج إلى مراجعة سورة النبأ',
      });
      id.note = created.body.id;

      const mine = await get('sup', 'teacher/notes', {
        studentId: id.s1,
      }).expect(200);
      expect(mine.body.data.map((n: { id: string }) => n.id)).toEqual([
        id.note,
      ]);
      const theirs = await get('asst', 'teacher/notes').expect(200);
      expect(theirs.body.data).toEqual([]);

      await send('asst', 'patch', `teacher/notes/${id.note}`, {
        content: 'x',
      }).expect(404);
      await send('other', 'delete', `teacher/notes/${id.note}`).expect(404);

      const edited = await send('sup', 'patch', `teacher/notes/${id.note}`, {
        content: 'تحسّن ملحوظ',
        date: addDays(TODAY, -1),
      }).expect(200);
      expect(edited.body).toMatchObject({
        content: 'تحسّن ملحوظ',
        date: addDays(TODAY, -1),
      });
      const forAdmin = await get(
        'admin',
        `admin/students/${id.s1}/teacher-notes`,
      ).expect(200);
      expect(forAdmin.body).toEqual([
        expect.objectContaining({
          id: id.note,
          teacher: expect.objectContaining({ id: id.sup }),
        }),
      ]);
      await get('sup', `admin/students/${id.s1}/teacher-notes`).expect(403);
      await send('sup', 'delete', `teacher/notes/${id.note}`).expect(204);
      await send('sup', 'delete', `teacher/notes/${id.note}`).expect(404);
    });

    it('only for my current students, never in the future, never empty', async () => {
      const other = await send('other', 'post', 'teacher/notes', {
        studentId: id.s1,
        content: 'ملاحظة',
      }).expect(400);
      expect(other.body.code).toBe('TEACHER_NOTE_STUDENT_NOT_ASSIGNED');
      const future = await send('sup', 'post', 'teacher/notes', {
        studentId: id.s1,
        content: 'ملاحظة',
        date: addDays(TODAY, 2),
      }).expect(400);
      expect(future.body.code).toBe('TEACHER_NOTE_DATE_FUTURE');
      await send('sup', 'post', 'teacher/notes', {
        studentId: id.s1,
        content: '   ',
      }).expect(400);
      await send('pupil', 'post', 'teacher/notes', {
        studentId: id.s1,
        content: 'x',
      }).expect(403);
    });
  });

  describe('student workspace', () => {
    it('my profile and my current class only', async () => {
      const { body } = await get('pupil', 'student/workspace').expect(200);
      expect(body.student).toMatchObject({
        id: id.s1,
        groupClassId: id.A,
        address: 'نابل',
        guardianPhone: '98765432',
      });
      expect(body.groupClasses.map((c: { id: string }) => c.id)).toEqual([
        id.A,
      ]);
      expect(body.teachers.map((t: { id: string }) => t.id).sort()).toEqual(
        [id.sup, id.asst].sort(),
      );
      expect(body.schedules).toHaveLength(1);
    });

    it('needs a student profile and the STUDENT role', async () => {
      const res = await get('noprofile', 'student/workspace').expect(403);
      expect(res.body.code).toBe('STUDENT_PROFILE_REQUIRED');
      await get('sup', 'student/workspace').expect(403);
    });

    it('sessions of my class, without administrative fields', async () => {
      const list = await get('pupil', 'student/sessions', {
        from: addDays(TODAY, -5),
        to: addDays(TODAY, 5),
        groupClassId: id.B,
      }).expect(200);
      const ids = list.body.data.map((s: { id: string }) => s.id);
      expect(ids).toEqual([id.aPast, id.aFuture]);
      expect(list.body.data[0]).not.toHaveProperty('attention');
      expect(list.body.data[0]).not.toHaveProperty('completion');
      const calendar = await get('pupil', 'student/sessions/calendar', {
        from: addDays(TODAY, -5),
        to: addDays(TODAY, 5),
      }).expect(200);
      expect(calendar.body.map((s: { id: string }) => s.id)).toEqual([
        id.aPast,
        id.aFuture,
      ]);
    });

    it('my attendance, memorization and finance', async () => {
      const records = await get('pupil', 'student/attendance').expect(200);
      expect(records.body.data).toEqual([
        expect.objectContaining({ sessionId: id.aPast, status: 'PRESENT' }),
      ]);
      const summary = await get('pupil', 'student/attendance/summary').expect(
        200,
      );
      expect(summary.body).toMatchObject({
        recorded: 1,
        present: 1,
        rate: 100,
      });
      await get('pupil', 'student/memorization').expect(200, []);
      const finance = await get('pupil', 'student/finance/summary').expect(200);
      expect(finance.body.student.id).toBe(id.s1);
      expect(finance.body.obligations).toEqual([]);
      await get('pupil', 'student/payments').expect(200, []);
    });
  });

  describe('admin attendance summary per student', () => {
    it('groups records by student with the shared rate rule and filters', async () => {
      const range = { from: addDays(TODAY, -10), to: TODAY };
      const { body } = await get('admin', 'admin/attendance/students-summary', {
        ...range,
        groupClassId: id.A,
      }).expect(200);
      expect(body).toEqual([
        expect.objectContaining({
          studentId: id.s2,
          recorded: 1,
          absent: 1,
          rate: 0,
        }),
        expect.objectContaining({
          studentId: id.s1,
          recorded: 1,
          present: 1,
          rate: 100,
        }),
      ]);
      const other = await get('admin', 'admin/attendance/students-summary', {
        ...range,
        groupClassId: id.B,
      }).expect(200);
      expect(other.body).toEqual([]);
      await get('sup', 'admin/attendance/students-summary').expect(403);
    });
  });

  describe('admin dashboard', () => {
    it('key figures for admins only', async () => {
      const { body } = await get('admin', 'admin/dashboard').expect(200);
      expect(body.today).toBe(TODAY);
      expect(body.students.total).toBeGreaterThanOrEqual(3);
      expect(body.students.active).toBeGreaterThanOrEqual(3);
      expect(body.students.registeredLast30Days).toBeGreaterThanOrEqual(0);
      expect(body.teachers.active).toBeGreaterThanOrEqual(3);
      expect(body.groups.runningClasses).toBeGreaterThanOrEqual(3);
      expect(body.branches.activeRooms).toBeGreaterThanOrEqual(3);
      expect(typeof body.registrationRequests.pending).toBe('number');
      expect(typeof body.sessions.needsAttention).toBe('number');
      await get('sup', 'admin/dashboard').expect(403);
    });
  });

  describe('platform preferences', () => {
    it('readable by every signed-in role, with the current academic year', async () => {
      for (const who of ['admin', 'sup', 'pupil']) {
        const { body } = await get(who, 'platform-preferences').expect(200);
        expect(body.timezone).toBe('Africa/Tunis');
        expect(['DD_MM_YYYY', 'YYYY_MM_DD']).toContain(body.dateFormat);
        expect(body).toHaveProperty('currentAcademicYear');
      }
      await http().get('/api/platform-preferences').expect(401);
    });
  });
});
