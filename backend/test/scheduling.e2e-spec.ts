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

/** Dates relative to "today" (Africa/Tunis) so the suite never ages. */
const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const TODAY = todayIn('Africa/Tunis');
const MON = (() => {
  let d = addDays(TODAY, 21);
  while (new Date(`${d}T00:00:00Z`).getUTCDay() !== 1) d = addDays(d, 1);
  return d;
})();
const TUE = addDays(MON, 1);
const SUN = addDays(MON, 6);
const week = (d: string, n: number) => addDays(d, 7 * n);

describe('Weekly scheduling & sessions (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let admin = '';
  let teacherToken = '';
  const id: Record<string, string> = {};

  const http = () => request(app.getHttpServer());
  const as = (token: string) => ({ Authorization: `Bearer ${token}` });
  const post = (path: string, body: object) =>
    http().post(`/api/admin/${path}`).set(as(admin)).send(body);
  const patch = (path: string, body: object) =>
    http().patch(`/api/admin/${path}`).set(as(admin)).send(body);
  const get = (path: string, query: object = {}) =>
    http().get(`/api/admin/${path}`).query(query).set(as(admin));
  const slot = (
    classKey: string,
    dayOfWeek: string,
    startTime: string,
    endTime: string,
  ) =>
    post(`group-classes/${id[classKey]}/schedules`, {
      dayOfWeek,
      startTime,
      endTime,
    });

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

  async function teacher(key: string) {
    id[key] = (
      await post('teachers', {
        person: {
          firstName: key,
          lastName: tag('معلم'),
          gender: 'MALE',
          phone: '22345678',
        },
        joinedAt: '2024-09-01',
      }).expect(201)
    ).body.id;
  }

  async function groupClass(key: string, body: object) {
    id[key] = (
      await post('group-classes', {
        groupId: id.group,
        branchId: id.branch,
        ...body,
      }).expect(201)
    ).body.id;
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
    teacherToken = await login('teacher', [Role.TEACHER]);

    id.branch = (
      await post('branches', {
        name: tag('فرع'),
        address: 'دار شعبان الفهري',
      }).expect(201)
    ).body.id;
    for (const r of ['R1', 'R2', 'R3', 'R4'])
      id[r] = (
        await post('rooms', { branchId: id.branch, name: tag(r) }).expect(201)
      ).body.id;
    id.group = (
      await post('groups', { name: tag('مجموعة أ'), audience: 'أطفال' }).expect(
        201,
      )
    ).body.id;
    id.group2 = (
      await post('groups', { name: tag('مجموعة ب'), audience: 'شباب' }).expect(
        201,
      )
    ).body.id;
    for (const t of ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8'])
      await teacher(t);

    await groupClass('A', {
      roomId: id.R1,
      supervisorId: id.T1,
      assistantTeacherIds: [id.T2],
    });
    await groupClass('B', { roomId: id.R2, supervisorId: id.T3 });
    await groupClass('D', { roomId: id.R1, supervisorId: id.T4 });
    await groupClass('E', { roomId: id.R3, supervisorId: id.T1 }); // T1 supervises A too
    await groupClass('F', {
      roomId: id.R3,
      supervisorId: id.T5,
      assistantTeacherIds: [id.T2],
    }); // T2 assists A
    await groupClass('G', { roomId: id.R4, supervisorId: id.T2 }); // T2 assists A
  });

  afterAll(async () => {
    const classes = { group: { name: { endsWith: RUN } } };
    await prisma.session.deleteMany({ where: { groupClass: classes } });
    await prisma.weeklySchedule.deleteMany({ where: { groupClass: classes } });
    await prisma.groupClassAssistant.deleteMany({
      where: { groupClass: classes },
    });
    await prisma.groupClass.deleteMany({ where: classes });
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

  it('non-admins are refused (403), admins succeed', async () => {
    await http().get('/api/admin/schedules').set(as(teacherToken)).expect(403);
    await http()
      .get(`/api/admin/group-classes/${id.A}/schedules`)
      .set(as(teacherToken))
      .expect(403);
    await http()
      .post('/api/admin/sessions/generate')
      .set(as(teacherToken))
      .send({ from: MON, to: SUN })
      .expect(403);
    await http().get('/api/admin/sessions').set(as(teacherToken)).expect(403);
    await get('schedules').expect(200);
  });

  // ───────────────────────── weekly schedules ─────────────────────────

  describe('weekly schedules', () => {
    it('creates a slot and validates times', async () => {
      const res = await slot('A', 'TUE', '17:00', '19:00').expect(201);
      expect(res.body).toMatchObject({
        dayOfWeek: 'TUE',
        startTime: '17:00',
        endTime: '19:00',
        groupClass: {
          id: id.A,
          room: { id: id.R1 },
          supervisor: { id: id.T1 },
        },
      });
      expect(
        res.body.groupClass.assistants.map((a: { id: string }) => a.id),
      ).toEqual([id.T2]);
      id.slotA = res.body.id;

      expect(
        (await slot('A', 'MON', '10:00', '10:00').expect(400)).body.code,
      ).toBe('SCHEDULE_TIME_INVALID');
      expect(
        (await slot('A', 'MON', '11:00', '10:00').expect(400)).body.code,
      ).toBe('SCHEDULE_TIME_INVALID');
      await slot('A', 'MON', '9:00', '10:00').expect(400); // not HH:MM
      await slot('A', 'XYZ', '09:00', '10:00').expect(400);
      await post(`group-classes/${randomUUID()}/schedules`, {
        dayOfWeek: 'MON',
        startTime: '09:00',
        endTime: '10:00',
      }).expect(404);
    });

    it('adjacent slots are fine; overlapping slots of the same class are not', async () => {
      id.slotA2 = (
        await slot('A', 'TUE', '19:00', '20:00').expect(201)
      ).body.id;
      await slot('A', 'TUE', '16:00', '17:00')
        .expect(201)
        .then((r) => (id.slotA0 = r.body.id));
      expect(
        (await slot('A', 'TUE', '18:00', '18:30').expect(409)).body.code,
      ).toBe('CLASS_SCHEDULE_CONFLICT');
      await http()
        .delete(`/api/admin/group-classes/${id.A}/schedules/${id.slotA0}`)
        .set(as(admin))
        .expect(204);
    });

    it('different room and different teachers: allowed', async () => {
      id.slotB = (await slot('B', 'TUE', '17:00', '19:00').expect(201)).body.id;
    });

    it('same room overlapping: 409 ROOM with the occupying class described', async () => {
      const res = await slot('D', 'TUE', '18:00', '19:30').expect(409);
      expect(res.body.code).toBe('ROOM_SCHEDULE_CONFLICT');
      expect(res.body.conflicts[0]).toMatchObject({
        type: 'ROOM',
        groupClassId: id.A,
        dayOfWeek: 'TUE',
        startTime: '17:00',
        endTime: '19:00',
        roomName: tag('R1'),
        groupName: tag('مجموعة أ'),
      });
      expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|phone/);
      id.slotD = (await slot('D', 'WED', '10:00', '12:00').expect(201)).body.id;
    });

    it('teacher conflicts: supervisor, assistant, supervisor-vs-assistant', async () => {
      const supervisor = await slot('E', 'TUE', '17:30', '18:00').expect(409); // T1 supervises A
      expect(supervisor.body.code).toBe('TEACHER_SCHEDULE_CONFLICT');
      expect(
        supervisor.body.conflicts[0].teachers.map((t: { id: string }) => t.id),
      ).toEqual([id.T1]);
      const assistant = await slot('F', 'TUE', '18:00', '18:30').expect(409); // T2 assists A and F
      expect(
        assistant.body.conflicts[0].teachers.map((t: { id: string }) => t.id),
      ).toEqual([id.T2]);
      const mixed = await slot('G', 'TUE', '18:30', '19:30').expect(409); // T2 supervises G, assists A
      expect(mixed.body.code).toBe('TEACHER_SCHEDULE_CONFLICT');
      await slot('G', 'TUE', '20:00', '21:00').expect(201); // A ends at 20:00 → touching is fine
    });

    it('update excludes the slot itself; an update creating a conflict is rejected', async () => {
      const res = await patch(`group-classes/${id.A}/schedules/${id.slotA}`, {
        endTime: '18:30',
      }).expect(200);
      expect(res.body).toMatchObject({ startTime: '17:00', endTime: '18:30' });
      // A (room R1) moved onto D's Wednesday slot in R1
      const clash = await patch(
        `group-classes/${id.A}/schedules/${id.slotA2}`,
        { dayOfWeek: 'WED', startTime: '11:00', endTime: '12:00' },
      ).expect(409);
      expect(clash.body.code).toBe('ROOM_SCHEDULE_CONFLICT');
      await patch(`group-classes/${id.A}/schedules/${id.slotA2}`, {
        endTime: '18:00',
      }).expect(400); // 19:00 → 18:00 invalid
      await patch(`group-classes/${id.B}/schedules/${id.slotA2}`, {
        endTime: '21:00',
      }).expect(404); // wrong class
      await http()
        .delete(`/api/admin/group-classes/${id.A}/schedules/${id.slotA2}`)
        .set(as(admin))
        .expect(204);
    });

    it('lists slots of a class and across classes (filters)', async () => {
      expect(
        (await get(`group-classes/${id.A}/schedules`).expect(200)).body.map(
          (s: { id: string }) => s.id,
        ),
      ).toEqual([id.slotA]);
      const roomR1 = await get('schedules', { roomId: id.R1 }).expect(200);
      expect(roomR1.body.map((s: { id: string }) => s.id).sort()).toEqual(
        [id.slotA, id.slotD].sort(),
      );
      const t2 = await get('schedules', { teacherId: id.T2 }).expect(200); // assistant of A, supervisor of G
      expect(
        t2.body
          .map((s: { groupClass: { id: string } }) => s.groupClass.id)
          .sort(),
      ).toEqual([id.A, id.G].sort());
    });
  });

  // ───────────────────────── class changes ─────────────────────────

  describe('class changes cannot silently create conflicts', () => {
    // A: TUE 17:00–18:30 in R1 (T1 + T2); B: TUE 17:00–19:00 in R2 (T3)
    it('changing the room', async () => {
      const res = await patch(`group-classes/${id.B}`, {
        roomId: id.R1,
      }).expect(409);
      expect(res.body.code).toBe('ROOM_SCHEDULE_CONFLICT');
      expect(
        (await get(`group-classes/${id.B}`).expect(200)).body.room.id,
      ).toBe(id.R2); // rolled back
    });

    it('changing the supervisor or the assistants', async () => {
      expect(
        (
          await patch(`group-classes/${id.B}`, { supervisorId: id.T1 }).expect(
            409,
          )
        ).body.code,
      ).toBe('TEACHER_SCHEDULE_CONFLICT');
      expect(
        (
          await patch(`group-classes/${id.B}`, {
            assistantTeacherIds: [id.T2],
          }).expect(409)
        ).body.code,
      ).toBe('TEACHER_SCHEDULE_CONFLICT');
      const ok = await patch(`group-classes/${id.B}`, {
        assistantTeacherIds: [id.T5],
      }).expect(200);
      expect(ok.body.assistants.map((a: { id: string }) => a.id)).toEqual([
        id.T5,
      ]);
    });

    it('activating a class whose slots now collide', async () => {
      await groupClass('I', {
        roomId: id.R2,
        supervisorId: id.T6,
        status: 'INACTIVE',
      });
      await slot('I', 'TUE', '17:30', '18:00').expect(201); // not running → only its own slots are checked
      expect(
        (
          await patch(`group-classes/${id.I}/status`, {
            status: 'ACTIVE',
          }).expect(409)
        ).body.code,
      ).toBe('ROOM_SCHEDULE_CONFLICT');
      expect((await get(`group-classes/${id.I}`).expect(200)).body.status).toBe(
        'INACTIVE',
      );
    });

    it('re-activating a group whose classes now collide', async () => {
      id.K = (
        await post('group-classes', {
          groupId: id.group2,
          branchId: id.branch,
          roomId: id.R2,
          supervisorId: id.T7,
        }).expect(201)
      ).body.id;
      await slot('K', 'SUN', '09:00', '10:00').expect(201);
      await patch(`groups/${id.group2}/status`, { status: 'INACTIVE' }).expect(
        200,
      );
      await groupClass('L', { roomId: id.R2, supervisorId: id.T8 });
      await slot('L', 'SUN', '09:00', '10:00').expect(201); // K's group is not running
      expect(
        (
          await patch(`groups/${id.group2}/status`, {
            status: 'ACTIVE',
          }).expect(409)
        ).body.code,
      ).toBe('ROOM_SCHEDULE_CONFLICT');
      expect((await get(`groups/${id.group2}`).expect(200)).body.status).toBe(
        'INACTIVE',
      );
    });
  });

  // ───────────────────────── generation ─────────────────────────

  describe('session generation', () => {
    it('generates SCHEDULED sessions on the matching weekdays of running classes', async () => {
      const res = await post('sessions/generate', {
        from: MON,
        to: addDays(SUN, 7),
      }).expect(200);
      // Running slots: A TUE, B TUE, D WED, G TUE, L SUN → 5 per week × 2 weeks (I and K are not running)
      const mine = await prisma.session.findMany({
        where: { groupClass: { group: { name: { endsWith: RUN } } } },
        include: { weeklySchedule: true },
      });
      expect(mine).toHaveLength(10);
      expect(res.body.created).toBeGreaterThanOrEqual(10);
      const weekdays = new Map([
        [1, 'MON'],
        [2, 'TUE'],
        [3, 'WED'],
        [0, 'SUN'],
      ]);
      for (const s of mine) {
        expect(weekdays.get(s.date.getUTCDay())).toBe(
          s.weeklySchedule!.dayOfWeek,
        );
        expect(s.status).toBe('SCHEDULED');
        expect(s.startTime.getTime()).toBe(
          s.weeklySchedule!.startTime.getTime(),
        );
      }
      expect(
        mine
          .filter((s) => s.groupClassId === id.A)
          .map((s) => s.date.toISOString().slice(0, 10))
          .sort(),
      ).toEqual([TUE, week(TUE, 1)]);
      expect(mine.some((s) => [id.I, id.K].includes(s.groupClassId))).toBe(
        false,
      );
    });

    it('is idempotent and never recreates a cancelled session', async () => {
      const again = await post('sessions/generate', {
        from: MON,
        to: addDays(SUN, 7),
        groupClassId: id.A,
      }).expect(200);
      expect(again.body).toMatchObject({ created: 0, skippedExisting: 2 });

      const aSecond = await prisma.session.findFirstOrThrow({
        where: {
          groupClassId: id.A,
          date: new Date(`${week(TUE, 1)}T00:00:00Z`),
        },
      });
      id.aCancelled = aSecond.id;
      const cancelled = await patch(`sessions/${aSecond.id}/status`, {
        status: 'CANCELLED',
        cancellationReason: 'عطلة',
      }).expect(200);
      expect(cancelled.body).toMatchObject({
        status: 'CANCELLED',
        cancellationReason: 'عطلة',
      });

      await post('sessions/generate', {
        from: MON,
        to: addDays(SUN, 7),
      }).expect(200);
      const aSessions = await prisma.session.findMany({
        where: { groupClassId: id.A },
      });
      expect(aSessions).toHaveLength(2);
      expect(aSessions.find((s) => s.id === aSecond.id)!.status).toBe(
        'CANCELLED',
      );
    });

    it('validates the range', async () => {
      await post('sessions/generate', { from: SUN, to: MON }).expect(400);
      await post('sessions/generate', {
        from: MON,
        to: addDays(MON, 400),
      }).expect(400);
    });
  });

  // ───────────────────────── sessions ─────────────────────────

  describe('sessions', () => {
    // Generated on TUE: A 17:00–18:30 (R1: T1,T2) · B 17:00–19:00 (R2: T3,T5) · G 20:00–21:00 (R4: T2)
    it('creates a manual session (weekly schedule untouched) and validates times / class state', async () => {
      const before = await prisma.weeklySchedule.count({
        where: { groupClassId: id.A },
      });
      const res = await post('sessions', {
        groupClassId: id.A,
        date: TUE,
        startTime: '18:30',
        endTime: '19:30',
      }).expect(201);
      expect(res.body).toMatchObject({
        status: 'SCHEDULED',
        weeklyScheduleId: null,
        date: TUE,
        startTime: '18:30',
        groupClass: { id: id.A },
      });
      id.manualA = res.body.id;
      expect(
        await prisma.weeklySchedule.count({ where: { groupClassId: id.A } }),
      ).toBe(before);

      expect(
        (
          await post('sessions', {
            groupClassId: id.A,
            date: TUE,
            startTime: '19:30',
            endTime: '19:30',
          }).expect(400)
        ).body.code,
      ).toBe('SESSION_TIME_INVALID');
      expect(
        (
          await post('sessions', {
            groupClassId: id.A,
            date: TUE,
            startTime: '18:00',
            endTime: '19:00',
          }).expect(409)
        ).body.code,
      ).toBe('CLASS_SESSION_CONFLICT');
      expect(
        (
          await post('sessions', {
            groupClassId: id.I,
            date: TUE,
            startTime: '08:00',
            endTime: '09:00',
          }).expect(409)
        ).body.code,
      ).toBe('GROUP_CLASS_INACTIVE');
      await post('sessions', {
        groupClassId: id.A,
        date: '2026-02-30',
        startTime: '08:00',
        endTime: '09:00',
      }).expect(400);
    });

    it('room and teacher conflicts with other classes’ sessions', async () => {
      const room = await post('sessions', {
        groupClassId: id.D,
        date: TUE,
        startTime: '18:00',
        endTime: '19:00',
      }).expect(409);
      expect(room.body.code).toBe('ROOM_SESSION_CONFLICT');
      expect(room.body.conflicts[0]).toMatchObject({
        type: 'ROOM',
        date: TUE,
        groupClassId: id.A,
      });
      const teacher = await post('sessions', {
        groupClassId: id.E,
        date: TUE,
        startTime: '17:30',
        endTime: '18:00',
      }).expect(409);
      expect(teacher.body.code).toBe('TEACHER_SESSION_CONFLICT');
      expect(
        teacher.body.conflicts[0].teachers.map((t: { id: string }) => t.id),
      ).toEqual([id.T1]);
    });

    it('a cancelled session does not block; restoring it re-checks conflicts', async () => {
      // A's second Tuesday is cancelled → T1 is free then
      const e = await post('sessions', {
        groupClassId: id.E,
        date: week(TUE, 1),
        startTime: '17:30',
        endTime: '18:00',
      }).expect(201);
      id.sessionE = e.body.id;
      const restore = await patch(`sessions/${id.aCancelled}/status`, {
        status: 'SCHEDULED',
      }).expect(409);
      expect(restore.body.code).toBe('TEACHER_SESSION_CONFLICT');
      expect(
        (await get(`sessions/${id.aCancelled}`).expect(200)).body.status,
      ).toBe('CANCELLED');
    });

    it('update: excludes itself, rejects new conflicts, only SCHEDULED sessions are editable', async () => {
      expect(
        (
          await patch(`sessions/${id.sessionE}`, { endTime: '18:15' }).expect(
            200,
          )
        ).body.endTime,
      ).toBe('18:15');
      expect(
        (await patch(`sessions/${id.sessionE}`, { date: TUE }).expect(409)).body
          .code,
      ).toBe('TEACHER_SESSION_CONFLICT');
      expect(
        (
          await patch(`sessions/${id.aCancelled}`, {
            startTime: '08:00',
          }).expect(409)
        ).body.code,
      ).toBe('SESSION_NOT_EDITABLE');
    });

    it('completion is explicit, never in the future, and persists', async () => {
      expect(
        (
          await patch(`sessions/${id.manualA}/status`, {
            status: 'COMPLETED',
          }).expect(400)
        ).body.code,
      ).toBe('SESSION_IN_FUTURE');
      const past = addDays(TODAY, -2);
      const done = await post('sessions', {
        groupClassId: id.A,
        date: past,
        startTime: '08:00',
        endTime: '09:00',
        status: 'COMPLETED',
      }).expect(201);
      expect(done.body.status).toBe('COMPLETED');
      expect(
        (
          await patch(`sessions/${done.body.id}/status`, {
            status: 'CANCELLED',
          }).expect(409)
        ).body.code,
      ).toBe('INVALID_STATUS_TRANSITION');
      expect(
        (
          await patch(`sessions/${done.body.id}/status`, {
            status: 'SCHEDULED',
          }).expect(200)
        ).body.status,
      ).toBe('SCHEDULED');
      expect(
        (
          await patch(`sessions/${done.body.id}/status`, {
            status: 'COMPLETED',
          }).expect(200)
        ).body.status,
      ).toBe('COMPLETED');
      expect(
        (await get(`sessions/${done.body.id}`).expect(200)).body.status,
      ).toBe('COMPLETED');
      await patch(`sessions/${done.body.id}/status`, {
        status: 'COMPLETED',
        cancellationReason: 'x',
      }).expect(400);
    });

    it('generation skips occurrences already covered by a manual session or blocked by another class', async () => {
      const wk = 3; // a fresh week
      // Manual A session covering its own Tuesday slot → the occurrence is "existing"
      await post('sessions', {
        groupClassId: id.A,
        date: week(TUE, wk),
        startTime: '17:00',
        endTime: '18:30',
      }).expect(201);
      // D (room R1, like A) books R1 on A's slot the following week → A's occurrence is a ROOM conflict
      await post('sessions', {
        groupClassId: id.D,
        date: week(TUE, wk + 1),
        startTime: '17:00',
        endTime: '18:00',
      }).expect(201);
      const res = await post('sessions/generate', {
        from: week(MON, wk),
        to: week(SUN, wk + 1),
        groupClassId: id.A,
      }).expect(200);
      expect(res.body.created).toBe(0);
      expect(res.body.skippedExisting).toBe(1);
      expect(res.body.skippedConflicts).toEqual([
        expect.objectContaining({
          groupClassId: id.A,
          date: week(TUE, wk + 1),
          reason: 'ROOM',
          startTime: '17:00',
          endTime: '18:30',
        }),
      ]);
      expect(
        await prisma.session.count({
          where: {
            groupClassId: id.A,
            date: new Date(`${week(TUE, wk)}T00:00:00Z`),
          },
        }),
      ).toBe(1);
    });

    it('the database refuses overlapping non-cancelled sessions of one class', async () => {
      const a = await prisma.session.findFirstOrThrow({
        where: {
          groupClassId: id.A,
          status: 'SCHEDULED',
          weeklyScheduleId: { not: null },
        },
      });
      await expect(
        prisma.session.create({
          data: {
            groupClassId: id.A,
            date: a.date,
            startTime: new Date('1970-01-01T18:00:00Z'),
            endTime: new Date('1970-01-01T18:20:00Z'),
          },
        }),
      ).rejects.toThrow(/sessions_class_no_overlap|exclusion/);
    });

    it('calendar and list queries', async () => {
      const cal = await get('sessions/calendar', {
        from: MON,
        to: SUN,
        branchId: id.branch,
      }).expect(200);
      expect(cal.body.length).toBeGreaterThanOrEqual(5);
      expect(cal.body[0]).toEqual(
        expect.objectContaining({
          date: expect.any(String),
          startTime: expect.any(String),
          status: expect.any(String),
          groupClass: expect.objectContaining({
            group: expect.any(Object),
            branch: expect.any(Object),
            room: expect.any(Object),
            supervisor: expect.any(Object),
          }),
        }),
      );
      const dates = cal.body.map((s: { date: string }) => s.date);
      expect([...dates].sort((a, b) => a.localeCompare(b))).toEqual(dates); // chronological
      expect(dates.every((d: string) => d >= MON && d <= SUN)).toBe(true);
      await get('sessions/calendar', {
        from: MON,
        to: addDays(MON, 90),
      }).expect(400);
      await get('sessions/calendar', { from: MON }).expect(400);

      const cancelled = await get('sessions', {
        status: 'CANCELLED',
        groupClassId: id.A,
      }).expect(200);
      expect(cancelled.body.data.map((s: { id: string }) => s.id)).toEqual([
        id.aCancelled,
      ]);
      const t2 = await get('sessions', {
        teacherId: id.T2,
        from: MON,
        to: SUN,
      }).expect(200);
      expect(
        t2.body.data.every((s: { groupClass: { id: string } }) =>
          [id.A, id.F, id.G].includes(s.groupClass.id),
        ),
      ).toBe(true);
      expect(
        (await get('sessions', { pageSize: 2, groupClassId: id.A }).expect(200))
          .body.meta.pageSize,
      ).toBe(2);
    });
  });
});
