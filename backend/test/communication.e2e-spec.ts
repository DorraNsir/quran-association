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
const PASSWORD = 'initial-pass-123';
const tag = (s: string) => `${s} ${RUN}`;
const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const TODAY = todayIn('Africa/Tunis');
const URL_OK = 'https://example.org/tajwid';

describe('Resources, announcements & notifications (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const token: Record<string, string> = {};
  const uid: Record<string, string> = {};
  const id: Record<string, string> = {};

  const http = () => request(app.getHttpServer());
  const as = (t: string) => ({ Authorization: `Bearer ${t}` });
  const api = (who: string, space: 'admin' | 'teacher' | 'student') => ({
    get: (path: string, query: object = {}) =>
      http().get(`/api/${space}/${path}`).query(query).set(as(token[who])),
    post: (path: string, body: object = {}) =>
      http().post(`/api/${space}/${path}`).set(as(token[who])).send(body),
    patch: (path: string, body: object) =>
      http().patch(`/api/${space}/${path}`).set(as(token[who])).send(body),
    delete: (path: string) =>
      http().delete(`/api/${space}/${path}`).set(as(token[who])),
  });
  const admin = () => api('admin', 'admin');
  const teacher = (who: string) => api(who, 'teacher');
  const student = (who: string) => api(who, 'student');
  const notif = (who: string) => ({
    list: (query: object = {}) =>
      http().get('/api/notifications').query(query).set(as(token[who])),
    count: async () =>
      (
        await http()
          .get('/api/notifications/unread-count')
          .set(as(token[who]))
          .expect(200)
      ).body.count as number,
    read: (nid: string) =>
      http().patch(`/api/notifications/${nid}/read`).set(as(token[who])),
    readAll: () =>
      http().patch('/api/notifications/read-all').set(as(token[who])),
  });

  /** Keys of this run's accounts notified about an item, sorted. */
  async function recipients(where: {
    resourceId?: string;
    announcementId?: string;
  }) {
    const keyOf = new Map(Object.entries(uid).map(([k, v]) => [v, k]));
    const rows = await prisma.notification.findMany({
      where,
      select: { userId: true },
    });
    return rows
      .map((r) => keyOf.get(r.userId))
      .filter((k): k is string => Boolean(k))
      .sort((a, b) => a.localeCompare(b));
  }

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
        dateOfBirth: new Date('2000-01-01'),
        address: 'نابل',
        phone: '22345678',
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
    id[`person:${key}`] = person.id;
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

  /** Student profile for an existing person, in a class (through the students API). */
  const enroll = async (key: string, classKey: string) =>
    (id[`student:${key}`] = (
      await admin()
        .post('students', {
          personId: id[`person:${key}`],
          groupClassId: id[classKey],
          registrationDate: TODAY,
        })
        .expect(201)
    ).body.id);

  const linkResource = (extra: object = {}) => ({
    title: 'شرح أحكام النون الساكنة',
    description: 'درس مصوّر',
    type: 'VIDEO_LINK',
    externalUrl: URL_OK,
    ...extra,
  });

  /** Admin draft + publish; returns the announcement id. */
  async function adminAnnouncement(body: object) {
    const created = await admin()
      .post('announcements', { title: 'إعلان', content: 'نص', ...body })
      .expect(201);
    await admin().post(`announcements/${created.body.id}/publish`).expect(200);
    return created.body.id as string;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    await account('admin', [Role.ADMIN]);
    await account('adminTeacher', [Role.ADMIN, Role.TEACHER], {
      teacher: true,
    });
    await account('sup', [Role.TEACHER], { teacher: true });
    await account('asst', [Role.TEACHER], { teacher: true });
    await account('other', [Role.TEACHER], { teacher: true });
    await account('multi', [Role.TEACHER, Role.STUDENT], { teacher: true });
    for (const s of [
      'stu1',
      'stu2',
      'stu3',
      'inactiveStu',
      'noProfile',
      'leaver',
    ])
      await account(s, [Role.STUDENT]);
    await account('disabled', [Role.STUDENT], { isActive: false });

    const make = async (path: string, key: string, body: object) =>
      (id[key] = (await admin().post(path, body).expect(201)).body.id);
    await make('branches', 'B1', { name: tag('B1'), address: 'نابل' });
    await make('branches', 'B2', { name: tag('B2'), address: 'قربة' });
    await make('rooms', 'R1', { branchId: id.B1, name: tag('R1') });
    await make('rooms', 'R2', { branchId: id.B2, name: tag('R2') });
    await make('groups', 'G1', { name: tag('G1'), audience: 'أطفال' });
    await make('groups', 'G2', { name: tag('G2'), audience: 'كبار' });
    const cls = (
      key: string,
      g: string,
      b: string,
      r: string,
      sup: string,
      assistants: string[] = [],
    ) =>
      make('group-classes', key, {
        groupId: id[g],
        branchId: id[b],
        roomId: id[r],
        supervisorId: id[`teacher:${sup}`],
        assistantTeacherIds: assistants.map((a) => id[`teacher:${a}`]),
      });
    await cls('C1', 'G1', 'B1', 'R1', 'sup', ['asst', 'multi']);
    await cls('C2', 'G1', 'B1', 'R1', 'adminTeacher');
    await cls('C3', 'G2', 'B2', 'R2', 'other');
    await cls('C4', 'G2', 'B2', 'R2', 'other');

    await enroll('stu1', 'C1');
    await enroll('multi', 'C1');
    await enroll('stu2', 'C2');
    await enroll('stu3', 'C3');
    await enroll('leaver', 'C3');
    await enroll('inactiveStu', 'C1');
    await enroll('disabled', 'C1');
    await admin()
      .patch(`students/${id['student:inactiveStu']}/status`, {
        status: 'INACTIVE',
      })
      .expect(200);
    // A student without any account
    await admin()
      .post('students', {
        person: {
          firstName: 'بلا حساب',
          lastName: tag('طالب'),
          gender: 'FEMALE',
          dateOfBirth: '2000-02-02',
          address: 'نابل',
          phone: '22345678',
        },
        groupClassId: id.C1,
        registrationDate: TODAY,
      })
      .expect(201);
  });

  afterAll(async () => {
    const persons = (
      await prisma.person.findMany({
        where: { lastName: { endsWith: RUN } },
        select: { id: true },
      })
    ).map((p) => p.id);
    const users = Object.values(uid);
    const studentWhere = { personId: { in: persons } };
    const classes = { group: { name: { endsWith: RUN } } };
    await prisma.notification.deleteMany({ where: { userId: { in: users } } });
    await prisma.resource.deleteMany({
      where: { publishedByUserId: { in: users } },
    });
    await prisma.announcement.deleteMany({
      where: { publishedByUserId: { in: users } },
    });
    await prisma.studentEnrollment.deleteMany({
      where: { student: studentWhere },
    });
    await prisma.studentStatusChange.deleteMany({
      where: { student: studentWhere },
    });
    await prisma.student.deleteMany({ where: studentWhere });
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

  /* ================================================================ */
  /* Resources                                                        */
  /* ================================================================ */

  describe('resources', () => {
    it('admin publishes to a class: only active student accounts of that class are notified', async () => {
      const res = await admin()
        .post(
          'resources',
          linkResource({ visibility: 'GROUP_CLASS', groupClassIds: [id.C1] }),
        )
        .expect(201);
      expect(res.body).toMatchObject({
        type: 'VIDEO_LINK',
        externalUrl: URL_OK,
        visibility: 'GROUP_CLASS',
        file: null,
        groupClasses: [
          { id: id.C1, group: { id: id.G1 }, branch: { id: id.B1 } },
        ],
        publishedBy: { id: uid.admin, firstName: 'admin' },
        canManage: true,
      });
      id.resAdminC1 = res.body.id;
      // Not: teachers, the inactive student, the disabled account, the student without account
      expect(await recipients({ resourceId: id.resAdminC1 })).toEqual([
        'multi',
        'stu1',
      ]);
    });

    it('admin targets every student or a whole group', async () => {
      const all = await admin()
        .post(
          'resources',
          linkResource({ title: 'للجميع', visibility: 'ALL_STUDENTS' }),
        )
        .expect(201);
      id.resAll = all.body.id;
      expect(await recipients({ resourceId: id.resAll })).toEqual([
        'leaver',
        'multi',
        'stu1',
        'stu2',
        'stu3',
      ]);
      const group = await admin()
        .post(
          'resources',
          linkResource({
            title: 'للمجموعة',
            visibility: 'GROUP',
            groupIds: [id.G1],
          }),
        )
        .expect(201);
      id.resG1 = group.body.id;
      expect(await recipients({ resourceId: id.resG1 })).toEqual([
        'multi',
        'stu1',
        'stu2',
      ]);
    });

    it('supervisors and assistants publish to their own class; the author is never notified', async () => {
      const bySup = await teacher('sup')
        .post(
          'resources',
          linkResource({ title: 'ملخص المشرف', groupClassIds: [id.C1] }),
        )
        .expect(201);
      id.resSup = bySup.body.id;
      expect(bySup.body).toMatchObject({
        visibility: 'GROUP_CLASS',
        canManage: true,
      });
      expect(await recipients({ resourceId: id.resSup })).toEqual([
        'multi',
        'stu1',
      ]);
      const byAsst = await teacher('asst')
        .post(
          'resources',
          linkResource({ title: 'ملخص المساعد', groupClassIds: [id.C1] }),
        )
        .expect(201);
      id.resAsst = byAsst.body.id;
      // multi (assistant + student of C1) publishing: not notified of its own resource
      const byMulti = await teacher('multi')
        .post(
          'resources',
          linkResource({ title: 'من مساعد طالب', groupClassIds: [id.C1] }),
        )
        .expect(201);
      expect(await recipients({ resourceId: byMulti.body.id })).toEqual([
        'stu1',
      ]);
    });

    it('an unassigned teacher, a student, or a client-chosen author cannot publish', async () => {
      expect(
        (
          await teacher('other')
            .post('resources', linkResource({ groupClassIds: [id.C1] }))
            .expect(403)
        ).body.code,
      ).toBe('RESOURCE_CLASS_ACCESS_DENIED');
      await teacher('sup')
        .post(
          'resources',
          linkResource({ groupClassIds: [id.C1], visibility: 'ALL_STUDENTS' }),
        )
        .expect(400);
      await teacher('sup')
        .post(
          'resources',
          linkResource({
            groupClassIds: [id.C1],
            publishedByUserId: uid.other,
          }),
        )
        .expect(400);
      await http()
        .post('/api/teacher/resources')
        .set(as(token.stu1))
        .send(linkResource({ groupClassIds: [id.C1] }))
        .expect(403);
      await http()
        .post('/api/admin/resources')
        .set(as(token.sup))
        .send(linkResource({ visibility: 'ALL_STUDENTS' }))
        .expect(403);
      await http()
        .post('/api/student/resources')
        .set(as(token.stu1))
        .send({})
        .expect(404);
    });

    it('validates links, types and targets (no unsafe URL, no file without storage)', async () => {
      const code = async (body: object) =>
        (
          await admin().post('resources', {
            visibility: 'ALL_STUDENTS',
            ...linkResource(body),
          })
        ).body.code;
      expect(await code({ externalUrl: undefined })).toBe(
        'RESOURCE_URL_REQUIRED',
      );
      for (const externalUrl of [
        'javascript:alert(1)',
        'ftp://example.org/a',
        'data:text/html,x',
        '/etc/passwd',
        'example.org',
      ])
        await admin()
          .post(
            'resources',
            linkResource({ visibility: 'ALL_STUDENTS', externalUrl }),
          )
          .expect(400);
      for (const type of ['PDF', 'IMAGE', 'AUDIO', 'FILE'])
        expect(await code({ type, externalUrl: undefined })).toBe(
          'RESOURCE_FILE_UPLOAD_UNAVAILABLE',
        );
      await admin()
        .post(
          'resources',
          linkResource({
            visibility: 'ALL_STUDENTS',
            fileUrl: '/uploads/x.pdf',
          }),
        )
        .expect(400);
      await admin()
        .post(
          'resources',
          linkResource({ visibility: 'ALL_STUDENTS', title: '  ' }),
        )
        .expect(400);
      const target = async (body: object) =>
        (await admin().post('resources', linkResource(body)).expect(400)).body
          .code;
      expect(
        await target({ visibility: 'ALL_STUDENTS', groupIds: [id.G1] }),
      ).toBe('RESOURCE_TARGET_INVALID');
      expect(
        await target({ visibility: 'GROUP', groupClassIds: [id.C1] }),
      ).toBe('RESOURCE_TARGET_INVALID');
      expect(await target({ visibility: 'GROUP_CLASS' })).toBe(
        'RESOURCE_TARGET_INVALID',
      );
      expect(
        await target({
          visibility: 'GROUP_CLASS',
          groupClassIds: [randomUUID()],
        }),
      ).toBe('RESOURCE_TARGET_INVALID');
      // The database refuses a file resource without a stored file reference
      await expect(
        prisma.resource.create({
          data: {
            title: 'x',
            type: 'PDF',
            visibility: 'ALL_STUDENTS',
            publishedByUserId: uid.admin,
          },
        }),
      ).rejects.toThrow(/resources_content_check/);
    });

    it('students see their own class, group and all-students resources only', async () => {
      const titles = async (who: string) =>
        (
          await student(who).get('resources', { pageSize: 100 }).expect(200)
        ).body.data
          .map((r: { id: string }) => r.id)
          .sort();
      const mine = await titles('stu1');
      expect(mine).toEqual(
        expect.arrayContaining([id.resAdminC1, id.resAll, id.resG1, id.resSup]),
      );
      const stu3 = await titles('stu3');
      expect(stu3).toContain(id.resAll);
      expect(stu3).not.toContain(id.resAdminC1);
      expect(stu3).not.toContain(id.resG1);
      expect(
        (await student('stu3').get(`resources/${id.resSup}`).expect(404)).body
          .code,
      ).toBe('RESOURCE_NOT_FOUND');
      expect(
        (await student('stu1').get(`resources/${id.resSup}`).expect(200)).body
          .canManage,
      ).toBe(false);
      await student('stu1').get(`resources/${randomUUID()}`).expect(404);
      // Student guards: profile required, active profile required, STUDENT role required
      expect(
        (await student('noProfile').get('resources').expect(403)).body.code,
      ).toBe('STUDENT_PROFILE_REQUIRED');
      expect(
        (await student('inactiveStu').get('resources').expect(403)).body.code,
      ).toBe('STUDENT_INACTIVE');
      await student('sup').get('resources').expect(403);
    });

    it('a teacher edits and deletes only their own resources; edits never notify again', async () => {
      expect(
        (
          await teacher('asst')
            .patch(`resources/${id.resSup}`, { title: 'x' })
            .expect(403)
        ).body.code,
      ).toBe('RESOURCE_EDIT_FORBIDDEN');
      await teacher('asst').delete(`resources/${id.resSup}`).expect(403);
      // Another class's teacher cannot even see it
      await teacher('other').get(`resources/${id.resSup}`).expect(404);
      await teacher('other')
        .patch(`resources/${id.resSup}`, { title: 'x' })
        .expect(404);
      const before = await prisma.notification.count({
        where: { resourceId: id.resSup },
      });
      const edited = await teacher('sup')
        .patch(`resources/${id.resSup}`, {
          title: 'ملخص المشرف (مُحدَّث)',
          externalUrl: 'https://example.org/v2',
        })
        .expect(200);
      expect(edited.body).toMatchObject({
        title: 'ملخص المشرف (مُحدَّث)',
        externalUrl: 'https://example.org/v2',
      });
      expect(
        await prisma.notification.count({ where: { resourceId: id.resSup } }),
      ).toBe(before);
      await teacher('sup')
        .patch(`resources/${id.resSup}`, { externalUrl: 'javascript:x' })
        .expect(400);
      await teacher('sup')
        .patch(`resources/${id.resSup}`, { groupClassIds: [id.C3] })
        .expect(403);
      // Admin may edit anyone's resource
      await admin()
        .patch(`resources/${id.resSup}`, { description: 'مراجعة الإدارة' })
        .expect(200);
    });

    it('teacher lists follow CURRENT assignments; ADMIN+TEACHER gets no admin rights on teacher routes', async () => {
      const ids = async (who: string) =>
        (
          await teacher(who).get('resources', { pageSize: 100 }).expect(200)
        ).body.data.map((r: { id: string }) => r.id);
      const asTeacher = await ids('adminTeacher');
      expect(asTeacher).toContain(id.resG1); // C2 is in G1
      expect(asTeacher).toContain(id.resAll);
      expect(asTeacher).not.toContain(id.resAdminC1);
      await teacher('adminTeacher')
        .get(`resources/${id.resAdminC1}`)
        .expect(404);
      await teacher('adminTeacher')
        .post('resources', linkResource({ groupClassIds: [id.C1] }))
        .expect(403);
      // …while the admin workspace sees everything
      await api('adminTeacher', 'admin')
        .get(`resources/${id.resAdminC1}`)
        .expect(200);
      const mine = (
        await teacher('sup').get('resources', { mine: true, pageSize: 100 })
      ).body.data;
      expect(mine.every((r: { canManage: boolean }) => r.canManage)).toBe(true);
    });

    it('removing an assignment revokes current class access (authorship kept)', async () => {
      await admin()
        .patch(`group-classes/${id.C1}`, {
          assistantTeacherIds: [id['teacher:multi']],
        })
        .expect(200);
      await teacher('asst').get(`resources/${id.resSup}`).expect(404);
      const list = (
        await teacher('asst').get('resources', { pageSize: 100 })
      ).body.data.map((r: { id: string }) => r.id);
      expect(list).not.toContain(id.resSup);
      expect(list).toContain(id.resAsst); // own, still visible
      expect(
        (
          await teacher('asst')
            .patch(`resources/${id.resAsst}`, { title: 'x' })
            .expect(403)
        ).body.code,
      ).toBe('RESOURCE_CLASS_ACCESS_DENIED');
      await teacher('asst')
        .post('resources', linkResource({ groupClassIds: [id.C1] }))
        .expect(403);
      // Re-assigned → access is back
      await admin()
        .patch(`group-classes/${id.C1}`, {
          assistantTeacherIds: [id['teacher:asst'], id['teacher:multi']],
        })
        .expect(200);
      await teacher('asst').get(`resources/${id.resSup}`).expect(200);
    });

    it('deleting a resource removes its notifications (no dangling links)', async () => {
      const r = await teacher('sup')
        .post(
          'resources',
          linkResource({ title: 'مؤقت', groupClassIds: [id.C1] }),
        )
        .expect(201);
      expect(
        await prisma.notification.count({ where: { resourceId: r.body.id } }),
      ).toBe(2);
      await teacher('sup').delete(`resources/${r.body.id}`).expect(204);
      expect(
        await prisma.notification.count({ where: { resourceId: r.body.id } }),
      ).toBe(0);
      await admin().get(`resources/${r.body.id}`).expect(404);
      await admin().delete(`resources/${randomUUID()}`).expect(404);
    });

    it('lists with filters and pagination', async () => {
      const list = (q: object) =>
        admin()
          .get('resources', { search: 'ملخص', ...q })
          .expect(200);
      expect((await list({ pageSize: 100 })).body.meta.total).toBe(2);
      expect(
        (await list({ groupClassId: id.C1, mine: true })).body.meta.total,
      ).toBe(0);
      expect(
        (await admin().get('resources', { visibility: 'GROUP' })).body.data.map(
          (r: { id: string }) => r.id,
        ),
      ).toContain(id.resG1);
      expect(
        (await admin().get('resources', { groupId: id.G1 })).body.data[0].id,
      ).toBe(id.resG1);
      const page = (await admin().get('resources', { pageSize: 1, page: 2 }))
        .body;
      expect(page.data).toHaveLength(1);
      await admin().get('resources', { type: 'TEXT' }).expect(400);
    });
  });

  /* ================================================================ */
  /* Announcements                                                    */
  /* ================================================================ */

  describe('announcements', () => {
    it('a draft is invisible and notifies nobody until it is published', async () => {
      const draft = await admin()
        .post('announcements', {
          title: 'اجتماع عام',
          content: 'اجتماع الأولياء يوم السبت',
          audience: 'EVERYONE',
        })
        .expect(201);
      expect(draft.body).toMatchObject({
        status: 'DRAFT',
        state: 'DRAFT',
        publishedAt: TODAY,
        firstPublishedAt: null,
      });
      id.annEveryone = draft.body.id;
      expect(
        await prisma.notification.count({
          where: { announcementId: id.annEveryone },
        }),
      ).toBe(0);
      await student('stu1').get(`announcements/${id.annEveryone}`).expect(404);
      await teacher('sup').get(`announcements/${id.annEveryone}`).expect(404);

      const published = await admin()
        .post(`announcements/${id.annEveryone}/publish`)
        .expect(200);
      expect(published.body.announcement).toMatchObject({
        status: 'PUBLISHED',
        state: 'ACTIVE',
      });
      expect(published.body.announcement.firstPublishedAt).toBeTruthy();
      // Everyone active with an eligible profile/role — once each, author excluded
      expect(await recipients({ announcementId: id.annEveryone })).toEqual([
        'adminTeacher',
        'asst',
        'leaver',
        'multi',
        'other',
        'stu1',
        'stu2',
        'stu3',
        'sup',
      ]);
      await student('stu1').get(`announcements/${id.annEveryone}`).expect(200);
    });

    it('a repeated or concurrent publish is refused and never notifies twice', async () => {
      expect(
        (
          await admin()
            .post(`announcements/${id.annEveryone}/publish`)
            .expect(409)
        ).body.code,
      ).toBe('ANNOUNCEMENT_PUBLISH_CONFLICT');
      const draft = await admin()
        .post('announcements', {
          title: 'تزامن',
          content: 'نص',
          audience: 'STUDENTS',
        })
        .expect(201);
      const results = await Promise.all(
        [0, 1, 2].map(() =>
          admin().post(`announcements/${draft.body.id}/publish`),
        ),
      );
      expect(results.map((r) => r.status).sort((a, b) => a - b)).toEqual([
        200, 409, 409,
      ]);
      expect(await recipients({ announcementId: draft.body.id })).toEqual([
        'leaver',
        'multi',
        'stu1',
        'stu2',
        'stu3',
      ]);
      id.annStudents = draft.body.id;
    });

    it('targets roles, branches and classes; multi-role accounts are notified once', async () => {
      id.annTeachers = await adminAnnouncement({ audience: 'TEACHERS' });
      expect(await recipients({ announcementId: id.annTeachers })).toEqual([
        'adminTeacher',
        'asst',
        'multi',
        'other',
        'sup',
      ]);
      id.annB2 = await adminAnnouncement({
        audience: 'SPECIFIC_BRANCHES',
        branchIds: [id.B2],
      });
      expect(await recipients({ announcementId: id.annB2 })).toEqual([
        'leaver',
        'other',
        'stu3',
      ]);
      id.annB1 = await adminAnnouncement({
        audience: 'SPECIFIC_BRANCHES',
        branchIds: [id.B1],
      });
      expect(await recipients({ announcementId: id.annB1 })).toEqual([
        'adminTeacher',
        'asst',
        'multi',
        'stu1',
        'stu2',
        'sup',
      ]);
      id.annC1 = await adminAnnouncement({
        audience: 'SPECIFIC_GROUP_CLASSES',
        groupClassIds: [id.C1],
      });
      expect(await recipients({ announcementId: id.annC1 })).toEqual([
        'asst',
        'multi',
        'stu1',
        'sup',
      ]);
    });

    it('validates audiences, targets and dates', async () => {
      const code = async (body: object) =>
        (
          await admin()
            .post('announcements', { title: 't', content: 'c', ...body })
            .expect(400)
        ).body.code;
      expect(await code({ audience: 'SPECIFIC_BRANCHES' })).toBe(
        'ANNOUNCEMENT_TARGET_INVALID',
      );
      expect(
        await code({ audience: 'SPECIFIC_GROUP_CLASSES', branchIds: [id.B1] }),
      ).toBe('ANNOUNCEMENT_TARGET_INVALID');
      expect(await code({ audience: 'EVERYONE', groupClassIds: [id.C1] })).toBe(
        'ANNOUNCEMENT_TARGET_INVALID',
      );
      expect(
        await code({
          audience: 'SPECIFIC_BRANCHES',
          branchIds: [randomUUID()],
        }),
      ).toBe('ANNOUNCEMENT_TARGET_INVALID');
      expect(
        await code({
          audience: 'EVERYONE',
          publishedAt: TODAY,
          expiresAt: addDays(TODAY, -1),
        }),
      ).toBe('INVALID_DATE_RANGE');
      await admin()
        .post('announcements', {
          title: 't',
          content: '',
          audience: 'EVERYONE',
        })
        .expect(400);
      await admin()
        .post('announcements', { title: 't', content: 'c', audience: 'ROLE' })
        .expect(400);
      await admin()
        .post('announcements', {
          title: 't',
          content: 'c',
          audience: 'EVERYONE',
          status: 'PUBLISHED',
        })
        .expect(400);
      await admin()
        .post('announcements', {
          title: 't',
          content: 'c',
          audience: 'EVERYONE',
          publishedByUserId: uid.sup,
        })
        .expect(400);
    });

    it('assigned teachers announce to their classes only (no global, no unrelated class)', async () => {
      const draft = await teacher('sup')
        .post('announcements', {
          title: 'لا حصة غدًا',
          content: 'تُلغى حصة الغد',
          groupClassIds: [id.C1],
        })
        .expect(201);
      expect(draft.body).toMatchObject({
        audience: 'SPECIFIC_GROUP_CLASSES',
        status: 'DRAFT',
        canManage: true,
      });
      id.annSup = draft.body.id;
      // Another teacher of the class cannot see the draft, nor publish it
      await teacher('asst').get(`announcements/${id.annSup}`).expect(404);
      await teacher('asst')
        .post(`announcements/${id.annSup}/publish`)
        .expect(404);
      const pub = await teacher('sup')
        .post(`announcements/${id.annSup}/publish`)
        .expect(200);
      expect(pub.body.notifiedCount).toBe(3);
      expect(await recipients({ announcementId: id.annSup })).toEqual([
        'asst',
        'multi',
        'stu1',
      ]);

      await teacher('sup')
        .post('announcements', {
          title: 't',
          content: 'c',
          groupClassIds: [id.C1],
          audience: 'EVERYONE',
        })
        .expect(400);
      expect(
        (
          await teacher('sup')
            .post('announcements', {
              title: 't',
              content: 'c',
              groupClassIds: [id.C3],
            })
            .expect(403)
        ).body.code,
      ).toBe('ANNOUNCEMENT_CLASS_ACCESS_DENIED');
      await teacher('sup')
        .post('announcements', { title: 't', content: 'c' })
        .expect(400);
      // A published announcement of another teacher is readable but not manageable
      expect(
        (
          await teacher('asst')
            .patch(`announcements/${id.annSup}`, { title: 'x' })
            .expect(403)
        ).body.code,
      ).toBe('ANNOUNCEMENT_EDIT_FORBIDDEN');
      await teacher('asst').delete(`announcements/${id.annSup}`).expect(403);
      await http()
        .post('/api/teacher/announcements')
        .set(as(token.stu1))
        .send({ title: 't', content: 'c', groupClassIds: [id.C1] })
        .expect(403);
    });

    it('students and teachers read only what targets them', async () => {
      const ids = async (who: string, space: 'student' | 'teacher') =>
        (
          await api(who, space)
            .get('announcements', { pageSize: 100 })
            .expect(200)
        ).body.data.map((a: { id: string }) => a.id);
      const stu1 = await ids('stu1', 'student');
      expect(stu1).toEqual(
        expect.arrayContaining([
          id.annEveryone,
          id.annStudents,
          id.annB1,
          id.annC1,
          id.annSup,
        ]),
      );
      expect(stu1).not.toContain(id.annTeachers);
      expect(stu1).not.toContain(id.annB2);
      const stu3 = await ids('stu3', 'student');
      expect(stu3).toEqual(expect.arrayContaining([id.annEveryone, id.annB2]));
      expect(stu3).not.toContain(id.annC1);
      await student('stu3').get(`announcements/${id.annC1}`).expect(404);
      await student('stu1').get(`announcements/${id.annTeachers}`).expect(404);
      const other = await ids('other', 'teacher');
      expect(other).toEqual(
        expect.arrayContaining([id.annEveryone, id.annTeachers, id.annB2]),
      );
      expect(other).not.toContain(id.annC1);
      expect(other).not.toContain(id.annStudents);
    });

    it('a published announcement keeps its audience; edits never notify again', async () => {
      const before = await prisma.notification.count({
        where: { announcementId: id.annC1 },
      });
      const res = await admin()
        .patch(`announcements/${id.annC1}`, {
          title: 'عنوان مصحّح',
          content: 'نص مصحّح',
        })
        .expect(200);
      expect(res.body).toMatchObject({
        title: 'عنوان مصحّح',
        status: 'PUBLISHED',
      });
      expect(
        await prisma.notification.count({
          where: { announcementId: id.annC1 },
        }),
      ).toBe(before);
      for (const body of [
        { audience: 'EVERYONE', groupClassIds: [] },
        { groupClassIds: [id.C2] },
        { publishedAt: addDays(TODAY, 3) },
      ])
        expect(
          (await admin().patch(`announcements/${id.annC1}`, body).expect(409))
            .body.code,
        ).toBe('ANNOUNCEMENT_PUBLISHED_LOCKED');
      await expect(
        prisma.announcement.update({
          where: { id: id.annC1 },
          data: { audience: 'EVERYONE' },
        }),
      ).rejects.toThrow(/announcements_published_locked/);
      // A draft is fully editable (retargeting included)
      const draft = await admin()
        .post('announcements', {
          title: 'مسودة',
          content: 'نص',
          audience: 'EVERYONE',
        })
        .expect(201);
      const retargeted = await admin()
        .patch(`announcements/${draft.body.id}`, {
          audience: 'SPECIFIC_BRANCHES',
          branchIds: [id.B2],
        })
        .expect(200);
      expect(retargeted.body.branches.map((b: { id: string }) => b.id)).toEqual(
        [id.B2],
      );
      await admin().delete(`announcements/${draft.body.id}`).expect(204);
    });

    it('archiving hides the announcement; its notification no longer opens it', async () => {
      const notification = (
        await notif('stu1').list({ pageSize: 100 })
      ).body.data.find(
        (n: { entityId: string }) => n.entityId === id.annStudents,
      );
      expect(notification).toMatchObject({
        type: 'ANNOUNCEMENT_PUBLISHED',
        entityType: 'ANNOUNCEMENT',
      });
      const res = await admin()
        .post(`announcements/${id.annStudents}/archive`)
        .expect(200);
      expect(res.body).toMatchObject({ status: 'ARCHIVED', state: 'ARCHIVED' });
      await student('stu1').get(`announcements/${id.annStudents}`).expect(404);
      expect(
        (
          await student('stu1').get('announcements', { pageSize: 100 })
        ).body.data.map((a: { id: string }) => a.id),
      ).not.toContain(id.annStudents);
      // The notification stays in the history; opening the content is re-authorized
      await notif('stu1').read(notification.id).expect(200);
      expect(
        (
          await admin()
            .post(`announcements/${id.annStudents}/archive`)
            .expect(409)
        ).body.code,
      ).toBe('ANNOUNCEMENT_NOT_PUBLISHED');
      expect(
        (
          await admin()
            .patch(`announcements/${id.annStudents}`, { title: 'x' })
            .expect(409)
        ).body.code,
      ).toBe('ANNOUNCEMENT_ARCHIVED');
      await admin().post(`announcements/${id.annStudents}/publish`).expect(409);
    });

    it('a scheduled announcement (and its notification) appears on its publication day', async () => {
      const before = await notif('stu2').count();
      const id2 = await adminAnnouncement({
        audience: 'STUDENTS',
        publishedAt: addDays(TODAY, 2),
      });
      expect((await admin().get(`announcements/${id2}`)).body.state).toBe(
        'SCHEDULED',
      );
      expect(
        await prisma.notification.count({ where: { announcementId: id2 } }),
      ).toBeGreaterThan(0);
      expect(await notif('stu2').count()).toBe(before);
      await student('stu2').get(`announcements/${id2}`).expect(404);
      const hidden = (
        await notif('stu2').list({ pageSize: 100 })
      ).body.data.map((n: { entityId: string }) => n.entityId);
      expect(hidden).not.toContain(id2);
      // An already-expired draft cannot be published
      const expired = await admin()
        .post('announcements', {
          title: 'قديم',
          content: 'نص',
          audience: 'EVERYONE',
          publishedAt: addDays(TODAY, -5),
          expiresAt: addDays(TODAY, -1),
        })
        .expect(201);
      expect(
        (
          await admin()
            .post(`announcements/${expired.body.id}/publish`)
            .expect(409)
        ).body.code,
      ).toBe('ANNOUNCEMENT_EXPIRED');
    });

    it('publication is atomic: an invalid target publishes nothing and notifies nobody', async () => {
      const draft = await admin()
        .post('announcements', {
          title: 'إلى حلقة ستُغلق',
          content: 'نص',
          audience: 'SPECIFIC_GROUP_CLASSES',
          groupClassIds: [id.C4],
        })
        .expect(201);
      await admin()
        .patch(`group-classes/${id.C4}/status`, { status: 'INACTIVE' })
        .expect(200);
      expect(
        (
          await admin()
            .post(`announcements/${draft.body.id}/publish`)
            .expect(400)
        ).body.code,
      ).toBe('ANNOUNCEMENT_TARGET_INVALID');
      expect(
        (await admin().get(`announcements/${draft.body.id}`)).body.status,
      ).toBe('DRAFT');
      expect(
        await prisma.notification.count({
          where: { announcementId: draft.body.id },
        }),
      ).toBe(0);
    });

    it('a teacher removed from the class loses its announcements and cannot publish there', async () => {
      const draft = await teacher('asst')
        .post('announcements', {
          title: 'من المساعد',
          content: 'نص',
          groupClassIds: [id.C1],
        })
        .expect(201);
      await admin()
        .patch(`group-classes/${id.C1}`, {
          assistantTeacherIds: [id['teacher:multi']],
        })
        .expect(200);
      expect(
        (
          await teacher('asst')
            .post(`announcements/${draft.body.id}/publish`)
            .expect(403)
        ).body.code,
      ).toBe('ANNOUNCEMENT_CLASS_ACCESS_DENIED');
      await teacher('asst').get(`announcements/${id.annC1}`).expect(404);
      await teacher('asst').get(`announcements/${id.annSup}`).expect(404);
      // Its own draft stays visible and deletable (authorship preserved)
      await teacher('asst').get(`announcements/${draft.body.id}`).expect(200);
      await teacher('asst')
        .delete(`announcements/${draft.body.id}`)
        .expect(204);
      await admin()
        .patch(`group-classes/${id.C1}`, {
          assistantTeacherIds: [id['teacher:asst'], id['teacher:multi']],
        })
        .expect(200);
    });

    it('admin lists with filters', async () => {
      const list = (q: object) =>
        admin()
          .get('announcements', { pageSize: 100, ...q })
          .expect(200);
      const drafts = (await list({ status: 'DRAFT' })).body.data;
      expect(
        drafts.every((a: { status: string }) => a.status === 'DRAFT'),
      ).toBe(true);
      expect(
        (await list({ branchId: id.B2 })).body.data.map(
          (a: { id: string }) => a.id,
        ),
      ).toContain(id.annB2);
      expect(
        (
          await list({
            groupClassId: id.C1,
            audience: 'SPECIFIC_GROUP_CLASSES',
          })
        ).body.meta.total,
      ).toBe(2);
      expect((await list({ search: 'لا حصة' })).body.data[0].id).toBe(
        id.annSup,
      );
      expect(
        (await list({ from: addDays(TODAY, 1) })).body.data.every(
          (a: { publishedAt: string }) => a.publishedAt > TODAY,
        ),
      ).toBe(true);
      expect(
        (
          await teacher('sup').get('announcements', { mine: true })
        ).body.data.map((a: { id: string }) => a.id),
      ).toEqual([id.annSup]);
      await admin().get(`announcements/${randomUUID()}`).expect(404);
    });
  });

  /* ================================================================ */
  /* Notifications                                                    */
  /* ================================================================ */

  describe('notifications', () => {
    it('lists my notifications newest first with safe navigation metadata', async () => {
      const res = await notif('stu3').list().expect(200);
      expect(res.body.meta.total).toBeGreaterThan(0);
      const first = res.body.data[0];
      expect(Object.keys(first).sort()).toEqual(
        [
          'createdAt',
          'entityId',
          'entityType',
          'id',
          'isRead',
          'message',
          'readAt',
          'title',
          'type',
        ].sort(),
      );
      const dates = res.body.data.map(
        (n: { createdAt: string }) => n.createdAt,
      );
      expect([...dates].sort((a, b) => b.localeCompare(a))).toEqual(dates);
      // Nothing addressed to another user leaks into my list
      const own = await prisma.notification.count({
        where: { userId: uid.stu3 },
      });
      expect(res.body.meta.total).toBeLessThanOrEqual(own);
      // Admins receive EVERYONE announcements only (the author excluded)
      const adminTeacher = (await notif('adminTeacher').list({ pageSize: 100 }))
        .body.data;
      expect(
        adminTeacher.map((n: { entityId: string }) => n.entityId),
      ).toContain(id.annEveryone);
      expect((await notif('admin').list()).body.meta.total).toBe(0);
    });

    it('counts unread, marks one / all as read, idempotently, for myself only', async () => {
      const unread = await notif('stu3').count();
      expect(unread).toBeGreaterThan(1);
      const [n] = (await notif('stu3').list({ unreadOnly: true })).body.data;
      const first = await notif('stu3').read(n.id).expect(200);
      expect(first.body.isRead).toBe(true);
      const again = await notif('stu3').read(n.id).expect(200);
      expect(again.body.readAt).toBe(first.body.readAt);
      expect(await notif('stu3').count()).toBe(unread - 1);
      // Someone else's notification: 404, and it stays unread
      expect((await notif('stu1').read(n.id).expect(404)).body.code).toBe(
        'NOTIFICATION_NOT_FOUND',
      );
      const [other] = (await notif('stu1').list({ unreadOnly: true })).body
        .data;
      await notif('stu3').read(other.id).expect(404);
      expect(
        (
          await prisma.notification.findUniqueOrThrow({
            where: { id: other.id },
          })
        ).readAt,
      ).toBeNull();
      await notif('stu3').read(randomUUID()).expect(404);
      const all = await notif('stu3').readAll().expect(200);
      expect(all.body.updated).toBe(unread - 1);
      expect(await notif('stu3').count()).toBe(0);
      expect((await notif('stu3').readAll().expect(200)).body.updated).toBe(0);
      expect(
        (await notif('stu3').list({ unreadOnly: true })).body.meta.total,
      ).toBe(0);
      expect(await notif('stu1').count()).toBeGreaterThan(0);
    });

    it('an old notification does not bypass current access (student moved to another class)', async () => {
      const ids = (await notif('stu1').list({ pageSize: 100 })).body.data.map(
        (n: { entityId: string }) => n.entityId,
      );
      expect(ids).toContain(id.resAdminC1);
      await admin()
        .patch(`students/${id['student:stu1']}/group-class`, {
          groupClassId: id.C3,
        })
        .expect(200);
      await student('stu1').get(`resources/${id.resAdminC1}`).expect(404);
      await student('stu1').get(`announcements/${id.annC1}`).expect(404);
      await student('stu1').get(`announcements/${id.annB2}`).expect(200);
    });

    it('requires authentication, and a disabled account is cut off (403) and skipped', async () => {
      await http().get('/api/notifications').expect(401);
      await http().patch('/api/notifications/read-all').expect(401);
      await notif('leaver').list().expect(200);
      await prisma.user.update({
        where: { id: uid.leaver },
        data: { isActive: false },
      });
      // Existing auth rule (Part 10.2): a disabled account gets 403 ACCOUNT_INACTIVE
      expect((await notif('leaver').list().expect(403)).body.code).toBe(
        'ACCOUNT_INACTIVE',
      );
      await student('leaver').get('resources').expect(403);
      // …and receives nothing new
      const r = await admin()
        .post(
          'resources',
          linkResource({ title: 'بعد التعطيل', visibility: 'ALL_STUDENTS' }),
        )
        .expect(201);
      expect(await recipients({ resourceId: r.body.id })).not.toContain(
        'leaver',
      );
    });
  });
});
