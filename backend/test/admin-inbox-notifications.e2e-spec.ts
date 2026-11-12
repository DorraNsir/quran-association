import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { PasswordService } from '../src/auth/password.service.js';
import { NotificationsService } from '../src/communication/notifications.service.js';
import { Role } from '../src/generated/prisma/enums.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { RegistrationRateLimiter } from '../src/registration/registration-rate-limit.guard.js';
import { OnboardingRateLimiter } from '../src/student-onboarding/student-onboarding.controller.js';

const RUN = randomUUID().slice(0, 8);
const PASSWORD = 'initial-pass-123';
const tag = (s: string) => `${s} ${RUN}`;
const IN_A_WEEK = `${new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10)}T20:00`;

/**
 * Phase 2 notifications: a public registration request and an onboarding
 * submission reach every active admin once, in the same transaction, named
 * after the applicant; nobody else is told, and only admins can open them.
 */
describe('Admin inbox notifications — registration requests & onboarding (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const id: Record<string, string> = {};
  const uid: Record<string, string> = {};
  const token: Record<string, string> = {};

  const http = () => request(app.getHttpServer());
  const as = (who: string) => ({ Authorization: `Bearer ${token[who]}` });
  const adminPost = (path: string, body: object = {}) =>
    http().post(`/api/admin/${path}`).set(as('admin')).send(body);
  const notificationsOf = async (who: string) =>
    (
      await http()
        .get('/api/notifications')
        .query({ pageSize: 100 })
        .set(as(who))
        .expect(200)
    ).body.data as {
      type: string;
      title: string;
      message: string;
      entityType: string;
      entityId: string;
      available: boolean;
    }[];
  /** This run's accounts notified about one request, sorted. */
  async function recipients(entityId: string) {
    const keyOf = new Map(Object.entries(uid).map(([k, v]) => [v, k]));
    const rows = await prisma.notification.findMany({
      where: { entityId },
      select: { userId: true },
    });
    return rows
      .map((r) => keyOf.get(r.userId))
      .filter((k): k is string => Boolean(k))
      .sort((a, b) => a.localeCompare(b));
  }

  const register = (body: object) => {
    app.get(RegistrationRateLimiter).reset();
    return http().post('/api/public/registration-requests').send(body);
  };
  const form = (first: string, extra: object = {}) => ({
    firstName: first,
    lastName: tag('مترشح'),
    birthDate: '1990-04-12',
    phone: '21234567',
    hasStudiedQuranBefore: true,
    ...extra,
  });
  const requestIdOf = async (first: string) =>
    (
      await prisma.registrationRequest.findFirstOrThrow({
        where: { firstName: first, lastName: tag('مترشح') },
        select: { id: true },
      })
    ).id;

  const submit = (t: string, fields: object = {}) => {
    app.get(OnboardingRateLimiter).reset();
    return http()
      .post('/api/public/student-onboarding/submissions')
      .send({
        token: t,
        submittedBy: 'GUARDIAN',
        consent: true,
        firstName: 'يوسف',
        lastName: tag('العيادي'),
        gender: 'MALE',
        dateOfBirth: '2015-03-10',
        address: 'نابل',
        guardianPhone: '98765432',
        ...fields,
      });
  };
  const submissionIdOf = async (first: string) =>
    (
      await prisma.onboardingSubmission.findFirstOrThrow({
        where: { firstName: first, lastName: tag('العيادي') },
        select: { id: true },
      })
    ).id;

  async function account(
    key: string,
    roles: Role[],
    opts: { teacher?: boolean; isActive?: boolean } = {},
  ) {
    const person = await prisma.person.create({
      data: {
        firstName: key,
        lastName: tag('حساب'),
        gender: 'MALE',
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
        id: true,
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
    // STUDENT_ONBOARDING_ENABLED for this app (the env is read once, at import time)
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
    await account('admin2', [Role.ADMIN]);
    await account('adminTeacher', [Role.ADMIN, Role.TEACHER], {
      teacher: true,
    });
    await account('disabledAdmin', [Role.ADMIN], { isActive: false });
    await account('sup', [Role.TEACHER], { teacher: true });
    await account('pupil', [Role.STUDENT]);

    id.branch = (
      await adminPost('branches', {
        name: tag('فرع المركز'),
        address: 'نابل',
      }).expect(201)
    ).body.id;
    id.group = (
      await adminPost('groups', { name: tag('مجموعة الماهر') }).expect(201)
    ).body.id;
    id.C = (
      await adminPost('group-classes', {
        groupId: id.group,
        branchId: id.branch,
        supervisorId: id['teacher:sup'],
      }).expect(201)
    ).body.id;
    const link = await adminPost('student-onboarding/links', {
      groupClassId: id.C,
      expiresAt: IN_A_WEEK,
    }).expect(201);
    id.link = link.body.id;
    token.link = (link.body.url as string).split('/student-info/')[1];
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    const classes = { group: { name: { endsWith: RUN } } };
    const requests = await prisma.registrationRequest.findMany({
      where: { lastName: { endsWith: RUN } },
      select: { id: true },
    });
    const submissions = await prisma.onboardingSubmission.findMany({
      where: { groupClass: classes },
      select: { id: true },
    });
    await prisma.notification.deleteMany({
      where: {
        entityId: { in: [...requests, ...submissions].map((r) => r.id) },
      },
    });
    await prisma.registrationRequest.deleteMany({
      where: { lastName: { endsWith: RUN } },
    });
    await prisma.onboardingSubmission.deleteMany({
      where: { groupClass: classes },
    });
    await prisma.onboardingLink.deleteMany({ where: { groupClass: classes } });
    await prisma.groupClass.deleteMany({ where: classes });
    await prisma.group.deleteMany({ where: { name: { endsWith: RUN } } });
    await prisma.branch.deleteMany({ where: { name: { endsWith: RUN } } });
    const persons = { lastName: { endsWith: RUN } };
    await prisma.teacher.deleteMany({ where: { person: persons } });
    await prisma.user.deleteMany({ where: { person: persons } });
    await prisma.person.deleteMany({ where: persons });
    await app.close();
  });

  describe('registration requests', () => {
    it('a public request reaches every active admin once, named after the applicant', async () => {
      await register(
        form('سلمى', { interestedGroupId: id.group, birthDate: '1995-01-01' }),
      ).expect(201);
      const requestId = await requestIdOf('سلمى');
      // Active admins (an ADMIN+TEACHER account once); not a disabled admin, a teacher or a student
      expect(await recipients(requestId)).toEqual([
        'admin',
        'admin2',
        'adminTeacher',
      ]);
      const [n] = (await notificationsOf('admin2')).filter(
        (x) => x.entityId === requestId,
      );
      expect(n).toMatchObject({
        type: 'REGISTRATION_REQUEST_SUBMITTED',
        title: 'طلب تسجيل جديد',
        message: `وصل طلب تسجيل جديد من الموقع باسم سلمى ${tag('مترشح')}، للمجموعة: ${tag('مجموعة الماهر')}.`,
        entityType: 'REGISTRATION_REQUEST',
        available: true,
      });
      // No account did it: no actor is invented
      const rows = await prisma.notification.findMany({
        where: { entityId: requestId },
      });
      expect(rows.every((r) => r.actorUserId === null)).toBe(true);
      expect(rows.every((r) => r.readAt === null)).toBe(true);
    });

    it('without a group asked for, the message says only who applied', async () => {
      await register(form('أنس')).expect(201);
      const requestId = await requestIdOf('أنس');
      const [n] = (await notificationsOf('admin')).filter(
        (x) => x.entityId === requestId,
      );
      expect(n.message).toBe(
        `وصل طلب تسجيل جديد من الموقع باسم أنس ${tag('مترشح')}.`,
      );
    });

    it('a refused submission stores nothing and notifies nobody', async () => {
      const before = await prisma.notification.count({
        where: { userId: uid.admin },
      });
      // No birth date nor age
      await register(form('مرفوض', { birthDate: undefined })).expect(400);
      expect(
        await prisma.notification.count({ where: { userId: uid.admin } }),
      ).toBe(before);
    });

    it('a request entered by an admin notifies nobody (it is not from the website)', async () => {
      const before = await prisma.notification.count({
        where: { userId: { in: [uid.admin, uid.admin2] } },
      });
      await adminPost('registration-requests', form('إداري')).expect(201);
      expect(
        await prisma.notification.count({
          where: { userId: { in: [uid.admin, uid.admin2] } },
        }),
      ).toBe(before);
    });

    it('notifying again for the same request adds nothing (one per admin)', async () => {
      const requestId = await requestIdOf('سلمى');
      const notifications = app.get(NotificationsService);
      const again = await prisma.$transaction((tx) =>
        notifications.notifyAdmins(tx, {
          type: 'REGISTRATION_REQUEST_SUBMITTED',
          entityType: 'REGISTRATION_REQUEST',
          entityId: requestId,
          title: 'طلب تسجيل جديد',
          message: 'مكرر',
          actorUserId: null,
        }),
      );
      expect(again).toBe(0);
      expect(await recipients(requestId)).toEqual([
        'admin',
        'admin2',
        'adminTeacher',
      ]);
      expect(
        await prisma.notification.count({
          where: { entityId: requestId, message: 'مكرر', userId: uid.admin },
        }),
      ).toBe(0);
    });

    it('only admins open the request it points to', async () => {
      const requestId = await requestIdOf('سلمى');
      await http()
        .get(`/api/admin/registration-requests/${requestId}`)
        .set(as('admin'))
        .expect(200);
      await http()
        .get(`/api/admin/registration-requests/${requestId}`)
        .set(as('sup'))
        .expect(403);
    });
  });

  describe('onboarding submissions', () => {
    it('a submission reaches every active admin once, naming who sent it and the class', async () => {
      await submit(token.link).expect(201);
      const submissionId = await submissionIdOf('يوسف');
      expect(await recipients(submissionId)).toEqual([
        'admin',
        'admin2',
        'adminTeacher',
      ]);
      const [n] = (await notificationsOf('adminTeacher')).filter(
        (x) => x.entityId === submissionId,
      );
      expect(n).toMatchObject({
        type: 'ONBOARDING_SUBMITTED',
        title: 'طلب استكمال جديد',
        message: `أرسل وليّ أمر الطالب يوسف ${tag('العيادي')} بياناته عبر رابط الاستكمال لقسم ${tag('مجموعة الماهر')} — ${tag('فرع المركز')}.`,
        entityType: 'ONBOARDING_SUBMISSION',
        available: true,
      });
      // The class's teacher and the students are not told
      expect(
        (await notificationsOf('sup')).filter(
          (x) => x.entityId === submissionId,
        ),
      ).toHaveLength(0);
      expect(
        (await notificationsOf('pupil')).filter(
          (x) => x.entityId === submissionId,
        ),
      ).toHaveLength(0);
    });

    it('a female student sending her own data is named as such', async () => {
      await submit(token.link, {
        submittedBy: 'STUDENT',
        firstName: 'مريم',
        gender: 'FEMALE',
        dateOfBirth: '2001-05-05',
        phone: '55443322',
        guardianPhone: undefined,
      }).expect(201);
      const submissionId = await submissionIdOf('مريم');
      const row = await prisma.notification.findFirstOrThrow({
        where: { entityId: submissionId, userId: uid.admin },
      });
      expect(row.message).toBe(
        `أرسلت الطالبة مريم ${tag('العيادي')} بياناتها عبر رابط الاستكمال لقسم ${tag('مجموعة الماهر')} — ${tag('فرع المركز')}.`,
      );
    });

    it('the anti-spam field, a revoked link or invalid data notify nobody', async () => {
      const before = await prisma.notification.count({
        where: { userId: uid.admin },
      });
      // Honeypot: accepted silently, never stored
      await submit(token.link, {
        firstName: 'روبوت',
        website: 'http://spam.example',
      }).expect(201);
      // Invalid data
      await submit(token.link, { firstName: 'ناقص', dateOfBirth: 'x' }).expect(
        400,
      );
      await adminPost(`student-onboarding/links/${id.link}/revoke`).expect(200);
      await submit(token.link, { firstName: 'متأخر' }).expect(404);
      expect(
        await prisma.notification.count({ where: { userId: uid.admin } }),
      ).toBe(before);
    });

    it('only admins open the submission it points to', async () => {
      const submissionId = await submissionIdOf('يوسف');
      await http()
        .get(`/api/admin/student-onboarding/submissions/${submissionId}`)
        .set(as('admin2'))
        .expect(200);
      await http()
        .get(`/api/admin/student-onboarding/submissions/${submissionId}`)
        .set(as('sup'))
        .expect(403);
    });
  });
});
