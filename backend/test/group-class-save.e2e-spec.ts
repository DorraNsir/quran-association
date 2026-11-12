import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { PasswordService } from '../src/auth/password.service.js';
import { Role } from '../src/generated/prisma/enums.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const RUN = randomUUID().slice(0, 8);
const PASSWORD = 'initial-pass-123';
const tag = (s: string) => `${s} ${RUN}`;

type Slot = {
  id?: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  roomId: string;
};

/**
 * «حفظ القسم» (PUT /admin/group-classes/:id/save): the class form's whole
 * state in one transaction — all or nothing, optimistic concurrency through
 * the class version (bumped by every write path), repeated requests safe.
 * And the group form: name + status together.
 */
describe('Atomic class save & group update (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let token = '';
  const id: Record<string, string> = {};

  const http = () => request(app.getHttpServer());
  const as = () => ({ Authorization: `Bearer ${token}` });
  const get = (path: string) => http().get(`/api/admin/${path}`).set(as());
  const post = (path: string, body: object = {}) =>
    http().post(`/api/admin/${path}`).set(as()).send(body);
  const patch = (path: string, body: object = {}) =>
    http().patch(`/api/admin/${path}`).set(as()).send(body);
  const del = (path: string) => http().delete(`/api/admin/${path}`).set(as());
  const save = (classId: string, body: object) =>
    http().put(`/api/admin/group-classes/${classId}/save`).set(as()).send(body);

  /** What the form shows of a class, read from the database. */
  async function state(classId: string) {
    const c = await prisma.groupClass.findUniqueOrThrow({
      where: { id: classId },
      select: {
        version: true,
        branchId: true,
        status: true,
        supervisorId: true,
        assistants: { select: { teacherId: true } },
        schedules: {
          select: {
            id: true,
            dayOfWeek: true,
            startTime: true,
            endTime: true,
            roomId: true,
            extraClasses: { select: { groupClassId: true } },
          },
          orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
        },
      },
    });
    const hhmm = (d: Date) => d.toISOString().slice(11, 16);
    return {
      version: c.version,
      branchId: c.branchId,
      status: c.status,
      supervisorId: c.supervisorId,
      assistantTeacherIds: c.assistants.map((a) => a.teacherId).sort(),
      slots: c.schedules.map((s) => ({
        id: s.id,
        dayOfWeek: s.dayOfWeek,
        startTime: hhmm(s.startTime),
        endTime: hhmm(s.endTime),
        roomId: s.roomId,
        extra: s.extraClasses.map((e) => e.groupClassId),
      })),
    };
  }
  /** The form's body for a class as it is now, with `changes` on top. */
  async function form(classId: string, changes: object = {}) {
    const s = await state(classId);
    return {
      version: s.version,
      branchId: s.branchId,
      status: s.status,
      supervisorId: s.supervisorId,
      assistantTeacherIds: s.assistantTeacherIds,
      slots: s.slots.map(({ extra: _extra, ...slot }) => slot) as Slot[],
      ...changes,
    };
  }
  const teacher = async (key: string) =>
    (id[key] = (
      await post('teachers', {
        person: {
          firstName: key,
          lastName: tag('معلم'),
          gender: 'MALE',
          phone: '22345678',
        },
        joinedAt: '2024-09-01',
      }).expect(201)
    ).body.id);

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
    token = (
      await http()
        .post('/api/auth/login')
        .send({ username: `e2e-${RUN}-admin`, password: PASSWORD })
        .expect(200)
    ).body.accessToken;

    id.B1 = (
      await post('branches', { name: tag('فرع المركز'), address: 'نابل' })
    ).body.id;
    id.B2 = (
      await post('branches', { name: tag('فرع الشاطئ'), address: 'قربة' })
    ).body.id;
    for (const [k, b] of [
      ['R1', 'B1'],
      ['R2', 'B1'],
      ['R3', 'B2'],
    ])
      id[k] = (
        await post('rooms', { branchId: id[b], name: tag(k) }).expect(201)
      ).body.id;
    id.G = (await post('groups', { name: tag('الماهر') }).expect(201)).body.id;
    for (const t of ['T1', 'T2', 'T3', 'T4', 'TX']) await teacher(t);
    // C: the class saved through the form; X: another class busy on Monday 09–10 in R1 (TX)
    id.C = (
      await post('group-classes', {
        groupId: id.G,
        branchId: id.B1,
        supervisorId: id.T1,
        assistantTeacherIds: [id.T2],
      }).expect(201)
    ).body.id;
    id.X = (
      await post('group-classes', {
        groupId: id.G,
        branchId: id.B1,
        supervisorId: id.TX,
        slots: [
          {
            dayOfWeek: 'MON',
            startTime: '09:00',
            endTime: '10:00',
            roomId: id.R1,
          },
        ],
      }).expect(201)
    ).body.id;
  });

  afterAll(async () => {
    const classes = { group: { name: { endsWith: RUN } } };
    await prisma.session.deleteMany({ where: { groupClass: classes } });
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
    const persons = { lastName: { endsWith: RUN } };
    await prisma.teacher.deleteMany({ where: { person: persons } });
    await prisma.user.deleteMany({ where: { person: persons } });
    await prisma.person.deleteMany({ where: persons });
    await app.close();
  });

  describe('saving the whole class', () => {
    it('applies team and new slots at once; the class version increases', async () => {
      const before = await state(id.C);
      expect(
        (await get(`group-classes/${id.C}`).expect(200)).body.version,
      ).toBe(before.version);
      const res = await save(
        id.C,
        await form(id.C, {
          assistantTeacherIds: [id.T2, id.T3],
          slots: [
            {
              dayOfWeek: 'SUN',
              startTime: '17:00',
              endTime: '18:00',
              roomId: id.R1,
            },
            {
              dayOfWeek: 'TUE',
              startTime: '17:00',
              endTime: '18:30',
              roomId: id.R2,
            },
          ],
        }),
      ).expect(200);
      const after = await state(id.C);
      expect(after.assistantTeacherIds).toEqual([id.T2, id.T3].sort());
      expect(
        after.slots.map((s) => [s.dayOfWeek, s.startTime, s.roomId]),
      ).toEqual([
        // Weekday order (MON … SUN)
        ['TUE', '17:00', id.R2],
        ['SUN', '17:00', id.R1],
      ]);
      expect(after.version).toBeGreaterThan(before.version);
      expect(res.body.version).toBe(after.version);
    });

    it('a no-op save writes nothing: same version, no notification', async () => {
      const before = await state(id.C);
      const notifications = await prisma.notification.count();
      await save(id.C, await form(id.C)).expect(200);
      expect(await state(id.C)).toEqual(before);
      expect(await prisma.notification.count()).toBe(notifications);
    });

    it('edits, moves and removes slots, and changes the status, in one request', async () => {
      const s = await state(id.C);
      const strip = ({ extra: _e, ...slot }: (typeof s.slots)[number]) => slot;
      const sun = strip(s.slots.find((x) => x.dayOfWeek === 'SUN')!);
      const tue = strip(s.slots.find((x) => x.dayOfWeek === 'TUE')!);
      await save(
        id.C,
        await form(id.C, {
          status: 'INACTIVE',
          slots: [{ ...sun, startTime: '16:00', endTime: '17:00' }],
        }),
      ).expect(200);
      let after = await state(id.C);
      expect(after.status).toBe('INACTIVE');
      expect(after.slots).toHaveLength(1);
      expect(after.slots[0]).toMatchObject({ id: sun.id, startTime: '16:00' });
      expect(after.slots.find((x) => x.id === tue.id)).toBeUndefined();
      await save(id.C, await form(id.C, { status: 'ACTIVE' })).expect(200);
      after = await state(id.C);
      expect(after.status).toBe('ACTIVE');
    });

    it('moves the class to another branch with a room of it for every slot', async () => {
      const s = await state(id.C);
      const res = await save(
        id.C,
        await form(id.C, {
          branchId: id.B2,
          slots: s.slots.map(({ extra: _e, ...x }) => ({
            ...x,
            roomId: id.R1,
          })),
        }),
      );
      // A room of the old branch: refused, nothing changed
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('ROOM_NOT_IN_BRANCH');
      expect(await state(id.C)).toEqual(s);
      await save(
        id.C,
        await form(id.C, {
          branchId: id.B2,
          slots: s.slots.map(({ extra: _e, ...x }) => ({
            ...x,
            roomId: id.R3,
          })),
        }),
      ).expect(200);
      const after = await state(id.C);
      expect(after.branchId).toBe(id.B2);
      expect(after.slots.every((x) => x.roomId === id.R3)).toBe(true);
      // Back to the first branch for the next tests
      await save(
        id.C,
        await form(id.C, {
          branchId: id.B1,
          slots: after.slots.map(({ extra: _e, ...x }) => ({
            ...x,
            roomId: id.R2,
          })),
        }),
      ).expect(200);
    });
  });

  describe('all or nothing', () => {
    it('a room conflict in a new slot undoes the removed slot and the new team', async () => {
      const before = await state(id.C);
      const res = await save(
        id.C,
        await form(id.C, {
          assistantTeacherIds: [id.T3],
          slots: [
            // X holds R1 on Monday 09–10
            {
              dayOfWeek: 'MON',
              startTime: '09:30',
              endTime: '10:30',
              roomId: id.R1,
            },
          ],
        }),
      ).expect(409);
      expect(res.body.code).toBe('ROOM_SCHEDULE_CONFLICT');
      expect(await state(id.C)).toEqual(before);
    });

    it('a teacher conflict (a new assistant busy elsewhere then) is refused, nothing changed', async () => {
      await save(
        id.C,
        await form(id.C, {
          slots: [
            ...(await form(id.C)).slots,
            {
              dayOfWeek: 'MON',
              startTime: '09:00',
              endTime: '10:00',
              roomId: id.R2,
            },
          ],
        }),
      ).expect(200);
      const before = await state(id.C);
      const res = await save(
        id.C,
        await form(id.C, { assistantTeacherIds: [id.T2, id.TX] }),
      ).expect(409);
      expect(res.body.code).toBe('TEACHER_SCHEDULE_CONFLICT');
      expect(await state(id.C)).toEqual(before);
    });

    it('an invalid supervisor is refused: inactive, or also an assistant', async () => {
      const before = await state(id.C);
      await prisma.teacher.update({
        where: { id: id.T4 },
        data: { status: 'INACTIVE' },
      });
      expect(
        (
          await save(id.C, await form(id.C, { supervisorId: id.T4 })).expect(
            409,
          )
        ).body.code,
      ).toBe('TEACHER_INACTIVE');
      expect(
        (
          await save(
            id.C,
            await form(id.C, { assistantTeacherIds: [id.T1, id.T2] }),
          ).expect(400)
        ).body.code,
      ).toBe('SUPERVISOR_IS_ASSISTANT');
      await save(
        id.C,
        await form(id.C, {
          slots: [
            {
              id: randomUUID(),
              dayOfWeek: 'SUN',
              startTime: '08:00',
              endTime: '09:00',
              roomId: id.R1,
            },
          ],
        }),
      ).expect(404);
      expect(await state(id.C)).toEqual(before);
    });
  });

  describe('concurrency and repeated requests', () => {
    it('a stale form is refused with 409 GROUP_CLASS_CHANGED, nothing written', async () => {
      const stale = await form(id.C, { assistantTeacherIds: [id.T3] });
      // Another admin changes the class meanwhile (through any path)
      await patch(`group-classes/${id.C}`, {
        assistantTeacherIds: [id.T2],
      }).expect(200);
      const before = await state(id.C);
      const res = await save(id.C, stale).expect(409);
      expect(res.body.code).toBe('GROUP_CLASS_CHANGED');
      expect(res.body.message).toContain('أعد فتحه');
      expect(await state(id.C)).toEqual(before);
    });

    it('every write path bumps the version (class, assistants, slots, shared slots)', async () => {
      const v = async () => (await state(id.C)).version;
      let last = await v();
      const bumped = async () => {
        const now = await v();
        expect(now).toBeGreaterThan(last);
        last = now;
      };
      // (the class has [T2] now: a real change)
      await patch(`group-classes/${id.C}`, {
        assistantTeacherIds: [id.T2, id.T3],
      }).expect(200);
      await bumped();
      const slot = (
        await post(`group-classes/${id.C}/schedules`, {
          dayOfWeek: 'THU',
          startTime: '17:00',
          endTime: '18:00',
          roomId: id.R1,
        }).expect(201)
      ).body.id;
      await bumped();
      await patch(`group-classes/${id.C}/schedules/${slot}`, {
        startTime: '16:30',
      }).expect(200);
      await bumped();
      await patch(`group-classes/${id.C}/status`, {
        status: 'INACTIVE',
      }).expect(200);
      await bumped();
      await patch(`group-classes/${id.C}/status`, { status: 'ACTIVE' }).expect(
        200,
      );
      await bumped();
      // A class taking part in this class's shared slot: its version moves too
      const S = (
        await post('group-classes', {
          groupId: id.G,
          branchId: id.B1,
          supervisorId: id.T1,
        }).expect(201)
      ).body.id;
      const sv = (await state(S)).version;
      await patch(`group-classes/${id.C}/schedules/${slot}`, {
        additionalGroupClassIds: [S],
      }).expect(200);
      await bumped();
      expect((await state(S)).version).toBeGreaterThan(sv);
      id.S = S;
      id.sharedSlot = slot;
      await del(`group-classes/${id.C}/schedules/${slot}`).expect(204);
      await bumped();
    });

    it('a double click / retried request with new slots creates them once', async () => {
      const body = await form(id.C, {
        slots: [
          ...(await form(id.C)).slots,
          {
            dayOfWeek: 'SAT',
            startTime: '10:00',
            endTime: '11:00',
            roomId: id.R1,
          },
        ],
      });
      const both = await Promise.all([save(id.C, body), save(id.C, body)]);
      expect(both.map((r) => r.status)).toEqual([200, 200]);
      const after = await state(id.C);
      expect(after.slots.filter((s) => s.dayOfWeek === 'SAT')).toHaveLength(1);
      // Sent again later (a network retry): still once, nothing written
      await save(id.C, body).expect(200);
      expect(await state(id.C)).toEqual(after);
    });

    it('two admins saving different changes from the same version: one wins, the other gets 409', async () => {
      const a = await form(id.C, { assistantTeacherIds: [id.T3] });
      const b = await form(id.C, { assistantTeacherIds: [id.T2, id.T3] });
      const res = await Promise.all([save(id.C, a), save(id.C, b)]);
      expect(res.map((r) => r.status).sort((x, y) => x - y)).toEqual([
        200, 409,
      ]);
      const winner = res[0].status === 200 ? a : b;
      expect((await state(id.C)).assistantTeacherIds).toEqual(
        [...winner.assistantTeacherIds].sort(),
      );
    });
  });

  describe('shared slots', () => {
    it('a hosted shared slot keeps its classes when edited; the supervisor cannot change while shared', async () => {
      const slot = (
        await post(`group-classes/${id.C}/schedules`, {
          dayOfWeek: 'WED',
          startTime: '17:00',
          endTime: '18:00',
          roomId: id.R1,
          additionalGroupClassIds: [id.S],
        }).expect(201)
      ).body.id;
      const body = await form(id.C);
      await save(id.C, {
        ...body,
        slots: body.slots.map((s) =>
          s.id === slot ? { ...s, startTime: '18:00', endTime: '19:00' } : s,
        ),
      }).expect(200);
      const shared = (await state(id.C)).slots.find((s) => s.id === slot)!;
      expect(shared).toMatchObject({ startTime: '18:00', extra: [id.S] });
      const before = await state(id.C);
      const res = await save(
        id.C,
        await form(id.C, { supervisorId: id.T3, assistantTeacherIds: [] }),
      ).expect(409);
      expect(res.body.code).toBe('SHARED_SUPERVISOR_CHANGE_BLOCKED');
      expect(await state(id.C)).toEqual(before);
    });
  });

  describe('creating a class with its slots', () => {
    it('creates class and slots together; a conflicting slot creates nothing', async () => {
      const ok = await post('group-classes', {
        groupId: id.G,
        branchId: id.B1,
        supervisorId: id.T3,
        slots: [
          {
            dayOfWeek: 'FRI',
            startTime: '17:00',
            endTime: '18:00',
            roomId: id.R2,
          },
        ],
      }).expect(201);
      expect((await state(ok.body.id)).slots).toHaveLength(1);
      const count = await prisma.groupClass.count({ where: { groupId: id.G } });
      const res = await post('group-classes', {
        groupId: id.G,
        branchId: id.B1,
        supervisorId: id.T3,
        slots: [
          {
            dayOfWeek: 'MON',
            startTime: '09:00',
            endTime: '10:00',
            roomId: id.R1,
          },
        ],
      }).expect(409);
      expect(res.body.code).toBe('ROOM_SCHEDULE_CONFLICT');
      expect(await prisma.groupClass.count({ where: { groupId: id.G } })).toBe(
        count,
      );
    });
  });

  describe('group form: name and status together', () => {
    it('renames and deactivates in one request', async () => {
      const g = (await post('groups', { name: tag('النور') }).expect(201)).body
        .id;
      const res = await patch(`groups/${g}`, {
        name: tag('النور الجديد'),
        status: 'INACTIVE',
      }).expect(200);
      expect(res.body).toMatchObject({
        name: tag('النور الجديد'),
        status: 'INACTIVE',
      });
      id.G2 = g;
    });

    it('a refused re-activation keeps the old name too', async () => {
      // An active class of the inactive group, its slot on X's Monday 09–10 room
      const cls = (
        await post('group-classes', {
          groupId: id.G2,
          branchId: id.B1,
          supervisorId: id.T2,
          status: 'INACTIVE',
        }).expect(201)
      ).body.id;
      await post(`group-classes/${cls}/schedules`, {
        dayOfWeek: 'MON',
        startTime: '09:00',
        endTime: '10:00',
        roomId: id.R1,
      }).expect(201);
      await prisma.groupClass.update({
        where: { id: cls },
        data: { status: 'ACTIVE' },
      });
      const res = await patch(`groups/${id.G2}`, {
        name: tag('اسم لن يُحفظ'),
        status: 'ACTIVE',
      }).expect(409);
      expect(res.body.code).toBe('ROOM_SCHEDULE_CONFLICT');
      expect(
        await prisma.group.findUniqueOrThrow({
          where: { id: id.G2 },
          select: { name: true, status: true },
        }),
      ).toEqual({ name: tag('النور الجديد'), status: 'INACTIVE' });
    });

    it('a rename alone, and the separate status endpoint, still work', async () => {
      await patch(`groups/${id.G2}`, { name: tag('النور 2') }).expect(200);
      await patch(`groups/${id.G2}/status`, { status: 'ARCHIVED' }).expect(200);
      expect(
        await prisma.group.findUniqueOrThrow({
          where: { id: id.G2 },
          select: { name: true, status: true },
        }),
      ).toEqual({ name: tag('النور 2'), status: 'ARCHIVED' });
    });
  });
});
