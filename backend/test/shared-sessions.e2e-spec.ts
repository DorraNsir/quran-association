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
/** A Tuesday at least three weeks ahead (the suite never ages). */
const TUE = (() => {
  let d = addDays(TODAY, 21);
  while (new Date(`${d}T00:00:00Z`).getUTCDay() !== 2) d = addDays(d, 1);
  return d;
})();
const WED = addDays(TUE, 1);
const THU = addDays(TUE, 2);
const week = (d: string, n: number) => addDays(d, 7 * n);

/**
 * «الحصص المشتركة» — scheduling (Stage 2): one lesson for several classes of
 * the same supervisor and branch. Classes:
 *   A (أركان, sup D, assistant A1)  B (الماهر, sup D, assistant B1)
 *   C (third group, sup D)          E (sup H)          F (sup D, OTHER branch)
 *   K (sup H, assistant B1)         I (sup D, INACTIVE)
 */
describe('Shared sessions — scheduling (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let admin = '';
  const id: Record<string, string> = {};

  const http = () => request(app.getHttpServer());
  const as = (token: string) => ({ Authorization: `Bearer ${token}` });
  const post = (path: string, body: object) =>
    http().post(`/api/admin/${path}`).set(as(admin)).send(body);
  const patch = (path: string, body: object) =>
    http().patch(`/api/admin/${path}`).set(as(admin)).send(body);
  const get = (path: string, query: object = {}) =>
    http().get(`/api/admin/${path}`).query(query).set(as(admin));
  const slot = (host: string, body: object) =>
    post(`group-classes/${id[host]}/schedules`, body);
  const extra = (host: string, body: object) =>
    post('sessions/extra', { groupClassId: id[host], ...body });
  const extras = (...keys: string[]) => keys.map((k) => id[k]);
  const sessionOf = (sessionId: string) =>
    prisma.session.findUniqueOrThrow({
      where: { id: sessionId },
      include: { extraClasses: true, teachers: true },
    });
  const extraIdsOf = (s: { extraClasses: { groupClassId: string }[] }) =>
    s.extraClasses.map((e) => e.groupClassId).sort();
  const teamOf = (s: { teachers: { teacherId: string; role: string }[] }) =>
    Object.fromEntries(s.teachers.map((t) => [t.teacherId, t.role]));

  async function login(key: string, roles: Role[]) {
    await prisma.person.create({
      data: {
        firstName: 'حساب',
        lastName: tag(key),
        user: {
          create: {
            username: `e2e-${RUN}-${key}`,
            passwordHash: await new PasswordService().hash(PASSWORD),
            mustChangePassword: false,
            roles: { create: roles.map((role) => ({ role })) },
          },
        },
      },
    });
    return (
      await http()
        .post('/api/auth/login')
        .send({ username: `e2e-${RUN}-${key}`, password: PASSWORD })
        .expect(200)
    ).body.accessToken as string;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    admin = await login('admin', [Role.ADMIN]);

    id.branch = (
      await post('branches', { name: tag('فرع'), address: 'نابل' }).expect(201)
    ).body.id;
    id.otherBranch = (
      await post('branches', { name: tag('فرع آخر'), address: 'تونس' }).expect(
        201,
      )
    ).body.id;
    for (const r of ['R1', 'R2', 'R3'])
      id[r] = (
        await post('rooms', { branchId: id.branch, name: tag(r) }).expect(201)
      ).body.id;
    id.RY = (
      await post('rooms', { branchId: id.otherBranch, name: tag('RY') }).expect(
        201,
      )
    ).body.id;
    for (const t of ['D', 'H', 'Z', 'A1', 'B1', 'N'])
      id[t] = (
        await post('teachers', {
          person: {
            firstName: t,
            lastName: tag('معلم'),
            gender: 'FEMALE',
            phone: '22345678',
          },
          joinedAt: '2024-09-01',
        }).expect(201)
      ).body.id;
    for (const g of ['أركان', 'الماهر', 'الثالثة'])
      id[g] = (await post('groups', { name: tag(g) }).expect(201)).body.id;
    const cls = async (
      key: string,
      group: string,
      supervisor: string,
      more: object = {},
    ) => {
      id[key] = (
        await post('group-classes', {
          groupId: id[group],
          branchId: id.branch,
          supervisorId: id[supervisor],
          ...more,
        }).expect(201)
      ).body.id;
    };
    await cls('A', 'أركان', 'D', { assistantTeacherIds: [id.A1] });
    await cls('B', 'الماهر', 'D', { assistantTeacherIds: [id.B1] });
    await cls('C', 'الثالثة', 'D');
    await cls('E', 'الماهر', 'H');
    await cls('F', 'أركان', 'D', { branchId: id.otherBranch });
    await cls('K', 'الثالثة', 'H', { assistantTeacherIds: [id.B1] });
    await cls('I', 'الثالثة', 'D', { status: 'INACTIVE' });
    // A student of B (work follow-up guard)
    id.sB = (
      await post('students', {
        person: {
          firstName: 'طالب',
          lastName: tag('ب'),
          gender: 'MALE',
          dateOfBirth: '2014-05-01',
          address: 'نابل',
        },
        groupClassId: id.B,
        registrationDate: addDays(TODAY, -30),
        guardianPhone: '98765432',
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
    await prisma.workProgram.deleteMany({
      where: { session: { groupClass: classes } },
    });
    await prisma.teacherAttendance.deleteMany({
      where: { session: { groupClass: classes } },
    });
    // session_classes / session_teachers go with their session (CASCADE)
    await prisma.session.deleteMany({ where: { groupClass: classes } });
    await prisma.weeklySchedule.deleteMany({ where: { groupClass: classes } });
    const students = { student: { personId: { in: persons } } };
    await prisma.paymentObligation.deleteMany({ where: students });
    await prisma.studentEnrollment.deleteMany({ where: students });
    await prisma.studentStatusChange.deleteMany({ where: students });
    await prisma.student.deleteMany({ where: { personId: { in: persons } } });
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

  // ───────────────────────── validation ─────────────────────────

  describe('validation (weekly slots and sessions)', () => {
    const at = { date: THU, startTime: '08:00', endTime: '09:00' };
    it('refuses different supervisors, branches, inactive, duplicates, the host, unknown classes', async () => {
      const code = async (r: request.Test, status: number) =>
        (await r.expect(status)).body.code as string;
      expect(
        await code(
          extra('A', {
            ...at,
            roomId: id.R1,
            additionalGroupClassIds: extras('E'),
          }),
          409,
        ),
      ).toBe('SHARED_SUPERVISOR_MISMATCH');
      expect(
        await code(
          extra('A', {
            ...at,
            roomId: id.R1,
            additionalGroupClassIds: extras('F'),
          }),
          409,
        ),
      ).toBe('SHARED_BRANCH_MISMATCH');
      expect(
        await code(
          extra('A', {
            ...at,
            roomId: id.R1,
            additionalGroupClassIds: extras('I'),
          }),
          409,
        ),
      ).toBe('SHARED_CLASS_INACTIVE');
      expect(
        await code(
          extra('A', {
            ...at,
            roomId: id.R1,
            additionalGroupClassIds: extras('B', 'B'),
          }),
          400,
        ),
      ).toBe('SHARED_CLASS_DUPLICATE');
      expect(
        await code(
          extra('A', {
            ...at,
            roomId: id.R1,
            additionalGroupClassIds: extras('A'),
          }),
          400,
        ),
      ).toBe('SHARED_CLASS_IS_HOST');
      expect(
        await code(
          extra('A', {
            ...at,
            roomId: id.R1,
            additionalGroupClassIds: [randomUUID()],
          }),
          404,
        ),
      ).toBe('GROUP_CLASS_NOT_FOUND');
      await extra('A', {
        ...at,
        roomId: id.R1,
        additionalGroupClassIds: ['not-a-uuid'],
      }).expect(400);
      // Same rules for a weekly slot
      const weekly = {
        dayOfWeek: 'MON',
        startTime: '08:00',
        endTime: '09:00',
        roomId: id.R1,
      };
      expect(
        await code(
          slot('A', { ...weekly, additionalGroupClassIds: extras('E') }),
          409,
        ),
      ).toBe('SHARED_SUPERVISOR_MISMATCH');
      expect(
        await code(
          slot('A', { ...weekly, additionalGroupClassIds: extras('F') }),
          409,
        ),
      ).toBe('SHARED_BRANCH_MISMATCH');
      expect(
        await code(
          slot('A', { ...weekly, additionalGroupClassIds: extras('A') }),
          400,
        ),
      ).toBe('SHARED_CLASS_IS_HOST');
      // Nothing was created
      expect(
        await prisma.session.count({ where: { groupClassId: id.A } }),
      ).toBe(0);
      expect(
        await prisma.weeklySchedule.count({ where: { groupClassId: id.A } }),
      ).toBe(0);
    });
  });

  // ───────────────────────── weekly slots ─────────────────────────

  describe('weekly shared slot', () => {
    it('a class with its own overlapping slot cannot join: the admin removes it first (no automatic merge)', async () => {
      const own = (
        await slot('B', {
          dayOfWeek: 'TUE',
          startTime: '17:00',
          endTime: '19:00',
          roomId: id.R2,
        }).expect(201)
      ).body;
      const shared = {
        dayOfWeek: 'TUE',
        startTime: '16:00',
        endTime: '18:00',
        roomId: id.R1,
        additionalGroupClassIds: extras('B'),
      };
      // Extra (B) vs B's own slot → CLASS
      expect((await slot('A', shared).expect(409)).body.code).toBe(
        'CLASS_SCHEDULE_CONFLICT',
      );
      await http()
        .delete(`/api/admin/group-classes/${id.B}/schedules/${own.id}`)
        .set(as(admin))
        .expect(204);
      // A dated lesson of B at one of the shared slot's dates (planned before the slot)
      id.bLesson = (
        await extra('B', {
          date: week(TUE, 2),
          startTime: '16:30',
          endTime: '17:30',
          roomId: id.R2,
        }).expect(201)
      ).body.id;
      const created = (await slot('A', shared).expect(201)).body;
      id.S1 = created.id;
      expect(created.groupClass.id).toBe(id.A);
      expect(
        created.additionalClasses.map((c: { id: string }) => c.id),
      ).toEqual([id.B]);
      expect(created.additionalClasses[0].group.name).toBe(tag('الماهر'));
    });

    it('conflicts: host vs extra, extra vs extra, teacher (incl. an extra class’s assistant) and room', async () => {
      const at = { dayOfWeek: 'TUE', startTime: '17:00', endTime: '18:00' };
      // B (an extra of S1) hosting another shared slot → CLASS
      expect(
        (
          await slot('B', {
            ...at,
            roomId: id.R2,
            additionalGroupClassIds: extras('C'),
          }).expect(409)
        ).body.code,
      ).toBe('CLASS_SCHEDULE_CONFLICT');
      // C hosting with B as extra → B is in both → CLASS
      expect(
        (
          await slot('C', {
            ...at,
            roomId: id.R2,
            additionalGroupClassIds: extras('B'),
          }).expect(409)
        ).body.code,
      ).toBe('CLASS_SCHEDULE_CONFLICT');
      // C alone, another room: D is S1's supervisor → TEACHER
      const teacher = (await slot('C', { ...at, roomId: id.R3 }).expect(409))
        .body;
      expect(teacher.code).toBe('TEACHER_SCHEDULE_CONFLICT');
      // K (sup H) has B1, an assistant of S1's extra class B → TEACHER
      expect(
        (await slot('K', { ...at, roomId: id.R3 }).expect(409)).body.code,
      ).toBe('TEACHER_SCHEDULE_CONFLICT');
      // E (sup H, no shared teacher) in S1's room → ROOM
      expect(
        (await slot('E', { ...at, roomId: id.R1 }).expect(409)).body.code,
      ).toBe('ROOM_SCHEDULE_CONFLICT');
      // E elsewhere: independent, allowed
      await slot('E', { ...at, roomId: id.R3 }).expect(201);
    });

    it('generation: ONE session per date, with the additional classes and the union team; a busy extra class is reported', async () => {
      const res = (
        await post('sessions/generate', {
          from: TUE,
          to: week(TUE, 2),
          groupClassId: id.A,
        }).expect(200)
      ).body;
      // B already has a lesson on the third Tuesday → not planned (CLASS)
      expect(res.skippedConflicts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            weeklyScheduleId: id.S1,
            date: week(TUE, 2),
            reason: 'CLASS',
            conflictingSessionId: id.bLesson,
          }),
        ]),
      );
      const sessions = await prisma.session.findMany({
        where: {
          weeklyScheduleId: id.S1,
          date: { gte: new Date(TUE), lte: new Date(week(TUE, 2)) },
        },
        include: { extraClasses: true, teachers: true },
        orderBy: { date: 'asc' },
      });
      expect(sessions.map((s) => s.date.toISOString().slice(0, 10))).toEqual([
        TUE,
        week(TUE, 1),
      ]);
      for (const s of sessions) {
        expect(s.groupClassId).toBe(id.A);
        expect(s.roomId).toBe(id.R1);
        expect(extraIdsOf(s)).toEqual([id.B]);
        expect(teamOf(s)).toEqual({
          [id.D]: 'SUPERVISOR',
          [id.A1]: 'ASSISTANT',
          [id.B1]: 'ASSISTANT',
        });
      }
      [id.s1Tue, id.s1Tue2] = sessions.map((s) => s.id);
      // Idempotent: nothing new
      const again = (
        await post('sessions/generate', {
          from: TUE,
          to: week(TUE, 1),
          groupClassId: id.A,
        }).expect(200)
      ).body;
      expect(again.created).toBe(0);
      // No separate lesson of B at that time
      expect(
        await prisma.session.count({
          where: { groupClassId: id.B, date: new Date(TUE) },
        }),
      ).toBe(0);
    });

    it('API responses and filters: the shared slot / lessons are found through EVERY participant, once', async () => {
      const slots = (await get('schedules', { groupClassId: id.B }).expect(200))
        .body;
      expect(slots.map((s: { id: string }) => s.id)).toContain(id.S1);
      const forClass = (
        await get(`group-classes/${id.B}/schedules`).expect(200)
      ).body;
      expect(forClass.map((s: { id: string }) => s.id)).toContain(id.S1);
      const byGroup = (
        await get('sessions/calendar', {
          from: TUE,
          to: TUE,
          groupId: id['الماهر'],
        }).expect(200)
      ).body;
      expect(byGroup.map((s: { id: string }) => s.id)).toContain(id.s1Tue);
      // Teacher D's calendar: the physical lesson once
      const forD = (
        await get('sessions/calendar', {
          from: TUE,
          to: TUE,
          teacherId: id.D,
        }).expect(200)
      ).body.filter((s: { startTime: string }) => s.startTime === '16:00');
      expect(forD).toHaveLength(1);
      expect(forD[0]).toMatchObject({
        groupClass: { id: id.A },
        additionalClasses: [{ id: id.B, group: { name: tag('الماهر') } }],
      });
    });

    it('editing participants: upcoming lessons follow; attended ones keep theirs; planned work blocks a removal', async () => {
      // The second Tuesday's lesson took place (teacher attendance)
      await prisma.teacherAttendance.create({
        data: { sessionId: id.s1Tue2, teacherId: id.D, status: 'PRESENT' },
      });
      // Work planned for B's student in the first Tuesday's lesson
      const program = await prisma.workProgram.create({
        data: { studentId: id.sB, sessionId: id.s1Tue },
      });
      expect(
        (
          await patch(`group-classes/${id.A}/schedules/${id.S1}`, {
            additionalGroupClassIds: [],
          }).expect(409)
        ).body.code,
      ).toBe('SHARED_CLASS_HAS_WORK');
      await prisma.workProgram.delete({ where: { id: program.id } });

      const normal = (
        await patch(`group-classes/${id.A}/schedules/${id.S1}`, {
          additionalGroupClassIds: [],
        }).expect(200)
      ).body;
      expect(normal.additionalClasses).toEqual([]);
      const first = await sessionOf(id.s1Tue);
      expect(extraIdsOf(first)).toEqual([]);
      expect(teamOf(first)).toEqual({
        [id.D]: 'SUPERVISOR',
        [id.A1]: 'ASSISTANT',
      });
      // History (attended) is untouched — and no replacement lesson for B
      expect(extraIdsOf(await sessionOf(id.s1Tue2))).toEqual([id.B]);
      expect(
        await prisma.session.count({
          where: { groupClassId: id.B, date: new Date(TUE) },
        }),
      ).toBe(0);

      // Back to a shared slot, now with three classes
      const three = (
        await patch(`group-classes/${id.A}/schedules/${id.S1}`, {
          additionalGroupClassIds: extras('B', 'C'),
        }).expect(200)
      ).body;
      expect(
        three.additionalClasses.map((c: { id: string }) => c.id).sort(),
      ).toEqual(extras('B', 'C').sort());
      expect(extraIdsOf(await sessionOf(id.s1Tue))).toEqual(
        extras('B', 'C').sort(),
      );
      expect(extraIdsOf(await sessionOf(id.s1Tue2))).toEqual([id.B]);
      // The edited slot is still validated (the host cannot be repeated)
      await patch(`group-classes/${id.A}/schedules/${id.S1}`, {
        additionalGroupClassIds: extras('A'),
      }).expect(400);
    });
  });

  // ───────────────────────── dated sessions ─────────────────────────

  describe('dated shared sessions', () => {
    it('a normal session is unchanged (no additional class, the class team)', async () => {
      const s = (
        await extra('A', {
          date: THU,
          startTime: '10:00',
          endTime: '11:00',
          roomId: id.R1,
        }).expect(201)
      ).body;
      expect(s.additionalClasses).toEqual([]);
      expect(teamOf(await sessionOf(s.id))).toEqual({
        [id.D]: 'SUPERVISOR',
        [id.A1]: 'ASSISTANT',
      });
    });

    it('an extra session for three classes: one lesson, the union team', async () => {
      const s = (
        await extra('A', {
          date: WED,
          startTime: '10:00',
          endTime: '11:00',
          roomId: id.R1,
          additionalGroupClassIds: extras('B', 'C'),
        }).expect(201)
      ).body;
      id.wed = s.id;
      expect(
        s.additionalClasses.map((c: { id: string }) => c.id).sort(),
      ).toEqual(extras('B', 'C').sort());
      expect(teamOf(await sessionOf(s.id))).toEqual({
        [id.D]: 'SUPERVISOR',
        [id.A1]: 'ASSISTANT',
        [id.B1]: 'ASSISTANT',
      });
    });

    it('dated conflicts against a shared lesson: extra class, teacher, room', async () => {
      const at = { date: TUE, startTime: '17:00', endTime: '17:30' };
      // C is an additional class of the first Tuesday's lesson now
      expect(
        (await extra('C', { ...at, roomId: id.R2 }).expect(409)).body.code,
      ).toBe('CLASS_SESSION_CONFLICT');
      // K: its assistant B1 teaches the shared lesson
      expect(
        (await extra('K', { ...at, roomId: id.R3 }).expect(409)).body.code,
      ).toBe('TEACHER_SESSION_CONFLICT');
      // E (sup H, no shared teacher) in R1, the shared lesson's room → ROOM
      expect(
        (
          await extra('E', {
            date: TUE,
            startTime: '16:00',
            endTime: '16:30',
            roomId: id.R1,
          }).expect(409)
        ).body.code,
      ).toBe('ROOM_SESSION_CONFLICT');
    });

    it('editing: participants of an upcoming lesson can change; cancel keeps them; restore re-checks', async () => {
      const edited = (
        await patch(`sessions/${id.wed}`, {
          additionalGroupClassIds: extras('C'),
        }).expect(200)
      ).body;
      expect(edited.additionalClasses.map((c: { id: string }) => c.id)).toEqual(
        [id.C],
      );
      // B1 left with B
      expect(teamOf(await sessionOf(id.wed))).toEqual({
        [id.D]: 'SUPERVISOR',
        [id.A1]: 'ASSISTANT',
      });
      await patch(`sessions/${id.wed}`, {
        additionalGroupClassIds: extras('C', 'C'),
      }).expect(400);
      await patch(`sessions/${id.wed}`, {
        additionalGroupClassIds: extras('E'),
      }).expect(409);

      const cancelled = (
        await patch(`sessions/${id.wed}/status`, {
          status: 'CANCELLED',
          cancellationReason: 'عطلة',
        }).expect(200)
      ).body;
      expect(
        cancelled.additionalClasses.map((c: { id: string }) => c.id),
      ).toEqual([id.C]);
      // While cancelled, C may get its own lesson then…
      const own = (
        await extra('C', {
          date: WED,
          startTime: '10:30',
          endTime: '11:30',
          roomId: id.R2,
        }).expect(201)
      ).body;
      // …and restoring the shared lesson is then refused (C would be in both)
      expect(
        (
          await patch(`sessions/${id.wed}/status`, {
            status: 'SCHEDULED',
          }).expect(409)
        ).body.code,
      ).toBe('CLASS_SESSION_CONFLICT');
      await patch(`sessions/${own.id}/status`, { status: 'CANCELLED' }).expect(
        200,
      );
      await patch(`sessions/${id.wed}/status`, { status: 'SCHEDULED' }).expect(
        200,
      );
    });

    it('a past lesson keeps its participants (history)', async () => {
      const past = (
        await post('sessions', {
          groupClassId: id.A,
          additionalGroupClassIds: extras('B'),
          roomId: id.R1,
          date: addDays(TODAY, -3),
          startTime: '06:00',
          endTime: '07:00',
        }).expect(201)
      ).body;
      expect(
        (
          await patch(`sessions/${past.id}`, {
            additionalGroupClassIds: [],
          }).expect(409)
        ).body.code,
      ).toBe('SHARED_EDIT_NOT_UPCOMING');
      expect(extraIdsOf(await sessionOf(past.id))).toEqual([id.B]);
    });

    it('concurrent requests: only one of two overlapping shared lessons is created', async () => {
      const at = { date: THU, startTime: '14:00', endTime: '15:00' };
      const both = await Promise.all([
        extra('A', {
          ...at,
          roomId: id.R1,
          additionalGroupClassIds: extras('B'),
        }),
        extra('C', {
          ...at,
          roomId: id.R2,
          additionalGroupClassIds: extras('B'),
        }),
      ]);
      expect(both.map((r) => r.status).sort((a, b) => a - b)).toEqual([
        201, 409,
      ]);
      const weekly = await Promise.all([
        slot('A', {
          dayOfWeek: 'FRI',
          startTime: '10:00',
          endTime: '12:00',
          roomId: id.R1,
          additionalGroupClassIds: extras('C'),
        }),
        slot('B', {
          dayOfWeek: 'FRI',
          startTime: '11:00',
          endTime: '13:00',
          roomId: id.R2,
          additionalGroupClassIds: extras('C'),
        }),
      ]);
      expect(weekly.map((r) => r.status).sort((a, b) => a - b)).toEqual([
        201, 409,
      ]);
    });
  });

  // ───────────────────────── class changes ─────────────────────────

  describe('class changes while shared', () => {
    it('supervisor / branch changes of a participating class are refused; assistant changes reach its shared lessons', async () => {
      expect(
        (
          await patch(`group-classes/${id.B}`, { supervisorId: id.H }).expect(
            409,
          )
        ).body.code,
      ).toBe('SHARED_SUPERVISOR_CHANGE_BLOCKED');
      // The host of a shared slot too
      expect(
        (
          await patch(`group-classes/${id.A}`, { supervisorId: id.Z }).expect(
            409,
          )
        ).body.code,
      ).toBe('SHARED_SUPERVISOR_CHANGE_BLOCKED');
      expect(
        (
          await patch(`group-classes/${id.C}`, {
            branchId: id.otherBranch,
          }).expect(409)
        ).body.code,
      ).toBe('SHARED_BRANCH_CHANGE_BLOCKED');
      expect(
        (await get(`group-classes/${id.B}`).expect(200)).body,
      ).toMatchObject({ supervisor: { id: id.D } });

      // New assistant of B: its upcoming shared lessons (hosted by A) follow
      await patch(`group-classes/${id.B}`, {
        assistantTeacherIds: [id.B1, id.N],
      }).expect(200);
      expect(teamOf(await sessionOf(id.s1Tue))).toMatchObject({
        [id.N]: 'ASSISTANT',
        [id.B1]: 'ASSISTANT',
        [id.A1]: 'ASSISTANT',
      });
      // The attended lesson keeps its team
      expect(teamOf(await sessionOf(id.s1Tue2))).not.toHaveProperty(id.N);
    });

    it('a class without shared participation is unaffected (normal rules)', async () => {
      await patch(`group-classes/${id.K}`, { supervisorId: id.Z }).expect(200);
    });
  });
});
