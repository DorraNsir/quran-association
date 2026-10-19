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
const tag = (s: string) => `${s} ${RUN}`;
const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const TODAY = todayIn('Africa/Tunis');
const day = (n: number) => addDays(TODAY, n);

/**
 * Teacher attendance filtered by GROUP (admin). درة (D) supervises A (G1)
 * and B (G2) — the example: G1 5 lessons all attended, G2 2 lessons 1
 * attended, all groups 6/7 = 85.7 %. Later, one SHARED lesson A + B (D late,
 * فاطمة — assistant of B only — excused). O teaches only C (G3). D is also
 * assigned to E (G4), which has no lesson.
 */
describe('Teacher attendance by group (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let admin = '';
  const id: Record<string, string> = {};

  const http = () => request(app.getHttpServer());
  const as = () => ({ Authorization: `Bearer ${admin}` });
  const post = (path: string, body: object) =>
    http().post(`/api/admin/${path}`).set(as()).send(body);
  const get = (path: string, query: object = {}) =>
    http().get(`/api/admin/${path}`).query(query).set(as());
  const EXAMPLE = { from: day(-31), to: day(-20) };
  const SHARED = { from: day(-15), to: day(-5) };
  const ALL = { from: day(-31), to: day(-1) };
  const summary = async (teacher: string, query: object) =>
    (await get(`teachers/${id[teacher]}/attendance/summary`, query).expect(200))
      .body as {
      recorded: number;
      attended: number;
      eligible: number;
      absent: number;
      excused: number;
      late: number;
      rate: number | null;
    };

  async function lesson(
    key: string,
    classKey: string,
    date: string,
    extra: string[] = [],
  ) {
    id[key] = (
      await post('sessions', {
        groupClassId: id[classKey],
        additionalGroupClassIds: extra.map((k) => id[k]),
        roomId: id.room,
        date,
        startTime: '10:00',
        endTime: '11:00',
      }).expect(201)
    ).body.id;
  }
  const mark = (sessionKey: string, teachers: [string, string][]) =>
    http()
      .put(`/api/admin/sessions/${id[sessionKey]}/attendance`)
      .set(as())
      .send({
        teachers: teachers.map(([t, status]) => ({ teacherId: id[t], status })),
      })
      .expect(200);

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
            passwordHash: await new PasswordService().hash('initial-pass-123'),
            mustChangePassword: false,
            roles: { create: [{ role: Role.ADMIN }] },
          },
        },
      },
    });
    admin = (
      await http()
        .post('/api/auth/login')
        .send({ username: `e2e-${RUN}-admin`, password: 'initial-pass-123' })
        .expect(200)
    ).body.accessToken;
    id.branch = (
      await post('branches', { name: tag('فرع'), address: 'نابل' }).expect(201)
    ).body.id;
    id.room = (
      await post('rooms', { branchId: id.branch, name: tag('قاعة') }).expect(
        201,
      )
    ).body.id;
    for (const t of ['D', 'F', 'O'])
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
    for (const g of ['G1', 'G2', 'G3', 'G4'])
      id[g] = (await post('groups', { name: tag(g) }).expect(201)).body.id;
    const cls = async (
      key: string,
      group: string,
      sup: string,
      asst: string[] = [],
    ) => {
      id[key] = (
        await post('group-classes', {
          groupId: id[group],
          branchId: id.branch,
          supervisorId: id[sup],
          assistantTeacherIds: asst.map((a) => id[a]),
        }).expect(201)
      ).body.id;
    };
    await cls('A', 'G1', 'D');
    await cls('B', 'G2', 'D', ['F']);
    await cls('C', 'G3', 'O');
    await cls('E', 'G4', 'D');

    // The example: G1 5 lessons (all attended), G2 2 lessons (one absence)
    for (let i = 0; i < 5; i++) {
      await lesson(`a${i}`, 'A', day(-30 + i));
      await mark(`a${i}`, [['D', 'PRESENT']]);
    }
    await lesson('b0', 'B', day(-25));
    await mark('b0', [
      ['D', 'PRESENT'],
      ['F', 'PRESENT'],
    ]);
    await lesson('b1', 'B', day(-24));
    await mark('b1', [
      ['D', 'ABSENT'],
      ['F', 'PRESENT'],
    ]);
    // O: one group only
    await lesson('c0', 'C', day(-23));
    await mark('c0', [['O', 'PRESENT']]);
    // A shared lesson A + B
    await lesson('shared', 'A', day(-10), ['B']);
    await mark('shared', [
      ['D', 'LATE'],
      ['F', 'EXCUSED'],
    ]);
  });

  afterAll(async () => {
    const classes = { group: { name: { endsWith: RUN } } };
    await prisma.teacherAttendance.deleteMany({
      where: { session: { groupClass: classes } },
    });
    await prisma.session.deleteMany({ where: { groupClass: classes } });
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

  it('teacher profile totals: all groups 6/7 (85.7 %), group 1 5/5 (100 %), group 2 1/2 (50 %)', async () => {
    expect(await summary('D', EXAMPLE)).toMatchObject({
      attended: 6,
      eligible: 7,
      absent: 1,
      rate: 85.7,
    });
    expect(await summary('D', { ...EXAMPLE, groupId: id.G1 })).toMatchObject({
      attended: 5,
      eligible: 5,
      absent: 0,
      rate: 100,
    });
    expect(await summary('D', { ...EXAMPLE, groupId: id.G2 })).toMatchObject({
      attended: 1,
      eligible: 2,
      absent: 1,
      rate: 50,
    });
  });

  it('the group filter combines with the period (month / academic-year range)', async () => {
    expect(
      await summary('D', { from: day(-27), to: day(-20), groupId: id.G1 }),
    ).toMatchObject({ attended: 2, eligible: 2 });
    expect(
      await summary('D', { from: day(-27), to: day(-20), groupId: id.G2 }),
    ).toMatchObject({ attended: 1, eligible: 2 });
  });

  it('a shared lesson counts once overall and once in EACH of its groups (never twice)', async () => {
    for (const groupId of [undefined, id.G1, id.G2])
      expect(await summary('D', { ...SHARED, groupId })).toMatchObject({
        recorded: 1,
        late: 1,
        attended: 1,
      });
    expect(await summary('D', ALL)).toMatchObject({
      recorded: 8,
      attended: 7,
      eligible: 8,
    });
  });

  it('an assistant: their own records, by the lesson’s groups (excused never counts)', async () => {
    expect(await summary('F', ALL)).toMatchObject({
      recorded: 3,
      attended: 2,
      excused: 1,
      rate: 100,
    });
    expect(await summary('F', { ...ALL, groupId: id.G2 })).toMatchObject({
      recorded: 3,
    });
    // The shared lesson is also a G1 lesson (F taught it): excused
    expect(await summary('F', { ...ALL, groupId: id.G1 })).toMatchObject({
      recorded: 1,
      excused: 1,
      rate: null,
    });
  });

  it('history: filtered by group; a shared lesson lists its other classes', async () => {
    const records = (
      await get(`teachers/${id.D}/attendance`, {
        ...ALL,
        groupId: id.G2,
        pageSize: 50,
      }).expect(200)
    ).body as {
      data: {
        sessionId: string;
        groupClass: { id: string };
        additionalClasses: { id: string; group: { name: string } }[];
      }[];
      meta: { total: number };
    };
    expect(records.meta.total).toBe(3);
    expect(records.data.map((r) => r.sessionId).sort()).toEqual(
      [id.b0, id.b1, id.shared].sort(),
    );
    const shared = records.data.find((r) => r.sessionId === id.shared)!;
    expect(shared.groupClass.id).toBe(id.A);
    expect(shared.additionalClasses).toEqual([
      expect.objectContaining({
        id: id.B,
        group: expect.objectContaining({ name: tag('G2') }),
      }),
    ]);
    expect(
      (await get(`teachers/${id.D}/attendance`, ALL).expect(200)).body.meta
        .total,
    ).toBe(8);
  });

  it('group options: groups with records or assignments; a group without lessons shows zero', async () => {
    const groups = async (t: string) =>
      (
        (await get(`teachers/${id[t]}/attendance/groups`).expect(200)).body as {
          id: string;
        }[]
      )
        .map((g) => g.id)
        .sort();
    expect(await groups('D')).toEqual([id.G1, id.G2, id.G4].sort());
    expect(await groups('O')).toEqual([id.G3]);
    expect(await groups('F')).toEqual([id.G1, id.G2].sort());
    expect(await summary('D', { ...ALL, groupId: id.G4 })).toMatchObject({
      recorded: 0,
      rate: null,
    });
    await get(`teachers/${randomUUID()}/attendance/groups`).expect(404);
  });

  it('«إحصائيات الحضور → المعلمون»: the group filter narrows the records BEFORE the totals', async () => {
    const line = async (query: object, teacher: string) =>
      (
        (await get('attendance/teachers-summary', query).expect(200)).body as {
          teacherId: string;
          attended: number;
          eligible: number;
          rate: number | null;
        }[]
      ).find((l) => l.teacherId === id[teacher]);
    expect(await line(EXAMPLE, 'D')).toMatchObject({
      attended: 6,
      eligible: 7,
      rate: 85.7,
    });
    expect(await line({ ...EXAMPLE, groupId: id.G1 }, 'D')).toMatchObject({
      attended: 5,
      eligible: 5,
      rate: 100,
    });
    expect(await line({ ...EXAMPLE, groupId: id.G2 }, 'D')).toMatchObject({
      attended: 1,
      eligible: 2,
      rate: 50,
    });
    // O teaches no G1 lesson: not listed under G1
    expect(await line({ ...EXAMPLE, groupId: id.G1 }, 'O')).toBeUndefined();
    expect(await line(EXAMPLE, 'O')).toMatchObject({
      attended: 1,
      eligible: 1,
    });
    // The shared lesson: counted once in each group and once overall
    expect(await line({ ...SHARED, groupId: id.G1 }, 'D')).toMatchObject({
      attended: 1,
      eligible: 1,
    });
    expect(await line({ ...SHARED, groupId: id.G2 }, 'D')).toMatchObject({
      attended: 1,
      eligible: 1,
    });
    expect(await line(SHARED, 'D')).toMatchObject({ attended: 1, eligible: 1 });
  });
});
