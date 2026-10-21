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
import { onlyId } from './cleanup-ids.js';

const RUN = randomUUID().slice(0, 8);
const PASSWORD = 'initial-pass-123';
const tag = (s: string) => `${s} ${RUN}`;
const TODAY = todayIn('Africa/Tunis');
const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const dbDate = (d: string) => new Date(`${d}T00:00:00Z`);

type Preview = {
  eligible: boolean;
  from: { id: string };
  to: { id: string };
  blocks: { code: string; count: number; message: string }[];
  keeps: { weeklySchedules: number; plannedSessions: number; teachers: number };
  destinationFee: string | null;
};

/**
 * «نقل القسم إلى مجموعة أخرى»: only a class that never had a student nor any
 * recorded activity, whose running state stays the same, changes group —
 * same id, teachers, branch, weekly slots and planned sessions; the move is
 * audited. Re-checked under locks at execution time.
 */
describe('Move a class to another group (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const token: Record<string, string> = {};
  const id: Record<string, string> = {};
  let hour = 6;

  const http = () => request(app.getHttpServer());
  const as = (t = token.admin) => ({ Authorization: `Bearer ${t}` });
  const admin = {
    get: (path: string, query: object = {}) =>
      http().get(`/api/admin/${path}`).query(query).set(as()),
    post: (path: string, body: object = {}) =>
      http().post(`/api/admin/${path}`).set(as()).send(body),
    put: (path: string, body: object) =>
      http().put(`/api/admin/${path}`).set(as()).send(body),
    patch: (path: string, body: object) =>
      http().patch(`/api/admin/${path}`).set(as()).send(body),
  };
  const preview = async (cls: string, group: string) =>
    (
      await admin
        .get(`group-classes/${id[cls]}/move-preview`, { groupId: id[group] })
        .expect(200)
    ).body as Preview;
  const move = (cls: string, group: string) =>
    admin.post(`group-classes/${id[cls]}/move`, { groupId: id[group] });
  const codes = (p: { blocks: { code: string }[] }) =>
    p.blocks.map((b) => b.code).sort();
  const groupOf = async (cls: string) =>
    (
      await prisma.groupClass.findUniqueOrThrow({
        where: { id: id[cls] },
        select: { groupId: true },
      })
    ).groupId;

  async function account(key: string, role: Role) {
    const person = await prisma.person.create({
      data: {
        firstName: key,
        lastName: tag('حساب'),
        teacher: { create: { joinedAt: new Date('2024-09-01') } },
        user: {
          create: {
            username: `e2e-${RUN}-${key}`,
            passwordHash: await new PasswordService().hash(PASSWORD),
            mustChangePassword: false,
            roles: { create: [{ role }] },
          },
        },
      },
      select: {
        teacher: { select: { id: true } },
        user: { select: { id: true } },
      },
    });
    id[`${key}Teacher`] = person.teacher!.id;
    id[`${key}User`] = person.user!.id;
    token[key] = (
      await http()
        .post('/api/auth/login')
        .send({ username: `e2e-${RUN}-${key}`, password: PASSWORD })
        .expect(200)
    ).body.accessToken;
  }
  const group = async (key: string) =>
    (id[key] = (
      await admin.post('groups', { name: tag(`مجموعة ${key}`) }).expect(201)
    ).body.id);
  const cls = async (key: string, groupKey: string) =>
    (id[key] = (
      await admin
        .post('group-classes', {
          groupId: id[groupKey],
          branchId: id.branch,
          supervisorId: id.adminTeacher,
        })
        .expect(201)
    ).body.id);
  const student = async (
    key: string,
    classKey: string,
    registrationDate = TODAY,
  ) =>
    (id[key] = (
      await admin
        .post('students', {
          person: {
            firstName: key,
            lastName: tag('طالب'),
            gender: 'MALE',
            dateOfBirth: '2012-05-01',
            address: 'نابل',
          },
          groupClassId: id[classKey],
          registrationDate,
          guardianPhone: '98765432',
        })
        .expect(201)
    ).body.id);
  /** A one-off session of the class today (each at its own hour: no conflicts) */
  const session = async (classKey: string, extra: object = {}) => {
    const start = `${String(hour).padStart(2, '0')}:00`;
    const end = `${String(hour).padStart(2, '0')}:45`;
    hour += 1;
    return (
      await admin
        .post('sessions/extra', {
          groupClassId: id[classKey],
          roomId: id.room,
          date: TODAY,
          startTime: start,
          endTime: end,
          ...extra,
        })
        .expect(201)
    ).body.id as string;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    await account('admin', Role.ADMIN);
    await account('teacher', Role.TEACHER);
    id.branch = (
      await admin
        .post('branches', { name: tag('فرع'), address: 'نابل' })
        .expect(201)
    ).body.id;
    id.room = (
      await admin
        .post('rooms', { branchId: id.branch, name: tag('قاعة') })
        .expect(201)
    ).body.id;
    for (const g of ['A', 'B', 'I', 'I2', 'Z']) await group(g);
    // A class of a group that is no longer running (created while it still was)
    await cls('dormant', 'I');
    for (const g of ['I', 'I2'])
      await admin
        .patch(`groups/${id[g]}/status`, {
          status: 'INACTIVE',
        })
        .expect(200);
    await admin
      .patch(`groups/${id.Z}/status`, { status: 'ARCHIVED' })
      .expect(200);
    id.year = (
      await prisma.academicYear.create({
        data: {
          label: tag('سنة'),
          startDate: dbDate(addDays(TODAY, -60)),
          endDate: dbDate(addDays(TODAY, 250)),
          semester2StartDate: dbDate(addDays(TODAY, 90)),
        },
        select: { id: true },
      })
    ).id;
  });

  afterAll(async () => {
    const groups = { name: { endsWith: RUN } };
    const classes = { group: groups };
    const persons = (
      await prisma.person.findMany({
        where: { lastName: { endsWith: RUN } },
        select: { id: true },
      })
    ).map((p) => p.id);
    const students = { personId: { in: persons } };
    await prisma.groupClassMove.deleteMany({ where: { groupClass: classes } });
    await prisma.onboardingSubmission.deleteMany({
      where: { groupClass: classes },
    });
    await prisma.onboardingLink.deleteMany({ where: { groupClass: classes } });
    await prisma.teacherNote.deleteMany({ where: { groupClass: classes } });
    await prisma.workProgram.deleteMany({
      where: { session: { groupClass: classes } },
    });
    await prisma.teacherAttendance.deleteMany({
      where: { session: { groupClass: classes } },
    });
    await prisma.session.deleteMany({ where: { groupClass: classes } });
    await prisma.weeklySchedule.deleteMany({ where: { groupClass: classes } });
    await prisma.payment.deleteMany({
      where: { obligation: { group: groups } },
    });
    await prisma.paymentObligation.deleteMany({ where: { group: groups } });
    await prisma.groupFee.deleteMany({ where: { group: groups } });
    await prisma.studentEnrollment.deleteMany({ where: { student: students } });
    await prisma.studentStatusChange.deleteMany({
      where: { student: students },
    });
    await prisma.student.deleteMany({ where: students });
    await prisma.groupClass.deleteMany({ where: classes });
    await prisma.academicYear.deleteMany({ where: onlyId(id.year) });
    await prisma.teacher.deleteMany({ where: { personId: { in: persons } } });
    await prisma.user.deleteMany({ where: { personId: { in: persons } } });
    await prisma.person.deleteMany({ where: { id: { in: persons } } });
    await prisma.room.deleteMany({
      where: { branch: { name: { endsWith: RUN } } },
    });
    await prisma.branch.deleteMany({ where: { name: { endsWith: RUN } } });
    await prisma.group.deleteMany({ where: groups });
    await app.close();
  });

  it('an unused class moves: same id, teachers, branch, weekly slot and planned session; audited', async () => {
    await cls('free', 'A');
    await admin
      .post(`group-classes/${id.free}/schedules`, {
        dayOfWeek: 'MON',
        startTime: '20:00',
        endTime: '21:00',
        roomId: id.room,
      })
      .expect(201);
    const planned = await session('free');
    const before = await admin.get(`group-classes/${id.free}`).expect(200);
    const p = await preview('free', 'B');
    expect(p).toMatchObject({
      eligible: true,
      blocks: [],
      from: { id: id.A },
      to: { id: id.B },
      keeps: { weeklySchedules: 1, plannedSessions: 1, teachers: 1 },
    });
    const res = await move('free', 'B').expect(200);
    expect(res.body.id).toBe(id.free);
    expect(await groupOf('free')).toBe(id.B);
    const after = await admin.get(`group-classes/${id.free}`).expect(200);
    expect(after.body).toMatchObject({
      branch: before.body.branch,
      supervisor: before.body.supervisor,
      status: before.body.status,
    });
    expect(
      await prisma.weeklySchedule.count({ where: { groupClassId: id.free } }),
    ).toBe(1);
    expect(
      (await prisma.session.findUniqueOrThrow({ where: { id: planned } }))
        .groupClassId,
    ).toBe(id.free);
    const audit = await prisma.groupClassMove.findMany({
      where: { groupClassId: id.free },
    });
    expect(audit).toEqual([
      expect.objectContaining({
        fromGroupId: id.A,
        toGroupId: id.B,
        movedByUserId: id.adminUser,
      }),
    ]);
    // The audit is append-only; a move goes somewhere else
    await expect(
      prisma.groupClassMove.update({
        where: { id: audit[0].id },
        data: { toGroupId: id.A },
      }),
    ).rejects.toThrow(/group_class_moves_immutable/);
    await expect(
      prisma.groupClassMove.create({
        data: {
          groupClassId: id.free,
          fromGroupId: id.B,
          toGroupId: id.B,
          movedByUserId: id.adminUser,
        },
      }),
    ).rejects.toThrow(/group_class_moves_distinct_check/);
  });

  it('invalid destinations: the same group, an archived one, a missing one', async () => {
    expect(codes(await preview('free', 'B'))).toEqual(['SAME_GROUP']);
    expect(codes(await preview('free', 'Z'))).toEqual(['DESTINATION_ARCHIVED']);
    await admin
      .get(`group-classes/${id.free}/move-preview`, { groupId: randomUUID() })
      .expect(404);
    await admin
      .get(`group-classes/${randomUUID()}/move-preview`, { groupId: id.A })
      .expect(404);
    await admin
      .get(`group-classes/${id.free}/move-preview`, { groupId: 'x' })
      .expect(400);
    const refused = await move('free', 'Z').expect(409);
    expect(refused.body.code).toBe('GROUP_CLASS_MOVE_REFUSED');
    expect(await groupOf('free')).toBe(id.B);
  });

  it('the running state must not change (active ↔ inactive group); inactive ↔ inactive is fine', async () => {
    expect(codes(await preview('free', 'I'))).toEqual([
      'RUNNING_STATE_CHANGES',
    ]);
    expect((await move('free', 'I').expect(409)).body.message).toMatch(
      /غير نشطة/,
    );
    expect(codes(await preview('dormant', 'A'))).toEqual([
      'RUNNING_STATE_CHANGES',
    ]);
    await move('dormant', 'I2').expect(200);
    expect(await groupOf('dormant')).toBe(id.I2);
  });

  it('a class with a current student is refused, with the way forward', async () => {
    await cls('withStudent', 'A');
    await student('s1', 'withStudent');
    const p = await preview('withStudent', 'B');
    expect(p.eligible).toBe(false);
    expect(p.blocks).toEqual([
      expect.objectContaining({ code: 'HAS_STUDENTS', count: 1 }),
    ]);
    const res = await move('withStudent', 'B').expect(409);
    expect(res.body.message).toMatch(/«تغيير المجموعة»/);
    expect(await groupOf('withStudent')).toBe(id.A);
  });

  it('a former student (enrollment history) also blocks it', async () => {
    await cls('formerly', 'A');
    await cls('elsewhere', 'A');
    // Registered earlier: a transfer on the registration day itself would only
    // correct the enrollment, leaving no history in the first class
    await student('s2', 'formerly', addDays(TODAY, -7));
    await admin
      .patch(`students/${id.s2}/group-class`, { groupClassId: id.elsewhere })
      .expect(200);
    expect(codes(await preview('formerly', 'B'))).toEqual(['HAS_STUDENTS']);
  });

  it('attendance, a completed session, work and teacher notes each block it', async () => {
    // Teacher attendance only (no student)
    await cls('attended', 'A');
    const s1 = await session('attended');
    await admin
      .put(`sessions/${s1}/attendance`, {
        teachers: [{ teacherId: id.adminTeacher, status: 'PRESENT' }],
      })
      .expect(200);
    expect(codes(await preview('attended', 'B'))).toContain('HAS_ATTENDANCE');

    await cls('completed', 'A');
    const s2 = await session('completed');
    await admin
      .patch(`sessions/${s2}/status`, {
        status: 'COMPLETED',
        adminOverride: true,
      })
      .expect(200);
    expect(codes(await preview('completed', 'B'))).toContain(
      'HAS_COMPLETED_SESSIONS',
    );

    await cls('worked', 'A');
    const s3 = await session('worked');
    await prisma.workProgram.create({
      data: { studentId: id.s1, sessionId: s3 },
    });
    expect(codes(await preview('worked', 'B'))).toEqual(['HAS_WORK']);

    await cls('noted', 'A');
    await prisma.teacherNote.create({
      data: {
        teacherId: id.adminTeacher,
        content: 'ملاحظة',
        groupClassId: id.noted,
      },
    });
    expect(codes(await preview('noted', 'B'))).toEqual(['HAS_TEACHER_NOTES']);
  });

  it('a submitted onboarding form blocks it (an unused link does not)', async () => {
    await cls('onboarded', 'A');
    const link = await prisma.onboardingLink.create({
      data: {
        groupClassId: id.onboarded,
        tokenHash: randomUUID().replaceAll('-', '').padEnd(64, '0'),
        tokenSealed: 'x',
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    expect((await preview('onboarded', 'B')).eligible).toBe(true);
    await prisma.onboardingSubmission.create({
      data: {
        onboardingLinkId: link.id,
        groupClassId: id.onboarded,
        submittedBy: 'STUDENT',
        firstName: 'سارة',
        lastName: tag('مترشحة'),
        gender: 'FEMALE',
        dateOfBirth: dbDate('2013-01-01'),
        address: 'نابل',
        originalData: {},
      },
    });
    expect(codes(await preview('onboarded', 'B'))).toEqual([
      'HAS_ONBOARDING_SUBMISSIONS',
    ]);
  });

  it('a shared weekly slot and its planned sessions stay valid (host and participant)', async () => {
    await cls('host', 'A');
    await cls('guest', 'B');
    const slot = (
      await admin
        .post(`group-classes/${id.host}/schedules`, {
          dayOfWeek: 'TUE',
          startTime: '21:00',
          endTime: '22:00',
          roomId: id.room,
          additionalGroupClassIds: [id.guest],
        })
        .expect(201)
    ).body.id;
    const shared = await session('host', {
      additionalGroupClassIds: [id.guest],
    });
    expect((await preview('guest', 'I2')).blocks.map((b) => b.code)).toEqual([
      'RUNNING_STATE_CHANGES',
    ]);
    expect((await preview('guest', 'A')).keeps).toMatchObject({
      weeklySchedules: 1,
      plannedSessions: 1,
    });
    await move('guest', 'A').expect(200);
    await move('host', 'B').expect(200);
    // Same slot, same participants, same session
    const [s] = await admin
      .get(`group-classes/${id.host}/schedules`)
      .expect(200)
      .then((r) => r.body);
    expect(s).toMatchObject({
      id: slot,
      additionalClasses: [expect.objectContaining({ id: id.guest })],
    });
    expect(
      await prisma.sessionClass.count({
        where: { sessionId: shared, groupClassId: id.guest },
      }),
    ).toBe(1);
    // Activity on the shared session blocks both classes
    await admin
      .put(`sessions/${shared}/attendance`, {
        teachers: [{ teacherId: id.adminTeacher, status: 'PRESENT' }],
      })
      .expect(200);
    expect(codes(await preview('guest', 'B'))).toContain('HAS_ATTENDANCE');
    expect(codes(await preview('host', 'A'))).toContain('HAS_ATTENDANCE');
  });

  it('a preview that became stale (a student joined) is refused at execution', async () => {
    await cls('stale', 'A');
    expect((await preview('stale', 'B')).eligible).toBe(true);
    await student('s3', 'stale');
    const res = await move('stale', 'B').expect(409);
    expect(res.body.blocks).toEqual([
      expect.objectContaining({ code: 'HAS_STUDENTS' }),
    ]);
    expect(await groupOf('stale')).toBe(id.A);
  });

  it('an enrollment at the same moment as the move: never both, the student billed by the final group', async () => {
    for (const [g, amount] of [
      ['A', '100'],
      ['B', '200'],
    ])
      await admin
        .put(`groups/${id[g]}/fees`, {
          academicYearId: id.year,
          label: 'معلوم',
          amount,
        })
        .expect(200);
    for (let i = 0; i < 3; i++) {
      const key = `race${i}`;
      await cls(key, 'A');
      const [moved, created] = await Promise.all([
        move(key, 'B'),
        admin.post('students', {
          person: {
            firstName: key,
            lastName: tag('طالب'),
            gender: 'MALE',
            dateOfBirth: '2012-05-01',
            address: 'نابل',
          },
          groupClassId: id[key],
          registrationDate: TODAY,
          guardianPhone: '98765432',
        }),
      ]);
      expect(created.status).toBe(201);
      const finalGroup = await groupOf(key);
      if (moved.status === 200) expect(finalGroup).toBe(id.B);
      else {
        expect(moved.body.code).toBe('GROUP_CLASS_MOVE_REFUSED');
        expect(finalGroup).toBe(id.A);
      }
      // Membership and billing always follow the class's final group
      const obligations = await prisma.paymentObligation.findMany({
        where: { studentId: created.body.id, voidedAt: null },
        select: { groupId: true },
      });
      expect(obligations).toEqual([{ groupId: finalGroup }]);
      // A move happened only when the class had no student yet
      const moves = await prisma.groupClassMove.count({
        where: { groupClassId: id[key] },
      });
      expect(moves).toBe(moved.status === 200 ? 1 : 0);
    }
  });

  it('admin only (teacher 403, anonymous 401)', async () => {
    const routes = [
      () =>
        http()
          .get(`/api/admin/group-classes/${id.free}/move-preview`)
          .query({ groupId: id.A }),
      () =>
        http()
          .post(`/api/admin/group-classes/${id.free}/move`)
          .send({ groupId: id.A }),
    ];
    for (const route of routes) {
      expect((await route().set(as(token.teacher))).status).toBe(403);
      expect((await route()).status).toBe(401);
    }
    expect(await groupOf('free')).toBe(id.B);
  });
});
