import { randomBytes, randomUUID } from 'node:crypto';

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';

import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { PasswordService } from '../src/auth/password.service.js';
import { FEEDBACK_RATE_LIMIT } from '../src/feedback/feedback.service.js';
import { Role } from '../src/generated/prisma/enums.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const RUN = randomUUID().slice(0, 8);
const PASSWORD = 'initial-pass-123';
const tag = (s: string) => `${s} ${RUN}`;
const PNG = () =>
  Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    randomBytes(200),
  ]);
const PDF = () => Buffer.concat([Buffer.from('%PDF-1.7\n'), randomBytes(300)]);

type Feedback = {
  id: string;
  category: string;
  title: string;
  description: string;
  status: string;
  version: number;
  response: string | null;
  respondedAt: string | null;
  resolvedAt: string | null;
  screenshot: { id: string; url: string } | null;
  sender?: { userId: string; name: string };
  senderRole?: string;
  respondedBy?: { userId: string; name: string } | null;
  platform?: string | null;
  screenPath?: string | null;
};

/**
 * «الملاحظات والاقتراحات»: teachers and students send feedback (their own, the sender from the
 * account), the admins manage and answer it; notifications both ways; private screenshots.
 */
describe('Feedback & suggestions — الملاحظات والاقتراحات (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const token: Record<string, string> = {};
  const uid: Record<string, string> = {};

  const http = () => request(app.getHttpServer());
  const as = (who: string) => ({ Authorization: `Bearer ${token[who]}` });
  const space = (who: string) =>
    who.startsWith('admin')
      ? 'admin'
      : who.startsWith('t')
        ? 'teacher'
        : 'student';
  const api = {
    get: (who: string, path: string, query: object = {}) =>
      http()
        .get(`/api/${space(who)}/feedback${path}`)
        .query(query)
        .set(as(who)),
    post: (who: string, body: object) =>
      http()
        .post(`/api/${space(who)}/feedback`)
        .set(as(who))
        .send(body),
    patch: (who: string, path: string, body: object) =>
      http()
        .patch(`/api/${space(who)}/feedback${path}`)
        .set(as(who))
        .send(body),
  };
  const send = (who: string, extra: object = {}) =>
    api.post(who, {
      category: 'BUG',
      title: tag('زر الحفظ لا يعمل'),
      description: `لا يحدث شيء عند الضغط ${randomUUID()}`,
      ...extra,
    });
  const sent = async (who: string, extra: object = {}) =>
    (await send(who, extra).expect(201)).body as Feedback;
  const upload = (
    who: string,
    content: Buffer,
    filename = 'shot.png',
    type = 'image/png',
  ) =>
    http()
      .post('/api/files')
      .query({ purpose: 'FEEDBACK_SCREENSHOT' })
      .set(as(who))
      .attach('file', content, { filename, contentType: type });
  const notificationsOf = (who: string, feedbackId: string) =>
    prisma.notification.findMany({
      where: { userId: uid[who], entityType: 'FEEDBACK', entityId: feedbackId },
      orderBy: { createdAt: 'asc' },
    });

  async function account(
    key: string,
    roles: Role[],
    profile: { teacher?: boolean; student?: boolean; inactive?: boolean } = {},
  ) {
    const status = profile.inactive ? 'INACTIVE' : 'ACTIVE';
    const person = await prisma.person.create({
      data: {
        firstName: key,
        lastName: tag('حساب'),
        gender: 'FEMALE',
        ...(profile.teacher
          ? {
              teacher: { create: { joinedAt: new Date('2024-09-01'), status } },
            }
          : {}),
        ...(profile.student
          ? {
              student: {
                create: {
                  registrationDate: new Date('2025-09-01'),
                  status: profile.inactive ? 'ARCHIVED' : 'ACTIVE',
                },
              },
            }
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
      select: { user: { select: { id: true } } },
    });
    uid[key] = person.user!.id;
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
    await account('admin', [Role.ADMIN]);
    await account('admin2', [Role.ADMIN]);
    await account('t1', [Role.TEACHER], { teacher: true });
    await account('tOff', [Role.TEACHER], { teacher: true, inactive: true });
    await account('s1', [Role.STUDENT], { student: true });
    await account('s2', [Role.STUDENT], { student: true });
    await account('sNoProfile', [Role.STUDENT]);
  });

  afterAll(async () => {
    const users = Object.values(uid);
    await prisma.notification.deleteMany({
      where: {
        OR: [{ userId: { in: users } }, { actorUserId: { in: users } }],
      },
    });
    await prisma.feedback.deleteMany({
      where: { createdByUserId: { in: users } },
    });
    await prisma.storedFile.deleteMany({
      where: { uploadedByUserId: { in: users } },
    });
    const persons = { lastName: { endsWith: RUN } };
    await prisma.student.deleteMany({ where: { person: persons } });
    await prisma.teacher.deleteMany({ where: { person: persons } });
    await prisma.authSession.deleteMany({ where: { userId: { in: users } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.person.deleteMany({ where: persons });
    await app.close();
  });

  describe('sending (teacher / student)', () => {
    it('a teacher sends feedback: NEW, the sender and role from the account; the context kept (route only)', async () => {
      const f = await sent('t1', {
        category: 'IMPROVEMENT',
        platform: 'WEB',
        appVersion: '1.4.0',
        screenPath: '/teacher/sessions?token=secret#x',
      });
      expect(f).toMatchObject({
        category: 'IMPROVEMENT',
        status: 'NEW',
        response: null,
        screenshot: null,
      });
      const row = await prisma.feedback.findUniqueOrThrow({
        where: { id: f.id },
      });
      expect(row).toMatchObject({
        createdByUserId: uid.t1,
        senderRole: 'TEACHER',
        platform: 'WEB',
        appVersion: '1.4.0',
        screenPath: '/teacher/sessions', // never a query string
      });
    });

    it('a student sends feedback (STUDENT)', async () => {
      const f = await sent('s1', { category: 'OTHER' });
      expect(
        (await prisma.feedback.findUniqueOrThrow({ where: { id: f.id } }))
          .senderRole,
      ).toBe('STUDENT');
    });

    it('validation: required category, title and description; an unknown category; lengths', async () => {
      const bad = async (body: object) =>
        (await api.post('s1', body).expect(400)).body;
      expect(await bad({ title: 'x', description: 'y' })).toBeTruthy();
      expect(
        await bad({ category: 'BUG', title: '   ', description: 'y' }),
      ).toBeTruthy();
      expect(
        await bad({ category: 'BUG', title: 'x', description: '' }),
      ).toBeTruthy();
      expect(
        await bad({ category: 'PRAISE', title: 'x', description: 'y' }),
      ).toBeTruthy();
      expect(
        await bad({
          category: 'BUG',
          title: 'x'.repeat(121),
          description: 'y',
        }),
      ).toBeTruthy();
      expect(
        await bad({
          category: 'BUG',
          title: 'x',
          description: 'y'.repeat(3001),
        }),
      ).toBeTruthy();
      expect(
        await bad({
          category: 'BUG',
          title: 'x',
          description: 'y',
          platform: 'WINDOWS',
        }),
      ).toBeTruthy();
    });

    it('the sender, the status and the response can never be sent (mass assignment refused)', async () => {
      for (const extra of [
        { createdByUserId: uid.s2 },
        { status: 'RESOLVED' },
        { adminResponse: 'تم' },
        { senderRole: 'ADMIN' },
      ])
        await send('s1', extra).expect(400);
    });

    it('only an ACTIVE teacher / student profile may send; an admin is not a sender here', async () => {
      await send('tOff').expect(403);
      await send('sNoProfile').expect(403);
      await http()
        .post('/api/teacher/feedback')
        .set(as('s1'))
        .send({ category: 'BUG', title: 'x', description: 'y' })
        .expect(403);
      await http().post('/api/student/feedback').send({}).expect(401);
    });

    it('a double tap (the same submission within 2 minutes) is ONE feedback, the admins told once', async () => {
      const body = {
        category: 'BUG',
        title: tag('مكرر'),
        description: 'نفس النص',
      };
      const [a, b] = await Promise.all([
        api.post('t1', body),
        api.post('t1', body),
      ]);
      expect([a.status, b.status]).toEqual([201, 201]);
      expect(a.body.id).toBe(b.body.id);
      expect(await notificationsOf('admin', a.body.id)).toHaveLength(1);
    });
  });

  describe('«ملاحظاتي»: own submissions only', () => {
    it('lists mine, newest first; another user never sees them (404 on the details)', async () => {
      const first = await sent('s2', { title: tag('الأولى') });
      const second = await sent('s2', { title: tag('الثانية') });
      const mine = (await api.get('s2', '').expect(200)).body as {
        data: Feedback[];
        meta: { total: number };
      };
      expect(mine.data.slice(0, 2).map((f) => f.id)).toEqual([
        second.id,
        first.id,
      ]);
      expect(mine.data.every((f) => f.sender === undefined)).toBe(true); // no admin fields
      expect((await api.get('s2', `/${first.id}`).expect(200)).body.title).toBe(
        tag('الأولى'),
      );
      // another student, a teacher: not found (never confirms it exists)
      expect((await api.get('s1', `/${first.id}`).expect(404)).body.code).toBe(
        'FEEDBACK_NOT_FOUND',
      );
      await api.get('t1', `/${first.id}`).expect(404);
      const others = (await api.get('s1', '').expect(200)).body as {
        data: Feedback[];
      };
      expect(others.data.some((f) => f.id === first.id)).toBe(false);
    });
  });

  describe('admin management', () => {
    it('all feedback, filters (status, category), search by title or sender, pagination; the NEW count', async () => {
      const bug = await sent('t1', { category: 'BUG', title: tag('بحث-فريد') });
      await sent('s1', { category: 'IMPROVEMENT', title: tag('اقتراح-آخر') });
      const list = async (query: object) =>
        (await api.get('admin', '', query).expect(200)).body as {
          data: Feedback[];
          meta: { total: number; pageSize: number };
          newCount: number;
        };
      const found = await list({ search: 'بحث-فريد' });
      expect(found.data.map((f) => f.id)).toEqual([bug.id]);
      expect(found.data[0]).toMatchObject({
        senderRole: 'TEACHER',
        sender: { userId: uid.t1 },
      });
      expect(
        (
          await list({ search: `t1 ${RUN}`.split(' ')[0]!, category: 'BUG' })
        ).data.some((f) => f.id === bug.id),
      ).toBe(true);
      expect(
        (await list({ category: 'IMPROVEMENT', search: RUN })).data.every(
          (f) => f.category === 'IMPROVEMENT',
        ),
      ).toBe(true);
      expect(
        (await list({ status: 'RESOLVED', search: 'بحث-فريد' })).data,
      ).toEqual([]);
      const page = await list({ pageSize: 2, page: 1 });
      expect(page.data).toHaveLength(2);
      expect(page.meta.total).toBeGreaterThan(2);
      expect(page.newCount).toBeGreaterThan(0);
    });

    it('a status and a response: who and when recorded; the sender sees them and is told ONCE per real change', async () => {
      const f = await sent('s1', { title: tag('للرد') });
      const before = await notificationsOf('s1', f.id);
      const answered = (
        await api
          .patch('admin', `/${f.id}`, {
            version: f.version,
            status: 'RESOLVED',
            response: 'شكرًا على ملاحظتك. تم إصلاح المشكلة في صفحة الحصص.',
          })
          .expect(200)
      ).body as Feedback;
      expect(answered).toMatchObject({
        status: 'RESOLVED',
        response: 'شكرًا على ملاحظتك. تم إصلاح المشكلة في صفحة الحصص.',
        respondedBy: { userId: uid.admin },
        version: f.version + 1,
      });
      expect(answered.respondedAt).toBeTruthy();
      expect(answered.resolvedAt).toBeTruthy();
      // the sender sees it
      expect((await api.get('s1', `/${f.id}`).expect(200)).body).toMatchObject({
        status: 'RESOLVED',
        response: answered.response,
      });
      const after = await notificationsOf('s1', f.id);
      expect(after).toHaveLength(before.length + 1);
      expect(after.at(-1)).toMatchObject({
        type: 'FEEDBACK_UPDATED',
        actorUserId: uid.admin,
        message: `ردّت الإدارة على ملاحظتك «${tag('للرد')}»، وأصبحت حالتها: تم الحل`,
      });
      // the same save again: nothing written, nobody told
      const same = (
        await api
          .patch('admin', `/${f.id}`, {
            version: answered.version,
            status: 'RESOLVED',
            response: answered.response,
          })
          .expect(200)
      ).body as Feedback;
      expect(same.version).toBe(answered.version);
      expect(await notificationsOf('s1', f.id)).toHaveLength(after.length);
      // the response updated by another admin: new metadata; then a status only
      const edited = (
        await api
          .patch('admin2', `/${f.id}`, {
            version: same.version,
            response: 'تم الإصلاح نهائيًا',
          })
          .expect(200)
      ).body as Feedback;
      expect(edited.respondedBy).toMatchObject({ userId: uid.admin2 });
      const reopened = (
        await api
          .patch('admin', `/${f.id}`, {
            version: edited.version,
            status: 'REVIEWING',
          })
          .expect(200)
      ).body as Feedback;
      expect(reopened.resolvedAt).toBeNull(); // no longer «تم الحل»
      expect(reopened.response).toBe('تم الإصلاح نهائيًا'); // kept
      const all = await notificationsOf('s1', f.id);
      expect(all).toHaveLength(after.length + 2);
      expect(all.at(-1)!.message).toBe(
        `أصبحت حالة ملاحظتك «${tag('للرد')}»: قيد المراجعة`,
      );
    });

    it('a stale version is refused (two admins at once); unknown id 404', async () => {
      const f = await sent('t1');
      await api
        .patch('admin', `/${f.id}`, { version: f.version, status: 'REVIEWING' })
        .expect(200);
      expect(
        (
          await api
            .patch('admin2', `/${f.id}`, {
              version: f.version,
              status: 'CLOSED',
            })
            .expect(409)
        ).body.code,
      ).toBe('FEEDBACK_CHANGED');
      await api
        .patch('admin', `/${randomUUID()}`, { version: 1, status: 'CLOSED' })
        .expect(404);
      await api.get('admin', `/${randomUUID()}`).expect(404);
    });

    it('only admins manage: a teacher or a student cannot list all, change a status or answer', async () => {
      const f = await sent('s1');
      await http().get('/api/admin/feedback').set(as('t1')).expect(403);
      await http().get('/api/admin/feedback').set(as('s1')).expect(403);
      await http()
        .patch(`/api/admin/feedback/${f.id}`)
        .set(as('s1'))
        .send({ version: 1, status: 'CLOSED' })
        .expect(403);
      // the sender's own routes have no update
      await http()
        .patch(`/api/student/feedback/${f.id}`)
        .set(as('s1'))
        .send({ status: 'CLOSED' })
        .expect(404);
      expect(
        (await prisma.feedback.findUniqueOrThrow({ where: { id: f.id } }))
          .status,
      ).toBe('NEW');
    });
  });

  describe('notifications to the admins', () => {
    it('a new submission: every active admin once, never the sender; the message names the sender', async () => {
      const f = await sent('t1', {
        category: 'IMPROVEMENT',
        title: tag('إشعار'),
      });
      for (const who of ['admin', 'admin2']) {
        const [n, ...more] = await notificationsOf(who, f.id);
        expect(more).toEqual([]);
        expect(n).toMatchObject({
          type: 'FEEDBACK_SUBMITTED',
          title: 'ملاحظة جديدة',
          actorUserId: uid.t1,
          message: `اقتراح تحسين من المعلمة t1 ${tag('حساب')}: «${tag('إشعار')}»`,
        });
      }
      expect(await notificationsOf('t1', f.id)).toEqual([]);
      // it opens (available) through the usual notifications API
      const mine = (
        await http().get('/api/notifications').set(as('admin')).expect(200)
      ).body.data as {
        entityType: string;
        entityId: string;
        available: boolean;
      }[];
      expect(mine.find((n) => n.entityId === f.id)).toMatchObject({
        entityType: 'FEEDBACK',
        available: true,
      });
    });
  });

  describe('screenshots (private: the sender and the admins only)', () => {
    it('an active sender uploads an image and attaches it; the sender and admins read it, nobody else', async () => {
      const fileId = (await upload('s1', PNG()).expect(201)).body.id as string;
      const f = await sent('s1', { screenshotFileId: fileId });
      expect(f.screenshot).toMatchObject({
        id: fileId,
        url: `/api/files/${fileId}`,
      });
      await http().get(`/api/files/${fileId}`).set(as('s1')).expect(200);
      await http().get(`/api/files/${fileId}`).set(as('admin')).expect(200);
      await http().get(`/api/files/${fileId}`).set(as('s2')).expect(404);
      await http().get(`/api/files/${fileId}`).set(as('t1')).expect(404);
      await http().get(`/api/files/${fileId}`).expect(401);
      await http().get(`/api/public/files/${fileId}`).expect(404);
    });

    it("images only; another user's file or another purpose cannot be attached; no upload without an active profile", async () => {
      await upload('s1', PDF(), 'doc.pdf', 'application/pdf').expect(400);
      const theirs = (await upload('s2', PNG()).expect(201)).body.id as string;
      expect(
        (await send('s1', { screenshotFileId: theirs }).expect(404)).body.code,
      ).toBe('FILE_NOT_FOUND');
      const photo = (
        await http()
          .post('/api/files')
          .query({ purpose: 'PROFILE_PHOTO' })
          .set(as('s1'))
          .attach('file', PNG(), {
            filename: 'p.png',
            contentType: 'image/png',
          })
          .expect(201)
      ).body.id as string;
      expect(
        (await send('s1', { screenshotFileId: photo }).expect(400)).body.code,
      ).toBe('FILE_PURPOSE_MISMATCH');
      await upload('sNoProfile', PNG()).expect(403);
      await upload('admin', PNG()).expect(403);
    });
  });

  it('rate limit: at most N submissions per hour and account (429, nothing stored)', async () => {
    await account('tBusy', [Role.TEACHER], { teacher: true });
    for (let i = 0; i < FEEDBACK_RATE_LIMIT; i++) await sent('tBusy');
    expect((await send('tBusy').expect(429)).body.code).toBe(
      'FEEDBACK_RATE_LIMITED',
    );
    expect(
      await prisma.feedback.count({ where: { createdByUserId: uid.tBusy } }),
    ).toBe(FEEDBACK_RATE_LIMIT);
  });
});
