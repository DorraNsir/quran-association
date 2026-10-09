import { randomBytes, randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';

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
import { classRooms } from './class-rooms.js';

const RUN = randomUUID().slice(0, 8);
const PASSWORD = 'initial-pass-123';
const tag = (s: string) => `${s} ${RUN}`;
const TODAY = todayIn('Africa/Tunis');
const ROOT = resolve(process.env.FILE_STORAGE_ROOT!);

/* Minimal payloads: only the signature matters to the server. */
const PNG = () =>
  Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    randomBytes(200),
  ]);
const JPEG = () =>
  Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), randomBytes(200)]);
const PDF = () => Buffer.concat([Buffer.from('%PDF-1.7\n'), randomBytes(300)]);
const MP3 = () =>
  Buffer.concat([Buffer.from('ID3'), Buffer.from([4, 0, 0]), randomBytes(300)]);

describe('Settings & file storage (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const token: Record<string, string> = {};
  const uid: Record<string, string> = {};
  const id: Record<string, string> = {};
  const createdSettings: string[] = [];

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
    patch: (path: string, body: object) =>
      http().patch(`/api/admin/${path}`).set(as(token.admin)).send(body),
    put: (path: string, body: object) =>
      http().put(`/api/admin/${path}`).set(as(token.admin)).send(body),
    delete: (path: string) =>
      http().delete(`/api/admin/${path}`).set(as(token.admin)),
  };

  /** Upload as `who` (undefined = anonymous). */
  const upload = (
    who: string | undefined,
    query: object,
    content: Buffer | null,
    filename = 'image.png',
    contentType = 'image/png',
  ) => {
    const req = http().post('/api/files').query(query);
    if (who) req.set(as(token[who]));
    return content
      ? req.attach('file', content, { filename, contentType })
      : req.field('x', '1');
  };
  const uploadOk = async (
    who: string,
    query: object,
    content: Buffer,
    filename?: string,
    type?: string,
  ) =>
    (await upload(who, query, content, filename, type).expect(201)).body
      .id as string;
  const fetchFile = (who: string | undefined, fileId: string) => {
    const req = http().get(`/api/files/${fileId}`);
    if (who) req.set(as(token[who]));
    return req;
  };
  const publicFile = (fileId: string) =>
    http().get(`/api/public/files/${fileId}`);
  const storedPath = async (fileId: string) =>
    join(
      ROOT,
      (await prisma.storedFile.findUniqueOrThrow({ where: { id: fileId } }))
        .storageKey,
    );
  const backdate = (fileId: string) =>
    prisma.storedFile.update({
      where: { id: fileId },
      data: { createdAt: new Date(Date.now() - 48 * 3_600_000) },
    });
  const cleanup = async () =>
    (await admin.post('files/cleanup').expect(200)).body;

  async function account(key: string, roles: Role[], teacher = false) {
    const person = await prisma.person.create({
      data: {
        firstName: key,
        lastName: tag('حساب'),
        gender: 'MALE',
        dateOfBirth: new Date('2000-01-01'),
        address: 'نابل',
        phone: '22345678',
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
      select: {
        id: true,
        teacher: { select: { id: true } },
        user: { select: { id: true } },
      },
    });
    uid[key] = person.user!.id;
    id[`person:${key}`] = person.id;
    if (teacher) id[`teacher:${key}`] = person.teacher!.id;
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
    await account('sup', [Role.TEACHER], true);
    await account('asst', [Role.TEACHER], true);
    await account('other', [Role.TEACHER], true);
    await account('s1', [Role.STUDENT]);
    await account('s2', [Role.STUDENT]);

    const make = async (path: string, key: string, body: object) =>
      (id[key] = (await admin.post(path, body).expect(201)).body.id);
    await make('branches', 'branch', { name: tag('فرع'), address: 'نابل' });
    await make('rooms', 'room', { branchId: id.branch, name: tag('قاعة') });
    await make('groups', 'group', { name: tag('مجموعة'), audience: 'أطفال' });
    const cls = (key: string, sup: string, assistants: string[] = []) =>
      make('group-classes', key, {
        groupId: id.group,
        branchId: id.branch,
        roomId: id.room,
        supervisorId: id[`teacher:${sup}`],
        assistantTeacherIds: assistants.map((a) => id[`teacher:${a}`]),
      });
    await cls('C1', 'sup', ['asst']);
    await cls('C2', 'other');
    await cls('C3', 'sup');
    for (const [key, classKey] of [
      ['s1', 'C1'],
      ['s2', 'C2'],
    ] as const)
      id[`student:${key}`] = (
        await admin
          .post('students', {
            personId: id[`person:${key}`],
            groupClassId: id[classKey],
            registrationDate: TODAY,
          })
          .expect(201)
      ).body.id;

    // Settings singletons (created only if this database lacks them)
    if (!(await prisma.associationSettings.findUnique({ where: { id: 1 } }))) {
      await prisma.associationSettings.create({
        data: { id: 1, name: 'جمعية الاختبار' },
      });
      createdSettings.push('association');
    }
    if (!(await prisma.platformSettings.findUnique({ where: { id: 1 } }))) {
      await prisma.platformSettings.create({ data: { id: 1 } });
      createdSettings.push('platform');
    }
    if (!(await prisma.siteSettings.findUnique({ where: { id: 1 } }))) {
      await prisma.siteSettings.create({
        data: {
          id: 1,
          shortDescription: 'وصف',
          about: 'نبذة',
          mission: 'رسالة',
          vision: 'رؤية',
        },
      });
      createdSettings.push('site');
    }
  });

  afterAll(async () => {
    const users = Object.values(uid);
    const files = { uploadedByUserId: { in: users } };
    // Detach everything this run attached, then remove its files (rows), then the rest
    await prisma.associationSettings.updateMany({
      where: { logoFile: files },
      data: { logoFileId: null },
    });
    await prisma.person.updateMany({
      where: { photoFile: files },
      data: { photoFileId: null, photoUrl: null },
    });
    await prisma.notification.deleteMany({ where: { userId: { in: users } } });
    await prisma.resource.deleteMany({
      where: { publishedByUserId: { in: users } },
    });
    await prisma.heroSlide.deleteMany({
      where: { subtitle: { contains: RUN } },
    });
    await prisma.newsArticle.deleteMany({
      where: { title: { contains: RUN } },
    });
    await prisma.storedFile.deleteMany({ where: files });
    const persons = (
      await prisma.person.findMany({
        where: { lastName: { endsWith: RUN } },
        select: { id: true },
      })
    ).map((p) => p.id);
    const studentWhere = { personId: { in: persons } };
    const classes = { group: { name: { endsWith: RUN } } };
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
    if (createdSettings.includes('association'))
      await prisma.associationSettings.delete({ where: { id: 1 } });
    if (createdSettings.includes('platform'))
      await prisma.platformSettings.delete({ where: { id: 1 } });
    if (createdSettings.includes('site'))
      await prisma.siteSettings.delete({ where: { id: 1 } });
    await app.close();
    // (The run's throwaway storage root is removed by the E2E global setup)
  });

  /* ================================================================ */
  /* Uploads                                                          */
  /* ================================================================ */

  describe('uploads', () => {
    it('stores an admin CMS image under a server key, with server metadata only', async () => {
      const res = await upload(
        'admin',
        { purpose: 'CMS_IMAGE' },
        PNG(),
        '../../etc/صورة.png',
      ).expect(201);
      expect(res.body).toMatchObject({
        purpose: 'CMS_IMAGE',
        mimeType: 'image/png',
        size: 208,
        originalName: 'صورة.png',
        url: `/api/files/${res.body.id}`,
      });
      expect(Object.keys(res.body).sort()).toEqual([
        'createdAt',
        'id',
        'mimeType',
        'originalName',
        'purpose',
        'size',
        'url',
      ]);
      const row = await prisma.storedFile.findUniqueOrThrow({
        where: { id: res.body.id },
      });
      expect(row.storageKey).toMatch(
        /^[0-9a-f]{2}\/[0-9a-f]{2}\/[0-9a-f-]{36}$/,
      );
      expect(row.uploadedByUserId).toBe(uid.admin);
      expect(row.checksum).toMatch(/^[0-9a-f]{64}$/);
      // The bytes are inside the storage root, under the key — never the client's name
      const path = await storedPath(res.body.id);
      expect(path.startsWith(ROOT)).toBe(true);
      expect(existsSync(path)).toBe(true);
      expect(path).not.toContain('صورة');
      id.cmsImage = res.body.id;
    });

    it('authorizes each purpose explicitly (not "any authenticated user")', async () => {
      const code = async (
        who: string | undefined,
        query: object,
        status: number,
      ) => (await upload(who, query, PNG()).expect(status)).body.code;
      expect(await code('sup', { purpose: 'CMS_IMAGE' }, 403)).toBe(
        'FILE_PURPOSE_FORBIDDEN',
      );
      expect(await code('s1', { purpose: 'CMS_IMAGE' }, 403)).toBe(
        'FILE_PURPOSE_FORBIDDEN',
      );
      expect(await code('sup', { purpose: 'ASSOCIATION_LOGO' }, 403)).toBe(
        'FILE_PURPOSE_FORBIDDEN',
      );
      expect(await code('sup', { purpose: 'PROFILE_PHOTO' }, 403)).toBe(
        'FILE_PURPOSE_FORBIDDEN',
      );
      expect(
        await code(
          's1',
          { purpose: 'EDUCATIONAL_RESOURCE', groupClassId: id.C1 },
          403,
        ),
      ).toBe('FILE_PURPOSE_FORBIDDEN');
      expect(await code('sup', { purpose: 'EDUCATIONAL_RESOURCE' }, 400)).toBe(
        'FILE_CLASS_REQUIRED',
      );
      expect(
        await code(
          'other',
          { purpose: 'EDUCATIONAL_RESOURCE', groupClassId: id.C1 },
          403,
        ),
      ).toBe('FILE_CLASS_ACCESS_DENIED');
      expect(await code('admin', { purpose: 'ANYTHING' }, 400)).toBe(
        'FILE_PURPOSE_INVALID',
      );
      await upload(undefined, { purpose: 'CMS_IMAGE' }, PNG()).expect(401);
      // Client-chosen storage/ownership is refused or ignored
      await upload(
        'admin',
        { purpose: 'CMS_IMAGE', storageKey: 'aa/bb/x' },
        PNG(),
      ).expect(400);
      const spoofOwner = await http()
        .post('/api/files')
        .query({ purpose: 'CMS_IMAGE' })
        .set(as(token.admin))
        .field('uploadedByUserId', uid.s1)
        .attach('file', PNG(), { filename: 'a.png', contentType: 'image/png' })
        .expect(201);
      expect(
        (
          await prisma.storedFile.findUniqueOrThrow({
            where: { id: spoofOwner.body.id },
          })
        ).uploadedByUserId,
      ).toBe(uid.admin);
      // A refused upload left nothing behind (checked before the body is accepted)
      expect(readdirSync(join(ROOT, '.tmp'))).toEqual([]);
      // A teacher may upload a resource for a class they teach now
      id.supPdf = await uploadOk(
        'sup',
        { purpose: 'EDUCATIONAL_RESOURCE', groupClassId: id.C1 },
        PDF(),
        'درس.pdf',
        'application/pdf',
      );
    });

    it('accepts only allowlisted content, detected from the bytes (no spoofing)', async () => {
      const code = async (
        content: Buffer,
        filename: string,
        type: string,
        purpose = 'CMS_IMAGE',
      ) =>
        (await upload('admin', { purpose }, content, filename, type)).body.code;
      expect(
        await code(
          Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
          'a.svg',
          'image/svg+xml',
        ),
      ).toBe('FILE_TYPE_NOT_ALLOWED');
      expect(
        await code(
          Buffer.from('<!DOCTYPE html><script>x</script>'),
          'a.html',
          'text/html',
        ),
      ).toBe('FILE_TYPE_NOT_ALLOWED');
      expect(
        await code(
          Buffer.from('MZ\x90\x00binary'),
          'a.exe',
          'application/octet-stream',
        ),
      ).toBe('FILE_TYPE_NOT_ALLOWED');
      expect(
        await code(
          Buffer.concat([Buffer.from('PK\x03\x04'), randomBytes(50)]),
          'a.zip',
          'application/zip',
        ),
      ).toBe('FILE_TYPE_NOT_ALLOWED');
      // A PDF is not an image (purpose rules)
      expect(await code(PDF(), 'a.pdf', 'application/pdf')).toBe(
        'FILE_TYPE_NOT_ALLOWED',
      );
      // Declared type or extension disagreeing with the content
      expect(await code(PNG(), 'a.png', 'image/jpeg')).toBe(
        'FILE_TYPE_MISMATCH',
      );
      expect(await code(PNG(), 'a.jpg', 'image/png')).toBe(
        'FILE_TYPE_MISMATCH',
      );
      expect(
        await code(Buffer.from('<html>x</html>'), 'a.png', 'image/png'),
      ).toBe('FILE_TYPE_NOT_ALLOWED');
      expect(
        await code(PDF(), 'a.png', 'image/png', 'EDUCATIONAL_RESOURCE'),
      ).toBe('FILE_TYPE_MISMATCH');
      await upload(
        'admin',
        { purpose: 'CMS_IMAGE' },
        JPEG(),
        'a.jpeg',
        'image/jpeg',
      ).expect(201);
      await upload(
        'admin',
        { purpose: 'EDUCATIONAL_RESOURCE' },
        MP3(),
        'a.mp3',
        'audio/mpeg',
      ).expect(201);
      expect(
        (await upload('admin', { purpose: 'CMS_IMAGE' }, null)).body.code,
      ).toBe('FILE_REQUIRED');
    });

    it('rejects oversized files without leaving a row or bytes', async () => {
      const before = await prisma.storedFile.count();
      const big = Buffer.concat([PNG(), Buffer.alloc(5 * 1024 * 1024)]);
      const res = await upload(
        'admin',
        { purpose: 'CMS_IMAGE' },
        big,
        'big.png',
        'image/png',
      ).expect(413);
      expect(res.body.code).toBe('FILE_TOO_LARGE');
      expect(await prisma.storedFile.count()).toBe(before);
      expect(readdirSync(join(ROOT, '.tmp'))).toEqual([]);
    });
  });

  /* ================================================================ */
  /* Downloads and public media                                       */
  /* ================================================================ */

  describe('downloads', () => {
    it('uploads are private by default: only admins and the uploader can read them', async () => {
      await publicFile(id.cmsImage).expect(404);
      expect((await fetchFile('sup', id.cmsImage).expect(404)).body.code).toBe(
        'FILE_NOT_FOUND',
      );
      await fetchFile('s1', id.cmsImage).expect(404);
      await fetchFile(undefined, id.cmsImage).expect(401);
      const res = await fetchFile('admin', id.cmsImage).expect(200);
      expect(res.headers['content-type']).toBe('image/png');
      expect(res.headers['cache-control']).toBe('private, no-store');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['content-security-policy']).toContain('sandbox');
      expect(res.headers['content-disposition']).toMatch(
        /^inline; filename="[^"]*"; filename\*=UTF-8''/,
      );
      // Exactly the stored bytes
      expect(
        Buffer.compare(
          res.body as Buffer,
          readFileSync(await storedPath(id.cmsImage)),
        ),
      ).toBe(0);
      // The teacher's own upload is readable by them
      await fetchFile('sup', id.supPdf).expect(200);
      await fetchFile('admin', 'not-a-uuid').expect(400);
      await fetchFile('admin', randomUUID()).expect(404);
      expect(
        (
          await http()
            .get(`/api/files/${id.cmsImage}`)
            .query({ download: true })
            .set(as(token.admin))
        ).headers['content-disposition'],
      ).toMatch(/^attachment;/);
    });

    it('public media follow the visibility of the content using them', async () => {
      const slide = await admin
        .post('cms/hero-slides', {
          imageFileId: id.cmsImage,
          subtitle: tag('شريحة'),
        })
        .expect(201);
      expect(slide.body).toMatchObject({
        imageUrl: `/api/files/${id.cmsImage}`,
        imageFileId: id.cmsImage,
      });
      id.slide = slide.body.id;
      const pub = await publicFile(id.cmsImage).expect(200);
      expect(pub.headers['cache-control']).toBe('public, max-age=300');
      expect(pub.headers['x-content-type-options']).toBe('nosniff');
      const hero = (await http().get('/api/public/hero-slides')).body.find(
        (s: { id: string }) => s.id === id.slide,
      );
      expect(hero.imageUrl).toBe(`/api/public/files/${id.cmsImage}`);
      expect(Object.keys(hero)).not.toContain('imageFileId');
      await http()
        .get(`/api/public/files/${id.cmsImage}`)
        .set('If-None-Match', pub.headers.etag)
        .expect(304);
      // Hidden slide → the image is no longer public
      await admin
        .patch(`cms/hero-slides/${id.slide}`, { isActive: false })
        .expect(200);
      await publicFile(id.cmsImage).expect(404);
      await admin
        .patch(`cms/hero-slides/${id.slide}`, { isActive: true })
        .expect(200);

      // News cover: draft and future-dated are not public
      const cover = await uploadOk('admin', { purpose: 'CMS_IMAGE' }, PNG());
      const news = await admin
        .post('cms/news', {
          title: tag('خبر'),
          excerpt: 'ملخص',
          content: 'نص',
          coverImageFileId: cover,
          isPublished: false,
        })
        .expect(201);
      await publicFile(cover).expect(404);
      await admin
        .patch(`cms/news/${news.body.id}`, {
          publishedAt: '2099-01-01',
          isPublished: true,
        })
        .expect(400);
      const future = new Date(`${TODAY}T00:00:00Z`);
      future.setUTCDate(future.getUTCDate() + 5);
      await admin
        .patch(`cms/news/${news.body.id}`, {
          publishedAt: future.toISOString().slice(0, 10),
          isPublished: true,
        })
        .expect(200);
      await publicFile(cover).expect(404);
      await admin
        .patch(`cms/news/${news.body.id}`, { publishedAt: TODAY })
        .expect(200);
      await publicFile(cover).expect(200);

      // Wrong purpose / type / someone else's file cannot be attached
      expect(
        (
          await admin
            .post('cms/hero-slides', {
              imageFileId: id.supPdf,
              subtitle: tag('x'),
            })
            .expect(400)
        ).body.code,
      ).toBe('FILE_PURPOSE_MISMATCH');
      expect(
        (
          await admin
            .post('cms/hero-slides', {
              imageFileId: randomUUID(),
              subtitle: tag('x'),
            })
            .expect(404)
        ).body.code,
      ).toBe('FILE_NOT_FOUND');
      expect(
        (
          await admin
            .post('cms/hero-slides', {
              imageFileId: id.cmsImage,
              imageUrl: '/website/halaqa.svg',
              subtitle: tag('x'),
            })
            .expect(400)
        ).body.code,
      ).toBe('CMS_MEDIA_CONFLICT');
      expect(
        (
          await admin
            .post('cms/hero-slides', { subtitle: tag('x') })
            .expect(400)
        ).body.code,
      ).toBe('CMS_MEDIA_REQUIRED');
    });

    it('missing stored bytes give a controlled error', async () => {
      const fileId = await uploadOk('admin', { purpose: 'CMS_IMAGE' }, PNG());
      rmSync(await storedPath(fileId));
      expect((await fetchFile('admin', fileId).expect(404)).body.code).toBe(
        'FILE_CONTENT_UNAVAILABLE',
      );
    });
  });

  /* ================================================================ */
  /* Settings and logo                                                */
  /* ================================================================ */

  describe('settings', () => {
    it('admins read every section; timezone and current year are read-only', async () => {
      const res = await admin.get('settings').expect(200);
      expect(Object.keys(res.body).sort()).toEqual([
        'association',
        'currentAcademicYear',
        'platform',
        'website',
      ]);
      expect(res.body.platform.timezone).toBe('Africa/Tunis');
      for (const body of [
        { platform: { timezone: 'Europe/Paris' } },
        { currentAcademicYearId: randomUUID() },
        { association: { id: 2 } },
        { platform: { defaultPageSize: 15 } },
        { association: { email: 'not-an-email' } },
        { association: { phone: '12345678' } },
        { association: { name: '' } },
      ])
        await admin.patch('settings', body).expect(400);
      expect((await admin.patch('settings', {}).expect(400)).body.code).toBe(
        'SETTINGS_EMPTY_UPDATE',
      );
      for (const website of [
        { facebookUrl: 'https://evil.example.org/x' },
        { youtubeUrl: 'javascript:alert(1)' },
        { mapUrl: 'http://maps.example.org' },
      ])
        expect(
          (await admin.patch('settings', { website }).expect(400)).body.code,
        ).toBe('SETTINGS_INVALID_URL');
      for (const who of ['sup', 's1'])
        await http()
          .patch('/api/admin/settings')
          .set(as(token[who]))
          .send({ association: { name: 'x' } })
          .expect(403);
      await http().get('/api/admin/settings').set(as(token.s1)).expect(403);
      await http()
        .patch('/api/admin/settings')
        .send({ association: { name: 'x' } })
        .expect(401);
    });

    it('applies partial updates, preserving everything else, as one singleton', async () => {
      const before = (await admin.get('settings')).body;
      const res = await admin
        .patch('settings', {
          association: {
            name: tag('جمعية'),
            phone: '72 290 415',
            email: 'Contact@Example.TN',
          },
          platform: { defaultPageSize: 20 },
          website: {
            facebookUrl: 'https://www.facebook.com/assoc',
            registrationEnabled: false,
          },
        })
        .expect(200);
      expect(res.body.association).toMatchObject({
        name: tag('جمعية'),
        phone: '72290415',
        email: 'contact@example.tn',
      });
      expect(res.body.association.address).toBe(before.association.address);
      expect(res.body.platform).toMatchObject({
        defaultPageSize: 20,
        dateFormat: before.platform.dateFormat,
        timezone: 'Africa/Tunis',
      });
      expect(res.body.website).toMatchObject({
        registrationEnabled: false,
        about: before.website.about,
      });
      // Concurrent saves never create a second record
      await Promise.all([
        admin.patch('settings', { platform: { defaultPageSize: 50 } }),
        admin.patch('settings', { platform: { defaultPageSize: 10 } }),
      ]);
      expect(await prisma.platformSettings.count()).toBe(1);
      expect(await prisma.associationSettings.count()).toBe(1);
      expect([10, 50]).toContain(
        (await admin.get('settings')).body.platform.defaultPageSize,
      );
      // Public view: approved fields only, new identity
      const pub = (await http().get('/api/public/site-settings').expect(200))
        .body;
      expect(pub.name).toBe(tag('جمعية'));
      expect(Object.keys(pub)).not.toContain('timezone');
      expect(Object.keys(pub)).not.toContain('defaultPageSize');
      await admin.patch('settings', {
        platform: { defaultPageSize: before.platform.defaultPageSize },
        association: {
          name: before.association.name,
          phone: before.association.phone,
          email: before.association.email,
        },
        website: {
          facebookUrl: before.website.facebookUrl,
          registrationEnabled: before.website.registrationEnabled,
        },
      });
    });

    it('the logo is an uploaded image, public once approved, replaced safely', async () => {
      const logo = await uploadOk(
        'admin',
        { purpose: 'ASSOCIATION_LOGO' },
        PNG(),
      );
      await publicFile(logo).expect(404);
      expect(
        (
          await admin
            .patch('settings', { association: { logoFileId: id.cmsImage } })
            .expect(400)
        ).body.code,
      ).toBe('FILE_PURPOSE_MISMATCH');
      const res = await admin
        .patch('settings', { association: { logoFileId: logo } })
        .expect(200);
      expect(res.body.association).toMatchObject({
        logoFileId: logo,
        logoUrl: `/api/files/${logo}`,
      });
      expect((await http().get('/api/public/site-settings')).body.logoUrl).toBe(
        `/api/public/files/${logo}`,
      );
      await publicFile(logo).expect(200);
      // Replacement: a failed update keeps the current logo; a successful one keeps the old file until unused
      await admin
        .patch('settings', { association: { logoFileId: randomUUID() } })
        .expect(404);
      expect((await admin.get('settings')).body.association.logoFileId).toBe(
        logo,
      );
      const logo2 = await uploadOk(
        'admin',
        { purpose: 'ASSOCIATION_LOGO' },
        JPEG(),
        'logo.jpg',
        'image/jpeg',
      );
      await admin
        .patch('settings', { association: { logoFileId: logo2 } })
        .expect(200);
      await publicFile(logo).expect(404);
      expect(existsSync(await storedPath(logo))).toBe(true);
      id.oldLogo = logo;
      id.logo = logo2;
    });
  });

  /* ================================================================ */
  /* Educational resources                                            */
  /* ================================================================ */

  describe('resource files', () => {
    const resource = (extra: object) => ({
      title: tag('درس'),
      type: 'PDF',
      groupClassIds: [id.C1],
      ...extra,
    });

    it('a teacher publishes a PDF to their class: students of that class only, notified once', async () => {
      const res = await http()
        .post('/api/teacher/resources')
        .set(as(token.sup))
        .send(resource({ fileId: id.supPdf }))
        .expect(201);
      expect(res.body.file).toMatchObject({
        id: id.supPdf,
        fileName: 'درس.pdf',
        mimeType: 'application/pdf',
        url: `/api/files/${id.supPdf}`,
      });
      id.res = res.body.id;
      expect(
        await prisma.notification.count({ where: { resourceId: id.res } }),
      ).toBe(1);
      await fetchFile('s1', id.supPdf).expect(200);
      await fetchFile('asst', id.supPdf).expect(200);
      await fetchFile('s2', id.supPdf).expect(404);
      await fetchFile('other', id.supPdf).expect(404);
      await publicFile(id.supPdf).expect(404);
    });

    it('refuses foreign, mistyped or wrong-class files — and then notifies nobody', async () => {
      const before = await prisma.notification.count();
      const resourcesBefore = await prisma.resource.count();
      // Another teacher cannot use sup's file by knowing its id
      expect(
        (
          await http()
            .post('/api/teacher/resources')
            .set(as(token.other))
            .send(resource({ fileId: id.supPdf, groupClassIds: [id.C2] }))
            .expect(404)
        ).body.code,
      ).toBe('FILE_NOT_FOUND');
      // A PDF is not an IMAGE resource
      expect(
        (
          await http()
            .post('/api/teacher/resources')
            .set(as(token.sup))
            .send(resource({ type: 'IMAGE', fileId: id.supPdf }))
            .expect(400)
        ).body.code,
      ).toBe('FILE_TYPE_NOT_ALLOWED');
      // Uploaded for C1, so it cannot reach C3 (also taught by sup)
      expect(
        (
          await http()
            .post('/api/teacher/resources')
            .set(as(token.sup))
            .send(resource({ fileId: id.supPdf, groupClassIds: [id.C3] }))
            .expect(403)
        ).body.code,
      ).toBe('FILE_CLASS_MISMATCH');
      // A CMS image is not a resource file
      expect(
        (
          await admin
            .post('resources', {
              title: tag('x'),
              type: 'IMAGE',
              visibility: 'ALL_STUDENTS',
              fileId: id.cmsImage,
            })
            .expect(400)
        ).body.code,
      ).toBe('FILE_PURPOSE_MISMATCH');
      expect(
        (
          await admin
            .post('resources', {
              title: tag('x'),
              type: 'PDF',
              visibility: 'ALL_STUDENTS',
            })
            .expect(400)
        ).body.code,
      ).toBe('RESOURCE_FILE_REQUIRED');
      await admin
        .post('resources', {
          title: tag('x'),
          type: 'PDF',
          visibility: 'ALL_STUDENTS',
          fileId: id.supPdf,
          externalUrl: 'https://example.org',
        })
        .expect(400);
      expect(await prisma.notification.count()).toBe(before);
      expect(await prisma.resource.count()).toBe(resourcesBefore);
    });

    it('replacing the file never notifies again; access follows current assignments', async () => {
      const pdf2 = await uploadOk(
        'sup',
        { purpose: 'EDUCATIONAL_RESOURCE', groupClassId: id.C1 },
        PDF(),
        'v2.pdf',
        'application/pdf',
      );
      const res = await http()
        .patch(`/api/teacher/resources/${id.res}`)
        .set(as(token.sup))
        .send({ fileId: pdf2 })
        .expect(200);
      expect(res.body.file.id).toBe(pdf2);
      expect(
        await prisma.notification.count({ where: { resourceId: id.res } }),
      ).toBe(1);
      // The old file is no longer reachable by students, but still stored (until cleanup)
      await fetchFile('s1', id.supPdf).expect(404);
      await fetchFile('s1', pdf2).expect(200);
      expect(existsSync(await storedPath(id.supPdf))).toBe(true);
      id.pdf2 = pdf2;
      // The assistant loses access when removed from the class
      await admin
        .patch(`group-classes/${id.C1}`, { assistantTeacherIds: [] })
        .expect(200);
      await fetchFile('asst', pdf2).expect(404);
      await admin
        .patch(`group-classes/${id.C1}`, {
          assistantTeacherIds: [id['teacher:asst']],
        })
        .expect(200);
      await fetchFile('asst', pdf2).expect(200);
      // An audio resource (admin, all students)
      const mp3 = await uploadOk(
        'admin',
        { purpose: 'EDUCATIONAL_RESOURCE' },
        MP3(),
        'تلاوة.mp3',
        'audio/mpeg',
      );
      const audio = await admin
        .post('resources', {
          title: tag('تلاوة'),
          type: 'AUDIO',
          visibility: 'ALL_STUDENTS',
          fileId: mp3,
        })
        .expect(201);
      expect(audio.body.file.mimeType).toBe('audio/mpeg');
      await fetchFile('s2', mp3).expect(200);
    });
  });

  /* ================================================================ */
  /* Profile photos                                                   */
  /* ================================================================ */

  describe('profile photos', () => {
    it('admins set photos; only the person and their class audience can see them', async () => {
      const photo = await uploadOk(
        'admin',
        { purpose: 'PROFILE_PHOTO' },
        JPEG(),
        'me.jpg',
        'image/jpeg',
      );
      const res = await admin
        .put(`students/${id['student:s1']}/photo`, { fileId: photo })
        .expect(200);
      expect(res.body).toMatchObject({
        photoFileId: photo,
        photoUrl: `/api/files/${photo}`,
      });
      expect(
        (await admin.get(`students/${id['student:s1']}`)).body.person.photoUrl,
      ).toBe(`/api/files/${photo}`);
      await fetchFile('s1', photo).expect(200);
      await fetchFile('sup', photo).expect(200);
      await fetchFile('asst', photo).expect(200);
      await fetchFile('s2', photo).expect(404);
      await fetchFile('other', photo).expect(404);
      await publicFile(photo).expect(404);
      // Teacher photo: visible to their students
      const tPhoto = await uploadOk(
        'admin',
        { purpose: 'PROFILE_PHOTO' },
        PNG(),
      );
      await admin
        .put(`teachers/${id['teacher:sup']}/photo`, { fileId: tPhoto })
        .expect(200);
      await fetchFile('s1', tPhoto).expect(200);
      await fetchFile('s2', tPhoto).expect(404);
      expect(
        (
          await admin
            .put(`students/${id['student:s1']}/photo`, { fileId: id.cmsImage })
            .expect(400)
        ).body.code,
      ).toBe('FILE_PURPOSE_MISMATCH');
      await http()
        .put(`/api/admin/students/${id['student:s1']}/photo`)
        .set(as(token.s1))
        .send({ fileId: photo })
        .expect(403);
      expect(
        (await admin.delete(`students/${id['student:s1']}/photo`).expect(200))
          .body.photoUrl,
      ).toBeNull();
    });
  });

  /* ================================================================ */
  /* Cleanup                                                          */
  /* ================================================================ */

  describe('cleanup', () => {
    it('removes only old, unreferenced files — never a referenced or recent one', async () => {
      // Shared image: two slides use it
      const shared = await uploadOk('admin', { purpose: 'CMS_IMAGE' }, PNG());
      const a = (
        await admin
          .post('cms/hero-slides', { imageFileId: shared, subtitle: tag('أ') })
          .expect(201)
      ).body.id;
      const b = (
        await admin
          .post('cms/hero-slides', { imageFileId: shared, subtitle: tag('ب') })
          .expect(201)
      ).body.id;
      const recent = await uploadOk('admin', { purpose: 'CMS_IMAGE' }, PNG());
      for (const fileId of [shared, id.supPdf, id.oldLogo, id.logo, id.pdf2])
        await backdate(fileId);
      await admin.delete(`cms/hero-slides/${a}`).expect(204);

      const first = await cleanup();
      expect(first.deletedFiles).toBeGreaterThanOrEqual(2); // the replaced PDF and the replaced logo
      for (const gone of [id.supPdf, id.oldLogo]) {
        expect(
          await prisma.storedFile.findUnique({ where: { id: gone } }),
        ).toBeNull();
        await fetchFile('admin', gone).expect(404);
      }
      // Still referenced (one slide, the logo, the resource) or recent: kept, bytes included
      for (const kept of [shared, id.logo, id.pdf2, recent])
        expect(existsSync(await storedPath(kept))).toBe(true);
      // The database refuses deleting a referenced file outright
      await expect(
        prisma.storedFile.delete({ where: { id: shared } }),
      ).rejects.toThrow();

      await admin.delete(`cms/hero-slides/${b}`).expect(204);
      const path = await storedPath(shared);
      await cleanup();
      expect(
        await prisma.storedFile.findUnique({ where: { id: shared } }),
      ).toBeNull();
      expect(existsSync(path)).toBe(false);
    });

    it('sweeps orphan bytes and abandoned temporary uploads', async () => {
      const key = `ab/cd/${randomUUID()}`;
      const orphan = join(ROOT, key);
      mkdirSync(join(ROOT, 'ab', 'cd'), { recursive: true });
      writeFileSync(orphan, 'orphan');
      const old = new Date(Date.now() - 48 * 3_600_000);
      utimesSync(orphan, old, old);
      const temp = join(ROOT, '.tmp', randomUUID());
      writeFileSync(temp, 'partial');
      utimesSync(temp, old, old);
      const result = await cleanup();
      expect(result.orphanBytes).toBeGreaterThanOrEqual(1);
      expect(result.staleTemp).toBeGreaterThanOrEqual(1);
      expect(existsSync(orphan)).toBe(false);
      expect(existsSync(temp)).toBe(false);
      await http()
        .post('/api/admin/files/cleanup')
        .set(as(token.sup))
        .expect(403);
    });
  });
});
