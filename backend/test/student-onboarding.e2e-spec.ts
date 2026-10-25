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
import { todayIn } from '../src/common/dates.js';
import { Role } from '../src/generated/prisma/enums.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { OnboardingRateLimiter } from '../src/student-onboarding/student-onboarding.controller.js';
import { schoolYearStart } from '../src/student-onboarding/student-onboarding.service.js';

const RUN = randomUUID().slice(0, 8);
const PASSWORD = 'initial-pass-123';
const tag = (s: string) => `${s} ${RUN}`;
const TODAY = todayIn('Africa/Tunis');
const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const IN_A_WEEK = `${addDays(TODAY, 7)}T20:00`;
const tokenOf = (url: string) => url.split('/student-info/')[1];
// A valid 1×1 PNG
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

/**
 * TEMPORARY «استكمال بيانات الطلبة»: links per class, public submissions,
 * admin review (create / match / reject), duplicates, expiry, feature flag.
 */
describe('Student onboarding — temporary module (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let limiter: OnboardingRateLimiter;
  const id: Record<string, string> = {};
  const token: Record<string, string> = {};

  const http = () => request(app.getHttpServer());
  const as = (who: string) => ({ Authorization: `Bearer ${token[who]}` });
  const admin = {
    get: (path: string, query: object = {}) =>
      http()
        .get(`/api/admin/student-onboarding/${path}`)
        .query(query)
        .set(as('admin')),
    post: (path: string, body: object = {}) =>
      http()
        .post(`/api/admin/student-onboarding/${path}`)
        .set(as('admin'))
        .send(body),
    patch: (path: string, body: object) =>
      http()
        .patch(`/api/admin/student-onboarding/${path}`)
        .set(as('admin'))
        .send(body),
  };
  const academic = (path: string, body: object = {}) =>
    http().post(`/api/admin/${path}`).set(as('admin')).send(body);
  const resolve = (t: string) =>
    http().post('/api/public/student-onboarding/resolve').send({ token: t });
  const submit = (t: string, fields: object = {}) =>
    http()
      .post('/api/public/student-onboarding/submissions')
      .send({
        token: t,
        submittedBy: 'GUARDIAN',
        consent: true,
        firstName: 'يوسف',
        lastName: tag('العيادي'),
        gender: 'MALE',
        dateOfBirth: '2015-03-10',
        address: 'نابل، شارع الحبيب بورقيبة',
        guardianPhone: '98765432',
        ...fields,
      });
  /** The public form as multipart: `data` (the JSON) + `photo`. */
  const submitWithPhoto = (
    t: string,
    photo: { bytes: Buffer; name: string; type: string },
    fields: object = {},
  ) =>
    http()
      .post('/api/public/student-onboarding/submissions')
      .field(
        'data',
        JSON.stringify({
          token: t,
          submittedBy: 'STUDENT',
          consent: true,
          firstName: 'صورة',
          lastName: tag('المصوّر'),
          gender: 'FEMALE',
          dateOfBirth: '2001-07-21',
          address: 'سوسة',
          phone: '55443322',
          ...fields,
        }),
      )
      .attach('photo', photo.bytes, {
        filename: photo.name,
        contentType: photo.type,
      });
  const submissionsOf = (linkId: string) =>
    prisma.onboardingSubmission.findMany({
      where: { onboardingLinkId: linkId },
      orderBy: { createdAt: 'asc' },
    });

  /** STUDENT_ONBOARDING_ENABLED for this app (the env is read once, at import time). */
  let restoreFlag: (() => void) | undefined;
  function setFlag(enabled: boolean) {
    restoreFlag?.();
    const config = app.get(ConfigService);
    const original = config.get.bind(config);
    const spy = vi
      .spyOn(config, 'get')
      .mockImplementation(((key: string, options?: object) =>
        key === 'STUDENT_ONBOARDING_ENABLED'
          ? enabled
          : original(key, options)) as typeof config.get);
    restoreFlag = () => spy.mockRestore();
  }

  async function account(key: string, roles: Role[], teacher = false) {
    const person = await prisma.person.create({
      data: {
        firstName: key,
        lastName: tag('حساب'),
        ...(teacher
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
      select: { id: true, teacher: { select: { id: true } } },
    });
    if (teacher) id[key] = person.teacher!.id;
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
    limiter = app.get(OnboardingRateLimiter);
    // The temporary module is OFF by default (STUDENT_ONBOARDING_ENABLED): turn it on here
    setFlag(true);

    await account('admin', [Role.ADMIN]);
    await account('sup', [Role.TEACHER], true);
    await account('pupil', [Role.STUDENT]);
    id.branch = (
      await academic('branches', { name: tag('فرع'), address: 'نابل' }).expect(
        201,
      )
    ).body.id;
    id.group = (
      await academic('groups', { name: tag('مجموعة الماهر') }).expect(201)
    ).body.id;
    const cls = async (key: string) =>
      (id[key] = (
        await academic('group-classes', {
          groupId: id.group,
          branchId: id.branch,
          supervisorId: id.sup,
        }).expect(201)
      ).body.id);
    await cls('C');
    await cls('C2');
    await cls('D');
    // An existing student (class D) — the one a duplicate submission is about
    id.existing = (
      await academic('students', {
        person: {
          firstName: 'مريم',
          lastName: tag('بن عمر'),
          gender: 'FEMALE',
          dateOfBirth: '2014-05-01',
          address: 'العنوان الأصلي',
        },
        groupClassId: id.D,
        registrationDate: addDays(TODAY, -100),
        guardianPhone: '22111222',
      }).expect(201)
    ).body.id;
  });

  beforeEach(() => limiter.reset());

  afterAll(async () => {
    vi.restoreAllMocks();
    const classes = { group: { name: { endsWith: RUN } } };
    await prisma.onboardingSubmission.deleteMany({
      where: { groupClass: classes },
    });
    await prisma.onboardingLink.deleteMany({ where: { groupClass: classes } });
    const persons = (
      await prisma.person.findMany({
        where: { lastName: { endsWith: RUN } },
        select: { id: true },
      })
    ).map((p) => p.id);
    const students = { personId: { in: persons } };
    await prisma.paymentObligation.deleteMany({ where: { student: students } });
    await prisma.studentEnrollment.deleteMany({ where: { student: students } });
    await prisma.studentStatusChange.deleteMany({
      where: { student: students },
    });
    await prisma.student.deleteMany({ where: students });
    await prisma.groupClassAssistant.deleteMany({
      where: { groupClass: classes },
    });
    await prisma.session.deleteMany({ where: { groupClass: classes } });
    await prisma.weeklySchedule.deleteMany({ where: { groupClass: classes } });
    await prisma.room.deleteMany({
      where: { branch: { name: { endsWith: RUN } } },
    });
    await prisma.groupClass.deleteMany({ where: classes });
    await prisma.groupFee
      .deleteMany({ where: { group: { name: { endsWith: RUN } } } })
      .catch(() => undefined);
    // Profile photos copied at approval (uploaded by this run's admin)
    await prisma.person.updateMany({
      where: { id: { in: persons } },
      data: { photoFileId: null, photoUrl: null },
    });
    await prisma.storedFile.deleteMany({
      where: { uploadedBy: { personId: { in: persons } } },
    });
    await prisma.teacher.deleteMany({ where: { personId: { in: persons } } });
    await prisma.user.deleteMany({ where: { personId: { in: persons } } });
    await prisma.person.deleteMany({ where: { id: { in: persons } } });
    await prisma.branch.deleteMany({ where: { name: { endsWith: RUN } } });
    await prisma.group.deleteMany({ where: { name: { endsWith: RUN } } });
    await app.close();
  });

  // ───────────────────────── links ─────────────────────────

  describe('links', () => {
    it('one secure, unpredictable link per class; the token is never stored in clear', async () => {
      const res = await admin
        .post('links', { groupClassId: id.C, expiresAt: IN_A_WEEK })
        .expect(201);
      expect(res.body.url).toMatch(
        /^https?:\/\/[^/]+\/student-info\/[A-Za-z0-9_-]{43}$/,
      );
      expect(res.body).toMatchObject({
        status: 'ACTIVE',
        groupClass: { id: id.C, group: { name: tag('مجموعة الماهر') } },
        submissions: { total: 0, pending: 0, approved: 0, rejected: 0 },
      });
      id.link = res.body.id;
      token.link = tokenOf(res.body.url);
      expect(token.link).not.toContain(id.C);
      const row = await prisma.onboardingLink.findUniqueOrThrow({
        where: { id: id.link },
      });
      expect(row.tokenHash).toHaveLength(64);
      expect(row.tokenHash).not.toBe(token.link);
      expect(row.tokenSealed).not.toContain(token.link);
      // A second link for the class is refused (extend or replace instead)
      expect(
        (
          await admin
            .post('links', { groupClassId: id.C, expiresAt: IN_A_WEEK })
            .expect(409)
        ).body,
      ).toMatchObject({
        code: 'ONBOARDING_LINK_EXISTS',
        linkId: id.link,
      });
      // Even at the same moment: exactly one
      const both = await Promise.all([
        admin.post('links', { groupClassId: id.C2, expiresAt: IN_A_WEEK }),
        admin.post('links', { groupClassId: id.C2, expiresAt: IN_A_WEEK }),
      ]);
      expect(both.map((r) => r.status).sort((a, b) => a - b)).toEqual([
        201, 409,
      ]);
      expect(
        await prisma.onboardingLink.count({
          where: { groupClassId: id.C2, revokedAt: null },
        }),
      ).toBe(1);
      await admin
        .post('links', {
          groupClassId: id.D,
          expiresAt: `${addDays(TODAY, -1)}T08:00`,
        })
        .expect(400);
    });

    it('lists never carry the token; the URL is revealed on explicit request', async () => {
      const list = (await admin.get('links').expect(200)).body as {
        id: string;
      }[];
      expect(JSON.stringify(list)).not.toContain(token.link);
      expect(list.find((l) => l.id === id.link)).not.toHaveProperty('url');
      expect(
        (await admin.get(`links/${id.link}/url`).expect(200)).body.url,
      ).toContain(token.link);
    });

    it('only admins manage links', async () => {
      await http()
        .get('/api/admin/student-onboarding/links')
        .set(as('sup'))
        .expect(403);
      await http()
        .post('/api/admin/student-onboarding/links')
        .set(as('pupil'))
        .send({ groupClassId: id.D, expiresAt: IN_A_WEEK })
        .expect(403);
      await http().get('/api/admin/student-onboarding/links').expect(401);
    });
  });

  // ───────────────────────── public form ─────────────────────────

  describe('public form', () => {
    it('shows the link’s class (read-only) with its weekly schedule, without any id', async () => {
      expect((await resolve(token.link).expect(200)).body.schedule).toEqual([]);
      const room = (
        await academic('rooms', { branchId: id.branch, name: tag('قاعة') })
      ).body.id;
      const slot = (classId: string, body: object) =>
        academic(`group-classes/${classId}/schedules`, {
          roomId: room,
          ...body,
        }).expect(201);
      // Its own slot, a shared slot hosted by another class, another class's slot
      await slot(id.C, {
        dayOfWeek: 'SUN',
        startTime: '09:00',
        endTime: '11:00',
      });
      await slot(id.C2, {
        dayOfWeek: 'TUE',
        startTime: '17:00',
        endTime: '18:30',
        additionalGroupClassIds: [id.C],
      });
      await slot(id.D, {
        dayOfWeek: 'WED',
        startTime: '15:00',
        endTime: '16:00',
      });
      const info = (await resolve(token.link).expect(200)).body;
      expect(info).toEqual({
        branchName: tag('فرع'),
        groupName: tag('مجموعة الماهر'),
        supervisorName: `sup ${tag('حساب')}`,
        // In week order (MON…SUN); never its room nor any id
        schedule: [
          { day: 'TUE', start: '17:00', end: '18:30' },
          { day: 'SUN', start: '09:00', end: '11:00' },
        ],
      });
      expect((await resolve('A'.repeat(43)).expect(404)).body.code).toBe(
        'ONBOARDING_LINK_INVALID',
      );
      await resolve('not-a-token').expect(400);
    });

    it('a submission is PENDING in the link’s class — no student, no account', async () => {
      const before = await prisma.student.count();
      expect((await submit(token.link).expect(201)).body).toEqual({
        received: true,
      });
      const [sub] = await submissionsOf(id.link);
      expect(sub).toMatchObject({
        status: 'PENDING',
        groupClassId: id.C,
        firstName: 'يوسف',
        approvedStudentId: null,
      });
      expect(await prisma.student.count()).toBe(before);
      expect(
        await prisma.user.count({
          where: { person: { lastName: tag('العيادي') } },
        }),
      ).toBe(0);
    });

    it('the class cannot be chosen or tampered with; no account data is accepted', async () => {
      await submit(token.link, { groupClassId: id.D }).expect(400);
      await submit(token.link, { password: 'x123456789' }).expect(400);
      await submit(token.link, { username: 'abc' }).expect(400);
      expect(
        (await submissionsOf(id.link)).every((s) => s.groupClassId === id.C),
      ).toBe(true);
    });

    it('the student form’s rules: a minor needs a guardian phone; consent required; honeypot ignored', async () => {
      expect(
        (await submit(token.link, { guardianPhone: null }).expect(400)).body
          .code,
      ).toBe('GUARDIAN_PHONE_REQUIRED');
      expect(
        (
          await submit(token.link, { dateOfBirth: addDays(TODAY, 3) }).expect(
            400,
          )
        ).body.code,
      ).toBe('DATE_OF_BIRTH_INVALID');
      await submit(token.link, { consent: false }).expect(400);
      await submit(token.link, { firstName: '' }).expect(400);
      const count = (await submissionsOf(id.link)).length;
      await submit(token.link, { website: 'http://spam.example' }).expect(201);
      expect((await submissionsOf(id.link)).length).toBe(count);
    });

    it('is rate limited per client', async () => {
      for (let i = 0; i < 5; i++)
        await submit(token.link, { firstName: `ف${i}` }).expect(201);
      expect((await submit(token.link).expect(429)).body.code).toBe(
        'TOO_MANY_REQUESTS',
      );
    });
  });

  // ───────────────────────── expiry / revoke / replace ─────────────────────────

  describe('expiry, revocation, replacement', () => {
    it('an expired link refuses submissions; existing ones stay; extending re-opens it', async () => {
      const existing = (await submissionsOf(id.link)).length;
      await prisma.onboardingLink.update({
        where: { id: id.link },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      expect((await resolve(token.link).expect(410)).body.code).toBe(
        'ONBOARDING_LINK_EXPIRED',
      );
      expect((await submit(token.link).expect(410)).body.message).toContain(
        'انتهت صلاحية رابط استكمال البيانات',
      );
      expect(
        (await admin.get('links', { status: 'EXPIRED' }).expect(200)).body.map(
          (l: { id: string }) => l.id,
        ),
      ).toContain(id.link);
      expect((await submissionsOf(id.link)).length).toBe(existing);
      const extended = (
        await admin
          .patch(`links/${id.link}`, { expiresAt: IN_A_WEEK })
          .expect(200)
      ).body;
      expect(extended.status).toBe('ACTIVE');
      await submit(token.link, { firstName: 'بعد التمديد' }).expect(201);
      await admin
        .patch(`links/${id.link}`, { expiresAt: `${addDays(TODAY, -2)}T08:00` })
        .expect(400);
    });

    it('a replaced link stops at once; the new one works; submissions keep their class', async () => {
      const replaced = (
        await admin
          .post(`links/${id.link}/replace`, { expiresAt: IN_A_WEEK })
          .expect(201)
      ).body;
      expect(replaced.groupClass.id).toBe(id.C);
      const fresh = tokenOf(replaced.url);
      expect(fresh).not.toBe(token.link);
      await resolve(token.link).expect(404);
      await submit(token.link).expect(404);
      await resolve(fresh).expect(200);
      const old = (await admin.get('links').expect(200)).body.find(
        (l: { id: string }) => l.id === id.link,
      );
      expect(old.status).toBe('REVOKED');
      // Its submissions remain, for review
      expect(old.submissions.total).toBeGreaterThan(0);
      id.link = replaced.id;
      token.link = fresh;
    });

    it('a revoked link refuses everything and cannot be extended', async () => {
      const other = (
        await admin
          .post('links', { groupClassId: id.D, expiresAt: IN_A_WEEK })
          .expect(201)
      ).body;
      await admin.post(`links/${other.id}/revoke`).expect(200);
      await resolve(tokenOf(other.url)).expect(404);
      await submit(tokenOf(other.url)).expect(404);
      expect(
        (
          await admin
            .patch(`links/${other.id}`, { expiresAt: IN_A_WEEK })
            .expect(409)
        ).body.code,
      ).toBe('ONBOARDING_LINK_REVOKED');
      id.linkD = (
        await admin
          .post(`links/${other.id}/replace`, { expiresAt: IN_A_WEEK })
          .expect(201)
      ).body.id;
    });
  });

  // ───────────────────────── review ─────────────────────────

  describe('admin review', () => {
    it('lists with filters and search; never public', async () => {
      const all = (
        await admin
          .get('submissions', {
            groupClassId: id.C,
            status: 'PENDING',
            pageSize: 100,
          })
          .expect(200)
      ).body;
      expect(all.meta.total).toBeGreaterThan(1);
      const byName = (
        await admin.get('submissions', { q: 'بعد التمديد' }).expect(200)
      ).body.data;
      expect(byName).toHaveLength(1);
      const byPhone = (
        await admin
          .get('submissions', {
            q: '98765432',
            groupId: id.group,
            pageSize: 100,
          })
          .expect(200)
      ).body;
      expect(byPhone.meta.total).toBe(all.meta.total);
      expect(
        (
          await admin
            .get('submissions', { from: addDays(TODAY, 1) })
            .expect(200)
        ).body.data.length,
      ).toBe(0);
      await http().get('/api/admin/student-onboarding/submissions').expect(401);
      await http()
        .get('/api/admin/student-onboarding/submissions')
        .set(as('pupil'))
        .expect(403);
      await http()
        .get('/api/admin/student-onboarding/submissions')
        .set(as('sup'))
        .expect(403);
      id.sub = byName[0].id;
    });

    it('corrections keep the original; a stale edit is refused', async () => {
      const before = (await admin.get(`submissions/${id.sub}`).expect(200))
        .body;
      const edited = (
        await admin
          .patch(`submissions/${id.sub}`, {
            version: before.version,
            firstName: 'يوسف',
            lastName: tag('العيادي'),
            gender: 'MALE',
            dateOfBirth: '2015-03-10',
            address: 'نابل',
            guardianPhone: '98765432',
          })
          .expect(200)
      ).body;
      expect(edited).toMatchObject({
        firstName: 'يوسف',
        edited: true,
        version: before.version + 1,
      });
      expect(edited.originalData.firstName).toBe('بعد التمديد');
      await admin
        .patch(`submissions/${id.sub}`, {
          ...edited,
          version: before.version,
          id: undefined,
        })
        .expect(400); // unknown fields (id, status…) are refused
    });

    it('approval creates the student through the regular path, in the link’s class — once', async () => {
      const sub = (await admin.get(`submissions/${id.sub}`).expect(200)).body;
      const both = await Promise.all([
        admin.post(`submissions/${id.sub}/approve`, { version: sub.version }),
        admin.post(`submissions/${id.sub}/approve`, { version: sub.version }),
      ]);
      expect(both.map((r) => r.status).sort((a, b) => a - b)).toEqual([
        200, 409,
      ]);
      const ok = both.find((r) => r.status === 200)!.body;
      expect(ok).toMatchObject({ status: 'APPROVED', linkedExisting: false });
      const student = await prisma.student.findUniqueOrThrow({
        where: { id: ok.approvedStudentId },
        include: { person: true, enrollments: true, statusChanges: true },
      });
      expect(student).toMatchObject({
        groupClassId: id.C,
        guardianPhone: '98765432',
        status: 'ACTIVE',
      });
      expect(student.person).toMatchObject({
        firstName: 'يوسف',
        address: 'نابل',
      });
      expect(student.enrollments).toHaveLength(1);
      expect(student.enrollments[0].groupClassId).toBe(id.C);
      expect(student.statusChanges).toHaveLength(1);
      expect(
        await prisma.user.count({ where: { personId: student.personId } }),
      ).toBe(0); // no account
      expect(
        await prisma.student.count({
          where: { person: { firstName: 'يوسف', lastName: tag('العيادي') } },
        }),
      ).toBe(1);
      id.approved = student.id;
      expect(
        (
          await admin
            .post(`submissions/${id.sub}/approve`, { version: ok.version })
            .expect(409)
        ).body.code,
      ).toBe('ONBOARDING_NOT_PENDING');
      // Teachers never approve
      const another = (
        await admin
          .get('submissions', { status: 'PENDING', groupClassId: id.C })
          .expect(200)
      ).body.data[0];
      await http()
        .post(`/api/admin/student-onboarding/submissions/${another.id}/approve`)
        .set(as('sup'))
        .send({ version: another.version })
        .expect(403);
    });

    it('a possible duplicate is shown, never merged; linking matches the existing student without overwriting them', async () => {
      await submit(token.link, {
        firstName: 'مريم',
        lastName: tag('بن عمر'),
        gender: 'FEMALE',
        dateOfBirth: '2014-05-01',
        address: 'عنوان جديد مختلف',
        guardianPhone: '22111222',
      }).expect(201);
      const dup = (await admin.get('submissions', { q: 'مريم' }).expect(200))
        .body.data[0];
      const detail = (await admin.get(`submissions/${dup.id}`).expect(200))
        .body;
      expect(detail.possibleMatches).toEqual([
        expect.objectContaining({
          studentId: id.existing,
          reasons: expect.arrayContaining([
            'NAME',
            'BIRTH_DATE',
            'GUARDIAN_PHONE',
          ]),
        }),
      ]);
      expect(
        (
          await admin
            .post(`submissions/${dup.id}/approve`, { version: detail.version })
            .expect(409)
        ).body,
      ).toMatchObject({
        code: 'ONBOARDING_POSSIBLE_DUPLICATE',
        message: 'قد يكون هذا الطالب مسجلاً مسبقاً في المنظومة.',
      });
      const linked = (
        await admin
          .post(`submissions/${dup.id}/link`, {
            version: detail.version,
            studentId: id.existing,
          })
          .expect(200)
      ).body;
      expect(linked).toMatchObject({
        status: 'APPROVED',
        linkedExisting: true,
        approvedStudentId: id.existing,
      });
      const existing = await prisma.student.findUniqueOrThrow({
        where: { id: id.existing },
        include: {
          person: true,
          enrollments: { orderBy: { startDate: 'asc' } },
        },
      });
      // Placed in the link's class with the regular rules; personal data untouched
      expect(existing.groupClassId).toBe(id.C);
      expect(existing.person.address).toBe('العنوان الأصلي');
      expect(
        existing.enrollments.filter((e) => e.endDate === null),
      ).toHaveLength(1);
      expect(
        await prisma.student.count({
          where: { person: { lastName: tag('بن عمر') } },
        }),
      ).toBe(1);
    });

    it('confirming "not a duplicate" creates a distinct student; rejection creates nothing', async () => {
      await submit(token.link, {
        firstName: 'آدم',
        lastName: tag('الشابي'),
        guardianPhone: '22111222', // a sibling sharing the family phone
      }).expect(201);
      const sib = (await admin.get('submissions', { q: 'آدم' }).expect(200))
        .body.data[0];
      const detail = (await admin.get(`submissions/${sib.id}`).expect(200))
        .body;
      expect(detail.possibleMatches[0].reasons).toEqual(['GUARDIAN_PHONE']);
      await admin
        .post(`submissions/${sib.id}/approve`, { version: detail.version })
        .expect(409);
      const created = (
        await admin
          .post(`submissions/${sib.id}/approve`, {
            version: detail.version,
            confirmNoDuplicate: true,
          })
          .expect(200)
      ).body;
      expect(created.approvedStudentId).not.toBe(id.existing);

      const toReject = (
        await admin
          .get('submissions', { status: 'PENDING', groupClassId: id.C })
          .expect(200)
      ).body.data[0];
      const before = await prisma.student.count();
      const rejected = (
        await admin
          .post(`submissions/${toReject.id}/reject`, {
            version: toReject.version,
            reason: 'بيانات غير صحيحة',
          })
          .expect(200)
      ).body;
      expect(rejected).toMatchObject({
        status: 'REJECTED',
        rejectionReason: 'بيانات غير صحيحة',
        approvedStudentId: null,
      });
      expect(await prisma.student.count()).toBe(before);
    });
  });

  // ───────────────────────── photo ─────────────────────────

  describe('photo', () => {
    it('optional photo (multipart): images only, viewable by admins only', async () => {
      const before = await prisma.onboardingSubmission.count();
      expect(
        (
          await submitWithPhoto(token.link, {
            bytes: Buffer.from('not an image at all'),
            name: 'x.png',
            type: 'image/png',
          }).expect(400)
        ).body.code,
      ).toBe('FILE_TYPE_NOT_ALLOWED');
      await http()
        .post('/api/public/student-onboarding/submissions')
        .field('data', '{oops')
        .expect(400);
      expect(await prisma.onboardingSubmission.count()).toBe(before);

      await submitWithPhoto(token.link, {
        bytes: PNG,
        name: 'me.png',
        type: 'image/png',
      }).expect(201);
      const [listed] = (
        await admin.get('submissions', { q: 'صورة' }).expect(200)
      ).body.data;
      expect(listed).toMatchObject({ hasPhoto: true, submittedBy: 'STUDENT' });
      id.photoSub = listed.id;
      const photo = await admin
        .get(`submissions/${id.photoSub}/photo`)
        .buffer(true)
        .expect(200);
      expect(photo.headers['content-type']).toBe('image/png');
      expect(photo.headers['cache-control']).toContain('no-store');
      expect(Buffer.compare(photo.body as Buffer, PNG)).toBe(0);
      await http()
        .get(`/api/admin/student-onboarding/submissions/${id.photoSub}/photo`)
        .expect(401);
      await http()
        .get(`/api/admin/student-onboarding/submissions/${id.photoSub}/photo`)
        .set(as('pupil'))
        .expect(403);
      // Without a photo: none
      expect(
        (await admin.get(`submissions/${id.sub}/photo`).expect(404)).body.code,
      ).toBe('ONBOARDING_PHOTO_NOT_FOUND');
    });

    it('approval: the photo becomes a regular profile photo, registered on 1 September', async () => {
      const sub = (await admin.get(`submissions/${id.photoSub}`).expect(200))
        .body;
      const ok = (
        await admin
          .post(`submissions/${id.photoSub}/approve`, {
            version: sub.version,
            confirmNoDuplicate: true,
          })
          .expect(200)
      ).body;
      const student = await prisma.student.findUniqueOrThrow({
        where: { id: ok.approvedStudentId },
        include: { person: true, enrollments: true },
      });
      expect(student.registrationDate.toISOString().slice(0, 10)).toBe(
        schoolYearStart(TODAY),
      );
      expect(student.enrollments[0].startDate.toISOString().slice(0, 10)).toBe(
        schoolYearStart(TODAY),
      );
      const fileId = student.person.photoFileId!;
      expect(student.person.photoUrl).toBe(`/api/files/${fileId}`);
      const file = await prisma.storedFile.findUniqueOrThrow({
        where: { id: fileId },
      });
      expect(file).toMatchObject({
        purpose: 'PROFILE_PHOTO',
        mimeType: 'image/png',
        size: PNG.length,
      });
      const reviewed = await prisma.onboardingSubmission.findUniqueOrThrow({
        where: { id: id.photoSub },
      });
      expect(file.uploadedByUserId).toBe(reviewed.reviewedByUserId);

      // Independent of the temporary tables
      await prisma.onboardingPhoto.delete({
        where: { submissionId: id.photoSub },
      });
      const served = await http()
        .get(`/api/files/${fileId}`)
        .set(as('admin'))
        .buffer(true)
        .expect(200);
      expect(Buffer.compare(served.body as Buffer, PNG)).toBe(0);
      id.photoStudent = student.id;
    });

    it('«ربط بطالب موجود» never replaces an existing photo', async () => {
      await submitWithPhoto(token.link, {
        bytes: PNG,
        name: 'again.png',
        type: 'image/png',
      }).expect(201);
      const [again] = (
        await admin
          .get('submissions', { q: 'صورة', status: 'PENDING' })
          .expect(200)
      ).body.data;
      const before = await prisma.student.findUniqueOrThrow({
        where: { id: id.photoStudent },
        include: { person: true },
      });
      await admin
        .post(`submissions/${again.id}/link`, {
          version: again.version,
          studentId: id.photoStudent,
        })
        .expect(200);
      const after = await prisma.student.findUniqueOrThrow({
        where: { id: id.photoStudent },
        include: { person: true },
      });
      expect(after.person.photoFileId).toBe(before.person.photoFileId);
    });
  });

  // ───────────────────────── isolation ─────────────────────────

  describe('isolation and the feature flag', () => {
    it('revoking links never touches approved students', async () => {
      await admin.post(`links/${id.link}/revoke`).expect(200);
      const student = await prisma.student.findUniqueOrThrow({
        where: { id: id.approved },
        include: { enrollments: true },
      });
      expect(student.enrollments).toHaveLength(1);
      await http()
        .get(`/api/admin/students/${id.approved}`)
        .set(as('admin'))
        .expect(200);
    });

    it('flag off: public form and every change refused; reads, students and registration requests unaffected', async () => {
      setFlag(false);
      try {
        expect((await admin.get('status').expect(200)).body).toEqual({
          enabled: false,
        });
        expect((await resolve(token.link).expect(404)).body.code).toBe(
          'STUDENT_ONBOARDING_DISABLED',
        );
        await submit(token.link).expect(404);
        await admin
          .post('links', { groupClassId: id.C2, expiresAt: IN_A_WEEK })
          .expect(404);
        await admin
          .patch(`links/${id.linkD}`, { expiresAt: IN_A_WEEK })
          .expect(404);
        await admin
          .post(`submissions/${id.sub}/reject`, { version: 1 })
          .expect(404);
        // Reads stay (stored submissions remain consultable)
        await admin.get('submissions').expect(200);
        // Permanent data and the rest of the platform are unaffected
        await http()
          .get(`/api/admin/students/${id.approved}`)
          .set(as('admin'))
          .expect(200);
        await http().get('/api/admin/students').set(as('admin')).expect(200);
        await http()
          .get('/api/admin/registration-requests')
          .set(as('admin'))
          .expect(200);
      } finally {
        setFlag(true);
      }
      expect((await admin.get('status').expect(200)).body).toEqual({
        enabled: true,
      });
    });
  });
});
