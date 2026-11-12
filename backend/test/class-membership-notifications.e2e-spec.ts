import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { vi } from 'vitest';
import { StudentsService } from '../src/academic/students/students.service.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { PasswordService } from '../src/auth/password.service.js';
import { todayIn } from '../src/common/dates.js';
import { Role } from '../src/generated/prisma/enums.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { OnboardingRateLimiter } from '../src/student-onboarding/student-onboarding.controller.js';

const RUN = randomUUID().slice(0, 8);
const PASSWORD = 'initial-pass-123';
const tag = (s: string) => `${s} ${RUN}`;
const TODAY = todayIn('Africa/Tunis');
const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/**
 * Phase 3: a student joining, moving between or leaving classes tells the
 * teachers of the class(es) concerned — once each, inside the same
 * transaction, naming the admin who did it; nobody else.
 */
describe('Class membership notifications — join, transfer, leave (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const id: Record<string, string> = {};
  const uid: Record<string, string> = {};
  const token: Record<string, string> = {};

  const http = () => request(app.getHttpServer());
  const as = (who: string) => ({ Authorization: `Bearer ${token[who]}` });
  const api = (who: string) => ({
    post: (path: string, body: object = {}) =>
      http().post(`/api/admin/${path}`).set(as(who)).send(body),
    patch: (path: string, body: object = {}) =>
      http().patch(`/api/admin/${path}`).set(as(who)).send(body),
  });
  const admin = api('admin');
  const name = (key: string) => `${key} ${tag('حساب')}`;
  const cls = (g: string) => `${tag(g)} — ${tag('فرع المركز')}`;

  /** This run's notifications about one subject: recipient key → [type, message]. */
  async function about(entityId: string, since = new Date(0)) {
    const keyOf = new Map(Object.entries(uid).map(([k, v]) => [v, k]));
    const rows = await prisma.notification.findMany({
      where: { entityId, createdAt: { gte: since } },
      orderBy: { createdAt: 'asc' },
    });
    const out: Record<string, { type: string; message: string }[]> = {};
    for (const r of rows) {
      const key = keyOf.get(r.userId) ?? 'someone-else';
      (out[key] ??= []).push({ type: r.type, message: r.message });
    }
    return out;
  }
  const countFor = (keys: string[]) =>
    prisma.notification.count({
      where: { userId: { in: keys.map((k) => uid[k]) } },
    });

  const newStudent = async (
    first: string,
    classKey: string,
    who = 'admin',
    gender: 'MALE' | 'FEMALE' = 'MALE',
  ) =>
    (
      await api(who)
        .post('students', {
          person: {
            firstName: first,
            lastName: tag('طالب'),
            gender,
            dateOfBirth: '2014-05-01',
            address: 'نابل',
          },
          groupClassId: id[classKey],
          registrationDate: addDays(TODAY, -30),
          guardianPhone: '98765432',
        })
        .expect(201)
    ).body.id as string;

  async function account(
    key: string,
    roles: Role[],
    opts: {
      teacher?: boolean;
      isActive?: boolean;
      gender?: 'MALE' | 'FEMALE' | null;
    } = {},
  ) {
    const person = await prisma.person.create({
      data: {
        firstName: key,
        lastName: tag('حساب'),
        gender: opts.gender === undefined ? 'MALE' : opts.gender,
        ...(opts.teacher
          ? { teacher: { create: { joinedAt: new Date('2024-09-01') } } }
          : {}),
        user: {
          create: {
            username: `e2e-${RUN}-${key}`.toLowerCase(),
            passwordHash: await new PasswordService().hash(PASSWORD),
            mustChangePassword: false,
            isActive: opts.isActive ?? true,
            roles: { create: roles.map((role) => ({ role })) },
          },
        },
      },
      select: {
        teacher: { select: { id: true } },
        user: { select: { id: true } },
      },
    });
    uid[key] = person.user!.id;
    if (opts.teacher) id[`teacher:${key}`] = person.teacher!.id;
    if (opts.isActive === false) return;
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
    const config = app.get(ConfigService);
    const original = config.get.bind(config);
    vi.spyOn(config, 'get').mockImplementation(((
      key: string,
      options?: object,
    ) =>
      key === 'STUDENT_ONBOARDING_ENABLED'
        ? true
        : original(key, options)) as typeof config.get);

    await account('admin', [Role.ADMIN]);
    await account('adminF', [Role.ADMIN], { gender: 'FEMALE' });
    // An admin who also teaches class A: never told of their own action
    await account('adminTeacher', [Role.ADMIN, Role.TEACHER], {
      teacher: true,
    });
    await account('supA', [Role.TEACHER], { teacher: true });
    await account('asstA', [Role.TEACHER], { teacher: true });
    await account('both', [Role.TEACHER], { teacher: true });
    await account('supB', [Role.TEACHER], { teacher: true });
    await account('disabledT', [Role.TEACHER], {
      teacher: true,
      isActive: false,
    });
    await account('inactiveT', [Role.TEACHER], { teacher: true });
    await account('other', [Role.TEACHER], { teacher: true });

    id.branch = (
      await admin
        .post('branches', { name: tag('فرع المركز'), address: 'نابل' })
        .expect(201)
    ).body.id;
    for (const g of ['G1', 'G2'])
      id[g] = (
        await admin.post('groups', { name: tag(g) }).expect(201)
      ).body.id;
    const make = async (
      key: string,
      g: string,
      sup: string,
      assistants: string[],
    ) =>
      (id[key] = (
        await admin
          .post('group-classes', {
            groupId: id[g],
            branchId: id.branch,
            supervisorId: id[`teacher:${sup}`],
            assistantTeacherIds: assistants.map((a) => id[`teacher:${a}`]),
          })
          .expect(201)
      ).body.id);
    await make('A', 'G1', 'supA', ['asstA', 'both', 'adminTeacher']);
    await make('B', 'G2', 'supB', ['both', 'disabledT', 'inactiveT']);
    await make('O', 'G2', 'other', []);
    // A teacher who left (INACTIVE) keeps an active account but is not told
    await prisma.teacher.update({
      where: { id: id['teacher:inactiveT'] },
      data: { status: 'INACTIVE' },
    });
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    const classes = { group: { name: { endsWith: RUN } } };
    const persons = { lastName: { endsWith: RUN } };
    const students = { person: persons };
    await prisma.notification.deleteMany({
      where: { userId: { in: Object.values(uid) } },
    });
    await prisma.registrationRequest.deleteMany({ where: persons });
    await prisma.onboardingSubmission.deleteMany({
      where: { groupClass: classes },
    });
    await prisma.onboardingLink.deleteMany({ where: { groupClass: classes } });
    await prisma.paymentObligation.deleteMany({ where: { student: students } });
    await prisma.studentEnrollment.deleteMany({ where: { student: students } });
    await prisma.studentStatusChange.deleteMany({
      where: { student: students },
    });
    await prisma.student.deleteMany({ where: students });
    await prisma.groupClassAssistant.deleteMany({
      where: { groupClass: classes },
    });
    await prisma.groupClass.deleteMany({ where: classes });
    await prisma.group.deleteMany({ where: { name: { endsWith: RUN } } });
    await prisma.branch.deleteMany({ where: { name: { endsWith: RUN } } });
    await prisma.teacher.deleteMany({ where: { person: persons } });
    await prisma.user.deleteMany({ where: { person: persons } });
    await prisma.person.deleteMany({ where: persons });
    await app.close();
  });

  describe('joining a class', () => {
    it('an admin adds a student: the class’s active teachers are told once, naming the admin', async () => {
      const s = await newStudent('سامي', 'A');
      const got = await about(s);
      expect(Object.keys(got).sort()).toEqual(
        ['adminTeacher', 'asstA', 'both', 'supA'].sort(),
      );
      expect(Object.values(got).every((l) => l.length === 1)).toBe(true);
      expect(got.supA[0]).toEqual({
        type: 'STUDENT_JOINED_CLASS',
        message: `أضاف المسؤول الإداري ${name('admin')} الطالب سامي ${tag('طالب')} إلى قسم ${cls('G1')}.`,
      });
      const row = await prisma.notification.findFirstOrThrow({
        where: { entityId: s, userId: uid.supA },
      });
      expect(row).toMatchObject({
        entityType: 'STUDENT',
        actorUserId: uid.admin,
        readAt: null,
      });
      id.sami = s;
    });

    it('the admin who teaches the class is not told of their own action; a female admin is named as such', async () => {
      const s = await newStudent('ليلى', 'A', 'adminTeacher', 'FEMALE');
      expect(Object.keys(await about(s)).sort()).toEqual(
        ['asstA', 'both', 'supA'].sort(),
      );
      const s2 = await newStudent('هند', 'B', 'adminF', 'FEMALE');
      const got = await about(s2);
      // Disabled account and INACTIVE teacher excluded
      expect(Object.keys(got).sort()).toEqual(['both', 'supB']);
      expect(got.supB[0].message).toBe(
        `أضافت المسؤولة الإدارية ${name('adminF')} الطالبة هند ${tag('طالب')} إلى قسم ${cls('G2')}.`,
      );
      id.hind = s2;
    });

    it('accepting a registration request names the admin and what they did', async () => {
      const rid = (
        await admin
          .post('registration-requests', {
            firstName: 'أنس',
            lastName: tag('طالب'),
            birthDate: '1990-04-12',
            phone: '21234567',
            gender: 'MALE',
            address: 'نابل',
            hasStudiedQuranBefore: false,
          })
          .expect(201)
      ).body.id;
      const res = await admin
        .post(`registration-requests/${rid}/accept`, { groupClassId: id.B })
        .expect(200);
      const got = await about(res.body.studentId);
      expect(Object.keys(got).sort()).toEqual(['both', 'supB']);
      expect(got.supB[0]).toEqual({
        type: 'STUDENT_JOINED_CLASS',
        message: `قبل المسؤول الإداري ${name('admin')} طلب تسجيل الطالب أنس ${tag('طالب')} وأضافه إلى قسم ${cls('G2')}.`,
      });
    });

    it('approving an onboarding submission names the admin; a refused approval notifies nobody', async () => {
      const link = await admin
        .post('student-onboarding/links', {
          groupClassId: id.A,
          expiresAt: `${addDays(TODAY, 7)}T20:00`,
        })
        .expect(201);
      app.get(OnboardingRateLimiter).reset();
      await http()
        .post('/api/public/student-onboarding/submissions')
        .send({
          token: (link.body.url as string).split('/student-info/')[1],
          submittedBy: 'STUDENT',
          consent: true,
          firstName: 'مريم',
          lastName: tag('طالب'),
          gender: 'FEMALE',
          dateOfBirth: '2001-05-05',
          address: 'نابل',
          phone: '55443322',
        })
        .expect(201);
      const sub = await prisma.onboardingSubmission.findFirstOrThrow({
        where: { firstName: 'مريم', lastName: tag('طالب') },
      });
      const before = await countFor(['supA', 'asstA', 'both']);
      // Stale version: refused, nothing created, nobody told
      await admin
        .post(`student-onboarding/submissions/${sub.id}/approve`, {
          version: sub.version + 1,
        })
        .expect(409);
      expect(await countFor(['supA', 'asstA', 'both'])).toBe(before);
      const ok = await admin
        .post(`student-onboarding/submissions/${sub.id}/approve`, {
          version: sub.version,
        })
        .expect(200);
      const got = await about(ok.body.approvedStudentId);
      expect(Object.keys(got).sort()).toEqual(
        ['adminTeacher', 'asstA', 'both', 'supA'].sort(),
      );
      expect(got.asstA[0].message).toBe(
        `اعتمد المسؤول الإداري ${name('admin')} بيانات الطالبة مريم ${tag('طالب')} وأضافها إلى قسم ${cls('G1')}.`,
      );
    });

    it('editing only personal information notifies nobody', async () => {
      const before = await countFor(['supA', 'asstA', 'both']);
      await admin
        .patch(`students/${id.sami}`, { person: { address: 'سوسة' } })
        .expect(200);
      expect(await countFor(['supA', 'asstA', 'both'])).toBe(before);
    });
  });

  describe('moving between classes', () => {
    it('A → B: the new class gets the whole move, the old one only the departure, a teacher of both one notification', async () => {
      const since = new Date();
      await admin
        .patch(`students/${id.sami}/group-class`, { groupClassId: id.B })
        .expect(200);
      const got = await about(id.sami, since);
      expect(got.both).toHaveLength(1);
      expect(got.both[0].type).toBe('STUDENT_TRANSFERRED');
      const move = `نقل المسؤول الإداري ${name('admin')} الطالب سامي ${tag('طالب')} من قسم ${cls('G1')} إلى قسم ${cls('G2')}.`;
      expect(got.supB).toEqual([
        { type: 'STUDENT_TRANSFERRED', message: move },
      ]);
      expect(got.both[0].message).toBe(move);
      // The old class's other teachers: told they left, about their class (not where to)
      const left = await about(id.A, since);
      const departure = `غادر الطالب سامي ${tag('طالب')} قسم ${cls('G1')} بعد نقله من طرف المسؤول الإداري ${name('admin')}.`;
      for (const k of ['supA', 'asstA', 'adminTeacher'])
        expect(left[k]).toEqual([
          { type: 'STUDENT_LEFT_CLASS', message: departure },
        ]);
      expect(left.both).toBeUndefined();
      // Disabled account, INACTIVE teacher and an unrelated teacher: nothing
      for (const k of ['disabledT', 'inactiveT', 'other']) {
        expect(got[k]).toBeUndefined();
        expect(left[k]).toBeUndefined();
      }
    });

    it('repeating the same move, or a refused one, notifies nobody', async () => {
      const before = await countFor(['supA', 'supB', 'both', 'asstA']);
      await admin
        .patch(`students/${id.sami}/group-class`, { groupClassId: id.B })
        .expect(200);
      await admin
        .patch(`students/${id.sami}/group-class`, {
          groupClassId: id.A,
          effectiveDate: addDays(TODAY, 3),
        })
        .expect(400);
      expect(await countFor(['supA', 'supB', 'both', 'asstA'])).toBe(before);
    });

    it('a back-dated move says from when', async () => {
      const s = await newStudent('رامي', 'O');
      const since = new Date();
      await admin
        .patch(`students/${s}/group-class`, {
          groupClassId: id.A,
          effectiveDate: addDays(TODAY, -2),
        })
        .expect(200);
      const got = await about(s, since);
      expect(got.supA[0].message).toContain(' ابتداءً من ');
      expect((await about(id.O, since)).other[0].message).toContain(
        'بعد نقله من طرف',
      );
    });
  });

  describe('leaving a class', () => {
    it('archiving tells the class’s teachers once; repeating it, or archiving an inactive student, adds nothing', async () => {
      const since = new Date();
      await admin
        .patch(`students/${id.hind}/status`, { status: 'ARCHIVED' })
        .expect(200);
      const got = await about(id.B, since);
      expect(Object.keys(got).sort()).toEqual(['both', 'supB']);
      expect(got.supB[0]).toEqual({
        type: 'STUDENT_LEFT_CLASS',
        message: `أرشف المسؤول الإداري ${name('admin')} الطالبة هند ${tag('طالب')}، فلم تعد ضمن طلبة قسم ${cls('G2')}.`,
      });
      const before = await countFor(['supB', 'both']);
      await admin
        .patch(`students/${id.hind}/status`, { status: 'ARCHIVED' })
        .expect(200);
      expect(await countFor(['supB', 'both'])).toBe(before);
    });

    it('making a student inactive says so; inactive → archived adds nothing', async () => {
      const s = await newStudent('يوسف', 'B');
      const since = new Date();
      await admin
        .patch(`students/${s}/status`, { status: 'INACTIVE' })
        .expect(200);
      expect((await about(id.B, since)).supB).toEqual([
        {
          type: 'STUDENT_LEFT_CLASS',
          message: `أوقف المسؤول الإداري ${name('admin')} نشاط الطالب يوسف ${tag('طالب')} في قسم ${cls('G2')}.`,
        },
      ]);
      const before = await countFor(['supB', 'both']);
      await admin
        .patch(`students/${s}/status`, { status: 'ARCHIVED' })
        .expect(200);
      expect(await countFor(['supB', 'both'])).toBe(before);
      id.yusuf = s;
    });

    it('making an archived student active again tells the class’s teachers once; repeating it adds nothing', async () => {
      const since = new Date();
      await admin
        .patch(`students/${id.yusuf}/status`, { status: 'ACTIVE' })
        .expect(200);
      const got = await about(id.yusuf, since);
      expect(Object.keys(got).sort()).toEqual(['both', 'supB']);
      expect(got.supB).toEqual([
        {
          type: 'STUDENT_JOINED_CLASS',
          message: `أعاد المسؤول الإداري ${name('admin')} تفعيل الطالب يوسف ${tag('طالب')} في قسم ${cls('G2')}.`,
        },
      ]);
      const before = await countFor(['supB', 'both']);
      await admin
        .patch(`students/${id.yusuf}/status`, { status: 'ACTIVE' })
        .expect(200);
      expect(await countFor(['supB', 'both'])).toBe(before);
    });
  });

  describe('transactions, availability and access', () => {
    it('a transaction that fails after the change leaves no notification behind', async () => {
      const students = app.get(StudentsService);
      const before = await countFor(['supA', 'asstA', 'both']);
      await expect(
        prisma.$transaction(async (tx) => {
          await students.createInTx(
            tx,
            {
              person: {
                firstName: 'تراجع',
                lastName: tag('طالب'),
                gender: 'MALE',
                dateOfBirth: '2014-05-01',
                address: 'نابل',
              },
              groupClassId: id.A,
              registrationDate: TODAY,
              guardianPhone: '98765432',
            },
            uid.admin,
          );
          throw new Error('rolled back');
        }),
      ).rejects.toThrow('rolled back');
      expect(await countFor(['supA', 'asstA', 'both'])).toBe(before);
    });

    it('a deleted student (or request) stays in the history, reported unavailable', async () => {
      const s = await newStudent('مؤقت', 'O');
      const list = async () =>
        (
          await http()
            .get('/api/notifications')
            .query({ pageSize: 100 })
            .set(as('other'))
            .expect(200)
        ).body.data.find((n: { entityId: string }) => n.entityId === s);
      expect(await list()).toMatchObject({
        entityType: 'STUDENT',
        available: true,
      });
      await prisma.paymentObligation.deleteMany({ where: { studentId: s } });
      await prisma.studentEnrollment.deleteMany({ where: { studentId: s } });
      await prisma.studentStatusChange.deleteMany({ where: { studentId: s } });
      await prisma.student.delete({ where: { id: s } });
      expect(await list()).toMatchObject({
        entityType: 'STUDENT',
        entityId: s,
        available: false,
      });
      // A deleted registration request (Phase 2) too
      const rid = (
        await admin
          .post('registration-requests', {
            firstName: 'محذوف',
            lastName: tag('طالب'),
            birthDate: '1990-04-12',
            phone: '21234567',
            hasStudiedQuranBefore: false,
          })
          .expect(201)
      ).body.id;
      await prisma.notification.create({
        data: {
          userId: uid.admin,
          type: 'REGISTRATION_REQUEST_SUBMITTED',
          title: 'طلب تسجيل جديد',
          message: 'm',
          entityType: 'REGISTRATION_REQUEST',
          entityId: rid,
        },
      });
      const adminList = async () =>
        (
          await http()
            .get('/api/notifications')
            .query({ pageSize: 100 })
            .set(as('admin'))
            .expect(200)
        ).body.data.find((n: { entityId: string }) => n.entityId === rid);
      expect((await adminList()).available).toBe(true);
      await prisma.registrationRequest.delete({ where: { id: rid } });
      expect(await adminList()).toMatchObject({
        available: false,
        message: 'm',
      });
    });

    it('teachers open only their current students and classes (the workspace a link is checked against)', async () => {
      const ws = async (who: string) =>
        (await http().get('/api/teacher/workspace').set(as(who)).expect(200))
          .body as {
          students: { id: string }[];
          groupClasses: { id: string }[];
        };
      // Sami moved A → B: B's teachers see him, A's supervisor no longer does
      expect((await ws('supB')).students.map((s) => s.id)).toContain(id.sami);
      expect((await ws('supA')).students.map((s) => s.id)).not.toContain(
        id.sami,
      );
      // The class a departure notification points to is still theirs
      expect((await ws('supA')).groupClasses.map((c) => c.id)).toContain(id.A);
      // Students' and teachers' own notification lists never hold another account's rows
      const mine = (
        await http()
          .get('/api/notifications')
          .query({ pageSize: 100 })
          .set(as('other'))
          .expect(200)
      ).body.meta.total;
      expect(mine).toBe(
        await prisma.notification.count({ where: { userId: uid.other } }),
      );
      await http().get('/api/admin/students').set(as('supA')).expect(403);
    });
  });
});
