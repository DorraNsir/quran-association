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
const IMG = '/website/halaqa.svg';

describe('Public website & CMS (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const token: Record<string, string> = {};
  const id: Record<string, string> = {};
  const createdSettings: string[] = [];

  const http = () => request(app.getHttpServer());
  const as = (t: string) => ({ Authorization: `Bearer ${t}` });
  const cms = (slug: string) => ({
    list: (query: object = {}) =>
      http().get(`/api/admin/cms/${slug}`).query(query).set(as(token.admin)),
    get: (itemId: string) =>
      http().get(`/api/admin/cms/${slug}/${itemId}`).set(as(token.admin)),
    create: (body: object) =>
      http().post(`/api/admin/cms/${slug}`).set(as(token.admin)).send(body),
    update: (itemId: string, body: object) =>
      http()
        .patch(`/api/admin/cms/${slug}/${itemId}`)
        .set(as(token.admin))
        .send(body),
    remove: (itemId: string) =>
      http().delete(`/api/admin/cms/${slug}/${itemId}`).set(as(token.admin)),
    order: (ids: string[]) =>
      http()
        .put(`/api/admin/cms/${slug}/order`)
        .set(as(token.admin))
        .send({ ids }),
  });
  const pub = (path: string, query: object = {}) =>
    http().get(`/api/public/${path}`).query(query);
  const make = async (slug: string, body: object) =>
    (await cms(slug).create(body).expect(201)).body.id as string;
  const ids = (rows: { id: string }[]) => rows.map((r) => r.id);

  async function account(key: string, roles: Role[]) {
    await prisma.person.create({
      data: {
        firstName: key,
        lastName: tag('حساب'),
        user: {
          create: {
            username: `e2e-${RUN}-${key}`.toLowerCase(),
            passwordHash: await new PasswordService().hash(PASSWORD),
            mustChangePassword: false,
            roles: { create: roles.map((role) => ({ role })) },
          },
        },
      },
    });
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
    await account('teacher', [Role.TEACHER]);
    await account('student', [Role.STUDENT]);
    await account('multiRole', [Role.TEACHER, Role.STUDENT]);

    // Singletons the public site reads (created only if this database lacks them)
    if (!(await prisma.associationSettings.findUnique({ where: { id: 1 } }))) {
      await prisma.associationSettings.create({
        data: {
          id: 1,
          name: 'الفرع المحلي عمر بن الخطاب',
          phone: '72290415',
          email: 'contact@example.tn',
          address: 'دار شعبان الفهري',
        },
      });
      createdSettings.push('association');
    }
    if (!(await prisma.siteSettings.findUnique({ where: { id: 1 } }))) {
      await prisma.siteSettings.create({
        data: {
          id: 1,
          shortDescription: 'جمعية لتحفيظ القرآن',
          about: 'نبذة',
          mission: 'الرسالة',
          vision: 'الرؤية',
          facebookUrl: 'https://facebook.com/x',
        },
      });
      createdSettings.push('site');
    }
    id.branch = (
      await prisma.branch.create({
        data: { name: tag('فرع نشط'), address: 'نابل', phone: '72000000' },
      })
    ).id;
    id.closedBranch = (
      await prisma.branch.create({
        data: { name: tag('فرع مغلق'), address: 'قربة', status: 'INACTIVE' },
      })
    ).id;
  });

  afterAll(async () => {
    const titled = { title: { contains: RUN } };
    await prisma.heroSlide.deleteMany({
      where: { subtitle: { contains: RUN } },
    });
    await prisma.serviceOffering.deleteMany({ where: titled });
    await prisma.publicProgram.deleteMany({ where: titled });
    await prisma.publicGroupListing.deleteMany({ where: titled });
    await prisma.publicEvent.deleteMany({ where: titled });
    await prisma.achievement.deleteMany({ where: titled });
    await prisma.newsArticle.deleteMany({ where: titled });
    await prisma.galleryImage.deleteMany({
      where: { description: { contains: RUN } },
    });
    await prisma.quranGraduate.deleteMany({
      where: { fullName: { contains: RUN } },
    });
    await prisma.administrationMember.deleteMany({
      where: { fullName: { contains: RUN } },
    });
    const persons = (
      await prisma.person.findMany({
        where: { lastName: { endsWith: RUN } },
        select: { id: true },
      })
    ).map((p) => p.id);
    await prisma.student.deleteMany({ where: { personId: { in: persons } } });
    await prisma.user.deleteMany({ where: { personId: { in: persons } } });
    await prisma.person.deleteMany({ where: { id: { in: persons } } });
    await prisma.branch.deleteMany({ where: { name: { endsWith: RUN } } });
    if (createdSettings.includes('association'))
      await prisma.associationSettings.delete({ where: { id: 1 } });
    if (createdSettings.includes('site'))
      await prisma.siteSettings.delete({ where: { id: 1 } });
    await app.close();
  });

  /* ================================================================ */

  describe('authorization', () => {
    const SLUGS = [
      'hero-slides',
      'services',
      'programs',
      'upcoming-groups',
      'events',
      'achievements',
      'graduates',
      'administration-members',
      'news',
      'gallery',
    ];

    const ROUTES = ['list', 'get', 'create', 'update', 'delete'];

    it('only ADMIN may read or change the CMS (teacher/student 403, anonymous 401)', async () => {
      const someId = randomUUID();
      for (const slug of SLUGS) {
        const base = `/api/admin/cms/${slug}`;
        const calls = (t?: string) => {
          const h = t ? as(t) : {};
          return [
            http().get(base).set(h),
            http().get(`${base}/${someId}`).set(h),
            http().post(base).set(h).send({ title: 'x' }),
            http().patch(`${base}/${someId}`).set(h).send({ title: 'x' }),
            http().delete(`${base}/${someId}`).set(h),
          ];
        };
        for (const [who, status] of [
          ['teacher', 403],
          ['student', 403],
          ['multiRole', 403],
          [undefined, 401],
        ] as const) {
          const results = await Promise.all(
            calls(who ? token[who] : undefined),
          );
          results.forEach((res, i) =>
            expect([slug, ROUTES[i], res.status]).toEqual([
              slug,
              ROUTES[i],
              status,
            ]),
          );
        }
      }
      await http()
        .put('/api/admin/cms/hero-slides/order')
        .set(as(token.teacher))
        .send({ ids: [] })
        .expect(403);
    });

    it('public endpoints need no account and are read-only', async () => {
      for (const path of [
        'home',
        'site-settings',
        'branches',
        'hero-slides',
        'services',
        'programs',
        'upcoming-groups',
        'events',
        'achievements',
        'graduates',
        'administration-members',
        'news',
        'gallery',
      ])
        expect([path, (await pub(path)).status]).toEqual([path, 200]);
      await http().post('/api/public/news').send({ title: 'x' }).expect(404);
      await http().delete(`/api/public/news/${randomUUID()}`).expect(404);
    });
  });

  /* ================================================================ */

  describe('hero slides', () => {
    it('creates in order, validates media and button links, hides inactive slides', async () => {
      const slide = (title: string, extra: object = {}) => ({
        imageUrl: IMG,
        title,
        subtitle: tag('شريحة'),
        ctaLabel: 'سجل الآن',
        ctaHref: '/registration',
        ...extra,
      });
      const a = await cms('hero-slides').create(slide('A')).expect(201);
      expect(a.body).toMatchObject({
        displayOrder: 1,
        isActive: true,
        ctaHref: '/registration',
      });
      id.slideA = a.body.id;
      id.slideB = await make(
        'hero-slides',
        slide('B', { imageUrl: '/website/children.svg' }),
      );
      id.slideC = await make('hero-slides', slide('C', { isActive: false }));
      expect((await cms('hero-slides').get(id.slideC)).body.displayOrder).toBe(
        3,
      );

      const code = async (extra: object) =>
        (await cms('hero-slides').create(slide('x', extra)).expect(400)).body
          .code;
      expect(await code({ ctaHref: 'javascript:alert(1)' })).toBe(
        'CMS_UNSAFE_URL',
      );
      expect(await code({ ctaHref: '//evil.example.org' })).toBe(
        'CMS_UNSAFE_URL',
      );
      expect(await code({ ctaHref: null })).toBe('CMS_CTA_INCOMPLETE');
      expect(await code({ imageUrl: 'blob:http://localhost/1' })).toBe(
        'CMS_MEDIA_UPLOAD_REQUIRED',
      );
      expect(await code({ imageUrl: '/etc/passwd' })).toBe('CMS_UNSAFE_URL');
      // External images are not accepted (uploads are attached by file id)
      expect(await code({ imageUrl: 'https://cdn.example.org/b.webp' })).toBe(
        'CMS_UNSAFE_URL',
      );
      expect(await code({ imageUrl: 'http://example.org/a.jpg' })).toBe(
        'CMS_UNSAFE_URL',
      );
      for (const extra of [
        { imageUrl: undefined },
        { displayOrder: 1 },
        { id: randomUUID() },
        { createdAt: TODAY },
      ])
        await cms('hero-slides').create(slide('x', extra)).expect(400);

      const visible = ids((await pub('hero-slides').expect(200)).body);
      expect(visible).toEqual([id.slideA, id.slideB]);
      expect(Object.keys((await pub('hero-slides')).body[0]).sort()).toEqual(
        [
          'ctaHref',
          'ctaLabel',
          'displayOrder',
          'id',
          'imageUrl',
          'subtitle',
          'title',
        ].sort(),
      );
    });

    it('reorders as a whole (every item once), consistently', async () => {
      const res = await cms('hero-slides')
        .order([id.slideC, id.slideB, id.slideA])
        .expect(200);
      expect(
        res.body.data.map((s: { id: string; displayOrder: number }) => [
          s.id,
          s.displayOrder,
        ]),
      ).toEqual([
        [id.slideC, 1],
        [id.slideB, 2],
        [id.slideA, 3],
      ]);
      expect(ids((await pub('hero-slides')).body)).toEqual([
        id.slideB,
        id.slideA,
      ]);
      for (const bad of [
        [id.slideA, id.slideB],
        [id.slideA, id.slideB, id.slideC, randomUUID()],
        [id.slideA, id.slideB, randomUUID()],
      ])
        expect(
          (await cms('hero-slides').order(bad).expect(400)).body.code,
        ).toBe('CMS_INVALID_ORDER');
      await cms('hero-slides')
        .order([id.slideA, id.slideA, id.slideB])
        .expect(400);
      // Concurrent reorders: the last one wins entirely, never a mix
      await Promise.all([
        cms('hero-slides').order([id.slideA, id.slideB, id.slideC]),
        cms('hero-slides').order([id.slideB, id.slideC, id.slideA]),
      ]);
      const orders = (await cms('hero-slides').list()).body.data.map(
        (s: { displayOrder: number }) => s.displayOrder,
      );
      expect(orders).toEqual([1, 2, 3]);
      // A new slide goes last
      const d = await cms('hero-slides')
        .create({ imageUrl: IMG, subtitle: tag('د') })
        .expect(201);
      expect(d.body.displayOrder).toBe(4);
    });

    it('hides, edits and deletes', async () => {
      await cms('hero-slides')
        .update(id.slideA, { isActive: false })
        .expect(200);
      expect(ids((await pub('hero-slides')).body)).not.toContain(id.slideA);
      const edited = await cms('hero-slides')
        .update(id.slideB, { title: 'جديد', ctaLabel: null, ctaHref: null })
        .expect(200);
      expect(edited.body).toMatchObject({
        title: 'جديد',
        ctaLabel: null,
        ctaHref: null,
      });
      await cms('hero-slides')
        .update(id.slideB, { ctaHref: 'javascript:x' })
        .expect(400);
      await cms('hero-slides').remove(id.slideC).expect(204);
      expect(
        (await cms('hero-slides').get(id.slideC).expect(404)).body.code,
      ).toBe('CMS_CONTENT_NOT_FOUND');
      await cms('hero-slides').remove(id.slideC).expect(404);
      await cms('hero-slides').get('not-a-uuid').expect(400);
    });
  });

  /* ================================================================ */

  describe('services, programs, board members', () => {
    it('services: CRUD, icon validation, published only, ordered', async () => {
      const s1 = await make('services', { title: tag('حفظ'), icon: 'book' });
      const s2 = await make('services', {
        title: tag('تجويد'),
        icon: 'mic',
        isPublished: false,
      });
      await cms('services')
        .create({ title: tag('x'), icon: 'Bad Icon!' })
        .expect(400);
      await cms('services').create({ title: '' }).expect(400);
      const visible = ids((await pub('services')).body);
      expect(visible).toContain(s1);
      expect(visible).not.toContain(s2);
      await cms('services').update(s2, { isPublished: true }).expect(200);
      expect(ids((await pub('services')).body)).toEqual(
        expect.arrayContaining([s1, s2]),
      );
      const list = await cms('services')
        .list({ search: 'تجويد', visible: true })
        .expect(200);
      expect(ids(list.body.data)).toEqual([s2]);
    });

    it('programs: public list and detail never expose hidden programs', async () => {
      id.program = await make('programs', {
        title: tag('برنامج'),
        description: 'وصف',
        imageUrl: IMG,
      });
      id.hiddenProgram = await make('programs', {
        title: tag('مخفي'),
        description: 'وصف',
        isPublished: false,
      });
      expect(
        (await pub(`programs/${id.program}`).expect(200)).body,
      ).toMatchObject({ id: id.program, imageUrl: IMG });
      expect(
        (await pub(`programs/${id.hiddenProgram}`).expect(404)).body.code,
      ).toBe('CMS_CONTENT_NOT_FOUND');
      expect(
        (await pub(`programs/${randomUUID()}`).expect(404)).body.code,
      ).toBe('CMS_CONTENT_NOT_FOUND');
      await pub('programs/not-a-uuid').expect(400);
      expect(ids((await pub('programs')).body)).not.toContain(id.hiddenProgram);
      await cms('programs')
        .create({ title: tag('x') })
        .expect(400);
    });

    it('administration members: public fields only, no platform account link', async () => {
      const m = await make('administration-members', {
        fullName: tag('رئيس'),
        role: 'رئيس الجمعية',
        shortBio: 'نبذة',
      });
      await make('administration-members', {
        fullName: tag('مخفي'),
        role: 'عضو',
        isPublished: false,
      });
      await cms('administration-members')
        .create({ fullName: tag('x'), role: 'عضو', userId: randomUUID() })
        .expect(400);
      const rows = (await pub('administration-members')).body;
      expect(ids(rows)).toEqual([m]);
      expect(Object.keys(rows[0]).sort()).toEqual(
        [
          'displayOrder',
          'fullName',
          'id',
          'photoUrl',
          'role',
          'shortBio',
        ].sort(),
      );
      expect(
        Object.keys((await cms('administration-members').get(m)).body),
      ).not.toContain('userId');
    });
  });

  /* ================================================================ */

  describe('upcoming groups', () => {
    it('lists announced groups (CLOSED excluded), with active branches only', async () => {
      const open = await make('upcoming-groups', {
        title: tag('مجموعة الصيف'),
        audience: 'أطفال',
        branchId: id.branch,
        publicStatus: 'OPEN',
        startDate: addDays(TODAY, 20),
      });
      const inClosedBranch = await make('upcoming-groups', {
        title: tag('فرع مغلق'),
        audience: 'كبار',
        branchId: id.closedBranch,
      });
      const closed = await make('upcoming-groups', {
        title: tag('مغلقة'),
        audience: 'كبار',
        publicStatus: 'CLOSED',
      });
      expect(
        (
          await cms('upcoming-groups')
            .create({ title: tag('x'), audience: 'x', groupId: randomUUID() })
            .expect(400)
        ).body.code,
      ).toBe('CMS_REFERENCE_INVALID');
      const rows = (await pub('upcoming-groups')).body;
      expect(ids(rows)).toEqual([open, inClosedBranch]);
      expect(rows[0]).toMatchObject({
        branch: { id: id.branch },
        startDate: addDays(TODAY, 20),
        publicStatus: 'OPEN',
      });
      expect(rows[1].branch).toBeNull();
      expect(ids(rows)).not.toContain(closed);
    });
  });

  /* ================================================================ */

  describe('events', () => {
    it('separates upcoming and past by the Africa/Tunis day; internal and unpublished are hidden', async () => {
      const ev = (title: string, extra: object) => ({
        title: tag(title),
        description: 'وصف',
        ...extra,
      });
      id.evToday = await make(
        'events',
        ev('اليوم', { startDate: TODAY, time: '17:30', location: 'المقر' }),
      );
      id.evOngoing = await make(
        'events',
        ev('جارية', {
          startDate: addDays(TODAY, -2),
          endDate: addDays(TODAY, 1),
        }),
      );
      id.evPast = await make(
        'events',
        ev('انتهت', { startDate: addDays(TODAY, -10) }),
      );
      id.evCancelled = await make(
        'events',
        ev('ملغاة', { startDate: addDays(TODAY, 5), isCancelled: true }),
      );
      id.evInternal = await make(
        'events',
        ev('داخلية', { startDate: addDays(TODAY, 3), isPublic: false }),
      );
      id.evDraft = await make(
        'events',
        ev('مسودة', { startDate: addDays(TODAY, 4), isPublished: false }),
      );

      const upcoming = (await pub('events', { search: RUN }).expect(200)).body;
      expect(ids(upcoming.data)).toEqual([
        id.evOngoing,
        id.evToday,
        id.evCancelled,
      ]);
      expect(upcoming.data[1]).toMatchObject({
        time: '17:30',
        status: 'UPCOMING',
        startDate: TODAY,
      });
      expect(upcoming.data[2].status).toBe('CANCELLED');
      const past = (await pub('events', { period: 'PAST', search: RUN })).body;
      expect(ids(past.data)).toEqual([id.evPast]);
      expect(past.data[0].status).toBe('COMPLETED');
      expect((await pub(`events/${id.evInternal}`).expect(404)).body.code).toBe(
        'CMS_CONTENT_NOT_FOUND',
      );
      await pub(`events/${id.evDraft}`).expect(404);
      await pub(`events/${id.evPast}`).expect(200);
      await pub('events', { period: 'LATER' }).expect(400);
      expect(Object.keys(upcoming.data[0])).not.toContain('isPublic');

      expect(
        (
          await cms('events')
            .create(ev('x', { startDate: TODAY, endDate: addDays(TODAY, -1) }))
            .expect(400)
        ).body.code,
      ).toBe('CMS_INVALID_DATE');
      await cms('events')
        .update(id.evToday, { endDate: addDays(TODAY, -1) })
        .expect(400);
      await cms('events')
        .create(ev('x', { startDate: TODAY, time: '25:00' }))
        .expect(400);
      expect((await cms('events').get(id.evPast)).body.status).toBe(
        'COMPLETED',
      );
      // A public event never creates an academic session
      expect(
        await prisma.session.count({
          where: { date: new Date(`${TODAY}T00:00:00Z`) },
        }),
      ).toBe(0);
    });
  });

  /* ================================================================ */

  describe('achievements', () => {
    it('derives the year from the date, filters featured, newest year first', async () => {
      const a2024 = await cms('achievements')
        .create({
          title: tag('2024'),
          description: 'وصف',
          date: '2024-06-01',
          isFeatured: true,
        })
        .expect(201);
      expect(a2024.body.year).toBe(2024);
      const a2026 = await make('achievements', {
        title: tag('2026'),
        description: 'وصف',
        year: 2026,
      });
      const hidden = await make('achievements', {
        title: tag('مخفي'),
        description: 'وصف',
        year: 2025,
        isPublished: false,
      });
      expect(
        (
          await cms('achievements')
            .create({
              title: tag('x'),
              description: 'x',
              date: '2024-06-01',
              year: 2023,
            })
            .expect(400)
        ).body.code,
      ).toBe('CMS_INVALID_DATE');
      await cms('achievements')
        .create({ title: tag('x'), description: 'x', category: 'SECRET' })
        .expect(400);
      const all = ids((await pub('achievements')).body);
      expect(all.indexOf(a2026)).toBeLessThan(all.indexOf(a2024.body.id));
      expect(all).not.toContain(hidden);
      expect(ids((await pub('achievements', { featured: true })).body)).toEqual(
        [a2024.body.id],
      );
    });
  });

  /* ================================================================ */

  describe('graduates', () => {
    it('stays unpublished until an explicit decision with a recorded consent', async () => {
      const created = await cms('graduates')
        .create({
          fullName: tag('أحمد'),
          completionYear: 2025,
          shortMessage: 'الحمد لله',
        })
        .expect(201);
      expect(created.body).toMatchObject({
        isPublished: false,
        consentGivenBy: null,
        consentRecordedAt: null,
      });
      id.grad = created.body.id;
      expect(
        (
          await cms('graduates')
            .update(id.grad, { isPublished: true })
            .expect(400)
        ).body.code,
      ).toBe('CMS_GRADUATE_CONSENT_REQUIRED');
      expect(
        (
          await cms('graduates')
            .create({ fullName: tag('x'), isPublished: true })
            .expect(400)
        ).body.code,
      ).toBe('CMS_GRADUATE_CONSENT_REQUIRED');
      // The server records who and when; the client cannot
      await cms('graduates')
        .update(id.grad, { consentRecordedAt: new Date().toISOString() })
        .expect(400);
      const res = await cms('graduates')
        .update(id.grad, { consentGivenBy: 'GRADUATE', isPublished: true })
        .expect(200);
      expect(res.body).toMatchObject({
        isPublished: true,
        consentGivenBy: 'GRADUATE',
        consentRecordedBy: { username: `e2e-${RUN}-admin` },
      });
      expect(res.body.consentRecordedAt).toBeTruthy();
      const publicRows = (await pub('graduates')).body;
      expect(ids(publicRows)).toContain(id.grad);
      expect(Object.keys(publicRows[0]).sort()).toEqual(
        [
          'completionDate',
          'completionYear',
          'displayOrder',
          'fullName',
          'id',
          'photoUrl',
          'shortMessage',
        ].sort(),
      );
      // Withdrawing the consent unpublishes at once
      const withdrawn = await cms('graduates')
        .update(id.grad, { consentGivenBy: null })
        .expect(200);
      expect(withdrawn.body).toMatchObject({
        isPublished: false,
        consentRecordedAt: null,
      });
      expect(ids((await pub('graduates')).body)).not.toContain(id.grad);
      // The database refuses a published graduate without consent
      await expect(
        prisma.quranGraduate.update({
          where: { id: id.grad },
          data: { isPublished: true },
        }),
      ).rejects.toThrow(/quran_graduates_published_consent_check/);
    });

    it('a linked minor student needs the guardian’s consent; the link is never public', async () => {
      const minor = await prisma.person.create({
        data: {
          firstName: 'قاصر',
          lastName: tag('طالب'),
          dateOfBirth: new Date(`${addDays(TODAY, -365 * 12)}T00:00:00Z`),
          student: {
            create: { registrationDate: new Date(`${TODAY}T00:00:00Z`) },
          },
        },
        select: { student: { select: { id: true } } },
      });
      const g = await make('graduates', {
        fullName: tag('سارة'),
        studentId: minor.student!.id,
        consentGivenBy: 'GRADUATE',
      });
      expect(
        (await cms('graduates').update(g, { isPublished: true }).expect(400))
          .body.code,
      ).toBe('CMS_GUARDIAN_CONSENT_REQUIRED');
      await cms('graduates')
        .update(g, { consentGivenBy: 'GUARDIAN', isPublished: true })
        .expect(200);
      expect(ids((await pub('graduates')).body)).toContain(g);
      expect(JSON.stringify((await pub('graduates')).body)).not.toContain(
        minor.student!.id,
      );
      expect(
        (
          await cms('graduates')
            .create({ fullName: tag('x'), studentId: randomUUID() })
            .expect(400)
        ).body.code,
      ).toBe('CMS_REFERENCE_INVALID');
    });
  });

  /* ================================================================ */

  describe('news', () => {
    it('drafts and future-dated articles stay hidden; newest first with pagination', async () => {
      const article = (title: string, extra: object = {}) => ({
        title: tag(title),
        excerpt: 'ملخص',
        content: 'فقرة أولى\n\nفقرة ثانية',
        ...extra,
      });
      const today = await cms('news').create(article('اليوم')).expect(201);
      expect(today.body).toMatchObject({
        publishedAt: TODAY,
        state: 'PUBLISHED',
        isPublished: true,
      });
      id.newsToday = today.body.id;
      id.newsOld = await make(
        'news',
        article('قديم', { publishedAt: addDays(TODAY, -30) }),
      );
      id.newsOlder = await make(
        'news',
        article('أقدم', { publishedAt: addDays(TODAY, -60) }),
      );
      const future = await cms('news')
        .create(article('مبرمج', { publishedAt: addDays(TODAY, 1) }))
        .expect(201);
      expect(future.body.state).toBe('SCHEDULED');
      id.newsFuture = future.body.id;
      id.newsDraft = await make(
        'news',
        article('مسودة', { isPublished: false }),
      );

      const page1 = (
        await pub('news', { search: RUN, pageSize: 2 }).expect(200)
      ).body;
      expect(ids(page1.data)).toEqual([id.newsToday, id.newsOld]);
      expect(page1.meta).toMatchObject({ total: 3, totalPages: 2 });
      expect(
        ids(
          (await pub('news', { search: RUN, pageSize: 2, page: 2 })).body.data,
        ),
      ).toEqual([id.newsOlder]);
      expect(Object.keys(page1.data[0])).not.toContain('content');
      const detail = await pub(`news/${id.newsToday}`).expect(200);
      expect(detail.body.content).toBe('فقرة أولى\n\nفقرة ثانية');
      for (const hidden of [id.newsFuture, id.newsDraft])
        expect((await pub(`news/${hidden}`).expect(404)).body.code).toBe(
          'CMS_CONTENT_NOT_FOUND',
        );
      expect(
        ids((await pub('news', { search: 'مبرمج' })).body.data),
      ).not.toContain(id.newsFuture);

      expect(
        (
          await cms('news')
            .create(article('x', { publishedAt: addDays(TODAY, 400) }))
            .expect(400)
        ).body.code,
      ).toBe('CMS_INVALID_PUBLICATION_DATE');
      await cms('news')
        .create(article('x', { content: '' }))
        .expect(400);
      // Publishing a draft makes it visible
      await cms('news').update(id.newsDraft, { isPublished: true }).expect(200);
      await pub(`news/${id.newsDraft}`).expect(200);
      const admin = await cms('news').list({ search: RUN, pageSize: 10 });
      expect(admin.body.meta.total).toBe(5);
    });
  });

  /* ================================================================ */

  describe('gallery', () => {
    it('needs a safe image reference; browser previews must be uploaded', async () => {
      const img = (extra: object) => ({
        imageUrl: IMG,
        description: tag('صورة'),
        ...extra,
      });
      id.g1 = await make('gallery', img({ category: 'CEREMONIES' }));
      id.g2 = await make(
        'gallery',
        img({
          imageUrl: '/website/summer.svg',
          category: 'ACTIVITIES',
        }),
      );
      id.g3 = await make('gallery', img({ isPublished: false }));
      expect(
        (
          await cms('gallery')
            .create(img({ imageUrl: 'data:image/png;base64,AAAA' }))
            .expect(400)
        ).body.code,
      ).toBe('CMS_MEDIA_UPLOAD_REQUIRED');
      expect(
        (
          await cms('gallery')
            .create(img({ imageUrl: '../../.env' }))
            .expect(400)
        ).body.code,
      ).toBe('CMS_UNSAFE_URL');
      await cms('gallery')
        .create(img({ imageUrl: undefined }))
        .expect(400);
      const page = (await pub('gallery', { search: RUN, pageSize: 1 })).body;
      expect(page.meta.total).toBe(2);
      expect(ids(page.data)).toEqual([id.g1]);
      expect(
        ids(
          (await pub('gallery', { search: RUN, category: 'ACTIVITIES' })).body
            .data,
        ),
      ).toEqual([id.g2]);
      await pub('gallery', { category: 'PRIVATE' }).expect(400);
    });
  });

  /* ================================================================ */

  describe('branches, settings and home', () => {
    it('branches: active only, public fields only', async () => {
      const rows = (await pub('branches')).body as { id: string }[];
      expect(ids(rows)).toContain(id.branch);
      expect(ids(rows)).not.toContain(id.closedBranch);
      expect(Object.keys(rows.find((b) => b.id === id.branch)!).sort()).toEqual(
        ['address', 'id', 'name', 'phone'],
      );
    });

    it('site settings: approved public fields only', async () => {
      const res = await pub('site-settings').expect(200);
      expect(Object.keys(res.body).sort()).toEqual(
        [
          'about',
          'address',
          'email',
          'history',
          'logoUrl',
          'mapUrl',
          'mission',
          'name',
          'openingHours',
          'phone',
          'registrationEnabled',
          'shortDescription',
          'social',
          'values',
          'vision',
        ].sort(),
      );
      expect(Object.keys(res.body.social).sort()).toEqual([
        'facebook',
        'instagram',
        'youtube',
      ]);
    });

    it('home: bounded, published-only sections and aggregate statistics only', async () => {
      for (let i = 0; i < 6; i++)
        await make('services', { title: tag(`خدمة ${i}`) });
      const res = await pub('home').expect(200);
      const home = res.body;
      expect(home.services.length).toBe(6);
      expect(home.programs.length).toBeLessThanOrEqual(3);
      expect(home.news.length).toBeLessThanOrEqual(3);
      expect(home.gallery.length).toBeLessThanOrEqual(5);
      expect(ids(home.news)).not.toContain(id.newsFuture);
      expect(ids(home.heroSlides)).not.toContain(id.slideA);
      expect(ids(home.upcomingEvents)).not.toContain(id.evInternal);
      expect(
        home.featuredAchievements.every(
          (a: { isFeatured: boolean }) => a.isFeatured,
        ),
      ).toBe(true);
      expect(Object.keys(home.statistics).sort()).toEqual([
        'branches',
        'graduates',
        'students',
        'teachers',
      ]);
      expect(home.settings.name).toBeTruthy();
      // No private or internal field anywhere in the public home page
      const text = JSON.stringify(home);
      for (const leak of [
        'studentId',
        'consent',
        'userId',
        'passwordHash',
        'isPublished',
        'isPublic',
        'guardianPhone',
        'dateOfBirth',
        'expectedAmount',
        'timezone',
      ])
        expect([leak, text.includes(`"${leak}`)]).toEqual([leak, false]);
    });
  });
});
