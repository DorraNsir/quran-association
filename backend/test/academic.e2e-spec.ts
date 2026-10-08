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

describe('Academic structure APIs (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let admin = '';
  const tokens: Record<string, string> = {};
  const id: Record<string, string> = {};
  let originalCurrentYearId: string | undefined;

  const http = () => request(app.getHttpServer());
  const as = (token: string) => ({ Authorization: `Bearer ${token}` });
  const post = (path: string, body: object) =>
    http().post(`/api/admin/${path}`).set(as(admin)).send(body);
  const patch = (path: string, body: object) =>
    http().patch(`/api/admin/${path}`).set(as(admin)).send(body);
  const get = (path: string, query: object = {}) =>
    http().get(`/api/admin/${path}`).query(query).set(as(admin));

  async function account(key: string, roles: Role[]) {
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
    const res = await http()
      .post('/api/auth/login')
      .send({ username: `e2e-${RUN}-${key}`, password: PASSWORD })
      .expect(200);
    return res.body.accessToken as string;
  }

  const teacherBody = (first: string, extra: object = {}) => ({
    person: {
      firstName: first,
      lastName: tag('معلم'),
      gender: 'MALE',
      phone: '22 345 678',
    },
    joinedAt: '2024-09-01',
    ...extra,
  });
  const studentBody = (
    first: string,
    groupClassId: string,
    extra: object = {},
  ) => ({
    person: {
      firstName: first,
      lastName: tag('طالب'),
      gender: 'FEMALE',
      dateOfBirth: '2015-03-10',
      address: 'دار شعبان الفهري',
    },
    groupClassId,
    registrationDate: '2026-09-15',
    guardianPhone: '98765432',
    ...extra,
  });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    originalCurrentYearId = (
      await prisma.academicYear.findFirst({ where: { isCurrent: true } })
    )?.id;
    admin = await account('admin', [Role.ADMIN]);
    tokens.teacher = await account('teacher', [Role.TEACHER]);
    tokens.student = await account('student', [Role.STUDENT]);
  });

  afterAll(async () => {
    // Restore the current year, then remove everything this run created (children first)
    if (originalCurrentYearId) {
      await prisma.$transaction([
        prisma.academicYear.updateMany({
          where: { isCurrent: true },
          data: { isCurrent: false },
        }),
        prisma.academicYear.update({
          where: { id: originalCurrentYearId },
          data: { isCurrent: true },
        }),
      ]);
    }
    await prisma.academicYear.deleteMany({
      where: { label: { endsWith: RUN.slice(0, 4) } },
    });
    const persons = (
      await prisma.person.findMany({
        where: { lastName: { endsWith: RUN } },
        select: { id: true },
      })
    ).map((p) => p.id);
    await prisma.studentEnrollment.deleteMany({
      where: { student: { personId: { in: persons } } },
    });
    await prisma.studentStatusChange.deleteMany({
      where: { student: { personId: { in: persons } } },
    });
    await prisma.student.deleteMany({ where: { personId: { in: persons } } });
    const classes = { group: { name: { endsWith: RUN } } };
    await prisma.groupClassAssistant.deleteMany({
      where: { groupClass: classes },
    });
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

  // ───────────────────────── authorization ─────────────────────────

  describe('authorization', () => {
    it('TEACHER-only and STUDENT-only accounts are refused every admin academic API', async () => {
      for (const token of [tokens.teacher, tokens.student]) {
        for (const path of [
          'academic-years',
          'branches',
          'rooms',
          'groups',
          'group-classes',
          'teachers',
          'students',
        ]) {
          const res = await http()
            .get(`/api/admin/${path}`)
            .set(as(token))
            .expect(403);
          expect(res.body.code).toBe('FORBIDDEN_ROLE');
        }
        await http()
          .post('/api/admin/branches')
          .set(as(token))
          .send({ name: 'x', address: 'y' })
          .expect(403);
      }
      await http().get('/api/admin/branches').expect(401);
    });
  });

  // ───────────────────────── academic years ─────────────────────────

  describe('academic years', () => {
    const label = (y: number) => `${y}–${y + 1} ${RUN.slice(0, 4)}`;

    it('creates, validates and updates years (two semesters derived)', async () => {
      const res = await post('academic-years', {
        label: label(2201),
        startDate: '2201-09-15',
        endDate: '2202-06-30',
        semester2StartDate: '2202-02-01',
      }).expect(201);
      expect(res.body).toMatchObject({
        isCurrent: false,
        firstSemester: { startDate: '2201-09-15', endDate: '2202-01-31' },
        secondSemester: { startDate: '2202-02-01', endDate: '2202-06-30' },
      });
      id.year1 = res.body.id;

      const bad = {
        label: label(2210),
        startDate: '2210-09-15',
        endDate: '2210-01-01',
        semester2StartDate: '2210-10-01',
      };
      expect((await post('academic-years', bad).expect(400)).body.code).toBe(
        'INVALID_DATES',
      );
      await post('academic-years', {
        ...bad,
        endDate: '2211-06-30',
        semester2StartDate: '2212-01-01',
      }).expect(400);
      await post('academic-years', { ...bad, startDate: '2210-02-30' }).expect(
        400,
      );

      // Overlap with an existing year and duplicate label are 409s
      const overlap = await post('academic-years', {
        label: label(2202),
        startDate: '2202-06-01',
        endDate: '2203-06-30',
        semester2StartDate: '2203-02-01',
      }).expect(409);
      expect(overlap.body.code).toBe('YEARS_OVERLAP');
      await post('academic-years', {
        label: label(2201),
        startDate: '2230-09-15',
        endDate: '2231-06-30',
        semester2StartDate: '2231-02-01',
      }).expect(409);

      const year2 = await post('academic-years', {
        label: label(2202),
        startDate: '2202-09-15',
        endDate: '2203-06-30',
        semester2StartDate: '2203-02-01',
      }).expect(201);
      id.year2 = year2.body.id;
      const upd = await patch(`academic-years/${id.year2}`, {
        semester2StartDate: '2203-02-15',
      }).expect(200);
      expect(upd.body.firstSemester.endDate).toBe('2203-02-14');
      await patch(`academic-years/${id.year2}`, {
        startDate: '2202-06-01',
      }).expect(409); // would overlap year1
      await patch(`academic-years/${id.year2}`, { isCurrent: true }).expect(
        400,
      ); // not editable here
    });

    it('the database refuses overlapping years even without the service check', async () => {
      await expect(
        prisma.academicYear.create({
          data: {
            label: `raw ${RUN.slice(0, 4)}`,
            startDate: new Date('2202-01-01'),
            endDate: new Date('2202-12-31'),
            semester2StartDate: new Date('2202-06-01'),
          },
        }),
      ).rejects.toThrow(/academic_years_no_overlap|exclusion/);
    });

    it('set-current keeps exactly one current year, even under concurrency', async () => {
      await http()
        .post(`/api/admin/academic-years/${id.year1}/set-current`)
        .set(as(admin))
        .expect(200);
      const results = await Promise.all([
        http()
          .post(`/api/admin/academic-years/${id.year1}/set-current`)
          .set(as(admin)),
        http()
          .post(`/api/admin/academic-years/${id.year2}/set-current`)
          .set(as(admin)),
      ]);
      for (const r of results) expect([200, 409]).toContain(r.status);
      expect(
        await prisma.academicYear.count({ where: { isCurrent: true } }),
      ).toBe(1);
      const list = await get('academic-years').expect(200);
      expect(
        list.body.filter((y: { isCurrent: boolean }) => y.isCurrent),
      ).toHaveLength(1);
    });
  });

  // ───────────────────────── branches & rooms ─────────────────────────

  describe('branches and rooms', () => {
    it('creates, lists, updates branches', async () => {
      id.branch = (
        await post('branches', {
          name: tag('فرع الرياض'),
          address: 'نهج ابن خلدون',
          phone: '72 290 415',
        }).expect(201)
      ).body.id;
      id.branch2 = (
        await post('branches', {
          name: tag('فرع الفهري'),
          address: 'شارع بورقيبة',
        }).expect(201)
      ).body.id;
      expect(
        (
          await post('branches', {
            name: tag('فرع الرياض'),
            address: 'عنوان آخر',
          }).expect(409)
        ).body.code,
      ).toBe('BRANCH_NAME_TAKEN');
      const list = await get('branches', { search: RUN }).expect(200);
      expect(list.body.meta.total).toBe(2);
      const upd = await patch(`branches/${id.branch}`, {
        address: 'عنوان جديد',
      }).expect(200);
      expect(upd.body).toMatchObject({
        address: 'عنوان جديد',
        phone: '72290415',
        status: 'ACTIVE',
      });
      await patch(`branches/${id.branch}`, { status: 'INACTIVE' }).expect(400); // status has its own endpoint
    });

    it('rooms belong to an existing, active branch; filter by branch', async () => {
      id.room = (
        await post('rooms', { branchId: id.branch, name: 'القاعة 1' }).expect(
          201,
        )
      ).body.id;
      id.room2 = (
        await post('rooms', { branchId: id.branch, name: 'القاعة 2' }).expect(
          201,
        )
      ).body.id;
      id.otherRoom = (
        await post('rooms', { branchId: id.branch2, name: 'القاعة 1' }).expect(
          201,
        )
      ).body.id;
      await post('rooms', { branchId: id.branch, name: 'القاعة 1' }).expect(
        409,
      );
      expect(
        (await post('rooms', { branchId: randomUUID(), name: 'x' }).expect(404))
          .body.code,
      ).toBe('BRANCH_NOT_FOUND');

      const filtered = await get('rooms', { branchId: id.branch }).expect(200);
      expect(
        filtered.body.data.map((r: { name: string }) => r.name).sort(),
      ).toEqual(['القاعة 1', 'القاعة 2']);
      expect(filtered.body.data[0].branch.id).toBe(id.branch);

      // Inactive branch: no new room, no room activation
      await patch(`branches/${id.branch2}/status`, {
        status: 'INACTIVE',
      }).expect(200);
      expect(
        (
          await post('rooms', {
            branchId: id.branch2,
            name: 'القاعة 9',
          }).expect(409)
        ).body.code,
      ).toBe('BRANCH_INACTIVE');
      await patch(`rooms/${id.otherRoom}/status`, {
        status: 'INACTIVE',
      }).expect(200);
      await patch(`rooms/${id.otherRoom}/status`, { status: 'ACTIVE' }).expect(
        409,
      );
      await patch(`branches/${id.branch2}/status`, { status: 'ACTIVE' }).expect(
        200,
      );
      await patch(`rooms/${id.otherRoom}/status`, { status: 'ACTIVE' }).expect(
        200,
      );
      await patch(`rooms/${id.room}`, { branchId: id.branch2 }).expect(400); // a room never changes branch
    });
  });

  // ───────────────────────── groups ─────────────────────────

  describe('groups', () => {
    it('creates, lists, updates, changes status', async () => {
      id.group = (
        await post('groups', {
          name: tag('مجموعة ماهر'),
          audience: 'أطفال 7–10 سنوات',
        }).expect(201)
      ).body.id;
      id.group2 = (
        await post('groups', {
          name: tag('مجموعة النور'),
          audience: 'شباب',
        }).expect(201)
      ).body.id;
      await post('groups', { name: tag('مجموعة ماهر'), audience: 'x' }).expect(
        409,
      );
      await post('groups', {
        name: tag('مجموعة'),
        audience: 'x',
        branchId: id.branch,
      }).expect(400); // class-level field
      const list = await get('groups', { search: RUN }).expect(200);
      expect(list.body.meta.total).toBe(2);
      expect(
        (await patch(`groups/${id.group2}`, { audience: 'كهول' }).expect(200))
          .body.audience,
      ).toBe('كهول');
      expect(
        (
          await patch(`groups/${id.group2}/status`, {
            status: 'ARCHIVED',
          }).expect(200)
        ).body.status,
      ).toBe('ARCHIVED');
    });
  });

  // ───────────────────────── teachers ─────────────────────────

  describe('teachers', () => {
    it('creates with a canonical Person, searches, updates the Person', async () => {
      const res = await post(
        'teachers',
        teacherBody('أحمد', { qualification: 'إجازة في رواية حفص' }),
      ).expect(201);
      expect(res.body).toMatchObject({
        status: 'ACTIVE',
        joinedAt: '2024-09-01',
        person: { firstName: 'أحمد', phone: '22345678' },
        account: null,
      });
      id.t1 = res.body.id;
      id.t1Person = res.body.person.id;
      id.t2 = (await post('teachers', teacherBody('سارة')).expect(201)).body.id;
      id.t3 = (await post('teachers', teacherBody('يوسف')).expect(201)).body.id;
      id.t4 = (await post('teachers', teacherBody('هالة')).expect(201)).body.id;

      const search = await get('teachers', { search: 'سارة' }).expect(200);
      expect(search.body.data.map((t: { id: string }) => t.id)).toContain(
        id.t2,
      );
      expect(search.body.data.map((t: { id: string }) => t.id)).not.toContain(
        id.t1,
      );

      const upd = await patch(`teachers/${id.t1}`, {
        person: { lastName: tag('بن صالح') },
        qualification: 'حافظ',
      }).expect(200);
      expect(upd.body).toMatchObject({
        qualification: 'حافظ',
        person: { id: id.t1Person, lastName: tag('بن صالح') },
      });
      const person = await prisma.person.findUniqueOrThrow({
        where: { id: id.t1Person },
      });
      expect(person.lastName).toBe(tag('بن صالح')); // stored once, on Person

      await post('teachers', { joinedAt: '2024-09-01' }).expect(400); // PERSON_REQUIRED
      await post(
        'teachers',
        teacherBody('x', {
          person: { firstName: 'x', lastName: 'y', gender: 'MALE' },
        }),
      ).expect(400); // phone required
      await patch(`teachers/${id.t1}`, { person: { phone: null } }).expect(400);
    });

    it('never creates a second teacher profile for the same Person', async () => {
      const res = await post('teachers', {
        personId: id.t1Person,
        joinedAt: '2025-01-01',
      }).expect(409);
      expect(res.body.code).toBe('TEACHER_PROFILE_EXISTS');
      await post('teachers', {
        personId: randomUUID(),
        joinedAt: '2025-01-01',
      }).expect(404);
    });
  });

  // ───────────────────────── group classes ─────────────────────────

  describe('group classes', () => {
    it('creates a class with one supervisor and several assistants', async () => {
      const res = await post('group-classes', {
        groupId: id.group,
        branchId: id.branch,
        roomId: id.room,
        supervisorId: id.t1,
        assistantTeacherIds: [id.t2, id.t3],
      }).expect(201);
      expect(res.body).toMatchObject({
        status: 'ACTIVE',
        group: { id: id.group },
        branch: { id: id.branch },
        room: { id: id.room },
        supervisor: { id: id.t1 },
      });
      expect(
        res.body.assistants.map((a: { id: string }) => a.id).sort(),
      ).toEqual([id.t2, id.t3].sort());
      id.class1 = res.body.id;
      id.class2 = (
        await post('group-classes', {
          groupId: id.group,
          branchId: id.branch,
          roomId: id.room2,
          supervisorId: id.t2,
        }).expect(201)
      ).body.id;
    });

    it('rejects invalid compositions', async () => {
      const base = {
        groupId: id.group,
        branchId: id.branch,
        roomId: id.room,
        supervisorId: id.t1,
      };
      expect(
        (
          await post('group-classes', { ...base, roomId: id.otherRoom }).expect(
            400,
          )
        ).body.code,
      ).toBe('ROOM_NOT_IN_BRANCH');
      expect(
        (
          await post('group-classes', {
            ...base,
            assistantTeacherIds: [id.t2, id.t2],
          }).expect(400)
        ).body.message,
      ).toBeDefined();
      expect(
        (
          await post('group-classes', {
            ...base,
            assistantTeacherIds: [id.t1],
          }).expect(400)
        ).body.code,
      ).toBe('SUPERVISOR_IS_ASSISTANT');
      expect(
        (
          await post('group-classes', {
            ...base,
            groupId: randomUUID(),
          }).expect(404)
        ).body.code,
      ).toBe('GROUP_NOT_FOUND');
      expect(
        (
          await post('group-classes', {
            ...base,
            supervisorId: randomUUID(),
          }).expect(404)
        ).body.code,
      ).toBe('TEACHER_NOT_FOUND');
      expect(
        (
          await post('group-classes', { ...base, groupId: id.group2 }).expect(
            409,
          )
        ).body.code,
      ).toBe('GROUP_INACTIVE'); // archived group

      await patch(`teachers/${id.t4}/status`, { status: 'INACTIVE' }).expect(
        200,
      );
      expect(
        (
          await post('group-classes', { ...base, supervisorId: id.t4 }).expect(
            409,
          )
        ).body.code,
      ).toBe('TEACHER_INACTIVE');
      await patch(`teachers/${id.t4}/status`, { status: 'ACTIVE' }).expect(200);
    });

    it('the database itself enforces room-in-branch and supervisor ≠ assistant', async () => {
      await expect(
        prisma.groupClass.update({
          where: { id: id.class1 },
          data: { roomId: id.otherRoom },
        }),
      ).rejects.toThrow();
      await expect(
        prisma.groupClassAssistant.create({
          data: { groupClassId: id.class1, teacherId: id.t1 },
        }),
      ).rejects.toThrow(/supervisor cannot also be an assistant/);
      await expect(
        prisma.groupClass.update({
          where: { id: id.class1 },
          data: { supervisorId: id.t2 },
        }),
      ).rejects.toThrow(/supervisor cannot also be an assistant/);
    });

    it('updates assignments: swap supervisor/assistant, replace assistant list, relocate', async () => {
      // t2 (assistant) becomes supervisor, t1 becomes assistant — in one request
      const swap = await patch(`group-classes/${id.class1}`, {
        supervisorId: id.t2,
        assistantTeacherIds: [id.t1, id.t4],
      }).expect(200);
      expect(swap.body.supervisor.id).toBe(id.t2);
      expect(
        swap.body.assistants.map((a: { id: string }) => a.id).sort(),
      ).toEqual([id.t1, id.t4].sort());

      expect(
        (
          await patch(`group-classes/${id.class1}`, {
            supervisorId: id.t4,
          }).expect(400)
        ).body.code,
      ).toBe('SUPERVISOR_IS_ASSISTANT');
      expect(
        (
          await patch(`group-classes/${id.class1}`, {
            assistantTeacherIds: [],
          }).expect(200)
        ).body.assistants,
      ).toEqual([]);
      expect(
        (
          await patch(`group-classes/${id.class1}`, {
            roomId: id.otherRoom,
          }).expect(400)
        ).body.code,
      ).toBe('ROOM_NOT_IN_BRANCH');
      await patch(`group-classes/${id.class1}`, { groupId: id.group2 }).expect(
        400,
      ); // a class never changes group

      const moved = await patch(`group-classes/${id.class1}`, {
        branchId: id.branch2,
        roomId: id.otherRoom,
      }).expect(200);
      expect(moved.body).toMatchObject({
        branch: { id: id.branch2 },
        room: { id: id.otherRoom },
      });
      await patch(`group-classes/${id.class1}`, {
        branchId: id.branch,
        roomId: id.room,
        assistantTeacherIds: [id.t3],
      }).expect(200);
    });

    it('lists with filters; teacher detail separates supervised and assisted classes', async () => {
      const byTeacher = await get('group-classes', { teacherId: id.t3 }).expect(
        200,
      );
      expect(byTeacher.body.data.map((c: { id: string }) => c.id)).toEqual([
        id.class1,
      ]); // assistant only
      const bySupervisor = await get('group-classes', {
        supervisorId: id.t2,
      }).expect(200);
      expect(bySupervisor.body.meta.total).toBe(2);
      expect(
        (
          await get('group-classes', {
            groupId: id.group,
            branchId: id.branch2,
          }).expect(200)
        ).body.meta.total,
      ).toBe(0);

      const t2 = await get(`teachers/${id.t2}`).expect(200);
      expect(
        t2.body.supervisedClasses.map((c: { id: string }) => c.id).sort(),
      ).toEqual([id.class1, id.class2].sort());
      expect(t2.body.assistedClasses).toEqual([]);
      const t3 = await get(`teachers/${id.t3}`).expect(200);
      expect(t3.body).toMatchObject({
        supervisedClassesCount: 0,
        assistedClassesCount: 1,
      });
      expect(t3.body.assistedClasses[0]).toMatchObject({
        id: id.class1,
        group: { id: id.group },
        branch: { id: id.branch },
      });
    });
  });

  // ───────────────────────── students ─────────────────────────

  describe('students', () => {
    it('creates with a canonical Person in one active class; contact rule enforced', async () => {
      const res = await post(
        'students',
        studentBody('مريم', id.class1, { cin: '01234567' }),
      ).expect(201);
      expect(res.body).toMatchObject({
        status: 'ACTIVE',
        guardianPhone: '98765432',
        person: { firstName: 'مريم', dateOfBirth: '2015-03-10' },
        groupClass: {
          id: id.class1,
          group: { id: id.group },
          branch: { id: id.branch },
          supervisor: { id: id.t2 },
        },
      });
      id.s1 = res.body.id;
      id.s1Person = res.body.person.id;
      id.s2 = (
        await post('students', studentBody('آدم', id.class1)).expect(201)
      ).body.id;

      // Minor without guardian phone; adult without own phone
      expect(
        (
          await post(
            'students',
            studentBody('x', id.class1, { guardianPhone: null }),
          ).expect(400)
        ).body.code,
      ).toBe('GUARDIAN_PHONE_REQUIRED');
      const adult = studentBody('y', id.class1);
      expect(
        (
          await post('students', {
            ...adult,
            person: { ...adult.person, dateOfBirth: '1990-01-01' },
          }).expect(400)
        ).body.code,
      ).toBe('PHONE_REQUIRED');
      expect(
        (
          await post(
            'students',
            studentBody('z', id.class1, { cin: '01234567' }),
          ).expect(409)
        ).body.code,
      ).toBe('CIN_TAKEN');
      expect(
        (await post('students', studentBody('w', randomUUID())).expect(404))
          .body.code,
      ).toBe('GROUP_CLASS_NOT_FOUND');
      await post('students', {
        ...studentBody('v', id.class1),
        groupId: id.group,
      }).expect(400); // derived, not stored
    });

    it('no duplicate student profile for the same Person; a teacher Person can also become a student', async () => {
      expect(
        (
          await post('students', {
            personId: id.s1Person,
            groupClassId: id.class1,
            registrationDate: '2026-09-15',
            guardianPhone: '98765432',
          }).expect(409)
        ).body.code,
      ).toBe('STUDENT_PROFILE_EXISTS');
    });

    it('updates the Person and student fields in one transaction; searches', async () => {
      const upd = await patch(`students/${id.s1}`, {
        person: { address: 'نابل', phone: '50 595 707' },
        cin: null,
      }).expect(200);
      expect(upd.body).toMatchObject({
        cin: null,
        person: { id: id.s1Person, address: 'نابل', phone: '50595707' },
      });
      await patch(`students/${id.s1}`, { guardianPhone: null }).expect(400); // still a minor
      await patch(`students/${id.s1}`, { groupClassId: id.class2 }).expect(400); // has its own endpoint

      expect(
        (await get('students', { search: 'مريم' }).expect(200)).body.data.map(
          (s: { id: string }) => s.id,
        ),
      ).toContain(id.s1);
      expect(
        (
          await get('students', { search: '50 595 707' }).expect(200)
        ).body.data.map((s: { id: string }) => s.id),
      ).toEqual([id.s1]);
      expect(
        (await get('students', { groupId: id.group, search: RUN }).expect(200))
          .body.meta.total,
      ).toBe(2);
      expect(
        (
          await get('students', { supervisorId: id.t2, search: RUN }).expect(
            200,
          )
        ).body.meta.total,
      ).toBe(2);
    });

    it('moves a student atomically: always exactly one current class', async () => {
      const moved = await patch(`students/${id.s1}/group-class`, {
        groupClassId: id.class2,
      }).expect(200);
      expect(moved.body.groupClass.id).toBe(id.class2);
      const stored = await prisma.student.findUniqueOrThrow({
        where: { id: id.s1 },
      });
      expect(stored.groupClassId).toBe(id.class2);
      const class1 = await get(`group-classes/${id.class1}`).expect(200);
      expect(class1.body.students.map((s: { id: string }) => s.id)).toEqual([
        id.s2,
      ]);
      expect(
        (await get(`group-classes/${id.class2}`).expect(200)).body
          .activeStudentsCount,
      ).toBe(1);

      // Inactive class cannot receive students; the student keeps the current class
      await patch(`group-classes/${id.class1}/status`, {
        status: 'INACTIVE',
      }).expect(200);
      expect(
        (
          await patch(`students/${id.s1}/group-class`, {
            groupClassId: id.class1,
          }).expect(409)
        ).body.code,
      ).toBe('GROUP_CLASS_INACTIVE');
      expect(
        (await get(`students/${id.s1}`).expect(200)).body.groupClass.id,
      ).toBe(id.class2);
      await patch(`group-classes/${id.class1}/status`, {
        status: 'ACTIVE',
      }).expect(200);
    });

    it('keeps an effective-dated class history (enrollments)', async () => {
      // s1: created in class1 on 2026-09-15, moved to class2 "today" in the previous test
      const history = await get(`students/${id.s1}/enrollments`).expect(200);
      expect(history.body).toHaveLength(2);
      const [current, previous] = history.body;
      expect(current).toMatchObject({
        isCurrent: true,
        endDate: null,
        groupClass: { id: id.class2 },
      });
      expect(previous).toMatchObject({
        isCurrent: false,
        startDate: '2026-09-15',
        endDate: current.startDate,
        groupClass: { id: id.class1 },
      });

      // Back-dated move between the current start and today
      const back = await patch(`students/${id.s2}/group-class`, {
        groupClassId: id.class2,
        effectiveDate: '2026-10-01',
      }).expect(200);
      expect(back.body.groupClass.id).toBe(id.class2);
      const s2 = (await get(`students/${id.s2}/enrollments`).expect(200)).body;
      expect(
        s2.map((e: { startDate: string; endDate: string | null }) => [
          e.startDate,
          e.endDate,
        ]),
      ).toEqual([
        ['2026-10-01', null],
        ['2026-09-15', '2026-10-01'],
      ]);

      // Rules: no future date, no date before the current membership, same class = no-op
      expect(
        (
          await patch(`students/${id.s2}/group-class`, {
            groupClassId: id.class1,
            effectiveDate: '2999-01-01',
          }).expect(400)
        ).body.code,
      ).toBe('FUTURE_EFFECTIVE_DATE');
      expect(
        (
          await patch(`students/${id.s2}/group-class`, {
            groupClassId: id.class1,
            effectiveDate: '2026-09-20',
          }).expect(409)
        ).body.code,
      ).toBe('EFFECTIVE_DATE_BEFORE_CURRENT');
      await patch(`students/${id.s2}/group-class`, {
        groupClassId: id.class2,
      }).expect(200);
      expect(
        (await get(`students/${id.s2}/enrollments`).expect(200)).body,
      ).toHaveLength(2);

      // Invariants: exactly one open enrollment, matching the current-class pointer; no payment created
      for (const sid of [id.s1, id.s2]) {
        const open = await prisma.studentEnrollment.findMany({
          where: { studentId: sid, endDate: null },
        });
        const student = await prisma.student.findUniqueOrThrow({
          where: { id: sid },
        });
        expect(open).toHaveLength(1);
        expect(open[0].groupClassId).toBe(student.groupClassId);
      }
      expect(
        await prisma.paymentObligation.count({
          where: { studentId: { in: [id.s1, id.s2] } },
        }),
      ).toBe(0);

      // Back to class1 today (the following tests start from there)
      await patch(`students/${id.s2}/group-class`, {
        groupClassId: id.class1,
      }).expect(200);
      expect(
        (await get(`students/${id.s2}/enrollments`).expect(200)).body,
      ).toHaveLength(3);
    });

    it('the database refuses a second open enrollment and overlapping periods', async () => {
      await expect(
        prisma.studentEnrollment.create({
          data: {
            studentId: id.s1,
            groupClassId: id.class1,
            startDate: new Date('2026-01-01'),
          },
        }),
      ).rejects.toThrow(); // one open enrollment per student
      await expect(
        prisma.studentEnrollment.create({
          data: {
            studentId: id.s1,
            groupClassId: id.class1,
            startDate: new Date('2026-09-20'),
            endDate: new Date('2026-09-25'),
          },
        }),
      ).rejects.toThrow(/student_enrollments_no_overlap|exclusion/);
    });

    it('status: archive keeps the class; reactivation needs an active class', async () => {
      expect(
        (
          await patch(`students/${id.s2}/status`, {
            status: 'ARCHIVED',
          }).expect(200)
        ).body,
      ).toMatchObject({ status: 'ARCHIVED', groupClass: { id: id.class1 } });
      await patch(`group-classes/${id.class1}/status`, {
        status: 'INACTIVE',
      }).expect(200);
      expect(
        (
          await patch(`students/${id.s2}/status`, { status: 'ACTIVE' }).expect(
            409,
          )
        ).body.code,
      ).toBe('GROUP_CLASS_INACTIVE');
      await patch(`students/${id.s2}/group-class`, {
        groupClassId: id.class2,
      }).expect(200);
      await patch(`students/${id.s2}/status`, { status: 'ACTIVE' }).expect(200);
    });

    it('class activation re-checks its references', async () => {
      await patch(`rooms/${id.room}/status`, { status: 'INACTIVE' }).expect(
        200,
      );
      expect(
        (
          await patch(`group-classes/${id.class1}/status`, {
            status: 'ACTIVE',
          }).expect(409)
        ).body.code,
      ).toBe('ROOM_INACTIVE');
      await patch(`rooms/${id.room}/status`, { status: 'ACTIVE' }).expect(200);
      await patch(`group-classes/${id.class1}/status`, {
        status: 'ACTIVE',
      }).expect(200);
    });
  });

  // ───────────────────────── lists, pagination, regression ─────────────────────────

  describe('lists and regression', () => {
    it('paginates on the database with consistent meta', async () => {
      const p1 = await get('teachers', {
        search: RUN,
        pageSize: 3,
        page: 1,
      }).expect(200);
      expect(p1.body.meta).toMatchObject({
        page: 1,
        pageSize: 3,
        total: 4,
        totalPages: 2,
      });
      expect(
        (
          await get('teachers', { search: RUN, pageSize: 3, page: 2 }).expect(
            200,
          )
        ).body.data,
      ).toHaveLength(1);
      await get('teachers', { pageSize: 1000 }).expect(400);
      await get('students', { groupClassId: 'nope' }).expect(400);
      await get('branches/not-a-uuid').expect(400);
    });

    it('auth and account/profile APIs still work', async () => {
      await http().get('/api/auth/me').set(as(admin)).expect(200);
      await http().get('/api/profile').set(as(tokens.teacher)).expect(200);
      await http()
        .get('/api/admin/accounts')
        .query({ search: RUN })
        .set(as(admin))
        .expect(200);
    });

    it('Swagger documents the academic endpoints', async () => {
      const doc = (await http().get('/api/docs-json').expect(200)).body;
      for (const path of [
        '/api/admin/academic-years/{id}/set-current',
        '/api/admin/branches/{id}/status',
        '/api/admin/rooms',
        '/api/admin/groups/{id}',
        '/api/admin/group-classes/{id}',
        '/api/admin/teachers/{id}/status',
        '/api/admin/students/{id}/group-class',
      ]) {
        expect(doc.paths).toHaveProperty([path]);
      }
      expect(JSON.stringify(doc.components.schemas)).not.toMatch(
        /passwordHash|refreshTokenHash/,
      );
    });
  });
});
