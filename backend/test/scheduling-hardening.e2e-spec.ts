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
import { SessionsService } from '../src/scheduling/sessions.service.js';

const RUN = randomUUID().slice(0, 8);
const PASSWORD = 'initial-pass-123';
const tag = (s: string) => `${s} ${RUN}`;
const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const TODAY = todayIn('Africa/Tunis');
/** First date ≥ from on the given UTC weekday (0 = Sunday). */
const nextWeekday = (from: string, weekday: number) => {
  let d = from;
  while (new Date(`${d}T00:00:00Z`).getUTCDay() !== weekday) d = addDays(d, 1);
  return d;
};
const MON1 = nextWeekday(addDays(TODAY, 14), 1); // upcoming Mondays
const MON2 = addDays(MON1, 7);
const PAST = addDays(TODAY, -7);

/**
 * Part 10.5 hardening: session snapshots (history), completion rules,
 * inactive teachers/classes, slot delete-recreate, scheduling lock.
 */
describe('Scheduling hardening (e2e)', () => {
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
  const teamOf = (s: { teachers: { id: string; role: string }[] }) =>
    s.teachers
      .map((t) => `${t.role}:${t.id}`)
      .sort((a, b) => a.localeCompare(b));
  const sessionsOf = (classKey: string) =>
    prisma.session.findMany({
      where: { groupClassId: id[classKey] },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    });

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
        firstName: 'حساب',
        lastName: tag('admin'),
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
    id.adminUser = (
      await prisma.user.findUniqueOrThrow({
        where: { username: `e2e-${RUN}-admin` },
      })
    ).id;

    id.branch = (
      await post('branches', { name: tag('فرع'), address: 'نابل' }).expect(201)
    ).body.id;
    for (const r of ['R1', 'R2', 'R3', 'R4'])
      id[r] = (
        await post('rooms', { branchId: id.branch, name: tag(r) }).expect(201)
      ).body.id;
    id.group = (
      await post('groups', { name: tag('مجموعة'), audience: 'أطفال' }).expect(
        201,
      )
    ).body.id;
    for (const t of ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']) {
      id[t] = (
        await post('teachers', {
          person: {
            firstName: t,
            lastName: tag('معلم'),
            gender: 'MALE',
            phone: '22345678',
          },
          joinedAt: '2024-09-01',
        }).expect(201)
      ).body.id;
    }
    const cls = async (key: string, body: object) =>
      (id[key] = (
        await post('group-classes', {
          groupId: id.group,
          branchId: id.branch,
          ...body,
        }).expect(201)
      ).body.id);
    await cls('C', {
      roomId: id.R1,
      supervisorId: id.T1,
      assistantTeacherIds: [id.T2],
    });
    await cls('D', { roomId: id.R1, supervisorId: id.T4 });
    await cls('E', { roomId: id.R3, supervisorId: id.T2 });
    await cls('F', { roomId: id.R3, supervisorId: id.T5 });
    await cls('X', { roomId: id.R4, supervisorId: id.T6 });
    await cls('Y', { roomId: id.R4, supervisorId: id.T7 });
  });

  afterAll(async () => {
    const classes = { group: { name: { endsWith: RUN } } };
    await prisma.session.deleteMany({ where: { groupClass: classes } }); // session_teachers cascade
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

  // ───────────────────────── 1. historical integrity ─────────────────────────

  describe('session snapshots (where / who really applied)', () => {
    it('sessions snapshot the class room and team at planning time', async () => {
      await post(`group-classes/${id.C}/schedules`, {
        dayOfWeek: 'MON',
        startTime: '10:00',
        endTime: '11:00',
      }).expect(201);
      await post('sessions/generate', {
        from: MON1,
        to: addDays(MON2, 6),
        groupClassId: id.C,
      }).expect(200);
      id.pastC = (
        await post('sessions', {
          groupClassId: id.C,
          date: PAST,
          startTime: '10:00',
          endTime: '11:00',
        }).expect(201)
      ).body.id;
      const [upcoming1] = (await sessionsOf('C')).filter(
        (s) => s.weeklyScheduleId,
      );
      id.cancelledC = upcoming1.id;
      await patch(`sessions/${upcoming1.id}/status`, {
        status: 'CANCELLED',
      }).expect(200);

      const s = (await get(`sessions/${id.pastC}`).expect(200)).body;
      expect(s.room.id).toBe(id.R1);
      expect(teamOf(s)).toEqual(
        [`ASSISTANT:${id.T2}`, `SUPERVISOR:${id.T1}`].sort((a, b) =>
          a.localeCompare(b),
        ),
      );
    });

    it('moving / re-staffing the class updates ONLY upcoming SCHEDULED sessions', async () => {
      await patch(`group-classes/${id.C}`, {
        roomId: id.R2,
        assistantTeacherIds: [id.T3],
      }).expect(200);

      const past = (await get(`sessions/${id.pastC}`).expect(200)).body;
      expect(past.room.id).toBe(id.R1); // history untouched
      expect(teamOf(past)).toContain(`ASSISTANT:${id.T2}`);
      const cancelled = (await get(`sessions/${id.cancelledC}`).expect(200))
        .body;
      expect(cancelled.room.id).toBe(id.R1); // cancelled kept as it was

      const upcoming = (
        await get('sessions', {
          groupClassId: id.C,
          status: 'SCHEDULED',
          from: TODAY,
        }).expect(200)
      ).body.data;
      expect(upcoming.length).toBe(1);
      expect(upcoming[0].room.id).toBe(id.R2);
      expect(teamOf(upcoming[0])).toEqual(
        [`ASSISTANT:${id.T3}`, `SUPERVISOR:${id.T1}`].sort((a, b) =>
          a.localeCompare(b),
        ),
      );
    });

    it('conflicts use the snapshot: the past session still held R1 and T2, the upcoming one R2 and T3', async () => {
      // R1 at the PAST lesson time is taken (by C's real past session)…
      expect(
        (
          await post('sessions', {
            groupClassId: id.D,
            date: PAST,
            startTime: '10:30',
            endTime: '11:30',
          }).expect(409)
        ).body.code,
      ).toBe('ROOM_SESSION_CONFLICT');
      // …but free at the upcoming one (C moved to R2)
      await post('sessions', {
        groupClassId: id.D,
        date: MON2,
        startTime: '10:30',
        endTime: '11:30',
      }).expect(201);
      // T2 left C’s team: it is free again at C’s upcoming time
      await post('sessions', {
        groupClassId: id.E,
        date: MON2,
        startTime: '10:00',
        endTime: '10:30',
      }).expect(201);
    });

    it('restoring a cancelled upcoming session takes the class’s current room/team and re-checks it', async () => {
      const restored = await patch(`sessions/${id.cancelledC}/status`, {
        status: 'SCHEDULED',
      }).expect(200);
      expect(restored.body.room.id).toBe(id.R2);
      expect(teamOf(restored.body)).toContain(`ASSISTANT:${id.T3}`);
    });
  });

  // ───────────────────────── 2. completion ─────────────────────────

  describe('completion rules', () => {
    it('normal path: completeFromAttendance (Part 10.6 hook) records ATTENDANCE', async () => {
      const sessions = app.get(SessionsService);
      await prisma.$transaction((tx) =>
        sessions.completeFromAttendance(tx, id.pastC, id.adminUser),
      );
      const done = (await get(`sessions/${id.pastC}`).expect(200)).body;
      expect(done).toMatchObject({
        status: 'COMPLETED',
        completion: { source: 'ATTENDANCE', completedBy: `e2e-${RUN}-admin` },
      });

      const upcoming = (await sessionsOf('C')).find(
        (s) => s.status === 'SCHEDULED',
      )!;
      await expect(
        prisma.$transaction((tx) =>
          sessions.completeFromAttendance(tx, upcoming.id, id.adminUser),
        ),
      ).rejects.toMatchObject({
        response: { code: 'SESSION_IN_FUTURE' },
      });
    });

    it('admin override is explicit; the database keeps completion data consistent', async () => {
      const s = (
        await post('sessions', {
          groupClassId: id.F,
          date: PAST,
          startTime: '14:00',
          endTime: '15:00',
        }).expect(201)
      ).body;
      expect(
        (
          await patch(`sessions/${s.id}/status`, {
            status: 'COMPLETED',
          }).expect(400)
        ).body.code,
      ).toBe('COMPLETION_REQUIRES_ATTENDANCE');
      const done = await patch(`sessions/${s.id}/status`, {
        status: 'COMPLETED',
        adminOverride: true,
      }).expect(200);
      expect(done.body.completion.source).toBe('ADMIN_OVERRIDE');
      await expect(
        prisma.session.update({
          where: { id: s.id },
          data: { completedAt: null },
        }),
      ).rejects.toThrow(/sessions_completion_check/);
      await expect(
        prisma.session.update({
          where: { id: s.id },
          data: { status: 'SCHEDULED' },
        }),
      ).rejects.toThrow(/sessions_completion_check/);
    });
  });

  // ───────────────────────── 3. inactive teachers ─────────────────────────

  describe('inactive teachers', () => {
    it('an inactive assistant: upcoming sessions flagged, left out of new snapshots', async () => {
      await patch(`teachers/${id.T3}/status`, { status: 'INACTIVE' }).expect(
        200,
      );
      const flagged = (
        await get('sessions', {
          groupClassId: id.C,
          needsAttention: true,
        }).expect(200)
      ).body.data;
      expect(flagged.length).toBeGreaterThan(0);
      expect(
        flagged.every(
          (s: { attention: string[]; status: string }) =>
            s.status === 'SCHEDULED' &&
            s.attention.includes('ASSISTANT_INACTIVE'),
        ),
      ).toBe(true);
      // Past/completed sessions are history, never flagged
      expect(
        (await get(`sessions/${id.pastC}`).expect(200)).body.attention,
      ).toEqual([]);

      const manual = await post('sessions', {
        groupClassId: id.C,
        date: addDays(MON2, 1),
        startTime: '10:00',
        endTime: '11:00',
      }).expect(201);
      expect(teamOf(manual.body)).toEqual([`SUPERVISOR:${id.T1}`]);
      await patch(`teachers/${id.T3}/status`, { status: 'ACTIVE' }).expect(200);
    });

    it('an inactive supervisor: no new slots/sessions, generation skips the class, existing sessions flagged (not cancelled)', async () => {
      await patch(`teachers/${id.T1}/status`, { status: 'INACTIVE' }).expect(
        200,
      );
      expect(
        (
          await post(`group-classes/${id.C}/schedules`, {
            dayOfWeek: 'FRI',
            startTime: '10:00',
            endTime: '11:00',
          }).expect(409)
        ).body.code,
      ).toBe('SUPERVISOR_INACTIVE');
      expect(
        (
          await post('sessions', {
            groupClassId: id.C,
            date: addDays(MON2, 2),
            startTime: '10:00',
            endTime: '11:00',
          }).expect(409)
        ).body.code,
      ).toBe('SUPERVISOR_INACTIVE');
      const gen = await post('sessions/generate', {
        from: addDays(MON2, 7),
        to: addDays(MON2, 13),
        groupClassId: id.C,
      }).expect(200);
      expect(gen.body).toMatchObject({
        created: 0,
        skippedInactiveSupervisorClassIds: [id.C],
      });

      const upcoming = (
        await get('sessions', {
          groupClassId: id.C,
          status: 'SCHEDULED',
          from: TODAY,
        }).expect(200)
      ).body.data;
      expect(upcoming.length).toBeGreaterThan(0);
      expect(
        upcoming.every((s: { attention: string[] }) =>
          s.attention.includes('SUPERVISOR_INACTIVE'),
        ),
      ).toBe(true);
      await patch(`teachers/${id.T1}/status`, { status: 'ACTIVE' }).expect(200);
    });
  });

  // ───────────────────────── 4. inactive classes ─────────────────────────

  describe('inactive classes', () => {
    it('keeps upcoming sessions, flags them CLASS_INACTIVE, and generation skips the class', async () => {
      const before = (await sessionsOf('C')).length;
      await patch(`group-classes/${id.C}/status`, {
        status: 'INACTIVE',
      }).expect(200);
      const after = await sessionsOf('C');
      expect(after).toHaveLength(before); // nothing deleted
      expect(after.filter((s) => s.status === 'CANCELLED').length).toBe(0); // nothing auto-cancelled
      const flagged = (
        await get('sessions', {
          needsAttention: true,
          groupClassId: id.C,
        }).expect(200)
      ).body.data;
      expect(
        flagged.every((s: { attention: string[] }) =>
          s.attention.includes('CLASS_INACTIVE'),
        ),
      ).toBe(true);
      expect(
        (
          await post('sessions/generate', {
            from: addDays(MON2, 7),
            to: addDays(MON2, 13),
            groupClassId: id.C,
          }).expect(200)
        ).body.created,
      ).toBe(0);
      await patch(`group-classes/${id.C}/status`, { status: 'ACTIVE' }).expect(
        200,
      );
      expect(
        (
          await get('sessions', {
            needsAttention: true,
            groupClassId: id.C,
          }).expect(200)
        ).body.data,
      ).toEqual([]);
    });
  });

  // ───────────────────────── 5. weekly slot edits ─────────────────────────

  describe('weekly slot delete & recreate', () => {
    it('never duplicates sessions (scheduled or cancelled)', async () => {
      const slot = (
        await post(`group-classes/${id.F}/schedules`, {
          dayOfWeek: 'WED',
          startTime: '09:00',
          endTime: '10:00',
        }).expect(201)
      ).body.id;
      await post('sessions/generate', {
        from: MON1,
        to: addDays(MON2, 6),
        groupClassId: id.F,
      }).expect(200);
      const first = (await sessionsOf('F')).filter(
        (s) => s.startTime.toISOString().slice(11, 16) === '09:00',
      );
      expect(first).toHaveLength(2);
      await patch(`sessions/${first[0].id}/status`, {
        status: 'CANCELLED',
      }).expect(200);

      await http()
        .delete(`/api/admin/group-classes/${id.F}/schedules/${slot}`)
        .set(as(admin))
        .expect(204);
      expect(
        (await prisma.session.findUniqueOrThrow({ where: { id: first[0].id } }))
          .weeklyScheduleId,
      ).toBeNull(); // kept, unlinked
      await post(`group-classes/${id.F}/schedules`, {
        dayOfWeek: 'WED',
        startTime: '09:00',
        endTime: '10:00',
      }).expect(201);
      const regen = await post('sessions/generate', {
        from: MON1,
        to: addDays(MON2, 6),
        groupClassId: id.F,
      }).expect(200);
      expect(regen.body).toMatchObject({ created: 0, skippedExisting: 2 });
      const after = (await sessionsOf('F')).filter(
        (s) => s.startTime.toISOString().slice(11, 16) === '09:00',
      );
      expect(after.map((s) => s.id).sort()).toEqual(
        first.map((s) => s.id).sort(),
      );
      expect(after.find((s) => s.id === first[0].id)!.status).toBe('CANCELLED');
    });

    it('editing a slot does not modify sessions already generated from it', async () => {
      const slot = await prisma.weeklySchedule.findFirstOrThrow({
        where: { groupClassId: id.F },
      });
      const before = (await sessionsOf('F')).map((s) => [
        s.id,
        s.startTime.getTime(),
      ]);
      await patch(`group-classes/${id.F}/schedules/${slot.id}`, {
        startTime: '09:30',
        endTime: '10:30',
      }).expect(200);
      expect(
        (await sessionsOf('F')).map((s) => [s.id, s.startTime.getTime()]),
      ).toEqual(before);
    });
  });

  // ───────────────────────── 6. concurrency ─────────────────────────

  describe('scheduling lock', () => {
    it('two simultaneous slots for the same room: exactly one wins', async () => {
      const results = await Promise.all([
        post(`group-classes/${id.X}/schedules`, {
          dayOfWeek: 'SUN',
          startTime: '08:00',
          endTime: '09:00',
        }),
        post(`group-classes/${id.Y}/schedules`, {
          dayOfWeek: 'SUN',
          startTime: '08:30',
          endTime: '09:30',
        }),
      ]);
      expect(results.map((r) => r.status).sort((a, b) => a - b)).toEqual([201, 409]);
    });

    it('two simultaneous sessions for the same room: exactly one wins', async () => {
      const date = addDays(MON2, 3);
      const results = await Promise.all([
        post('sessions', {
          groupClassId: id.X,
          date,
          startTime: '15:00',
          endTime: '16:00',
        }),
        post('sessions', {
          groupClassId: id.Y,
          date,
          startTime: '15:30',
          endTime: '16:30',
        }),
      ]);
      expect(results.map((r) => r.status).sort((a, b) => a - b)).toEqual([201, 409]);
    });

    it('a class move racing a session creation never leaves a double-booked room', async () => {
      const date = addDays(MON2, 4);
      await post('sessions', {
        groupClassId: id.X,
        date,
        startTime: '11:00',
        endTime: '12:00',
      }).expect(201); // X in R4
      await post('sessions', {
        groupClassId: id.F,
        date,
        startTime: '11:00',
        endTime: '12:00',
      }).expect(201); // F in R3
      await Promise.all([
        patch(`group-classes/${id.F}`, { roomId: id.R4 }), // would put F's session into R4
        post('sessions', {
          groupClassId: id.Y,
          date,
          startTime: '11:30',
          endTime: '12:30',
        }), // Y in R4
      ]);
      const clashes = await prisma.$queryRaw<{ n: bigint }[]>`
        SELECT count(*) AS n FROM sessions a JOIN sessions b
          ON a.id < b.id AND a.date = b.date AND a."roomId" = b."roomId"
         AND a."startTime" < b."endTime" AND a."endTime" > b."startTime"
        WHERE a.status <> 'CANCELLED' AND b.status <> 'CANCELLED'
          AND a."groupClassId" IN (${id.X}::uuid, ${id.Y}::uuid, ${id.F}::uuid)`;
      expect(Number(clashes[0].n)).toBe(0);
    });
  });
});
