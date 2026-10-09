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
import { RegistrationRateLimiter } from '../src/registration/registration-rate-limit.guard.js';
import { classRooms } from './class-rooms.js';

const RUN = randomUUID().slice(0, 8);
const PASSWORD = 'initial-pass-123';
const tag = (s: string) => `${s} ${RUN}`;
const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const TODAY = todayIn('Africa/Tunis');

describe('Registration requests, fees & cash payments (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let limiter: RegistrationRateLimiter;
  const token: Record<string, string> = {};
  const id: Record<string, string> = {};

  const http = () => request(app.getHttpServer());
  const as = (t: string) => ({ Authorization: `Bearer ${t}` });
  // Each class's usual room: applied to its weekly slots / ad-hoc sessions (rooms are per slot)
  const rooms = classRooms();
  const admin = {
    get: (path: string, query: object = {}) =>
      http().get(`/api/admin/${path}`).query(query).set(as(token.admin)),
    post: (path: string, body: object = {}) =>
      rooms.post(path, body, (b) =>
        http().post(`/api/admin/${path}`).set(as(token.admin)).send(b),
      ),
    put: (path: string, body: object) =>
      http().put(`/api/admin/${path}`).set(as(token.admin)).send(body),
    patch: (path: string, body: object) =>
      http().patch(`/api/admin/${path}`).set(as(token.admin)).send(body),
  };
  const rawSubmit = (body: object) =>
    http().post('/api/public/registration-requests').send(body);
  /** Public submission with a fresh rate-limit window (the limit has its own test). */
  const submit = (body: object) => {
    limiter.reset();
    return rawSubmit(body);
  };

  /** Distinct phones: equal phones are (rightly) flagged as possible duplicates. */
  let phoneSeq = 0;
  const nextPhone = () => `2${String(1_000_000 + ++phoneSeq).padStart(7, '0')}`;

  /** A valid public form (adult applicant); lastName carries the run tag. */
  const form = (first: string, extra: object = {}) => ({
    firstName: first,
    lastName: tag('مترشح'),
    birthDate: '1990-04-12',
    phone: nextPhone(),
    hasStudiedQuranBefore: true,
    ...extra,
  });

  async function account(key: string, roles: Role[], withTeacher = false) {
    const person = await prisma.person.create({
      data: {
        firstName: key,
        lastName: tag('حساب'),
        ...(withTeacher
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
      select: { teacher: { select: { id: true } } },
    });
    if (withTeacher) id[key] = person.teacher!.id;
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

  /** Student created through the students API (in the class, since `from`). */
  async function student(key: string, classKey: string, from = TODAY) {
    id[key] = (
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
          registrationDate: from,
          guardianPhone: '98765432',
        })
        .expect(201)
    ).body.id;
  }

  /** Admin-entered PENDING request; returns its id. */
  const pending = async (first: string, extra: object = {}) =>
    (await admin.post('registration-requests', form(first, extra)).expect(201))
      .body.id as string;

  const obligation = async (studentKey: string, feeKey: string) =>
    (
      await admin
        .post('payment-obligations', {
          studentId: id[studentKey],
          groupFeeId: id[feeKey],
        })
        .expect(201)
    ).body;

  const pay = (obligationId: string, amount: string | number, extra = {}) =>
    admin.post('payments', { obligationId, amount, ...extra });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    limiter = app.get(RegistrationRateLimiter);

    await account('admin', [Role.ADMIN]);
    await account('sup', [Role.TEACHER], true);
    await account('pupil', [Role.STUDENT]);

    const branch = async (key: string) =>
      (id[key] = (
        await admin
          .post('branches', { name: tag(key), address: 'نابل' })
          .expect(201)
      ).body.id);
    const room = async (key: string, branchKey: string) =>
      (id[key] = (
        await admin
          .post('rooms', { branchId: id[branchKey], name: tag(key) })
          .expect(201)
      ).body.id);
    const group = async (key: string) =>
      (id[key] = (
        await admin
          .post('groups', { name: tag(key), audience: 'أطفال' })
          .expect(201)
      ).body.id);
    const cls = async (
      key: string,
      groupKey: string,
      branchKey: string,
      roomKey: string,
    ) =>
      (id[key] = (
        await admin
          .post('group-classes', {
            groupId: id[groupKey],
            branchId: id[branchKey],
            roomId: id[roomKey],
            supervisorId: id.sup,
          })
          .expect(201)
      ).body.id);

    await branch('B1');
    await branch('B2');
    await room('R1', 'B1');
    await room('R2', 'B2');
    await group('G1');
    await group('G2');
    await cls('C1', 'G1', 'B1', 'R1');
    await cls('C1b', 'G1', 'B2', 'R2');
    await cls('C2', 'G2', 'B2', 'R2');

    // Classes whose class / group / branch are inactive (acceptance checks)
    await branch('Boff');
    await room('Roff', 'Boff');
    await group('Goff');
    await cls('Cinactive', 'G1', 'B1', 'R1');
    await cls('CgroupOff', 'Goff', 'B1', 'R1');
    await cls('CbranchOff', 'G1', 'Boff', 'Roff');
    await prisma.groupClass.update({
      where: { id: id.Cinactive },
      data: { status: 'INACTIVE' },
    });
    await prisma.group.update({
      where: { id: id.Goff },
      data: { status: 'INACTIVE' },
    });
    await prisma.branch.update({
      where: { id: id.Boff },
      data: { status: 'INACTIVE' },
    });

    const yearLabel = (n: string) => `${n}-${RUN.slice(0, 6)}`;
    id.year = (
      await admin
        .post('academic-years', {
          label: yearLabel('F1'),
          startDate: addDays(TODAY, -60),
          endDate: addDays(TODAY, 250),
          semester2StartDate: addDays(TODAY, 90),
        })
        .expect(201)
    ).body.id;
    id.prevYear = (
      await admin
        .post('academic-years', {
          label: yearLabel('F0'),
          startDate: addDays(TODAY, -430),
          endDate: addDays(TODAY, -70),
          semester2StartDate: addDays(TODAY, -250),
        })
        .expect(201)
    ).body.id;

    await student('S1', 'C1', addDays(TODAY, -30));
    await student('S2', 'C1');
    await student('S3', 'C2');
    await student('S4', 'C1b');
  });

  beforeEach(() => limiter.reset());

  afterAll(async () => {
    const persons = (
      await prisma.person.findMany({
        where: { lastName: { endsWith: RUN } },
        select: { id: true },
      })
    ).map((p) => p.id);
    const studentWhere = { personId: { in: persons } };
    const groups = { name: { endsWith: RUN } };
    await prisma.payment.deleteMany({
      where: { obligation: { group: groups } },
    });
    await prisma.paymentObligation.deleteMany({ where: { group: groups } });
    await prisma.groupFee.deleteMany({ where: { group: groups } });
    await prisma.registrationRequest.deleteMany({
      where: { lastName: { endsWith: RUN } },
    });
    await prisma.studentEnrollment.deleteMany({
      where: { student: studentWhere },
    });
    await prisma.studentStatusChange.deleteMany({
      where: { student: studentWhere },
    });
    await prisma.student.deleteMany({ where: studentWhere });
    await prisma.groupClass.deleteMany({ where: { group: groups } });
    await prisma.academicYear.deleteMany({
      where: { label: { endsWith: RUN.slice(0, 6) } },
    });
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

  /* ================================================================ */
  /* Public submission                                                */
  /* ================================================================ */

  describe('public registration', () => {
    it('accepts a submission without authentication and only acknowledges it', async () => {
      const res = await submit(form('عامّ', { phone: '22 345 678' })).expect(
        201,
      );
      expect(Object.keys(res.body).sort()).toEqual(['message', 'receivedAt']);
      const stored = await prisma.registrationRequest.findFirstOrThrow({
        where: { firstName: 'عامّ', lastName: tag('مترشح') },
      });
      expect(stored).toMatchObject({
        source: 'PUBLIC_WEBSITE',
        status: 'PENDING',
        phone: '22345678',
        createdByUserId: null,
        reviewedAt: null,
        createdStudentId: null,
      });
      // Never an account or a student
      expect(
        await prisma.person.count({
          where: { firstName: 'عامّ', lastName: tag('مترشح') },
        }),
      ).toBe(0);
    });

    it('never honors privileged fields (status, source, reviewer, student)', async () => {
      for (const extra of [
        { status: 'ACCEPTED' },
        { source: 'ADMIN' },
        { reviewedByUserId: randomUUID() },
        { createdStudentId: randomUUID() },
      ]) {
        await submit(form('امتياز', extra)).expect(400);
      }
      expect(
        await prisma.registrationRequest.count({
          where: { firstName: 'امتياز', lastName: tag('مترشح') },
        }),
      ).toBe(0);
    });

    it('validates birth date / age, phone and guardian contact', async () => {
      const code = async (body: object) => (await submit(body)).body.code;
      expect(await code(form('x', { birthDate: undefined }))).toBe(
        'BIRTH_DATE_OR_AGE_REQUIRED',
      );
      expect(await code(form('x', { age: 30 }))).toBe(
        'BIRTH_DATE_OR_AGE_REQUIRED',
      );
      expect(await code(form('x', { birthDate: addDays(TODAY, 1) }))).toBe(
        'INVALID_BIRTH_DATE',
      );
      expect(await code(form('x', { birthDate: addDays(TODAY, -365) }))).toBe(
        'INVALID_BIRTH_DATE',
      );
      await submit(form('x', { birthDate: '2020-02-30' })).expect(400);
      await submit(form('x', { birthDate: undefined, age: 2 })).expect(400);
      await submit(form('x', { phone: '12345678' })).expect(400);
      await submit(form('x', { phone: undefined })).expect(400);
      // Minor (by birth date or by age) → guardian phone required
      expect(await code(form('x', { birthDate: '2015-01-01' }))).toBe(
        'GUARDIAN_PHONE_REQUIRED',
      );
      expect(await code(form('x', { birthDate: undefined, age: 9 }))).toBe(
        'GUARDIAN_PHONE_REQUIRED',
      );
      await submit(
        form('قاصر', {
          birthDate: undefined,
          age: 9,
          guardianPhone: '98765432',
        }),
      ).expect(201);
    });

    it('validates the interested group without revealing whether it exists', async () => {
      const missing = await submit(
        form('x', { interestedGroupId: randomUUID() }),
      ).expect(400);
      const inactive = await submit(
        form('x', { interestedGroupId: id.Goff }),
      ).expect(400);
      expect(missing.body).toEqual(inactive.body);
      expect(missing.body.code).toBe('INTERESTED_GROUP_INVALID');
      await submit(form('مهتم', { interestedGroupId: id.G1 })).expect(201);
    });

    it('is rate-limited per client (429 after the configured maximum)', async () => {
      for (let i = 0; i < 5; i++) await rawSubmit(form(`حد${i}`)).expect(201);
      const res = await rawSubmit(form('حد5')).expect(429);
      expect(res.body.code).toBe('TOO_MANY_REQUESTS');
      // Invalid submissions count as well (no free probing)
      limiter.reset();
      for (let i = 0; i < 5; i++) await rawSubmit({}).expect(400);
      await rawSubmit(form('حد6')).expect(429);
    });
  });

  /* ================================================================ */
  /* Admin management                                                 */
  /* ================================================================ */

  describe('admin registration requests', () => {
    it('is ADMIN-only (teacher/student 403, anonymous 401)', async () => {
      const someId = await pending('حماية');
      const calls = (t?: string) => {
        const h = t ? as(t) : {};
        return [
          http().get('/api/admin/registration-requests').set(h),
          http().get(`/api/admin/registration-requests/${someId}`).set(h),
          http()
            .post('/api/admin/registration-requests')
            .set(h)
            .send(form('x')),
          http()
            .patch(`/api/admin/registration-requests/${someId}`)
            .set(h)
            .send({ notes: 'x' }),
          http()
            .post(`/api/admin/registration-requests/${someId}/accept`)
            .set(h)
            .send({ groupClassId: id.C1 }),
          http()
            .post(`/api/admin/registration-requests/${someId}/reject`)
            .set(h)
            .send({}),
        ];
      };
      for (const res of await Promise.all(calls(token.sup)))
        expect(res.status).toBe(403);
      for (const res of await Promise.all(calls(token.pupil)))
        expect(res.status).toBe(403);
      for (const res of await Promise.all(calls()))
        expect(res.status).toBe(401);
      expect(
        (
          await prisma.registrationRequest.findUniqueOrThrow({
            where: { id: someId },
          })
        ).status,
      ).toBe('PENDING');
    });

    it('creates ADMIN-source requests with the same rules', async () => {
      const res = await admin
        .post('registration-requests', form('إداري', { gender: 'FEMALE' }))
        .expect(201);
      expect(res.body).toMatchObject({
        source: 'ADMIN',
        status: 'PENDING',
        gender: 'FEMALE',
        birthDate: '1990-04-12',
        createdBy: { username: `e2e-${RUN}-admin` },
        reviewedBy: null,
        createdStudent: null,
      });
      await admin
        .post('registration-requests', form('x', { birthDate: '2016-01-01' }))
        .expect(400);
      await admin
        .post('registration-requests', form('x', { status: 'ACCEPTED' }))
        .expect(400);
      await admin.get(`registration-requests/${randomUUID()}`).expect(404);
    });

    it('lists with filters, search and pagination', async () => {
      await submit(form('بحث', { phone: '55 111 222' })).expect(201);
      const list = (q: object) =>
        admin.get('registration-requests', { search: RUN, ...q });
      const all = (await list({ pageSize: 100 }).expect(200)).body;
      expect(all.meta.total).toBeGreaterThanOrEqual(5);
      const pub = (await list({ source: 'PUBLIC_WEBSITE', pageSize: 100 }))
        .body;
      expect(
        pub.data.every(
          (r: { source: string }) => r.source === 'PUBLIC_WEBSITE',
        ),
      ).toBe(true);
      const adm = (await list({ source: 'ADMIN', pageSize: 100 })).body;
      expect(adm.meta.total + pub.meta.total).toBe(all.meta.total);
      const byPhone = (
        await admin.get('registration-requests', { search: '55111' })
      ).body;
      expect(
        byPhone.data.map((r: { firstName: string }) => r.firstName),
      ).toContain('بحث');
      const page = (await list({ pageSize: 2, page: 2 })).body;
      expect(page.meta).toMatchObject({ page: 2, pageSize: 2 });
      expect(page.data).toHaveLength(2);
      const today = (await list({ from: TODAY, to: TODAY, pageSize: 100 }))
        .body;
      expect(today.meta.total).toBe(all.meta.total);
      const none = (
        await list({ from: addDays(TODAY, -10), to: addDays(TODAY, -5) })
      ).body;
      expect(none.meta.total).toBe(0);
      const interested = (
        await list({ interestedGroupId: id.G1, pageSize: 100 })
      ).body;
      expect(
        interested.data.map((r: { firstName: string }) => r.firstName),
      ).toEqual(['مهتم']);
      await admin
        .get('registration-requests', { status: 'REJECTED' })
        .expect(400);
    });

    it('edits PENDING requests only, re-checking the rules', async () => {
      const rid = await pending('تعديل');
      const res = await admin
        .patch(`registration-requests/${rid}`, {
          birthDate: null,
          age: 25,
          address: 'منزل تميم',
          notes: 'يفضّل المساء',
        })
        .expect(200);
      expect(res.body).toMatchObject({
        birthDate: null,
        age: 25,
        address: 'منزل تميم',
      });
      // Becoming a minor without a guardian phone is refused
      expect(
        (
          await admin
            .patch(`registration-requests/${rid}`, { age: 10 })
            .expect(400)
        ).body.code,
      ).toBe('GUARDIAN_PHONE_REQUIRED');
      await admin
        .patch(`registration-requests/${rid}`, { firstName: null })
        .expect(400);
      await admin
        .patch(`registration-requests/${rid}`, { status: 'ACCEPTED' })
        .expect(400);
      await admin.post(`registration-requests/${rid}/reject`, {}).expect(200);
      expect(
        (
          await admin
            .patch(`registration-requests/${rid}`, { notes: 'x' })
            .expect(409)
        ).body.code,
      ).toBe('REGISTRATION_REQUEST_ALREADY_REVIEWED');
    });
  });

  /* ================================================================ */
  /* Acceptance                                                       */
  /* ================================================================ */

  describe('acceptance', () => {
    it('creates Person + Student + enrollment + status atomically, with no account and no payment', async () => {
      // An active fee exists for the group: acceptance must still not charge
      await admin
        .put(`groups/${id.G1}/fees`, {
          academicYearId: id.year,
          label: 'معلوم سنوي',
          billingType: 'YEARLY',
          amount: '60',
        })
        .expect(200);
      const rid = await pending('مقبول', {
        phone: '50 123 456',
        gender: 'MALE',
        address: 'دار شعبان',
        guardianPhone: '98111222',
      });
      const res = await admin
        .post(`registration-requests/${rid}/accept`, { groupClassId: id.C1 })
        .expect(200);
      expect(res.body.linkedExistingPerson).toBe(false);
      expect(res.body.request).toMatchObject({
        status: 'ACCEPTED',
        reviewedBy: { username: `e2e-${RUN}-admin` },
        createdStudent: { id: res.body.studentId, firstName: 'مقبول' },
      });
      expect(res.body.request.reviewedAt).toBeTruthy();
      const studentRow = await prisma.student.findUniqueOrThrow({
        where: { id: res.body.studentId },
        include: { person: { include: { user: true } } },
      });
      expect(studentRow).toMatchObject({
        groupClassId: id.C1,
        status: 'ACTIVE',
        guardianPhone: '98111222',
      });
      expect(studentRow.person).toMatchObject({
        firstName: 'مقبول',
        gender: 'MALE',
        address: 'دار شعبان',
        phone: '50123456',
        user: null,
      });
      const enrollments = await admin
        .get(`students/${res.body.studentId}/enrollments`)
        .expect(200);
      expect(enrollments.body).toHaveLength(1);
      expect(enrollments.body[0]).toMatchObject({
        startDate: TODAY,
        endDate: null,
      });
      expect(
        await prisma.studentStatusChange.count({
          where: { studentId: res.body.studentId },
        }),
      ).toBe(1);
      expect(
        await prisma.paymentObligation.count({
          where: { studentId: res.body.studentId },
        }),
      ).toBe(0);
      id.accepted = res.body.studentId;
      id.acceptedRequest = rid;
    });

    it('refuses a second acceptance, and concurrent acceptances create one student', async () => {
      expect(
        (
          await admin
            .post(`registration-requests/${id.acceptedRequest}/accept`, {
              groupClassId: id.C1,
              confirmNewPerson: true,
            })
            .expect(409)
        ).body.code,
      ).toBe('REGISTRATION_REQUEST_ALREADY_REVIEWED');
      await admin
        .post(`registration-requests/${id.acceptedRequest}/reject`, {})
        .expect(409);

      const rid = await pending('متزامن', {
        gender: 'FEMALE',
        address: 'نابل',
      });
      const results = await Promise.all(
        [0, 1, 2].map(() =>
          admin.post(`registration-requests/${rid}/accept`, {
            groupClassId: id.C1,
          }),
        ),
      );
      expect(results.map((r) => r.status).sort((a, b) => a - b)).toEqual([
        200, 409, 409,
      ]);
      expect(
        await prisma.person.count({
          where: { firstName: 'متزامن', lastName: tag('مترشح') },
        }),
      ).toBe(1);
    });

    it('requires an active class, group and branch', async () => {
      const rid = await pending('صنف', { gender: 'MALE', address: 'نابل' });
      const code = async (groupClassId: string) =>
        (
          await admin.post(`registration-requests/${rid}/accept`, {
            groupClassId,
          })
        ).body.code;
      expect(await code(id.Cinactive)).toBe('GROUP_CLASS_INACTIVE');
      expect(await code(id.CgroupOff)).toBe('GROUP_INACTIVE');
      expect(await code(id.CbranchOff)).toBe('BRANCH_INACTIVE');
      expect(await code(randomUUID())).toBe('GROUP_CLASS_NOT_FOUND');
      expect(
        (
          await admin.post(`registration-requests/${rid}/accept`, {
            groupClassId: id.C1,
            registrationDate: addDays(TODAY, 1),
          })
        ).body.code,
      ).toBe('REGISTRATION_DATE_IN_FUTURE');
      // Nothing was created by the failed attempts
      expect(
        (
          await prisma.registrationRequest.findUniqueOrThrow({
            where: { id: rid },
          })
        ).status,
      ).toBe('PENDING');
      expect(
        await prisma.person.count({
          where: { firstName: 'صنف', lastName: tag('مترشح') },
        }),
      ).toBe(0);
    });

    it('asks for the missing student data (age-only request) and accepts corrections', async () => {
      const rid = await pending('عمر', {
        birthDate: undefined,
        age: 30,
      });
      const missing = await admin
        .post(`registration-requests/${rid}/accept`, { groupClassId: id.C1 })
        .expect(400);
      expect(missing.body.code).toBe('ACCEPTANCE_DATA_MISSING');
      expect(missing.body.fields.sort()).toEqual([
        'address',
        'dateOfBirth',
        'gender',
      ]);
      // A minor birth date without guardian phone → the student contact rule applies
      expect(
        (
          await admin
            .post(`registration-requests/${rid}/accept`, {
              groupClassId: id.C1,
              person: {
                gender: 'MALE',
                dateOfBirth: '2016-03-03',
                address: 'نابل',
              },
            })
            .expect(400)
        ).body.code,
      ).toBe('GUARDIAN_PHONE_REQUIRED');
      const ok = await admin
        .post(`registration-requests/${rid}/accept`, {
          groupClassId: id.C1,
          registrationDate: addDays(TODAY, -3),
          person: {
            firstName: 'عمر المصحَّح',
            gender: 'MALE',
            dateOfBirth: '1996-03-03',
            address: 'نابل',
          },
        })
        .expect(200);
      const created = await admin
        .get(`students/${ok.body.studentId}`)
        .expect(200);
      expect(created.body).toMatchObject({
        registrationDate: addDays(TODAY, -3),
        person: { firstName: 'عمر المصحَّح', dateOfBirth: '1996-03-03' },
      });
      // The application itself keeps what the applicant sent
      expect(
        (
          await prisma.registrationRequest.findUniqueOrThrow({
            where: { id: rid },
          })
        ).firstName,
      ).toBe('عمر');
    });

    it('never merges duplicates silently: candidates, explicit link or explicit new person', async () => {
      // Same full name as an existing student
      const rid = await pending('S1', {
        lastName: tag('طالب'),
        gender: 'MALE',
        address: 'نابل',
        phone: '29999999',
      });
      const dup = await admin
        .post(`registration-requests/${rid}/accept`, { groupClassId: id.C1 })
        .expect(409);
      expect(dup.body.code).toBe('POSSIBLE_DUPLICATE_PERSON');
      expect(dup.body.candidates).toEqual([
        expect.objectContaining({ studentId: id.S1, firstName: 'S1' }),
      ]);
      // Linking a person who already is a student is refused
      const s1 = await prisma.student.findUniqueOrThrow({
        where: { id: id.S1 },
      });
      expect(
        (
          await admin
            .post(`registration-requests/${rid}/accept`, {
              groupClassId: id.C1,
              personId: s1.personId,
            })
            .expect(409)
        ).body.code,
      ).toBe('STUDENT_PROFILE_EXISTS');
      await admin
        .post(`registration-requests/${rid}/accept`, {
          groupClassId: id.C1,
          personId: s1.personId,
          person: { address: 'x' },
        })
        .expect(400);
      // Explicit decision: a different person with the same name
      const ok = await admin
        .post(`registration-requests/${rid}/accept`, {
          groupClassId: id.C1,
          confirmNewPerson: true,
        })
        .expect(200);
      expect(ok.body.studentId).not.toBe(id.S1);

      // Same phone as an existing person (a parent with an account, no student)
      const parent = await prisma.person.create({
        data: {
          firstName: 'وليّ',
          lastName: tag('أسرة'),
          gender: 'MALE',
          dateOfBirth: new Date('1980-01-01'),
          address: 'نابل',
          phone: '27777777',
        },
      });
      const r2 = await pending('ربط', {
        phone: '27777777',
        gender: 'MALE',
        address: 'نابل',
      });
      const dup2 = await admin
        .post(`registration-requests/${r2}/accept`, { groupClassId: id.C1 })
        .expect(409);
      expect(
        dup2.body.candidates.map((c: { personId: string }) => c.personId),
      ).toEqual([parent.id]);
      // Explicit link: the existing Person becomes the student, no new person
      const linked = await admin
        .post(`registration-requests/${r2}/accept`, {
          groupClassId: id.C1,
          personId: parent.id,
        })
        .expect(200);
      expect(linked.body.linkedExistingPerson).toBe(true);
      expect(
        (
          await prisma.student.findUniqueOrThrow({
            where: { id: linked.body.studentId },
          })
        ).personId,
      ).toBe(parent.id);
      expect(await prisma.person.count({ where: { firstName: 'ربط' } })).toBe(
        0,
      );
    });

    it('rejects with an optional reason, keeping the application and creating nothing', async () => {
      const rid = await pending('مرفوض');
      const res = await admin
        .post(`registration-requests/${rid}/reject`, {
          reason: 'لا توجد أماكن شاغرة',
        })
        .expect(200);
      expect(res.body).toMatchObject({
        status: 'REFUSED',
        rejectionReason: 'لا توجد أماكن شاغرة',
        reviewedBy: { username: `e2e-${RUN}-admin` },
        createdStudent: null,
        firstName: 'مرفوض',
      });
      await admin.post(`registration-requests/${rid}/reject`, {}).expect(409);
      await admin
        .post(`registration-requests/${rid}/accept`, { groupClassId: id.C1 })
        .expect(409);
      const r2 = await pending('بلا سبب');
      expect(
        (await admin.post(`registration-requests/${r2}/reject`).expect(200))
          .body.rejectionReason,
      ).toBeNull();
      await admin
        .post(`registration-requests/${randomUUID()}/reject`, {})
        .expect(404);
      expect(await prisma.person.count({ where: { firstName: 'مرفوض' } })).toBe(
        0,
      );
    });

    it('enforces review consistency in the database', async () => {
      const rid = await pending('قيد');
      await expect(
        prisma.registrationRequest.update({
          where: { id: rid },
          data: { status: 'ACCEPTED' },
        }),
      ).rejects.toThrow(/registration_requests_review_check/);
      await expect(
        prisma.registrationRequest.update({
          where: { id: id.acceptedRequest },
          data: {
            status: 'REFUSED',
            createdStudentId: null,
          },
        }),
      ).rejects.toThrow(/registration_requests_final/);
    });
  });

  /* ================================================================ */
  /* Fees                                                             */
  /* ================================================================ */

  describe('group fees', () => {
    it('validates amounts as exact positive decimals and billing periods', async () => {
      const put = (body: object) =>
        admin.put(`groups/${id.G2}/fees`, {
          academicYearId: id.year,
          label: 'معلوم',
          billingType: 'MONTHLY',
          numberOfPeriods: 2,
          amount: '20',
          ...body,
        });
      for (const amount of ['0', '0.000', '-5', '12.3456', 'abc', '', '1e3'])
        await put({ amount }).expect(400);
      await put({ amount: 0 }).expect(400);
      expect((await put({ billingType: 'YEARLY' }).expect(400)).body.code).toBe(
        'INVALID_NUMBER_OF_PERIODS',
      );
      await put({ numberOfPeriods: 13 }).expect(400);
      expect(
        (await put({ startDate: addDays(TODAY, -365) }).expect(400)).body.code,
      ).toBe('FEE_DATES_OUTSIDE_YEAR');
      await put({ academicYearId: randomUUID() }).expect(404);
      await admin
        .put(`groups/${randomUUID()}/fees`, {
          academicYearId: id.year,
          label: 'x',
          billingType: 'YEARLY',
          amount: '1',
        })
        .expect(404);
      const res = await put({}).expect(200);
      expect(res.body).toMatchObject({
        billingType: 'MONTHLY',
        amount: '20.000',
        numberOfPeriods: 2,
        totalAmount: '40.000',
        currency: 'TND',
        isActive: true,
        createdBy: { username: `e2e-${RUN}-admin` },
      });
      id.feeG2 = res.body.id;
    });

    it('versions fee changes and is inherited by every class of the group', async () => {
      const first = (
        await admin.get(`groups/${id.G1}/fees`, { academicYearId: id.year })
      ).body.data;
      expect(first).toHaveLength(1);
      id.feeG1v1 = first[0].id;
      const v2 = await admin
        .put(`groups/${id.G1}/fees`, {
          academicYearId: id.year,
          label: 'معلوم سنوي',
          billingType: 'YEARLY',
          amount: 60.5,
        })
        .expect(200);
      expect(v2.body.amount).toBe('60.500');
      id.feeG1v2 = v2.body.id;
      const history = (await admin.get(`groups/${id.G1}/fees`)).body.data;
      expect(
        history.map((f: { id: string; isActive: boolean }) => [
          f.id,
          f.isActive,
        ]),
      ).toEqual([
        [id.feeG1v2, true],
        [id.feeG1v1, false],
      ]);
      expect(history[1].deactivatedBy.username).toBe(`e2e-${RUN}-admin`);
      for (const cls of ['C1', 'C1b']) {
        const applicable = await admin
          .get(`group-classes/${id[cls]}/fee`, { academicYearId: id.year })
          .expect(200);
        expect(applicable.body.fee.id).toBe(id.feeG1v2);
        expect(applicable.body.group.id).toBe(id.G1);
      }
      const otherYear = await admin
        .get(`group-classes/${id.C1}/fee`, { academicYearId: id.prevYear })
        .expect(200);
      expect(otherYear.body.fee).toBeNull();
      await admin.get(`group-fees/${id.feeG1v1}`).expect(200);
      await admin.get(`group-fees/${randomUUID()}`).expect(404);
    });

    it('keeps pricing immutable in the database (versions, never edits)', async () => {
      await expect(
        prisma.groupFee.update({
          where: { id: id.feeG1v2 },
          data: { amount: '1' },
        }),
      ).rejects.toThrow(/group_fees_immutable/);
      await expect(
        prisma.groupFee.update({
          where: { id: id.feeG1v1 },
          data: {
            isActive: true,
            deactivatedAt: null,
            deactivatedByUserId: null,
          },
        }),
      ).rejects.toThrow(/group_fees_immutable|group_fees_one_active_key/);
    });
  });

  /* ================================================================ */
  /* Obligations                                                      */
  /* ================================================================ */

  describe('payment obligations', () => {
    it('charges the current fee total, frozen, once per student/group/year', async () => {
      const o = await obligation('S1', 'feeG1v2');
      expect(o).toMatchObject({
        student: { id: id.S1 },
        group: { id: id.G1 },
        academicYear: { id: id.year },
        expectedAmount: '60.500',
        totalPaid: '0.000',
        remainingAmount: '60.500',
        status: 'UNPAID',
        currency: 'TND',
        paymentsCount: 0,
        voided: null,
      });
      id.oS1 = o.id;
      expect(
        (
          await admin
            .post('payment-obligations', {
              studentId: id.S1,
              groupFeeId: id.feeG1v2,
            })
            .expect(409)
        ).body.code,
      ).toBe('OBLIGATION_EXISTS');
      expect(
        (
          await admin
            .post('payment-obligations', {
              studentId: id.S2,
              groupFeeId: id.feeG1v1,
            })
            .expect(409)
        ).body.code,
      ).toBe('GROUP_FEE_INACTIVE');
      expect(
        (
          await admin
            .post('payment-obligations', {
              studentId: id.S3,
              groupFeeId: id.feeG1v2,
            })
            .expect(409)
        ).body.code,
      ).toBe('STUDENT_NOT_IN_GROUP');
      await admin
        .post('payment-obligations', {
          studentId: randomUUID(),
          groupFeeId: id.feeG1v2,
        })
        .expect(404);
      await admin
        .post('payment-obligations', {
          studentId: id.S1,
          groupFeeId: randomUUID(),
        })
        .expect(404);
      await admin
        .post('payment-obligations', {
          studentId: id.S1,
          groupFeeId: id.feeG1v2,
          expectedAmount: '1',
        })
        .expect(400);
    });

    it('a later fee change never alters existing obligations', async () => {
      const v3 = await admin
        .put(`groups/${id.G1}/fees`, {
          academicYearId: id.year,
          label: 'معلوم سنوي',
          billingType: 'YEARLY',
          amount: '80',
        })
        .expect(200);
      id.feeG1v3 = v3.body.id;
      expect(
        (await admin.get(`payment-obligations/${id.oS1}`)).body.expectedAmount,
      ).toBe('60.500');
      const o2 = await obligation('S2', 'feeG1v3');
      expect(o2.expectedAmount).toBe('80.000');
      id.oS2 = o2.id;
      // The class in another branch inherits the same group fee
      id.oS4 = (await obligation('S4', 'feeG1v3')).id;
      id.oS3 = (await obligation('S3', 'feeG2')).id;
      await expect(
        prisma.paymentObligation.update({
          where: { id: id.oS1 },
          data: { expectedAmount: '1' },
        }),
      ).rejects.toThrow(/payment_obligations_immutable/);
      const fee = await prisma.groupFee.findUniqueOrThrow({
        where: { id: id.feeG1v3 },
      });
      await expect(
        prisma.paymentObligation.create({
          data: {
            studentId: id.accepted,
            groupFeeId: fee.id,
            groupId: fee.groupId,
            academicYearId: fee.academicYearId,
            expectedAmount: '5',
          },
        }),
      ).rejects.toThrow(/payment_obligations_amount_matches_fee/);
    });

    it('transfers never create or change obligations automatically', async () => {
      const before = await prisma.paymentObligation.count({
        where: { studentId: id.S1 },
      });
      await admin
        .patch(`students/${id.S1}/group-class`, {
          groupClassId: id.C1b,
          effectiveDate: addDays(TODAY, -10),
        })
        .expect(200);
      await admin
        .patch(`students/${id.S1}/group-class`, { groupClassId: id.C2 })
        .expect(200);
      expect(
        await prisma.paymentObligation.count({ where: { studentId: id.S1 } }),
      ).toBe(before);
      expect(
        (await admin.get(`payment-obligations/${id.oS1}`)).body.expectedAmount,
      ).toBe('60.500');
      // The admin may now decide to charge the new group too (same year)
      const o = await obligation('S1', 'feeG2');
      expect(o.expectedAmount).toBe('40.000');
      id.oS1g2 = o.id;
    });

    it('lists with filters and per student', async () => {
      const list = (q: object) =>
        admin.get('payment-obligations', { academicYearId: id.year, ...q });
      const all = (await list({ pageSize: 100 }).expect(200)).body;
      expect(all.meta.total).toBe(5);
      expect(
        (await list({ groupId: id.G2 })).body.data
          .map((o: { id: string }) => o.id)
          .sort(),
      ).toEqual([id.oS1g2, id.oS3].sort());
      expect((await list({ studentId: id.S1 })).body.meta.total).toBe(2);
      expect((await list({ status: 'UNPAID' })).body.meta.total).toBe(5);
      expect((await list({ status: 'PAID' })).body.meta.total).toBe(0);
      expect((await list({ search: 'S3' })).body.data[0].id).toBe(id.oS3);
      const page = (await list({ pageSize: 2, page: 3 })).body;
      expect(page.meta).toMatchObject({ total: 5, totalPages: 3 });
      expect(page.data).toHaveLength(1);
      const s1 = (await admin.get(`students/${id.S1}/payment-obligations`))
        .body;
      expect(s1).toHaveLength(2);
      expect(
        (
          await admin.get(`students/${id.S1}/payment-obligations`, {
            academicYearId: id.prevYear,
          })
        ).body,
      ).toEqual([]);
      await admin
        .get(`students/${randomUUID()}/payment-obligations`)
        .expect(404);
      await admin.get(`payment-obligations/${randomUUID()}`).expect(404);
      await admin.get('payment-obligations', { status: 'OVERDUE' }).expect(400);
    });
  });

  /* ================================================================ */
  /* Payments                                                         */
  /* ================================================================ */

  describe('cash payments', () => {
    it('records partial payments with derived balances; the recorder is the admin', async () => {
      const res = await pay(id.oS1, '15.500', { note: 'الدفعة الأولى' }).expect(
        201,
      );
      expect(res.body).toMatchObject({
        obligationId: id.oS1,
        amount: '15.500',
        currency: 'TND',
        paidAt: TODAY,
        method: 'CASH',
        receiptIssued: false,
        receiptIssuedAt: null,
        recordedBy: { username: `e2e-${RUN}-admin` },
        student: { id: id.S1 },
        voided: null,
      });
      id.p1 = res.body.id;
      expect(
        (await admin.get(`payment-obligations/${id.oS1}`)).body,
      ).toMatchObject({
        totalPaid: '15.500',
        remainingAmount: '45.000',
        status: 'PARTIAL',
        paymentsCount: 1,
        receiptsNotIssued: 1,
      });
      // The client cannot choose the recorder or the method
      await pay(id.oS1, '1', { recordedByUserId: randomUUID() }).expect(400);
      await pay(id.oS1, '1', { method: 'CARD' }).expect(400);
    });

    it('rejects zero, negative, imprecise, excessive and future payments', async () => {
      for (const amount of ['0', '0.000', '-1', '1.0001', 'x'])
        await pay(id.oS1, amount).expect(400);
      await pay(id.oS1, 0).expect(400);
      const over = await pay(id.oS1, '45.001').expect(409);
      expect(over.body.code).toBe('AMOUNT_EXCEEDS_REMAINING');
      expect(over.body.message).toContain('45.000');
      expect(
        (await pay(id.oS1, '1', { paidAt: addDays(TODAY, 1) }).expect(400)).body
          .code,
      ).toBe('PAYMENT_DATE_IN_FUTURE');
      expect(
        (await pay(id.oS1, '1', { periodNumber: 1 }).expect(400)).body.code,
      ).toBe('PERIOD_NOT_APPLICABLE');
      await pay(randomUUID(), '1').expect(404);
    });

    it('becomes PAID exactly at the expected amount, then refuses more', async () => {
      const res = await pay(id.oS1, '45', {
        paidAt: addDays(TODAY, -2),
        receiptIssued: true,
      }).expect(201);
      expect(res.body.receiptIssued).toBe(true);
      expect(res.body.receiptIssuedBy.username).toBe(`e2e-${RUN}-admin`);
      id.p2 = res.body.id;
      expect(
        (await admin.get(`payment-obligations/${id.oS1}`)).body,
      ).toMatchObject({
        totalPaid: '60.500',
        remainingAmount: '0.000',
        status: 'PAID',
      });
      expect((await pay(id.oS1, '0.001').expect(409)).body.code).toBe(
        'OBLIGATION_FULLY_PAID',
      );
    });

    it('sums exactly in decimals (0.1 + 0.2 = 0.300) and checks monthly periods', async () => {
      await pay(id.oS3, '0.1', { periodNumber: 1 }).expect(201);
      await pay(id.oS3, '0.2', { periodNumber: 2 }).expect(201);
      expect(
        (await pay(id.oS3, '1', { periodNumber: 3 }).expect(400)).body.code,
      ).toBe('INVALID_PERIOD');
      expect(
        (await admin.get(`payment-obligations/${id.oS3}`)).body,
      ).toMatchObject({
        totalPaid: '0.300',
        remainingAmount: '39.700',
        status: 'PARTIAL',
      });
    });

    it('serializes concurrent payments: the obligation is never exceeded', async () => {
      const results = await Promise.all(
        Array.from({ length: 6 }, () => pay(id.oS2, '20')),
      );
      expect(results.filter((r) => r.status === 201)).toHaveLength(4);
      expect(results.filter((r) => r.status === 409)).toHaveLength(2);
      expect(
        (await admin.get(`payment-obligations/${id.oS2}`)).body,
      ).toMatchObject({
        totalPaid: '80.000',
        status: 'PAID',
      });
    });

    it('the database refuses overpayment and rewriting a payment', async () => {
      await expect(
        prisma.payment.create({
          data: {
            obligationId: id.oS2,
            amount: '1',
            paidAt: new Date(`${TODAY}T00:00:00Z`),
            recordedByUserId: (
              await prisma.user.findFirstOrThrow({
                where: { username: `e2e-${RUN}-admin` },
              })
            ).id,
          },
        }),
      ).rejects.toThrow(/payments_no_overpayment/);
      await expect(
        prisma.payment.update({ where: { id: id.p1 }, data: { amount: '1' } }),
      ).rejects.toThrow(/payments_immutable/);
    });

    it('voids a payment (who/when/why) instead of editing or deleting it', async () => {
      await admin.post(`payments/${id.p1}/void`, {}).expect(400);
      await admin.post(`payments/${id.p1}/void`, { reason: '  ' }).expect(400);
      const res = await admin
        .post(`payments/${id.p1}/void`, { reason: 'مبلغ مسجّل خطأ' })
        .expect(200);
      expect(res.body.voided).toMatchObject({
        reason: 'مبلغ مسجّل خطأ',
        by: { username: `e2e-${RUN}-admin` },
      });
      expect(
        (
          await admin
            .post(`payments/${id.p1}/void`, { reason: 'x' })
            .expect(409)
        ).body.code,
      ).toBe('PAYMENT_ALREADY_VOIDED');
      // Excluded from every total; the obligation is PARTIAL again
      expect(
        (await admin.get(`payment-obligations/${id.oS1}`)).body,
      ).toMatchObject({
        totalPaid: '45.000',
        remainingAmount: '15.500',
        status: 'PARTIAL',
        paymentsCount: 1,
      });
      // Kept in the history, flagged
      const history = (
        await admin.get(`payment-obligations/${id.oS1}/payments`)
      ).body;
      expect(history.map((p: { id: string }) => p.id)).toEqual([id.p2, id.p1]);
      expect(history[1].voided).not.toBeNull();
      // Lists exclude voided payments unless asked
      const live = (await admin.get('payments', { obligationId: id.oS1 })).body;
      expect(live.data.map((p: { id: string }) => p.id)).toEqual([id.p2]);
      const withVoided = (
        await admin.get('payments', {
          obligationId: id.oS1,
          includeVoided: true,
        })
      ).body;
      expect(withVoided.meta.total).toBe(2);
      await expect(
        prisma.payment.update({
          where: { id: id.p1 },
          data: { voidedAt: null, voidedByUserId: null, voidReason: null },
        }),
      ).rejects.toThrow(/payments_immutable/);
      await admin
        .post(`payments/${randomUUID()}/void`, { reason: 'x' })
        .expect(404);
    });

    it('tracks receipts independently of the amounts (ADMIN action only)', async () => {
      const before = (await admin.get(`payment-obligations/${id.oS3}`)).body;
      const [first] = (
        await admin.get(`payment-obligations/${id.oS3}/payments`)
      ).body;
      const issued = await admin
        .patch(`payments/${first.id}/receipt`, { receiptIssued: true })
        .expect(200);
      expect(issued.body).toMatchObject({
        receiptIssued: true,
        receiptIssuedBy: { username: `e2e-${RUN}-admin` },
      });
      expect(issued.body.receiptIssuedAt).toBeTruthy();
      const after = (await admin.get(`payment-obligations/${id.oS3}`)).body;
      expect(after).toMatchObject({
        totalPaid: before.totalPaid,
        status: before.status,
        receiptsNotIssued: before.receiptsNotIssued - 1,
      });
      const undone = await admin
        .patch(`payments/${first.id}/receipt`, { receiptIssued: false })
        .expect(200);
      expect(undone.body).toMatchObject({
        receiptIssued: false,
        receiptIssuedAt: null,
        receiptIssuedBy: null,
      });
      await admin.patch(`payments/${first.id}/receipt`, {}).expect(400);
      expect(
        (
          await admin
            .patch(`payments/${id.p1}/receipt`, { receiptIssued: true })
            .expect(409)
        ).body.code,
      ).toBe('PAYMENT_VOIDED');
    });

    it('voids an obligation only without live payments', async () => {
      expect(
        (
          await admin
            .post(`payment-obligations/${id.oS1}/void`, { reason: 'خطأ' })
            .expect(409)
        ).body.code,
      ).toBe('OBLIGATION_HAS_PAYMENTS');
      const res = await admin
        .post(`payment-obligations/${id.oS4}/void`, { reason: 'التزام مكرّر' })
        .expect(200);
      expect(res.body.voided.reason).toBe('التزام مكرّر');
      expect((await pay(id.oS4, '1').expect(409)).body.code).toBe(
        'OBLIGATION_VOIDED',
      );
      await admin
        .post(`payment-obligations/${id.oS4}/void`, { reason: 'x' })
        .expect(409);
      // Hidden from lists by default; a new obligation may replace it
      const list = (
        await admin.get('payment-obligations', { studentId: id.S4 })
      ).body;
      expect(list.meta.total).toBe(0);
      expect(
        (
          await admin.get('payment-obligations', {
            studentId: id.S4,
            includeVoided: true,
          })
        ).body.meta.total,
      ).toBe(1);
      id.oS4b = (await obligation('S4', 'feeG1v3')).id;
    });

    it('lists payments with filters, per student and per obligation', async () => {
      const byStudent = (await admin.get(`students/${id.S1}/payments`)).body;
      expect(byStudent).toHaveLength(2); // the voided one stays visible, flagged
      const list = (q: object) =>
        admin.get('payments', { academicYearId: id.year, ...q });
      expect((await list({ studentId: id.S1 })).body.meta.total).toBe(1);
      expect((await list({ groupId: id.G2 })).body.meta.total).toBe(2);
      expect((await list({ from: TODAY, to: TODAY })).body.meta.total).toBe(6);
      expect(
        (
          await list({ from: addDays(TODAY, -2), to: addDays(TODAY, -2) })
        ).body.data.map((p: { id: string }) => p.id),
      ).toEqual([id.p2]);
      expect((await list({ receiptIssued: true })).body.meta.total).toBe(1);
      expect((await list({ receiptIssued: false })).body.meta.total).toBe(6);
      await admin.get(`payments/${id.p2}`).expect(200);
      await admin.get(`payments/${randomUUID()}`).expect(404);
      await admin.get(`students/${randomUUID()}/payments`).expect(404);
      await admin
        .get(`payment-obligations/${randomUUID()}/payments`)
        .expect(404);
    });
  });

  /* ================================================================ */
  /* Summaries                                                        */
  /* ================================================================ */

  describe('finance summaries', () => {
    it('summarizes one student (live obligations, totals, statuses, receipts)', async () => {
      const res = await admin
        .get(`students/${id.S1}/finance/summary`, { academicYearId: id.year })
        .expect(200);
      expect(res.body).toMatchObject({
        student: {
          id: id.S1,
          firstName: 'S1',
          status: 'ACTIVE',
          currentClass: { id: id.C2, group: { id: id.G2 } },
        },
        academicYear: { id: id.year },
        currency: 'TND',
        totals: {
          expectedAmount: '100.500',
          totalPaid: '45.000',
          remainingAmount: '55.500',
        },
        statusCounts: { UNPAID: 1, PARTIAL: 1, PAID: 0 },
        receipts: { issued: 1, notIssued: 0 },
      });
      expect(res.body.obligations).toHaveLength(2);
      const empty = await admin
        .get(`students/${id.S1}/finance/summary`, {
          academicYearId: id.prevYear,
        })
        .expect(200);
      expect(empty.body.totals).toEqual({
        expectedAmount: '0.000',
        totalPaid: '0.000',
        remainingAmount: '0.000',
      });
      await admin
        .get(`students/${id.S1}/finance/summary`, {
          academicYearId: randomUUID(),
        })
        .expect(404);
      await admin.get(`students/${randomUUID()}/finance/summary`).expect(404);
    });

    it('summarizes the association by year, group, branch and payment dates', async () => {
      const summary = (q: object = {}) =>
        admin.get('finance/summary', { academicYearId: id.year, ...q });
      const all = (await summary().expect(200)).body;
      // S1/G1 60.5, S1/G2 40, S2 80, S3 40, S4b 80 (S4 voided)
      expect(all).toMatchObject({
        currency: 'TND',
        obligationsCount: 5,
        totals: {
          expectedAmount: '300.500',
          totalPaid: '125.300',
          remainingAmount: '175.200',
        },
        statusCounts: { UNPAID: 2, PARTIAL: 2, PAID: 1 },
        collected: {
          paymentsCount: 7,
          amount: '125.300',
          receiptsNotIssued: 6,
          voidedPaymentsCount: 1,
        },
      });
      const g2 = (await summary({ groupId: id.G2 })).body;
      expect(g2.obligationsCount).toBe(2);
      expect(g2.totals.expectedAmount).toBe('80.000');
      // Branch B2: S4 (C1b, G1) and S3 (C2, G2) and S1's G2 obligation (C2 in B2)
      // and S1's G1 obligation (C1b in B2 for a moment)
      const b2 = (await summary({ branchId: id.B2 })).body;
      expect(b2.obligationsCount).toBe(4);
      const b1 = (await summary({ branchId: id.B1 })).body;
      expect(b1.obligationsCount).toBe(2); // S1/G1 and S2 (C1)
      // Dates filter payments only: the obligations/balances stay the same
      const twoDaysAgo = (
        await summary({ from: addDays(TODAY, -2), to: addDays(TODAY, -1) })
      ).body;
      expect(twoDaysAgo.totals).toEqual(all.totals);
      expect(twoDaysAgo.collected).toMatchObject({
        paymentsCount: 1,
        amount: '45.000',
      });
      const other = (
        await admin.get('finance/summary', { academicYearId: id.prevYear })
      ).body;
      expect(other.obligationsCount).toBe(0);
      expect(other.totals.totalPaid).toBe('0.000');
      await admin.get('finance/summary', { from: '2026-13-01' }).expect(400);
    });
  });

  /* ================================================================ */
  /* Security                                                         */
  /* ================================================================ */

  it('every finance route is ADMIN-only (teacher/student 403, anonymous 401)', async () => {
    const routes: [string, string, object?][] = [
      ['get', `/api/admin/groups/${id.G1}/fees`],
      ['put', `/api/admin/groups/${id.G1}/fees`, {}],
      ['get', `/api/admin/group-fees/${id.feeG1v3}`],
      ['post', `/api/admin/group-fees/${id.feeG1v3}/deactivate`],
      ['get', `/api/admin/group-classes/${id.C1}/fee`],
      ['get', '/api/admin/payment-obligations'],
      ['post', '/api/admin/payment-obligations', {}],
      ['get', `/api/admin/payment-obligations/${id.oS1}`],
      ['get', `/api/admin/payment-obligations/${id.oS1}/payments`],
      ['post', `/api/admin/payment-obligations/${id.oS1}/void`, {}],
      ['get', `/api/admin/students/${id.S1}/payment-obligations`],
      ['get', '/api/admin/payments'],
      ['post', '/api/admin/payments', {}],
      ['get', `/api/admin/payments/${id.p2}`],
      ['post', `/api/admin/payments/${id.p2}/void`, {}],
      ['patch', `/api/admin/payments/${id.p2}/receipt`, {}],
      ['get', `/api/admin/students/${id.S1}/payments`],
      ['get', `/api/admin/students/${id.S1}/finance/summary`],
      ['get', '/api/admin/finance/summary'],
    ];
    for (const [method, path, body] of routes) {
      const call = (t?: string) => {
        const req = (
          http() as unknown as Record<string, (p: string) => request.Test>
        )[method](path);
        if (t) req.set(as(t));
        return body ? req.send(body) : req;
      };
      expect([path, (await call(token.sup)).status]).toEqual([path, 403]);
      expect([path, (await call(token.pupil)).status]).toEqual([path, 403]);
      expect([path, (await call()).status]).toEqual([path, 401]);
    }
    // Nothing changed through the denied calls
    expect((await admin.get(`payments/${id.p2}`)).body.voided).toBeNull();
    expect((await admin.get(`group-fees/${id.feeG1v3}`)).body.isActive).toBe(
      true,
    );
  });

  it('a stopped fee keeps its obligations and history', async () => {
    const res = await admin
      .post(`group-fees/${id.feeG1v3}/deactivate`)
      .expect(200);
    expect(res.body).toMatchObject({ isActive: false, obligationsCount: 2 });
    await admin.post(`group-fees/${id.feeG1v3}/deactivate`).expect(409);
    expect(
      (await admin.get(`payment-obligations/${id.oS2}`)).body,
    ).toMatchObject({
      expectedAmount: '80.000',
      status: 'PAID',
    });
    expect(
      (
        await admin.get(`group-classes/${id.C1}/fee`, {
          academicYearId: id.year,
        })
      ).body.fee,
    ).toBeNull();
  });
});
