import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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
/** Next Monday at least 14 days ahead (a clean week for generation). */
const MON = (() => {
  let d = addDays(TODAY, 14);
  while (weekdayOf(d) !== 'MON') d = addDays(d, 1);
  return d;
})();

/**
 * Room per weekly slot: each slot of a class has its own room (of the
 * class's branch); generated sessions take their slot's room; moving a slot
 * moves only its upcoming scheduled sessions; history and attendance stay.
 */
describe('Room per weekly slot (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let admin = '';
  const id: Record<string, string> = {};

  const http = () => request(app.getHttpServer());
  const as = () => ({ Authorization: `Bearer ${admin}` });
  const post = (path: string, body: object) =>
    http().post(`/api/admin/${path}`).set(as()).send(body);
  const patch = (path: string, body: object) =>
    http().patch(`/api/admin/${path}`).set(as()).send(body);
  const put = (path: string, body: object) =>
    http().put(`/api/admin/${path}`).set(as()).send(body);
  const get = (path: string, query: object = {}) =>
    http().get(`/api/admin/${path}`).query(query).set(as());
  const slot = (
    cls: string,
    dayOfWeek: string,
    startTime: string,
    endTime: string,
    room: string,
  ) =>
    post(`group-classes/${id[cls]}/schedules`, {
      dayOfWeek,
      startTime,
      endTime,
      roomId: id[room],
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
      await post('branches', {
        name: tag('فرع الروضة'),
        address: 'نابل',
      }).expect(201)
    ).body.id;
    id.branch2 = (
      await post('branches', { name: tag('فرع آخر'), address: 'نابل' }).expect(
        201,
      )
    ).body.id;
    for (const r of ['R1', 'R2', 'R3'])
      id[r] = (
        await post('rooms', {
          branchId: id.branch,
          name: tag(`القاعة ${r}`),
        }).expect(201)
      ).body.id;
    id.OTHER = (
      await post('rooms', {
        branchId: id.branch2,
        name: tag('القاعة X'),
      }).expect(201)
    ).body.id;
    id.group = (
      await post('groups', {
        name: tag('مجموعة الماهر'),
        audience: 'أطفال',
      }).expect(201)
    ).body.id;
    for (const t of ['T1', 'T2'])
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
    for (const [cls, teacher] of [
      ['A', 'T1'],
      ['B', 'T2'],
    ])
      id[cls] = (
        await post('group-classes', {
          groupId: id.group,
          branchId: id.branch,
          supervisorId: id[teacher],
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

  it('one class, three weekly slots, three different rooms', async () => {
    id.slotMon = (
      await slot('A', 'MON', '09:00', '11:00', 'R1').expect(201)
    ).body.id;
    id.slotTue = (
      await slot('A', 'TUE', '09:00', '11:00', 'R3').expect(201)
    ).body.id;
    id.slotFri = (
      await slot('A', 'FRI', '14:00', '16:00', 'R2').expect(201)
    ).body.id;
    const slots = (await get(`group-classes/${id.A}/schedules`).expect(200))
      .body;
    expect(
      slots.map((s: { dayOfWeek: string; room: { id: string } }) => [
        s.dayOfWeek,
        s.room.id,
      ]),
    ).toEqual([
      ['MON', id.R1],
      ['TUE', id.R3],
      ['FRI', id.R2],
    ]);
    const cls = (await get(`group-classes/${id.A}`).expect(200)).body;
    expect(cls.rooms.map((r: { id: string }) => r.id)).toEqual([
      id.R1,
      id.R3,
      id.R2,
    ]);
  });

  it('same room at the same time is refused; another room at the same time is allowed', async () => {
    const clash = await slot('B', 'MON', '10:00', '12:00', 'R1').expect(409);
    expect(clash.body.code).toBe('ROOM_SCHEDULE_CONFLICT');
    expect(clash.body.conflicts[0]).toMatchObject({
      type: 'ROOM',
      groupClassId: id.A,
    });
    id.slotB = (
      await slot('B', 'MON', '10:00', '12:00', 'R2').expect(201)
    ).body.id;
    // …and A's Monday slot cannot move into B's room at that time
    expect(
      (
        await patch(`group-classes/${id.A}/schedules/${id.slotMon}`, {
          roomId: id.R2,
        }).expect(409)
      ).body.code,
    ).toBe('ROOM_SCHEDULE_CONFLICT');
  });

  it('a room of another branch is refused (create, update, ad-hoc session)', async () => {
    expect(
      (await slot('A', 'WED', '09:00', '10:00', 'OTHER').expect(400)).body.code,
    ).toBe('ROOM_NOT_IN_BRANCH');
    expect(
      (
        await patch(`group-classes/${id.A}/schedules/${id.slotTue}`, {
          roomId: id.OTHER,
        }).expect(400)
      ).body.code,
    ).toBe('ROOM_NOT_IN_BRANCH');
    expect(
      (
        await post('sessions', {
          groupClassId: id.A,
          roomId: id.OTHER,
          date: addDays(MON, 2),
          startTime: '17:00',
          endTime: '18:00',
        }).expect(400)
      ).body.code,
    ).toBe('ROOM_NOT_IN_BRANCH');
  });

  it('generated sessions take the room of THEIR weekly slot', async () => {
    const res = await post('sessions/generate', {
      from: MON,
      to: addDays(MON, 6),
      groupClassId: id.A,
    }).expect(200);
    expect(res.body.created).toBe(3);
    const sessions = (
      await get('sessions/calendar', {
        from: MON,
        to: addDays(MON, 6),
        groupClassId: id.A,
      }).expect(200)
    ).body as {
      weeklyScheduleId: string;
      room: { id: string };
      date: string;
      id: string;
    }[];
    const roomOf = (slotId: string) =>
      sessions.find((s) => s.weeklyScheduleId === slotId)!.room.id;
    expect(roomOf(id.slotMon)).toBe(id.R1);
    expect(roomOf(id.slotTue)).toBe(id.R3);
    expect(roomOf(id.slotFri)).toBe(id.R2);
  });

  it('changing ONE slot room moves only its upcoming scheduled sessions; history and attendance stay', async () => {
    // A past lesson of the Tuesday slot with recorded attendance (history)
    id.student = (
      await post('students', {
        person: {
          firstName: 'يوسف',
          lastName: tag('طالب'),
          gender: 'MALE',
          dateOfBirth: '2015-01-01',
          address: 'نابل',
        },
        groupClassId: id.A,
        registrationDate: addDays(TODAY, -30),
        guardianPhone: '98765432',
      }).expect(201)
    ).body.id;
    let past = addDays(TODAY, -7);
    while (weekdayOf(past) !== 'TUE') past = addDays(past, -1);
    const upcomingTue = await prisma.session.findFirstOrThrow({
      where: { weeklyScheduleId: id.slotTue },
      select: { id: true },
    });
    const history = await post('sessions', {
      groupClassId: id.A,
      roomId: id.R3,
      date: past,
      startTime: '09:00',
      endTime: '11:00',
    }).expect(201);
    await put(`sessions/${history.body.id}/attendance`, {
      records: [{ studentId: id.student, status: 'PRESENT' }],
    }).expect(200);
    expect(
      (await get(`sessions/${history.body.id}`).expect(200)).body.status,
    ).toBe('COMPLETED');

    const moved = await patch(`group-classes/${id.A}/schedules/${id.slotTue}`, {
      roomId: id.R1,
    }).expect(200);
    expect(moved.body.room.id).toBe(id.R1);
    // Other slots unchanged
    const slots = (await get(`group-classes/${id.A}/schedules`).expect(200))
      .body;
    expect(
      Object.fromEntries(
        slots.map((s: { id: string; room: { id: string } }) => [
          s.id,
          s.room.id,
        ]),
      ),
    ).toEqual({
      [id.slotMon]: id.R1,
      [id.slotTue]: id.R1,
      [id.slotFri]: id.R2,
    });
    // The upcoming generated lesson of that slot moved; the completed one did not
    expect(
      (await get(`sessions/${upcomingTue.id}`).expect(200)).body.room.id,
    ).toBe(id.R1);
    const kept = (await get(`sessions/${history.body.id}`).expect(200)).body;
    expect(kept).toMatchObject({ status: 'COMPLETED', room: { id: id.R3 } });
    const attendance = (
      await get(`students/${id.student}/attendance`).expect(200)
    ).body;
    expect(attendance.data).toEqual([
      expect.objectContaining({
        sessionId: history.body.id,
        status: 'PRESENT',
      }),
    ]);
  });

  it('one lesson can move to another free room of the branch (its slot is unchanged)', async () => {
    const fri = await prisma.session.findFirstOrThrow({
      where: { weeklyScheduleId: id.slotFri },
      select: { id: true },
    });
    const res = await patch(`sessions/${fri.id}`, { roomId: id.R3 }).expect(
      200,
    );
    expect(res.body.room.id).toBe(id.R3);
    const slots = (await get(`group-classes/${id.A}/schedules`).expect(200))
      .body;
    expect(slots.find((s: { id: string }) => s.id === id.slotFri).room.id).toBe(
      id.R2,
    );
  });

  it('branch change: every slot needs a room of the new branch, in one request', async () => {
    const slotsOfB = (await get(`group-classes/${id.B}/schedules`).expect(200))
      .body;
    expect(
      (
        await patch(`group-classes/${id.B}`, { branchId: id.branch2 }).expect(
          400,
        )
      ).body.code,
    ).toBe('SCHEDULE_ROOMS_REQUIRED');
    const moved = await patch(`group-classes/${id.B}`, {
      branchId: id.branch2,
      scheduleRooms: slotsOfB.map((s: { id: string }) => ({
        scheduleId: s.id,
        roomId: id.OTHER,
      })),
    }).expect(200);
    expect(moved.body).toMatchObject({
      branch: { id: id.branch2 },
      rooms: [{ id: id.OTHER }],
    });
  });

  it('migration: every existing slot inherits its class room, then the class room is dropped', async () => {
    const schema = `mig_${RUN.replace(/-/g, '')}`;
    const sql = readFileSync(
      join(
        process.cwd(),
        'prisma/migrations/20261010090000_room_per_weekly_schedule/migration.sql',
      ),
      'utf8',
    );
    await prisma.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    try {
      // The pre-migration shape (only what the migration touches), in a scratch schema
      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}"`);
        for (const statement of [
          `CREATE TABLE rooms (id UUID PRIMARY KEY, "branchId" UUID NOT NULL, UNIQUE (id, "branchId"))`,
          `CREATE TABLE group_classes (id UUID PRIMARY KEY, "branchId" UUID NOT NULL, "roomId" UUID NOT NULL,
             CONSTRAINT "group_classes_roomId_branchId_fkey" FOREIGN KEY ("roomId", "branchId") REFERENCES rooms(id, "branchId"))`,
          `CREATE INDEX "group_classes_roomId_idx" ON group_classes("roomId")`,
          `CREATE TABLE weekly_schedules (id UUID PRIMARY KEY, "groupClassId" UUID NOT NULL REFERENCES group_classes(id), "dayOfWeek" TEXT NOT NULL)`,
          `INSERT INTO rooms VALUES ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1'),
                                   ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000b1')`,
          `INSERT INTO group_classes VALUES
             ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1'),
             ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a2'),
             ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a2')`,
          `INSERT INTO weekly_schedules VALUES
             ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c1', 'MON'),
             ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000c1', 'TUE'),
             ('00000000-0000-0000-0000-0000000000d3', '00000000-0000-0000-0000-0000000000c2', 'MON')`,
        ])
          await tx.$executeRawUnsafe(statement);
        await tx.$executeRawUnsafe(sql);
      });
      const slots = await prisma.$queryRawUnsafe<
        { id: string; roomId: string }[]
      >(
        `SELECT id::text, "roomId"::text FROM "${schema}".weekly_schedules ORDER BY id`,
      );
      expect(slots).toEqual([
        {
          id: '00000000-0000-0000-0000-0000000000d1',
          roomId: '00000000-0000-0000-0000-0000000000a1',
        },
        {
          id: '00000000-0000-0000-0000-0000000000d2',
          roomId: '00000000-0000-0000-0000-0000000000a1',
        },
        {
          id: '00000000-0000-0000-0000-0000000000d3',
          roomId: '00000000-0000-0000-0000-0000000000a2',
        },
      ]);
      const classes = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
        `SELECT count(*) AS n FROM "${schema}".group_classes`,
      );
      expect(Number(classes[0].n)).toBe(3); // classes kept (even the one without slots)
      const column = await prisma.$queryRawUnsafe<unknown[]>(
        `SELECT 1 FROM information_schema.columns WHERE table_schema = '${schema}' AND table_name = 'group_classes' AND column_name = 'roomId'`,
      );
      expect(column).toEqual([]);
    } finally {
      await prisma.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    }
  });
});
