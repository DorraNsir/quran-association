import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { PasswordService } from '../src/auth/password.service.js';
import { todayIn, toLocalDateTime } from '../src/common/dates.js';
import { Role } from '../src/generated/prisma/enums.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const RUN = randomUUID().slice(0, 8);
const PASSWORD = 'initial-pass-123';
const tag = (s: string) => `${s} ${RUN}`;
const TODAY = todayIn('Africa/Tunis');
const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const dbDate = (d: string) => new Date(`${d}T00:00:00.000Z`);
/** Deterministic dates: always in the future, whatever the time of day. */
const FUT = (n: number) => addDays(TODAY, n);

/**
 * A lesson that has ALREADY STARTED TODAY, whatever the time of day the suite
 * runs: 00:00 today — or, in the very first minute of the day, late yesterday.
 */
function startedToday() {
  const now = toLocalDateTime(new Date(), 'Africa/Tunis');
  return now.slice(11, 16) > '00:00'
    ? { date: now.slice(0, 10), startTime: '00:00', endTime: '00:01' }
    : {
        date: addDays(now.slice(0, 10), -1),
        startTime: '23:58',
        endTime: '23:59',
      };
}

/**
 * Teacher session actions («إلغاء الحصة», «إضافة حصة إضافية» — supervisors
 * only) and the admin's management of extra sessions (edit, «حذف نهائي» —
 * a real DELETE, guarded against any loss of history).
 */
describe('Session management: teacher actions, extra-session edit and permanent delete (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const id: Record<string, string> = {};
  const uid: Record<string, string> = {};
  const token: Record<string, string> = {};

  const http = () => request(app.getHttpServer());
  const auth = (who: string) => ({ Authorization: `Bearer ${token[who]}` });
  const admin = {
    get: (path: string) => http().get(`/api/admin/${path}`).set(auth('admin')),
    post: (path: string, body: object = {}) =>
      http().post(`/api/admin/${path}`).set(auth('admin')).send(body),
    patch: (path: string, body: object = {}) =>
      http().patch(`/api/admin/${path}`).set(auth('admin')).send(body),
    del: (path: string) =>
      http().delete(`/api/admin/${path}`).set(auth('admin')),
  };
  const teacher = (who: string) => ({
    extra: (body: object) =>
      http().post('/api/teacher/sessions/extra').set(auth(who)).send(body),
    cancel: (sessionId: string, body: object = {}) =>
      http()
        .post(`/api/teacher/sessions/${sessionId}/cancel`)
        .set(auth(who))
        .send(body),
  });
  const mark = () => new Date(Date.now() - 1);

  /** This run's notifications since `t`, per account key. */
  async function since(t: Date) {
    const keyOf = new Map(Object.entries(uid).map(([k, v]) => [v, k]));
    const rows = await prisma.notification.findMany({
      where: { createdAt: { gte: t }, userId: { in: Object.values(uid) } },
      orderBy: { createdAt: 'asc' },
    });
    const out: Record<string, (typeof rows)[number][]> = {};
    for (const r of rows) (out[keyOf.get(r.userId)!] ??= []).push(r);
    return out;
  }
  const keys = (got: Record<string, unknown>) => Object.keys(got).sort();

  async function account(
    key: string,
    roles: Role[],
    opts: { teacher?: boolean } = {},
  ) {
    const person = await prisma.person.create({
      data: {
        firstName: key,
        lastName: tag('حساب'),
        gender: 'MALE',
        dateOfBirth: new Date('2000-01-01'),
        address: 'نابل',
        phone: '22345678',
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
      select: {
        id: true,
        teacher: { select: { id: true } },
        user: { select: { id: true } },
      },
    });
    uid[key] = person.user!.id;
    id[`person:${key}`] = person.id;
    if (opts.teacher) id[`teacher:${key}`] = person.teacher!.id;
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

  /** An admin extra lesson (always in the future: deterministic). */
  const adminExtra = async (body: object) =>
    (await admin.post('sessions/extra', body).expect(201)).body as {
      id: string;
      updatedAt: string;
    };
  /** A manual (historical) session — the unchanged manual endpoint (isExtra too). */
  const manual = async (body: object) =>
    (await admin.post('sessions', body).expect(201)).body.id as string;
  const sessionRow = (sessionId: string) =>
    prisma.session.findUnique({ where: { id: sessionId } });
  const lesson = (
    classKey: string,
    roomKey: string,
    date: string,
    startTime: string,
    endTime: string,
  ) => ({
    groupClassId: id[classKey],
    roomId: id[roomKey],
    date,
    startTime,
    endTime,
  });
  const lessonA = (date: string, startTime: string, endTime: string) =>
    lesson('A', 'R1', date, startTime, endTime);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    await account('admin', [Role.ADMIN]);
    await account('admin2', [Role.ADMIN]);
    // An admin who also assists class A: told once, never twice
    await account('adminTeacher', [Role.ADMIN, Role.TEACHER], {
      teacher: true,
    });
    for (const t of ['T1', 'T2', 'TX', 'TI'])
      await account(t, [Role.TEACHER], { teacher: true });
    for (const s of ['sA', 'sP', 'sO', 'sW']) await account(s, [Role.STUDENT]);

    id.B1 = (
      await admin
        .post('branches', { name: tag('B1'), address: 'نابل' })
        .expect(201)
    ).body.id;
    id.B2 = (
      await admin
        .post('branches', { name: tag('B2'), address: 'قربة' })
        .expect(201)
    ).body.id;
    for (const [k, b] of [
      ['R1', 'B1'],
      ['R2', 'B1'],
      ['R3', 'B2'],
      ['R4', 'B1'],
    ])
      id[k] = (
        await admin.post('rooms', { branchId: id[b], name: tag(k) }).expect(201)
      ).body.id;
    id.G = (await admin.post('groups', { name: tag('G') }).expect(201)).body.id;
    const make = async (key: string, sup: string, assistants: string[]) =>
      (id[key] = (
        await admin
          .post('group-classes', {
            groupId: id.G,
            branchId: id.B1,
            supervisorId: id[`teacher:${sup}`],
            assistantTeacherIds: assistants.map((a) => id[`teacher:${a}`]),
          })
          .expect(201)
      ).body.id);
    await make('A', 'T1', ['T2', 'adminTeacher']);
    await make('P', 'T1', []); // same supervisor: may share a lesson with A
    await make('O', 'TX', []); // another supervisor
    await make('I', 'T1', []); // made inactive below
    await make('Z', 'TI', []); // its supervisor's profile is made inactive in a test
    const enroll = async (key: string, classKey: string) =>
      (id[`student:${key}`] = (
        await admin
          .post('students', {
            personId: id[`person:${key}`],
            groupClassId: id[classKey],
            registrationDate: addDays(TODAY, -10),
            guardianPhone: '98765432',
          })
          .expect(201)
      ).body.id);
    await enroll('sA', 'A');
    await enroll('sP', 'P');
    await enroll('sO', 'O');
    await enroll('sW', 'A');
    await prisma.groupClass.update({
      where: { id: id.I },
      data: { status: 'INACTIVE' },
    });
    await prisma.notification.deleteMany({
      where: { userId: { in: Object.values(uid) } },
    });
  });

  afterAll(async () => {
    const classes = { group: { name: { endsWith: RUN } } };
    const persons = { lastName: { endsWith: RUN } };
    const students = { person: persons };
    const sessions = { groupClass: classes };
    await prisma.notification.deleteMany({
      where: { userId: { in: Object.values(uid) } },
    });
    await prisma.workItem.deleteMany({
      where: { program: { session: sessions } },
    });
    await prisma.workProgram.deleteMany({ where: { session: sessions } });
    await prisma.attendanceChange.deleteMany({ where: { session: sessions } });
    await prisma.studentAttendance.deleteMany({ where: { session: sessions } });
    await prisma.teacherAttendance.deleteMany({ where: { session: sessions } });
    await prisma.paymentObligation.deleteMany({ where: { student: students } });
    await prisma.studentEnrollment.deleteMany({ where: { student: students } });
    await prisma.studentStatusChange.deleteMany({
      where: { student: students },
    });
    await prisma.student.deleteMany({ where: students });
    await prisma.session.deleteMany({ where: sessions });
    await prisma.weeklyScheduleClass.deleteMany({
      where: { groupClass: classes },
    });
    await prisma.weeklySchedule.deleteMany({ where: { groupClass: classes } });
    await prisma.groupClassAssistant.deleteMany({
      where: { groupClass: classes },
    });
    await prisma.groupClass.deleteMany({ where: classes });
    await prisma.group.deleteMany({ where: { name: { endsWith: RUN } } });
    await prisma.room.deleteMany({
      where: { branch: { name: { endsWith: RUN } } },
    });
    await prisma.branch.deleteMany({ where: { name: { endsWith: RUN } } });
    await prisma.teacher.deleteMany({ where: { person: persons } });
    await prisma.user.deleteMany({ where: { person: persons } });
    await prisma.person.deleteMany({ where: persons });
    await app.close();
  });

  /* ─────────────────────── teacher: extra session ─────────────────────── */

  describe('teacher: «إضافة حصة إضافية»', () => {
    it('the supervisor creates one for their class; its people and every admin are told once each', async () => {
      const t = mark();
      const res = await teacher('T1')
        .extra(lessonA(FUT(3), '10:00', '11:00'))
        .expect(201);
      expect(res.body).toMatchObject({
        isExtra: true,
        status: 'SCHEDULED',
        weeklyScheduleId: null,
        date: FUT(3),
        groupClass: { id: id.A },
      });
      // Its team snapshot: the class's supervisor and assistants
      expect(
        res.body.teachers.map((x: { id: string; role: string }) => [
          x.id,
          x.role,
        ]),
      ).toEqual(expect.arrayContaining([[id['teacher:T1'], 'SUPERVISOR']]));
      const got = await since(t);
      // Team + students + admins — never the teacher who did it; the admin
      // who also assists A only once
      expect(keys(got)).toEqual(
        ['T2', 'adminTeacher', 'sA', 'sW', 'admin', 'admin2'].sort(),
      );
      expect(Object.values(got).every((l) => l.length === 1)).toBe(true);
      expect(got.admin[0]).toMatchObject({
        type: 'SESSION_CHANGED',
        title: 'حصة إضافية',
        entityType: 'SESSION',
        entityId: res.body.id,
        sessionId: res.body.id,
        actorUserId: uid.T1,
      });
      // Named as a teacher, not as an administrator
      expect(got.admin[0].message).toContain(`أضاف المعلم T1 ${tag('حساب')}`);
    });

    it('an assistant, an unrelated teacher, an admin account, an unknown class: refused, nothing created', async () => {
      const body = lessonA(FUT(3), '12:00', '13:00');
      const t = mark();
      expect((await teacher('T2').extra(body).expect(403)).body.code).toBe(
        'TEACHER_NOT_SUPERVISOR',
      );
      expect((await teacher('TX').extra(body).expect(403)).body.code).toBe(
        'TEACHER_NOT_SUPERVISOR',
      );
      await teacher('admin').extra(body).expect(403);
      expect(
        (
          await teacher('T1')
            .extra({ ...body, groupClassId: randomUUID() })
            .expect(403)
        ).body.code,
      ).toBe('TEACHER_NOT_SUPERVISOR');
      expect(
        await prisma.session.count({
          where: { groupClassId: id.A, date: dbDate(FUT(3)) },
        }),
      ).toBe(1);
      expect(await since(t)).toEqual({});
    });

    it('an inactive teacher profile is refused', async () => {
      await prisma.teacher.update({
        where: { id: id['teacher:TI'] },
        data: { status: 'INACTIVE' },
      });
      const res = await teacher('TI')
        .extra(lesson('Z', 'R1', FUT(3), '14:00', '15:00'))
        .expect(403);
      expect(res.body.code).toBe('TEACHER_INACTIVE');
      await prisma.teacher.update({
        where: { id: id['teacher:TI'] },
        data: { status: 'ACTIVE' },
      });
    });

    it('an inactive class, a past date, a start already passed today: refused', async () => {
      expect(
        (
          await teacher('T1')
            .extra(lesson('I', 'R1', FUT(3), '15:00', '16:00'))
            .expect(409)
        ).body.code,
      ).toBe('GROUP_CLASS_INACTIVE');
      expect(
        (
          await teacher('T1')
            .extra(lessonA(addDays(TODAY, -1), '10:00', '11:00'))
            .expect(400)
        ).body.code,
      ).toBe('SESSION_DATE_PAST');
      const s = startedToday();
      expect(
        (
          await teacher('T1')
            .extra(lessonA(s.date, s.startTime, s.endTime))
            .expect(400)
        ).body.code,
      ).toBe('SESSION_DATE_PAST');
    });

    it('room and teacher conflicts, another branch’s room, a shared lesson with another supervisor: refused', async () => {
      // O (TX) holds R2 at 17:00 on FUT(3)
      await adminExtra(lesson('O', 'R2', FUT(3), '17:00', '18:00'));
      expect(
        (
          await teacher('T1')
            .extra(lesson('A', 'R2', FUT(3), '17:30', '18:30'))
            .expect(409)
        ).body.code,
      ).toBe('ROOM_SESSION_CONFLICT');
      // T1 already teaches A 10:00–11:00 that day: P at an overlapping time
      expect(
        (
          await teacher('T1')
            .extra(lesson('P', 'R2', FUT(3), '10:30', '11:30'))
            .expect(409)
        ).body.code,
      ).toBe('TEACHER_SESSION_CONFLICT');
      expect(
        (
          await teacher('T1')
            .extra(lesson('A', 'R3', FUT(3), '19:00', '20:00'))
            .expect(400)
        ).body.code,
      ).toBe('ROOM_NOT_IN_BRANCH');
      expect(
        (
          await teacher('T1')
            .extra({
              ...lessonA(FUT(3), '19:00', '20:00'),
              additionalGroupClassIds: [id.O],
            })
            .expect(409)
        ).body.code,
      ).toBe('SHARED_SUPERVISOR_MISMATCH');
      // A shared lesson of their own two classes is fine
      const shared = await teacher('T1')
        .extra({
          ...lessonA(FUT(3), '19:00', '20:00'),
          additionalGroupClassIds: [id.P],
        })
        .expect(201);
      expect(
        shared.body.additionalClasses.map((c: { id: string }) => c.id),
      ).toEqual([id.P]);
    });

    it('the workspace offers every active room of the branches the teacher supervises', async () => {
      const ws = await http()
        .get('/api/teacher/workspace')
        .set(auth('T1'))
        .expect(200);
      const rooms = ws.body.rooms.map((r: { id: string }) => r.id);
      expect(rooms).toEqual(expect.arrayContaining([id.R1, id.R2, id.R4]));
      // Another branch's room never
      expect(rooms).not.toContain(id.R3);
    });
  });

  /* ─────────────────────── teacher: cancel ─────────────────────── */

  describe('teacher: «إلغاء الحصة»', () => {
    it('the supervisor cancels an upcoming lesson: kept as CANCELLED, its people and the admins told', async () => {
      const l = await adminExtra(lessonA(FUT(4), '10:00', '11:00'));
      const t = mark();
      const res = await teacher('T1')
        .cancel(l.id, { cancellationReason: 'مرض' })
        .expect(200);
      expect(res.body).toMatchObject({
        status: 'CANCELLED',
        cancellationReason: 'مرض',
      });
      expect((await sessionRow(l.id))?.status).toBe('CANCELLED');
      const got = await since(t);
      expect(keys(got)).toEqual(
        ['T2', 'adminTeacher', 'sA', 'sW', 'admin', 'admin2'].sort(),
      );
      expect(Object.values(got).every((x) => x.length === 1)).toBe(true);
      expect(got.admin2[0]).toMatchObject({
        title: 'إلغاء حصة',
        entityId: l.id,
        sessionId: l.id,
        actorUserId: uid.T1,
      });
      expect(got.admin2[0].message).toContain(`ألغى المعلم T1 ${tag('حساب')}`);
      expect(got.admin2[0].message).toContain('السبب: مرض');
      // Already cancelled: refused, nobody told again (no restore for teachers)
      const t2 = mark();
      expect((await teacher('T1').cancel(l.id).expect(409)).body.code).toBe(
        'SESSION_NOT_CANCELLABLE',
      );
      expect(await since(t2)).toEqual({});
    });

    it('an assistant, an unrelated teacher, an unknown lesson: refused, the lesson untouched', async () => {
      const l = await adminExtra(lessonA(FUT(4), '12:00', '13:00'));
      const t = mark();
      expect((await teacher('T2').cancel(l.id).expect(403)).body.code).toBe(
        'TEACHER_NOT_SUPERVISOR',
      );
      expect((await teacher('TX').cancel(l.id).expect(403)).body.code).toBe(
        'TEACHER_NOT_SUPERVISOR',
      );
      await teacher('T1').cancel(randomUUID()).expect(404);
      expect((await sessionRow(l.id))?.status).toBe('SCHEDULED');
      expect(await since(t)).toEqual({});
    });

    it('an inactive teacher profile is refused', async () => {
      const l = await adminExtra(lesson('Z', 'R4', FUT(4), '12:00', '13:00'));
      await prisma.teacher.update({
        where: { id: id['teacher:TI'] },
        data: { status: 'INACTIVE' },
      });
      expect((await teacher('TI').cancel(l.id).expect(403)).body.code).toBe(
        'TEACHER_INACTIVE',
      );
      await prisma.teacher.update({
        where: { id: id['teacher:TI'] },
        data: { status: 'ACTIVE' },
      });
      expect((await sessionRow(l.id))?.status).toBe('SCHEDULED');
    });

    it('a past, an already started or a completed lesson: refused', async () => {
      const past = await manual(lessonA(addDays(TODAY, -2), '10:00', '11:00'));
      const s = startedToday();
      const started = await manual(lessonA(s.date, s.startTime, s.endTime));
      const completed = await manual({
        ...lessonA(addDays(TODAY, -3), '10:00', '11:00'),
        status: 'COMPLETED',
      });
      for (const sid of [past, started])
        expect((await teacher('T1').cancel(sid).expect(409)).body.code).toBe(
          'SESSION_ALREADY_STARTED',
        );
      expect(
        (await teacher('T1').cancel(completed).expect(409)).body.code,
      ).toBe('SESSION_NOT_CANCELLABLE');
      for (const sid of [past, started])
        expect((await sessionRow(sid))?.status).toBe('SCHEDULED');
      expect((await sessionRow(completed))?.status).toBe('COMPLETED');
    });

    it('a lesson with recorded attendance: refused', async () => {
      const l = await adminExtra(lessonA(FUT(4), '14:00', '15:00'));
      await prisma.studentAttendance.create({
        data: {
          sessionId: l.id,
          studentId: id['student:sA'],
          status: 'PRESENT',
        },
      });
      expect((await teacher('T1').cancel(l.id).expect(409)).body.code).toBe(
        'SESSION_HAS_ATTENDANCE',
      );
      expect((await sessionRow(l.id))?.status).toBe('SCHEDULED');
    });
  });

  /* ─────────────────────── admin: edit an extra session ─────────────────────── */

  describe('admin: «تعديل الحصة» (extra session)', () => {
    it('moves date, time and room; the host class stays; a stale form is refused', async () => {
      const l = await adminExtra(lessonA(FUT(5), '10:00', '11:00'));
      const t = mark();
      const res = await admin
        .patch(`sessions/${l.id}`, {
          date: FUT(6),
          startTime: '09:00',
          endTime: '10:30',
          roomId: id.R2,
          expectedUpdatedAt: l.updatedAt,
        })
        .expect(200);
      expect(res.body).toMatchObject({
        date: FUT(6),
        startTime: '09:00',
        endTime: '10:30',
        room: { id: id.R2 },
        groupClass: { id: id.A },
        isExtra: true,
      });
      expect((await since(t)).sA[0].title).toBe('تغيير موعد حصة');
      // The form was opened before that change: refused, nothing overwritten
      const stale = await admin
        .patch(`sessions/${l.id}`, {
          startTime: '08:00',
          endTime: '08:30',
          expectedUpdatedAt: l.updatedAt,
        })
        .expect(409);
      expect(stale.body.code).toBe('SESSION_CHANGED');
      const row = await sessionRow(l.id);
      expect(row?.startTime.toISOString().slice(11, 16)).toBe('09:00');
      expect(row?.groupClassId).toBe(id.A);
    });

    it('room and teacher conflicts are refused', async () => {
      const l = await adminExtra(lessonA(FUT(5), '12:00', '13:00'));
      await adminExtra(lesson('O', 'R2', FUT(5), '14:00', '15:00'));
      await adminExtra(lesson('P', 'R2', FUT(5), '16:00', '17:00'));
      expect(
        (
          await admin
            .patch(`sessions/${l.id}`, {
              startTime: '14:00',
              endTime: '15:00',
              roomId: id.R2,
            })
            .expect(409)
        ).body.code,
      ).toBe('ROOM_SESSION_CONFLICT');
      // T1 teaches P at 16:00 (in another room)
      expect(
        (
          await admin
            .patch(`sessions/${l.id}`, { startTime: '16:00', endTime: '17:00' })
            .expect(409)
        ).body.code,
      ).toBe('TEACHER_SESSION_CONFLICT');
    });

    it('never into the past, never once started, never with attendance, never completed', async () => {
      const l = await adminExtra(lessonA(FUT(5), '18:00', '19:00'));
      expect(
        (
          await admin
            .patch(`sessions/${l.id}`, { date: addDays(TODAY, -1) })
            .expect(400)
        ).body.code,
      ).toBe('SESSION_DATE_PAST');
      const s = startedToday();
      expect(
        (
          await admin
            .patch(`sessions/${l.id}`, {
              date: s.date,
              startTime: s.startTime,
              endTime: s.endTime,
            })
            .expect(400)
        ).body.code,
      ).toBe('SESSION_DATE_PAST');
      // An extra lesson that already took place (manual, yesterday): not editable
      const yesterday = await manual(
        lesson('O', 'R2', addDays(TODAY, -1), '06:00', '07:00'),
      );
      expect(
        (
          await admin
            .patch(`sessions/${yesterday}`, { date: FUT(7) })
            .expect(409)
        ).body.code,
      ).toBe('SESSION_ALREADY_STARTED');
      await prisma.teacherAttendance.create({
        data: {
          sessionId: l.id,
          teacherId: id['teacher:T1'],
          status: 'PRESENT',
        },
      });
      expect(
        (
          await admin
            .patch(`sessions/${l.id}`, { startTime: '18:30', endTime: '19:30' })
            .expect(409)
        ).body.code,
      ).toBe('SESSION_HAS_ATTENDANCE');
      const completed = await manual({
        ...lessonA(addDays(TODAY, -4), '10:00', '11:00'),
        status: 'COMPLETED',
      });
      expect(
        (
          await admin
            .patch(`sessions/${completed}`, { date: FUT(8) })
            .expect(409)
        ).body.code,
      ).toBe('SESSION_NOT_EDITABLE');
    });

    it('planned work stays valid: a move keeping its students works, one leaving a student out is refused', async () => {
      const l = await adminExtra(lessonA(FUT(9), '10:00', '11:00'));
      await prisma.workProgram.create({
        data: {
          studentId: id['student:sW'],
          sessionId: l.id,
          items: {
            create: { position: 0, type: 'REVISION', description: 'مراجعة' },
          },
        },
      });
      await admin.patch(`sessions/${l.id}`, { date: FUT(10) }).expect(200);
      // sW leaves class A from FUT(12) on
      await prisma.studentEnrollment.updateMany({
        where: { studentId: id['student:sW'], endDate: null },
        data: { endDate: dbDate(FUT(12)) },
      });
      try {
        const res = await admin
          .patch(`sessions/${l.id}`, { date: FUT(13) })
          .expect(409);
        expect(res.body.code).toBe('SESSION_WORK_ROSTER_CHANGED');
        expect((await sessionRow(l.id))?.date).toEqual(dbDate(FUT(10)));
        expect(
          await prisma.workItem.count({
            where: { program: { sessionId: l.id } },
          }),
        ).toBe(1);
      } finally {
        await prisma.studentEnrollment.updateMany({
          where: { studentId: id['student:sW'], endDate: dbDate(FUT(12)) },
          data: { endDate: null },
        });
      }
    });
  });

  /* ─────────────────────── admin: permanent delete ─────────────────────── */

  describe('admin: «حذف نهائي»', () => {
    it('a clean upcoming extra session is REALLY deleted: structure removed, history kept, those told before are told', async () => {
      const l = await adminExtra({
        ...lessonA(FUT(14), '10:00', '11:00'),
        additionalGroupClassIds: [id.P],
      });
      expect(
        await prisma.sessionTeacher.count({ where: { sessionId: l.id } }),
      ).toBeGreaterThan(0);
      expect(
        await prisma.sessionClass.count({ where: { sessionId: l.id } }),
      ).toBe(1);
      const added = await prisma.notification.findMany({
        where: { entityId: l.id },
        select: { id: true, userId: true },
      });
      expect(added.length).toBeGreaterThan(0);
      const t = mark();
      await admin.del(`sessions/${l.id}`).expect(204);
      // A real DELETE — not a status change
      expect(await sessionRow(l.id)).toBeNull();
      expect(
        await prisma.sessionTeacher.count({ where: { sessionId: l.id } }),
      ).toBe(0);
      expect(
        await prisma.sessionClass.count({ where: { sessionId: l.id } }),
      ).toBe(0);
      // Earlier notifications are kept, their link cleared (ON DELETE SET NULL)
      const kept = await prisma.notification.findMany({
        where: { id: { in: added.map((n) => n.id) } },
      });
      expect(kept).toHaveLength(added.length);
      expect(
        kept.every((n) => n.sessionId === null && n.entityId === l.id),
      ).toBe(true);
      // Exactly those told before are told now, once each, with no link
      const got = await since(t);
      const toldBefore = [...new Set(added.map((n) => n.userId))]
        .map((u) => Object.entries(uid).find(([, v]) => v === u)![0])
        .sort();
      expect(keys(got)).toEqual(toldBefore);
      expect(Object.values(got).every((x) => x.length === 1)).toBe(true);
      expect(got.sP[0]).toMatchObject({
        type: 'SESSION_CHANGED',
        title: 'تم حذف حصة إضافية',
        entityType: 'SESSION',
        entityId: l.id,
        sessionId: null,
        actorUserId: uid.admin,
      });
      expect(got.sP[0].message).toContain(
        `حذف المسؤول الإداري admin ${tag('حساب')} الحصة الإضافية`,
      );
      // Gone for the API too
      await admin.get(`sessions/${l.id}`).expect(404);
      expect((await admin.del(`sessions/${l.id}`).expect(404)).body.code).toBe(
        'SESSION_NOT_FOUND',
      );
    });

    it('a cancelled extra session (upcoming, or in the past) is deleted', async () => {
      const upcoming = await adminExtra(lessonA(FUT(14), '12:00', '13:00'));
      await admin
        .patch(`sessions/${upcoming.id}/status`, { status: 'CANCELLED' })
        .expect(200);
      await admin.del(`sessions/${upcoming.id}`).expect(204);
      expect(await sessionRow(upcoming.id)).toBeNull();
      // A past cancelled extra lesson (manual endpoint, then cancelled)
      const past = await manual(lessonA(addDays(TODAY, -5), '10:00', '11:00'));
      await admin
        .patch(`sessions/${past}/status`, { status: 'CANCELLED' })
        .expect(200);
      const t = mark();
      await admin.del(`sessions/${past}`).expect(204);
      expect(await sessionRow(past)).toBeNull();
      // A lesson entirely in the past: nobody is told
      expect(await since(t)).toEqual({});
    });

    it('a regular, a completed, a past or started scheduled session: refused and kept', async () => {
      // A regular lesson (not extra)
      const regularId = await manual(
        lesson('O', 'R2', FUT(14), '07:00', '08:00'),
      );
      await prisma.session.update({
        where: { id: regularId },
        data: { isExtra: false },
      });
      const completed = await manual({
        ...lessonA(addDays(TODAY, -6), '10:00', '11:00'),
        status: 'COMPLETED',
      });
      const past = await manual(lessonA(addDays(TODAY, -6), '12:00', '13:00'));
      const s = startedToday();
      const started = await manual(
        lesson('O', 'R2', s.date, s.startTime, s.endTime),
      );
      const cases: [string, string, string][] = [
        [regularId, 'SESSION_NOT_EXTRA', 'لا يمكن حذف حصة عادية'],
        [completed, 'SESSION_COMPLETED', 'لا يمكن حذف حصة مكتملة'],
        [past, 'SESSION_DATE_PAST', 'لا يمكن حذف حصة مبرمجة في الماضي'],
        [started, 'SESSION_DATE_PAST', 'لا يمكن حذف حصة مبرمجة في الماضي'],
      ];
      for (const [sid, code, message] of cases) {
        const res = await admin.del(`sessions/${sid}`).expect(409);
        expect(res.body.code).toBe(code);
        expect(res.body.message).toContain(message);
        expect(await sessionRow(sid)).not.toBeNull();
      }
      expect((await sessionRow(completed))?.status).toBe('COMPLETED');
    });

    it('attendance, attendance history or work: refused, every protected row kept', async () => {
      const withStudent = await adminExtra(lessonA(FUT(15), '08:00', '09:00'));
      await prisma.studentAttendance.create({
        data: {
          sessionId: withStudent.id,
          studentId: id['student:sA'],
          status: 'ABSENT',
        },
      });
      const withTeacher = await adminExtra(lessonA(FUT(15), '10:00', '11:00'));
      await prisma.teacherAttendance.create({
        data: {
          sessionId: withTeacher.id,
          teacherId: id['teacher:T1'],
          status: 'PRESENT',
        },
      });
      // Only the audit trail: a CASCADE relation, so it must be checked explicitly
      const withAudit = await adminExtra(lessonA(FUT(15), '12:00', '13:00'));
      await prisma.attendanceChange.create({
        data: {
          sessionId: withAudit.id,
          subject: 'STUDENT',
          studentId: id['student:sA'],
          kind: 'CREATED',
          newStatus: 'PRESENT',
          actorName: 'admin',
        },
      });
      const withWork = await adminExtra(lessonA(FUT(15), '14:00', '15:00'));
      await prisma.workProgram.create({
        data: {
          studentId: id['student:sA'],
          sessionId: withWork.id,
          items: {
            create: { position: 0, type: 'MEMORIZATION', description: 'حفظ' },
          },
        },
      });
      const t = mark();
      const cases: [string, string][] = [
        [withStudent.id, 'SESSION_HAS_ATTENDANCE'],
        [withTeacher.id, 'SESSION_HAS_ATTENDANCE'],
        [withAudit.id, 'SESSION_HAS_HISTORY'],
        [withWork.id, 'SESSION_HAS_WORK'],
      ];
      for (const [sid, code] of cases) {
        expect((await admin.del(`sessions/${sid}`).expect(409)).body.code).toBe(
          code,
        );
        expect((await sessionRow(sid))?.status).toBe('SCHEDULED');
      }
      expect(
        await prisma.studentAttendance.count({
          where: { sessionId: withStudent.id },
        }),
      ).toBe(1);
      expect(
        await prisma.teacherAttendance.count({
          where: { sessionId: withTeacher.id },
        }),
      ).toBe(1);
      expect(
        await prisma.attendanceChange.count({
          where: { sessionId: withAudit.id },
        }),
      ).toBe(1);
      expect(
        await prisma.workItem.count({
          where: { program: { sessionId: withWork.id } },
        }),
      ).toBe(1);
      // A refused delete tells nobody
      expect(await since(t)).toEqual({});
    });

    it('only admins: a teacher (even the supervisor) cannot delete', async () => {
      const l = await adminExtra(lessonA(FUT(16), '10:00', '11:00'));
      await http()
        .delete(`/api/admin/sessions/${l.id}`)
        .set(auth('T1'))
        .expect(403);
      expect(await sessionRow(l.id)).not.toBeNull();
    });

    it('work inserted concurrently (uncommitted when the delete starts) is never lost', async () => {
      const l = await adminExtra(lessonA(FUT(17), '10:00', '11:00'));
      let release!: () => void;
      const gate = new Promise<void>((r) => (release = r));
      let inserted!: () => void;
      const ready = new Promise<void>((r) => (inserted = r));
      const writer = prisma.$transaction(
        async (tx) => {
          await tx.workProgram.create({
            data: { studentId: id['student:sA'], sessionId: l.id },
          });
          inserted();
          await gate;
        },
        { timeout: 20_000 },
      );
      await ready;
      const deleting = admin.del(`sessions/${l.id}`).then((r) => r);
      // The delete waits on the session row (locked by the uncommitted insert)
      await new Promise((r) => setTimeout(r, 300));
      release();
      await writer;
      const res = await deleting;
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('SESSION_HAS_WORK');
      expect(await sessionRow(l.id)).not.toBeNull();
      expect(
        await prisma.workProgram.count({ where: { sessionId: l.id } }),
      ).toBe(1);
    });

    it('attendance racing a delete: either the lesson is gone and nothing was recorded, or both remain', async () => {
      for (let i = 0; i < 4; i++) {
        const h = String(10 + i).padStart(2, '0');
        const l = await adminExtra(lessonA(FUT(18), `${h}:00`, `${h}:30`));
        const [del, rec] = await Promise.allSettled([
          admin.del(`sessions/${l.id}`).then((r) => r),
          prisma.studentAttendance.create({
            data: {
              sessionId: l.id,
              studentId: id['student:sA'],
              status: 'PRESENT',
            },
          }),
        ]);
        const row = await sessionRow(l.id);
        const records = await prisma.studentAttendance.count({
          where: { sessionId: l.id },
        });
        expect(del.status).toBe('fulfilled');
        const status = del.status === 'fulfilled' ? del.value.status : 0;
        if (row === null) {
          // Deleted first: the late insert was rejected by the foreign key
          expect(status).toBe(204);
          expect(rec.status).toBe('rejected');
          expect(records).toBe(0);
        } else {
          // Recorded first: the delete was refused (409, never a 500)
          expect(status).toBe(409);
          expect(rec.status).toBe('fulfilled');
          expect(records).toBe(1);
        }
      }
    });
  });
});
