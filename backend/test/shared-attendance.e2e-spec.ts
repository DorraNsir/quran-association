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
const SOON = addDays(TODAY, 10);
/** A Thursday at least two weeks ahead (weekly slot). */
const THU = (() => {
  let d = addDays(TODAY, 14);
  while (new Date(`${d}T00:00:00Z`).getUTCDay() !== 4) d = addDays(d, 1);
  return d;
})();

type Roster = {
  students: {
    studentId: string;
    groupClass: { id: string; group: { name: string } } | null;
    expected: boolean;
  }[];
  scope: { allStudents: boolean; groupClassIds: string[] };
  additionalClasses: { id: string }[];
  expectedCount: number;
  recordedCount: number;
};

/**
 * «الحصص المشتركة» — attendance, authorization, reports (Stage 3).
 * The real case: درة (D) supervises A (أركان) and B (الماهر); فدوى (F)
 * assists BOTH; A1 assists only A, B1 only B. X is a normal class (sup O,
 * assistant A1). Students: a1 a2 t in A (t moves to B the day after the
 * past shared lesson), b1 b2 in B, x1 in X.
 */
describe('Shared sessions — attendance & authorization (e2e)', () => {
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
    post: (path: string, body: object) =>
      http().post(`/api/teacher/${path}`).set(as(who)).send(body),
    patch: (path: string, body: object) =>
      http().patch(`/api/teacher/${path}`).set(as(who)).send(body),
  });
  const roster = async (who: string, sessionId: string) =>
    (
      await (
        who === 'admin'
          ? admin.get(`sessions/${sessionId}/attendance`)
          : teacher(who).get(`sessions/${sessionId}/attendance`)
      ).expect(200)
    ).body as Roster;
  const studentsOf = (r: Roster) => r.students.map((s) => s.studentId).sort();
  const sorted = (...keys: string[]) => keys.map((k) => id[k]).sort();
  const save = (who: string, sessionId: string, records: object[]) =>
    teacher(who).put(`sessions/${sessionId}/attendance`, { records });
  const mark = (keys: string[], status = 'PRESENT') =>
    keys.map((k) => ({ studentId: id[k], status }));

  async function account(key: string, withTeacher: boolean) {
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
            roles: {
              create: [{ role: withTeacher ? Role.TEACHER : Role.ADMIN }],
            },
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
    await cls('X', 'الثالثة', 'O', ['A1']);
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
    for (const s of ['b1', 'b2']) await student(s, 'B');
    await student('x1', 'X');

    // The past shared lesson (A + B), a normal lesson of X, an upcoming shared lesson
    id.P = (
      await admin
        .post('sessions', {
          groupClassId: id.A,
          additionalGroupClassIds: [id.B],
          roomId: id.R1,
          date: PAST,
          startTime: '10:00',
          endTime: '11:00',
        })
        .expect(201)
    ).body.id;
    id.N = (
      await admin
        .post('sessions', {
          groupClassId: id.X,
          roomId: id.R2,
          date: PAST,
          startTime: '12:00',
          endTime: '13:00',
        })
        .expect(201)
    ).body.id;
    id.U = (
      await admin
        .post('sessions/extra', {
          groupClassId: id.A,
          additionalGroupClassIds: [id.B],
          roomId: id.R1,
          date: SOON,
          startTime: '10:00',
          endTime: '11:00',
        })
        .expect(201)
    ).body.id;
    // Promotion: t moves from أركان to الماهر the day after the past lesson
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
    await prisma.workItem.deleteMany({
      where: { program: { session: { groupClass: classes } } },
    });
    await prisma.workProgram.deleteMany({
      where: { session: { groupClass: classes } },
    });
    await prisma.notification.deleteMany({
      where: { session: { groupClass: classes } },
    });
    await prisma.studentAttendance.deleteMany({
      where: { student: students },
    });
    await prisma.teacherAttendance.deleteMany({
      where: { session: { groupClass: classes } },
    });
    await prisma.session.deleteMany({ where: { groupClass: classes } });
    await prisma.weeklySchedule.deleteMany({ where: { groupClass: classes } });
    await prisma.paymentObligation.deleteMany({
      where: { student: students },
    });
    await prisma.studentEnrollment.deleteMany({
      where: { student: students },
    });
    await prisma.studentStatusChange.deleteMany({
      where: { student: students },
    });
    await prisma.student.deleteMany({ where: students });
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

  // ───────────────────────── roster ─────────────────────────

  describe('combined roster', () => {
    it('supervisor and an assistant of BOTH classes: one list of every participating student, with their own group and class', async () => {
      for (const who of ['D', 'F', 'admin']) {
        const r = await roster(who, id.P);
        expect(studentsOf(r)).toEqual(sorted('a1', 'a2', 't', 'b1', 'b2'));
        expect(r.scope.allStudents).toBe(true);
        expect(r.expectedCount).toBe(5);
        expect(r.additionalClasses.map((c) => c.id)).toEqual([id.B]);
        const label = (key: string) =>
          r.students.find((s) => s.studentId === id[key])!.groupClass;
        expect(label('a1')).toMatchObject({
          id: id.A,
          group: { name: tag('أركان') },
        });
        expect(label('b1')).toMatchObject({
          id: id.B,
          group: { name: tag('الماهر') },
        });
        // t was still in أركان on the lesson's date (historical enrollment)
        expect(label('t')).toMatchObject({ id: id.A });
      }
    });

    it('an assistant of ONE class sees only that class’s students', async () => {
      const a = await roster('A1', id.P);
      expect(studentsOf(a)).toEqual(sorted('a1', 'a2', 't'));
      expect(a.scope).toEqual({ allStudents: false, groupClassIds: [id.A] });
      expect(a.expectedCount).toBe(3);
      const b = await roster('B1', id.P);
      expect(studentsOf(b)).toEqual(sorted('b1', 'b2'));
      // The upcoming lesson: t is in الماهر by then
      expect(studentsOf(await roster('B1', id.U))).toEqual(
        sorted('b1', 'b2', 't'),
      );
      expect(studentsOf(await roster('A1', id.U))).toEqual(sorted('a1', 'a2'));
    });

    it('a normal session is unchanged: its assistant sees all its students; outsiders are refused', async () => {
      const n = await roster('A1', id.N);
      expect(studentsOf(n)).toEqual(sorted('x1'));
      expect(n.scope.allStudents).toBe(true);
      expect(n.additionalClasses).toEqual([]);
      await teacher('B1').get(`sessions/${id.N}/attendance`).expect(403);
      await teacher('O').get(`sessions/${id.P}/attendance`).expect(403);
    });
  });

  // ───────────────────────── saving ─────────────────────────

  describe('saving', () => {
    it('an assistant cannot write another class’s students; a student outside the session is refused', async () => {
      expect(
        (await save('A1', id.P, mark(['a1', 'b1'])).expect(403)).body.code,
      ).toBe('ATTENDANCE_STUDENT_NOT_ALLOWED');
      expect((await save('A1', id.P, mark(['x1'])).expect(400)).body.code).toBe(
        'ATTENDANCE_STUDENT_NOT_IN_SESSION',
      );
      expect(
        await prisma.studentAttendance.count({ where: { sessionId: id.P } }),
      ).toBe(0);
    });

    it('partial saves per class never touch the others and complete the lesson only when everyone is recorded', async () => {
      const a = (await save('A1', id.P, mark(['a1', 'a2', 't'])).expect(200))
        .body as Roster;
      expect(a.recordedCount).toBe(3);
      const statusOf = async () =>
        (await prisma.session.findUniqueOrThrow({ where: { id: id.P } }))
          .status;
      expect(await statusOf()).toBe('SCHEDULED');
      await save('B1', id.P, mark(['b1'], 'ABSENT')).expect(200);
      expect(await statusOf()).toBe('SCHEDULED');
      // The أركان records are untouched by الماهر's assistant
      const records = await prisma.studentAttendance.findMany({
        where: { sessionId: id.P },
      });
      expect(records.filter((r) => r.status === 'PRESENT')).toHaveLength(3);
      await save('B1', id.P, mark(['b2'])).expect(200);
      expect(await statusOf()).toBe('COMPLETED');
      // The supervisor corrects any student; still one record each
      await save('D', id.P, mark(['b1'], 'LATE')).expect(200);
      await save('D', id.P, [
        ...mark(['a1']),
        ...mark(['a1'], 'ABSENT'),
      ]).expect(400);
      expect(
        await prisma.studentAttendance.count({ where: { sessionId: id.P } }),
      ).toBe(5);
      expect(
        (
          await prisma.studentAttendance.findFirstOrThrow({
            where: { sessionId: id.P, studentId: id.b1 },
          })
        ).status,
      ).toBe('LATE');
    });

    it('the change history follows the same scope', async () => {
      const history = async (who: string) =>
        (
          (
            await teacher(who)
              .get(`sessions/${id.P}/attendance/history`)
              .expect(200)
          ).body as { subjectId: string }[]
        ).map((h) => h.subjectId);
      expect(new Set(await history('A1'))).toEqual(
        new Set(sorted('a1', 'a2', 't')),
      );
      expect(new Set(await history('D'))).toEqual(
        new Set(sorted('a1', 'a2', 't', 'b1', 'b2')),
      );
    });
  });

  // ───────────────────────── counts & reports ─────────────────────────

  describe('counts and reports', () => {
    it('session counts: the whole roster; a class / group filter counts only its students', async () => {
      const counts = async (query: object) => {
        const list = (
          await admin
            .get('sessions/calendar', { from: PAST, to: PAST, ...query })
            .expect(200)
        ).body as { id: string; attendance: Record<string, number> }[];
        return list.find((s) => s.id === id.P)!.attendance;
      };
      expect(await counts({ teacherId: id.D })).toMatchObject({
        expected: 5,
        recorded: 5,
        present: 4,
        late: 1,
      });
      expect(await counts({ groupClassId: id.B })).toMatchObject({
        expected: 2,
        recorded: 2,
        present: 1,
        late: 1,
      });
      expect(await counts({ groupClassId: id.A })).toMatchObject({
        expected: 3,
        recorded: 3,
        present: 3,
      });
      expect(await counts({ groupId: id['الماهر'] })).toMatchObject({
        expected: 2,
        recorded: 2,
      });
      // The normal session is unchanged
      const n = (await admin.get(`sessions/${id.N}`).expect(200)).body;
      expect(n.attendance).toMatchObject({ expected: 1, recorded: 0 });
    });

    it('per-student report: a class / group filter lists only its own students of the shared lesson', async () => {
      const report = async (query: object) =>
        (
          (
            await admin
              .get('attendance/students-summary', {
                from: PAST,
                to: PAST,
                ...query,
              })
              .expect(200)
          ).body as { studentId: string; present: number }[]
        )
          .map((l) => l.studentId)
          .sort();
      expect(await report({ groupClassId: id.A })).toEqual(
        sorted('a1', 'a2', 't'),
      );
      expect(await report({ groupClassId: id.B })).toEqual(sorted('b1', 'b2'));
      expect(await report({ groupId: id['الماهر'] })).toEqual(
        sorted('b1', 'b2'),
      );
      expect(await report({ groupClassId: id.B, teacherId: id.D })).toEqual(
        sorted('b1', 'b2'),
      );
      // Overall: the physical lesson counted once per student
      const all = await report({ branchId: id.branch });
      expect(all).toEqual(sorted('a1', 'a2', 't', 'b1', 'b2'));
    });

    it("a student's own records show THEIR class of that lesson", async () => {
      const records = async (key: string) =>
        (
          await admin
            .get(`students/${id[key]}/attendance`, { from: PAST, to: PAST })
            .expect(200)
        ).body.data as { groupClass: { id: string } }[];
      expect((await records('b1'))[0].groupClass.id).toBe(id.B);
      expect((await records('t'))[0].groupClass.id).toBe(id.A);
    });
  });

  // ───────────────────────── other endpoints ─────────────────────────

  describe('no access through other endpoints', () => {
    it("a teacher's student pages (and memorization, same rule): an assistant never reaches another class's students through a shared lesson", async () => {
      const range = { from: addDays(TODAY, -30), to: addDays(TODAY, -2) };
      await teacher('A1')
        .get(`students/${id.b1}/attendance`, range)
        .expect(403);
      await teacher('A1')
        .get(`students/${id.a1}/attendance`, range)
        .expect(200);
      await teacher('B1')
        .get(`students/${id.a1}/attendance`, range)
        .expect(403);
      // The supervisor of the shared lesson, and the assistant of both
      await teacher('D').get(`students/${id.b1}/attendance`, range).expect(200);
      await teacher('F').get(`students/${id.a1}/attendance`, range).expect(200);
    });
  });

  // ───────────────────────── work follow-up ─────────────────────────

  describe('متابعة العمل in a shared lesson', () => {
    const items = [{ type: 'MEMORIZATION', description: 'سورة الملك' }];
    const program = (who: string, studentKey: string) =>
      teacher(who).post('work-programs', {
        studentId: id[studentKey],
        sessionId: id.U,
        items,
      });

    it('the supervisor and the assistant of both: any student; an assistant of one class: only theirs', async () => {
      id.pb1 = (await program('D', 'b1').expect(201)).body.id;
      id.pb2 = (await program('F', 'b2').expect(201)).body.id;
      id.pa1 = (await program('A1', 'a1').expect(201)).body.id;
      // Another class's student: refused before anything else (even existence)
      expect((await program('A1', 'b1').expect(403)).body.code).toBe(
        'TEACHER_STUDENT_ACCESS_DENIED',
      );
      // One program per student and lesson
      expect((await program('D', 'b1').expect(409)).body.code).toBe(
        'WORK_PROGRAM_EXISTS',
      );
      // A new program for a الماهر student: refused to أركان's assistant
      expect((await program('A1', 't').expect(403)).body.code).toBe(
        'TEACHER_STUDENT_ACCESS_DENIED',
      );
      // Not in the lesson at all
      expect((await program('D', 'x1').expect(400)).body.code).toBe(
        'WORK_STUDENT_NOT_IN_SESSION',
      );
      expect(
        await prisma.workProgram.count({
          where: { sessionId: id.U, studentId: id.b1 },
        }),
      ).toBe(1);
    });

    it('reading and editing another class’s student’s program is refused; lists and eligible lessons follow the same scope', async () => {
      await teacher('A1').get(`work-programs/${id.pb1}`).expect(403);
      await teacher('A1')
        .patch(`work-programs/${id.pb1}`, {
          version: 1,
          generalNotes: 'x',
        })
        .expect(403);
      await teacher('B1').get(`work-programs/${id.pb1}`).expect(200);
      const list = async (who: string, query: object = {}) =>
        (
          (
            await teacher(who)
              .get('work-programs', { sessionId: id.U, ...query })
              .expect(200)
          ).body.data as { id: string }[]
        )
          .map((p) => p.id)
          .sort();
      expect(await list('A1')).toEqual([id.pa1]);
      expect(await list('B1')).toEqual([id.pb1, id.pb2].sort());
      expect(await list('D')).toEqual([id.pa1, id.pb1, id.pb2].sort());
      // Admin class filter: only that class's students in the shared lesson
      const byClass = (
        await admin
          .get('work-programs', { groupClassId: id.B, sessionId: id.U })
          .expect(200)
      ).body.data.map((p: { id: string }) => p.id);
      expect(byClass.sort()).toEqual([id.pb1, id.pb2].sort());
      const eligible = async (who: string, key: string) =>
        (
          (
            await teacher(who)
              .get('work-programs/eligible-sessions', { studentId: id[key] })
              .expect(200)
          ).body as { id: string }[]
        ).map((s) => s.id);
      expect(await eligible('D', 't')).toContain(id.U);
      expect(await eligible('B1', 't')).toContain(id.U);
      expect(await eligible('A1', 't')).not.toContain(id.U);
    });
  });

  // ───────────────────────── cancellation / generation ─────────────────────────

  describe('cancellation and generation visibility', () => {
    it('a cancelled shared lesson keeps its records and refuses new attendance', async () => {
      await admin
        .patch(`sessions/${id.U}/status`, { status: 'CANCELLED' })
        .expect(200);
      const r = await roster('D', id.U);
      expect(r.additionalClasses.map((c) => c.id)).toEqual([id.B]);
      expect(
        await prisma.workProgram.count({ where: { sessionId: id.U } }),
      ).toBe(3);
      await save('D', id.U, mark(['a1'])).expect(409);
    });

    it('editing a weekly slot reports the dates its re-planning skipped (and why)', async () => {
      const created = (
        await admin
          .post(`group-classes/${id.A}/schedules`, {
            dayOfWeek: 'THU',
            startTime: '08:00',
            endTime: '09:00',
            roomId: id.R3,
            additionalGroupClassIds: [id.B],
          })
          .expect(201)
      ).body;
      expect(created).toHaveProperty('generation');
      await admin
        .post('sessions/generate', {
          from: THU,
          to: addDays(THU, 7),
          groupClassId: id.A,
        })
        .expect(200);
      // B gets a lesson of its own on the second Thursday, at the slot's new time
      const own = (
        await admin
          .post('sessions/extra', {
            groupClassId: id.B,
            roomId: id.R2,
            date: addDays(THU, 7),
            startTime: '09:30',
            endTime: '10:00',
          })
          .expect(201)
      ).body.id;
      const moved = (
        await admin
          .patch(`group-classes/${id.A}/schedules/${created.id}`, {
            startTime: '09:00',
            endTime: '10:00',
          })
          .expect(200)
      ).body;
      expect(moved.generation).not.toBeNull();
      expect(moved.generation.created).toBeGreaterThanOrEqual(1);
      expect(moved.generation.skippedConflicts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            date: addDays(THU, 7),
            reason: 'CLASS',
            conflictingSessionId: own,
          }),
        ]),
      );
    });
  });
});
