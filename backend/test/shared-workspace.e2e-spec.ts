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
const PAST = addDays(TODAY, -2);

type Slot = {
  id: string;
  groupClassId: string;
  additionalGroupClassIds: string[];
  participants: { groupClassId: string; group: { name: string } }[];
};
type SessionMemo = {
  scope: { allStudents: boolean; groupClassIds: string[] };
  classes: { id: string }[];
  semester: string;
  academicYear: { id: string };
  students: {
    studentId: string;
    groupClass: { id: string; group: { name: string } };
    lastMemorizedSurahNumber: number | null;
  }[];
};

/**
 * «الحصص المشتركة» — workspaces and متابعة الحفظ (Stage 4). درة (D)
 * supervises A (أركان) and B (الماهر); فدوى (F) assists both; A1 only A, B1
 * only B. A + B share the Monday 09:00–11:00 slot; A also meets on Wednesday,
 * B on Thursday. X is a normal class (sup O). Students: a1 a2 t in A (t is
 * promoted to B the day after the past shared lesson), b1 in B, x1 in X.
 */
describe('Shared sessions — workspaces & memorization (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const id: Record<string, string> = {};
  const token: Record<string, string> = {};

  const http = () => request(app.getHttpServer());
  const as = (who: string) => ({ Authorization: `Bearer ${token[who]}` });
  const admin = {
    post: (path: string, body: object) =>
      http().post(`/api/admin/${path}`).set(as('admin')).send(body),
    put: (path: string, body: object) =>
      http().put(`/api/admin/${path}`).set(as('admin')).send(body),
    patch: (path: string, body: object) =>
      http().patch(`/api/admin/${path}`).set(as('admin')).send(body),
    get: (path: string, query: object = {}) =>
      http().get(`/api/admin/${path}`).query(query).set(as('admin')),
  };
  const teacher = (who: string) => ({
    get: (path: string, query: object = {}) =>
      http().get(`/api/teacher/${path}`).query(query).set(as(who)),
    put: (path: string, body: object) =>
      http().put(`/api/teacher/${path}`).set(as(who)).send(body),
  });
  const sorted = (...keys: string[]) => keys.map((k) => id[k]).sort();

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
  const userData = async (key: string, role: Role) => ({
    username: `e2e-${RUN}-${key}`.toLowerCase(),
    passwordHash: await new PasswordService().hash(PASSWORD),
    mustChangePassword: false,
    roles: { create: [{ role }] },
  });

  async function account(key: string, withTeacher: boolean) {
    const person = await prisma.person.create({
      data: {
        firstName: key,
        lastName: tag('حساب'),
        ...(withTeacher
          ? { teacher: { create: { joinedAt: new Date('2024-09-01') } } }
          : {}),
        user: {
          create: await userData(key, withTeacher ? Role.TEACHER : Role.ADMIN),
        },
      },
      select: { teacher: { select: { id: true } } },
    });
    if (withTeacher) id[key] = person.teacher!.id;
    await login(key);
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    await account('admin', false);
    for (const t of ['D', 'F', 'A1', 'B1', 'O']) await account(t, true);

    id.branch = (
      await admin
        .post('branches', { name: tag('فرع'), address: 'نابل' })
        .expect(201)
    ).body.id;
    for (const r of ['R1', 'R2', 'R3'])
      id[r] = (
        await admin
          .post('rooms', { branchId: id.branch, name: tag(r) })
          .expect(201)
      ).body.id;
    for (const g of ['أركان', 'الماهر', 'الثالثة'])
      id[g] = (
        await admin.post('groups', { name: tag(g) }).expect(201)
      ).body.id;
    const cls = async (
      key: string,
      group: string,
      supervisor: string,
      assistants: string[],
    ) => {
      id[key] = (
        await admin
          .post('group-classes', {
            groupId: id[group],
            branchId: id.branch,
            supervisorId: id[supervisor],
            assistantTeacherIds: assistants.map((a) => id[a]),
          })
          .expect(201)
      ).body.id;
    };
    await cls('A', 'أركان', 'D', ['F', 'A1']);
    await cls('B', 'الماهر', 'D', ['F', 'B1']);
    await cls('X', 'الثالثة', 'O', []);
    const student = async (key: string, classKey: string) => {
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
            groupClassId: id[classKey],
            registrationDate: addDays(TODAY, -60),
            guardianPhone: '98765432',
          })
          .expect(201)
      ).body.id;
    };
    for (const s of ['a1', 'a2', 't']) await student(s, 'A');
    await student('b1', 'B');
    await student('x1', 'X');
    // Student logins for a1 (أركان) and b1 (الماهر)
    for (const key of ['a1', 'b1']) {
      const { personId } = await prisma.student.findUniqueOrThrow({
        where: { id: id[key] },
        select: { personId: true },
      });
      await prisma.user.create({
        data: { personId, ...(await userData(`s-${key}`, Role.STUDENT)) },
      });
      await login(`s-${key}`);
    }

    // Weekly: the shared Monday lesson, A's own Wednesday, B's own Thursday
    const slot = async (key: string, host: string, body: object) => {
      id[key] = (
        await admin
          .post(`group-classes/${id[host]}/schedules`, body)
          .expect(201)
      ).body.id;
    };
    await slot('shared', 'A', {
      dayOfWeek: 'MON',
      startTime: '09:00',
      endTime: '11:00',
      roomId: id.R1,
      additionalGroupClassIds: [id.B],
    });
    await slot('aWed', 'A', {
      dayOfWeek: 'WED',
      startTime: '09:00',
      endTime: '10:00',
      roomId: id.R1,
    });
    await slot('bThu', 'B', {
      dayOfWeek: 'THU',
      startTime: '09:00',
      endTime: '10:00',
      roomId: id.R2,
    });

    // An academic year around today (test DB only; not made current)
    id.year = (
      await admin
        .post('academic-years', {
          label: `SW-${RUN.slice(0, 6)}`,
          startDate: addDays(TODAY, -100),
          endDate: addDays(TODAY, 200),
          semester2StartDate: addDays(TODAY, 30),
        })
        .expect(201)
    ).body.id;
    // t's progress BEFORE the promotion
    await admin
      .put(`students/${id.t}/memorization`, {
        academicYearId: id.year,
        semester: 'FIRST',
        lastMemorizedSurahNumber: 50,
      })
      .expect(200);

    // A past shared lesson (A + B) and a normal lesson of X
    id.P = (
      await admin
        .post('sessions', {
          groupClassId: id.A,
          additionalGroupClassIds: [id.B],
          roomId: id.R3,
          date: PAST,
          startTime: '15:00',
          endTime: '16:00',
        })
        .expect(201)
    ).body.id;
    id.N = (
      await admin
        .post('sessions', {
          groupClassId: id.X,
          roomId: id.R2,
          date: PAST,
          startTime: '15:00',
          endTime: '16:00',
        })
        .expect(201)
    ).body.id;
    // Promotion: t moves from أركان to الماهر the day after that lesson
    await admin
      .patch(`students/${id.t}/group-class`, {
        groupClassId: id.B,
        effectiveDate: addDays(TODAY, -1),
      })
      .expect(200);
  });

  afterAll(async () => {
    const persons = (
      await prisma.person.findMany({
        where: { lastName: { endsWith: RUN } },
        select: { id: true },
      })
    ).map((p) => p.id);
    const students = { personId: { in: persons } };
    const classes = { group: { name: { endsWith: RUN } } };
    await prisma.memorizationProgress.deleteMany({
      where: { student: students },
    });
    await prisma.session.deleteMany({ where: { groupClass: classes } });
    await prisma.weeklySchedule.deleteMany({ where: { groupClass: classes } });
    await prisma.academicYear.deleteMany({
      where: { label: `SW-${RUN.slice(0, 6)}` },
    });
    await prisma.paymentObligation.deleteMany({
      where: { student: students },
    });
    await prisma.studentEnrollment.deleteMany({
      where: { student: students },
    });
    await prisma.studentStatusChange.deleteMany({
      where: { student: students },
    });
    await prisma.user.deleteMany({ where: { personId: { in: persons } } });
    await prisma.student.deleteMany({ where: students });
    await prisma.groupClassAssistant.deleteMany({
      where: { groupClass: classes },
    });
    await prisma.groupClass.deleteMany({ where: classes });
    await prisma.teacher.deleteMany({ where: { personId: { in: persons } } });
    await prisma.person.deleteMany({ where: { id: { in: persons } } });
    await prisma.room.deleteMany({
      where: { branch: { name: { endsWith: RUN } } },
    });
    await prisma.branch.deleteMany({ where: { name: { endsWith: RUN } } });
    await prisma.group.deleteMany({ where: { name: { endsWith: RUN } } });
    await app.close();
  });

  // ───────────────────────── workspaces ─────────────────────────

  describe('teacher workspace', () => {
    const workspace = async (who: string) =>
      (await teacher(who).get('workspace').expect(200)).body as {
        schedules: Slot[];
        groupClasses: { id: string }[];
        students: { id: string }[];
      };

    it('the shared lesson appears ONCE, with every participating class and program', async () => {
      for (const who of ['D', 'F']) {
        const w = await workspace(who);
        const ids = w.schedules.map((s) => s.id);
        expect(ids.filter((s) => s === id.shared)).toHaveLength(1);
        expect(new Set(ids)).toEqual(new Set([id.shared, id.aWed, id.bThu]));
        const shared = w.schedules.find((s) => s.id === id.shared)!;
        expect(shared).toMatchObject({
          groupClassId: id.A,
          additionalGroupClassIds: [id.B],
        });
        expect(
          shared.participants.map((p) => [p.groupClassId, p.group.name]),
        ).toEqual([
          [id.A, tag('أركان')],
          [id.B, tag('الماهر')],
        ]);
      }
    });

    it('an assistant of one class sees the shared lesson through it — not the other class’s own slots or students', async () => {
      const b1 = await workspace('B1');
      expect(new Set(b1.schedules.map((s) => s.id))).toEqual(
        new Set([id.shared, id.bThu]),
      );
      // The host class is not listed among "my classes"
      expect(b1.groupClasses.map((c) => c.id)).toEqual([id.B]);
      // Current enrollment: t was promoted to الماهر
      expect(b1.students.map((s) => s.id).sort()).toEqual(sorted('b1', 't'));
      const a1 = await workspace('A1');
      expect(new Set(a1.schedules.map((s) => s.id))).toEqual(
        new Set([id.shared, id.aWed]),
      );
      expect(a1.students.map((s) => s.id).sort()).toEqual(sorted('a1', 'a2'));
    });

    it('a normal class is unchanged', async () => {
      const o = await workspace('O');
      expect(o.schedules).toEqual([]);
      expect(o.students.map((s) => s.id)).toEqual([id.x1]);
    });
  });

  describe('student workspace', () => {
    const workspace = async (who: string) =>
      (await http().get('/api/student/workspace').set(as(who)).expect(200))
        .body as { schedules: Slot[]; student: { id: string } };

    it('students of BOTH classes see the shared lesson, each with their own class; no other student’s data', async () => {
      const a = await workspace('s-a1');
      expect(new Set(a.schedules.map((s) => s.id))).toEqual(
        new Set([id.shared, id.aWed]),
      );
      const b = await workspace('s-b1');
      expect(new Set(b.schedules.map((s) => s.id))).toEqual(
        new Set([id.shared, id.bThu]),
      );
      expect(b.student.id).toBe(id.b1);
      const shared = b.schedules.find((s) => s.id === id.shared)!;
      expect(shared.participants.map((p) => p.group.name)).toEqual([
        tag('أركان'),
        tag('الماهر'),
      ]);
      // Nothing about the other class's students
      const raw = JSON.stringify(b);
      for (const other of ['a1', 'a2', 't'])
        expect(raw).not.toContain(id[other]);
      expect(raw).not.toContain('"students"');
    });

    it('their session lists include the shared lesson (whichever class hosts it)', async () => {
      const list = (
        await http()
          .get('/api/student/sessions/calendar')
          .query({ from: PAST, to: PAST })
          .set(as('s-b1'))
          .expect(200)
      ).body as { id: string }[];
      expect(list.map((s) => s.id)).toContain(id.P);
    });
  });

  // ───────────────────────── memorization ─────────────────────────

  describe('combined memorization from a session', () => {
    const memo = async (who: string, sessionKey = 'P', query: object = {}) =>
      (
        await (
          who === 'admin'
            ? admin.get(`sessions/${id[sessionKey]}/memorization`, query)
            : teacher(who).get(`sessions/${id[sessionKey]}/memorization`, query)
        ).expect(200)
      ).body as SessionMemo;
    const studentsOf = (m: SessionMemo) =>
      m.students.map((s) => s.studentId).sort();

    it('supervisor, assistant of both and admin: one combined list, each student with their own program — default period of the session date', async () => {
      for (const who of ['D', 'F', 'admin']) {
        const m = await memo(who);
        expect(studentsOf(m)).toEqual(sorted('a1', 'a2', 't', 'b1'));
        expect(m.scope.allStudents).toBe(true);
        expect(m.classes.map((c) => c.id)).toEqual([id.A, id.B]);
        expect(m).toMatchObject({
          academicYear: { id: id.year },
          semester: 'FIRST',
        });
        const of = (key: string) =>
          m.students.find((s) => s.studentId === id[key])!;
        expect(of('b1').groupClass.group.name).toBe(tag('الماهر'));
        // Enrollment ON the lesson date: t was still in أركان, with their progress
        expect(of('t')).toMatchObject({
          groupClass: { id: id.A },
          lastMemorizedSurahNumber: 50,
        });
      }
    });

    it('an assistant of one class sees only that class; outsiders are refused', async () => {
      const a = await memo('A1');
      expect(studentsOf(a)).toEqual(sorted('a1', 'a2', 't'));
      expect(a.scope).toEqual({ allStudents: false, groupClassIds: [id.A] });
      expect(studentsOf(await memo('B1'))).toEqual(sorted('b1'));
      await teacher('O').get(`sessions/${id.P}/memorization`).expect(403);
      await teacher('O').get(`sessions/${id.N}/memorization`).expect(200);
    });

    it('updates go through the per-student endpoint: student-specific, one record, another class refused', async () => {
      const set = (who: string, key: string, surah: number) =>
        teacher(who).put(`students/${id[key]}/memorization`, {
          academicYearId: id.year,
          semester: 'FIRST',
          lastMemorizedSurahNumber: surah,
        });
      await set('D', 'b1', 78).expect(200);
      await set('A1', 'a1', 67).expect(200);
      expect((await set('A1', 'b1', 1).expect(403)).body.code).toBe(
        'TEACHER_CLASS_ACCESS_DENIED',
      );
      await set('B1', 'a1', 1).expect(403);
      await set('D', 'b1', 77).expect(200);
      const m = await memo('D');
      const value = (key: string) =>
        m.students.find((s) => s.studentId === id[key])!
          .lastMemorizedSurahNumber;
      expect(value('b1')).toBe(77);
      expect(value('a1')).toBe(67);
      expect(value('a2')).toBeNull();
      expect(
        await prisma.memorizationProgress.count({
          where: { studentId: id.b1 },
        }),
      ).toBe(1);
    });

    it('promotion keeps the progress: one record, visible from the new class too', async () => {
      expect(
        await prisma.memorizationProgress.count({
          where: { studentId: id.t },
        }),
      ).toBe(1);
      const forB = (
        await teacher('B1')
          .get(`group-classes/${id.B}/memorization`, {
            academicYearId: id.year,
            semester: 'FIRST',
          })
          .expect(200)
      ).body as {
        students: { studentId: string; lastMemorizedSurahNumber: number }[];
      };
      expect(
        forB.students.find((s) => s.studentId === id.t)
          ?.lastMemorizedSurahNumber,
      ).toBe(50);
    });

    it('explicit period, incomplete period, and a normal session', async () => {
      const second = await memo('D', 'P', {
        academicYearId: id.year,
        semester: 'SECOND',
      });
      expect(second.semester).toBe('SECOND');
      expect(
        second.students.every((s) => s.lastMemorizedSurahNumber === null),
      ).toBe(true);
      expect(
        (
          await teacher('D')
            .get(`sessions/${id.P}/memorization`, { semester: 'FIRST' })
            .expect(400)
        ).body.code,
      ).toBe('MEMORIZATION_PERIOD_INCOMPLETE');
      const normal = await memo('O', 'N');
      expect(studentsOf(normal)).toEqual([id.x1]);
      expect(normal.scope.allStudents).toBe(true);
      expect(normal.classes.map((c) => c.id)).toEqual([id.X]);
    });
  });
});
