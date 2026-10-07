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
const PREFIX = `e2e-${RUN}-`;
const PASSWORD = 'initial-pass-123';
const name = (key: string) => `${PREFIX}${key}`;

describe('Account management & own profile (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const ids: Record<string, string> = {};
  let bossToken = '';

  const http = () => request(app.getHttpServer());
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const login = (username: string, password = PASSWORD) =>
    http().post('/api/auth/login').send({ username, password });
  const tokenOf = async (username: string, password = PASSWORD) =>
    (await login(username, password).expect(200)).body.accessToken as string;
  const refreshCookie = (res: request.Response) =>
    ([] as string[])
      .concat(res.headers['set-cookie'] ?? [])
      .find((c) => c.startsWith('qa_refresh='))
      ?.split(';')[0] ?? '';
  const asBoss = () => bearer(bossToken);

  async function seedAccount(
    key: string,
    roles: Role[],
    extra: { mustChangePassword?: boolean; teacher?: boolean } = {},
  ) {
    const person = await prisma.person.create({
      data: {
        firstName: 'اختبار',
        lastName: `${key}-${RUN}`,
        user: {
          create: {
            username: name(key),
            passwordHash: await new PasswordService().hash(PASSWORD),
            mustChangePassword: extra.mustChangePassword ?? false,
            roles: { create: roles.map((role) => ({ role })) },
          },
        },
        ...(extra.teacher
          ? { teacher: { create: { joinedAt: new Date('2024-09-01') } } }
          : {}),
      },
      select: { user: { select: { id: true } } },
    });
    ids[key] = person.user!.id;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    await seedAccount('boss', [Role.ADMIN]);
    await seedAccount('boss2', [Role.ADMIN]);
    await seedAccount('teacher', [Role.TEACHER], { teacher: true });
    await seedAccount('temp', [Role.STUDENT], { mustChangePassword: true });
    await seedAccount('target', [Role.TEACHER]);
    bossToken = await tokenOf(name('boss'));
  });

  afterAll(async () => {
    const people = await prisma.person.findMany({
      where: {
        OR: [
          { lastName: { endsWith: `-${RUN}` } },
          { user: { username: { startsWith: PREFIX } } },
        ],
      },
      select: { id: true },
    });
    const personIds = people.map((p) => p.id);
    await prisma.user.deleteMany({ where: { personId: { in: personIds } } });
    await prisma.teacher.deleteMany({ where: { personId: { in: personIds } } });
    await prisma.person.deleteMany({ where: { id: { in: personIds } } });
    await app.close();
  });

  // ───────────────────────── access control ─────────────────────────

  describe('access', () => {
    it('401 without a token, 403 for a non-admin', async () => {
      await http().get('/api/admin/accounts').expect(401);
      const teacher = await tokenOf(name('teacher'));
      expect(
        (
          await http()
            .get('/api/admin/accounts')
            .set(bearer(teacher))
            .expect(403)
        ).body.code,
      ).toBe('FORBIDDEN_ROLE');
      await http()
        .post(`/api/admin/accounts/${ids.target}/deactivate`)
        .set(bearer(teacher))
        .expect(403);
    });

    it('validates the :id parameter', async () => {
      await http()
        .get('/api/admin/accounts/not-a-uuid')
        .set(asBoss())
        .expect(400);
      expect(
        (
          await http()
            .get(`/api/admin/accounts/${randomUUID()}`)
            .set(asBoss())
            .expect(404)
        ).body.code,
      ).toBe('ACCOUNT_NOT_FOUND');
    });
  });

  // ───────────────────────── list ─────────────────────────

  describe('list', () => {
    it('paginates, searches and filters in the database', async () => {
      const page1 = await http()
        .get('/api/admin/accounts')
        .query({ search: PREFIX, pageSize: 2, page: 1 })
        .set(asBoss())
        .expect(200);
      expect(page1.body.meta).toMatchObject({
        page: 1,
        pageSize: 2,
        total: 5,
        totalPages: 3,
      });
      expect(page1.body.data).toHaveLength(2);
      const page3 = await http()
        .get('/api/admin/accounts')
        .query({ search: PREFIX, pageSize: 2, page: 3 })
        .set(asBoss())
        .expect(200);
      expect(page3.body.data).toHaveLength(1);

      const byLastName = await http()
        .get('/api/admin/accounts')
        .query({ search: `TEACHER-${RUN}` })
        .set(asBoss())
        .expect(200);
      expect(
        byLastName.body.data.map((a: { username: string }) => a.username),
      ).toEqual([name('teacher')]);
      expect(byLastName.body.data[0].teacherId).toEqual(expect.any(String));

      const admins = await http()
        .get('/api/admin/accounts')
        .query({ search: PREFIX, role: 'ADMIN' })
        .set(asBoss())
        .expect(200);
      expect(admins.body.meta.total).toBe(2);
      const inactive = await http()
        .get('/api/admin/accounts')
        .query({ search: PREFIX, isActive: 'false' })
        .set(asBoss())
        .expect(200);
      expect(inactive.body.meta.total).toBe(0);

      expect(JSON.stringify(page1.body)).not.toMatch(
        /passwordHash|refreshTokenHash|\$argon2/,
      );
    });

    it('defaults pageSize to the platform setting and caps it', async () => {
      const res = await http()
        .get('/api/admin/accounts')
        .set(asBoss())
        .expect(200);
      const setting = await prisma.platformSettings.findUnique({
        where: { id: 1 },
      });
      expect(res.body.meta.pageSize).toBe(setting?.defaultPageSize ?? 10);
      await http()
        .get('/api/admin/accounts')
        .query({ pageSize: 500 })
        .set(asBoss())
        .expect(400);
      await http()
        .get('/api/admin/accounts')
        .query({ role: 'SUPERUSER' })
        .set(asBoss())
        .expect(400);
    });
  });

  // ───────────────────────── create ─────────────────────────

  describe('create', () => {
    it('provisions Person + User + roles with a hashed temporary password (username normalized)', async () => {
      const res = await http()
        .post('/api/admin/accounts')
        .set(asBoss())
        .send({
          username: `  ${PREFIX.toUpperCase()}New.User `,
          temporaryPassword: 'temporary-123',
          roles: ['TEACHER', 'ADMIN'],
          person: {
            firstName: 'سارة',
            lastName: `جديدة-${RUN}`,
            phone: '22 345 678',
            email: 'Sara@Example.TN',
          },
        })
        .expect(201);
      expect(res.body).toMatchObject({
        username: name('new.user'),
        isActive: true,
        mustChangePassword: true,
        roles: ['ADMIN', 'TEACHER'],
        teacherId: null, // a TEACHER role never fabricates a Teacher profile
        studentId: null,
        person: {
          firstName: 'سارة',
          phone: '22345678',
          email: 'sara@example.tn',
        },
      });
      expect(JSON.stringify(res.body)).not.toMatch(
        /passwordHash|temporary-123/,
      );
      ids.newUser = res.body.id;

      const stored = await prisma.user.findUniqueOrThrow({
        where: { id: res.body.id },
      });
      expect(stored.passwordHash.startsWith('$argon2id$')).toBe(true);
      expect(
        await prisma.teacher.count({ where: { personId: res.body.person.id } }),
      ).toBe(0);

      // Case-insensitive login; the temporary password forces a change first
      const first = await login(
        `${PREFIX.toUpperCase()}NEW.USER`,
        'temporary-123',
      ).expect(200);
      expect(first.body.user.mustChangePassword).toBe(true);
      await http()
        .get('/api/admin/accounts')
        .set(bearer(first.body.accessToken))
        .expect(403);
    });

    it('rejects a duplicate username whatever its case', async () => {
      const res = await http()
        .post('/api/admin/accounts')
        .set(asBoss())
        .send({
          username: name('BOSS'),
          temporaryPassword: 'temporary-123',
          roles: ['ADMIN'],
          person: { firstName: 'أ', lastName: `ب-${RUN}` },
        })
        .expect(409);
      expect(res.body.code).toBe('USERNAME_TAKEN');
    });

    it('links an existing Person (e.g. a teacher profile) without duplicating it', async () => {
      const person = await prisma.person.create({
        data: {
          firstName: 'معلم',
          lastName: `بلا-حساب-${RUN}`,
          teacher: { create: { joinedAt: new Date('2025-01-01') } },
        },
      });
      const res = await http()
        .post('/api/admin/accounts')
        .set(asBoss())
        .send({
          username: name('linked'),
          temporaryPassword: 'temporary-123',
          roles: ['TEACHER'],
          personId: person.id,
        })
        .expect(201);
      expect(res.body.person.id).toBe(person.id);
      expect(res.body.teacherId).toEqual(expect.any(String));
      expect(
        await prisma.person.count({ where: { lastName: `بلا-حساب-${RUN}` } }),
      ).toBe(1);

      const again = await http()
        .post('/api/admin/accounts')
        .set(asBoss())
        .send({
          username: name('linked2'),
          temporaryPassword: 'temporary-123',
          roles: ['TEACHER'],
          personId: person.id,
        })
        .expect(409);
      expect(again.body.code).toBe('PERSON_ALREADY_HAS_ACCOUNT');
      await http()
        .post('/api/admin/accounts')
        .set(asBoss())
        .send({
          username: name('ghost'),
          temporaryPassword: 'temporary-123',
          roles: ['TEACHER'],
          personId: randomUUID(),
        })
        .expect(404);
    });

    it('validates the body', async () => {
      const base = {
        username: name('valid'),
        temporaryPassword: 'temporary-123',
        roles: ['ADMIN'],
        person: { firstName: 'أ', lastName: 'ب' },
      };
      const post = (body: object) =>
        http().post('/api/admin/accounts').set(asBoss()).send(body);
      await post({ ...base, username: 'ab' }).expect(400);
      await post({ ...base, username: 'with space' }).expect(400);
      await post({ ...base, temporaryPassword: 'short' }).expect(400);
      await post({ ...base, roles: [] }).expect(400);
      await post({ ...base, roles: ['ADMIN', 'ADMIN'] }).expect(400);
      await post({ ...base, isActive: false }).expect(400);
      await post({ ...base, person: { ...base.person, phone: '123' } }).expect(
        400,
      );
      expect(
        (await post({ ...base, person: undefined }).expect(400)).body.code,
      ).toBe('PERSON_REQUIRED');
      expect(
        (await post({ ...base, personId: randomUUID() }).expect(400)).body.code,
      ).toBe('PERSON_REQUIRED');
    });
  });

  // ───────────────────────── update / roles / status / reset ─────────────────────────

  describe('administration actions', () => {
    it('changes the username (sessions kept) and the canonical Person', async () => {
      const targetToken = await tokenOf(name('target'));
      const res = await http()
        .patch(`/api/admin/accounts/${ids.target}`)
        .set(asBoss())
        .send({
          username: name('Renamed'),
          person: { lastName: `معدّل-${RUN}`, address: 'نابل' },
        })
        .expect(200);
      expect(res.body).toMatchObject({
        username: name('renamed'),
        person: { lastName: `معدّل-${RUN}`, address: 'نابل' },
      });

      // Same session still valid; the person data is the one shown everywhere
      const me = await http()
        .get('/api/auth/me')
        .set(bearer(targetToken))
        .expect(200);
      expect(me.body).toMatchObject({
        username: name('renamed'),
        person: { lastName: `معدّل-${RUN}` },
      });
      await login(name('target')).expect(401);
      await login(name('RENAMED')).expect(200);

      await http()
        .patch(`/api/admin/accounts/${ids.target}`)
        .set(asBoss())
        .send({ username: name('boss') })
        .expect(409);
      await http()
        .patch(`/api/admin/accounts/${ids.target}`)
        .set(asBoss())
        .send({ passwordHash: 'x' })
        .expect(400);
    });

    it('replaces roles atomically; removal is effective on the next request', async () => {
      const set = (roles: string[]) =>
        http()
          .put(`/api/admin/accounts/${ids.target}/roles`)
          .set(asBoss())
          .send({ roles });
      expect(
        (await set(['ADMIN', 'TEACHER', 'STUDENT']).expect(200)).body.roles,
      ).toEqual(['ADMIN', 'TEACHER', 'STUDENT']);
      const targetToken = await tokenOf(name('renamed'));
      await http()
        .get('/api/admin/accounts')
        .set(bearer(targetToken))
        .expect(200);

      expect((await set(['TEACHER']).expect(200)).body.roles).toEqual([
        'TEACHER',
      ]);
      await http()
        .get('/api/admin/accounts')
        .set(bearer(targetToken))
        .expect(403); // same token, role gone
      expect(
        (await http().get('/api/auth/me').set(bearer(targetToken)).expect(200))
          .body.roles,
      ).toEqual(['TEACHER']);

      await set([]).expect(400);
      await set(['TEACHER', 'TEACHER']).expect(400);
      expect(
        await prisma.userRole.count({ where: { userId: ids.target } }),
      ).toBe(1);
    });

    it('deactivation revokes every session immediately; reactivation does not restore them', async () => {
      const a = await login(name('renamed')).expect(200);
      const b = await login(name('renamed')).expect(200);
      const off = await http()
        .post(`/api/admin/accounts/${ids.target}/deactivate`)
        .set(asBoss())
        .expect(200);
      expect(off.body).toMatchObject({ isActive: false, activeSessions: 0 });

      for (const s of [a, b]) {
        await http()
          .get('/api/auth/me')
          .set(bearer(s.body.accessToken))
          .expect(401);
        await http()
          .post('/api/auth/refresh')
          .set('Cookie', refreshCookie(s))
          .expect(401);
      }
      expect((await login(name('renamed')).expect(403)).body.code).toBe(
        'ACCOUNT_INACTIVE',
      );

      expect(
        (
          await http()
            .post(`/api/admin/accounts/${ids.target}/activate`)
            .set(asBoss())
            .expect(200)
        ).body.isActive,
      ).toBe(true);
      await http()
        .get('/api/auth/me')
        .set(bearer(a.body.accessToken))
        .expect(401);
      await login(name('renamed')).expect(200);
    });

    it('password reset: temporary password, mustChangePassword, all sessions revoked', async () => {
      const s1 = await login(name('renamed')).expect(200);
      const s2 = await login(name('renamed')).expect(200);
      const res = await http()
        .post(`/api/admin/accounts/${ids.target}/reset-password`)
        .set(asBoss())
        .send({ temporaryPassword: 'reset-temp-456' })
        .expect(200);
      expect(res.body).toMatchObject({
        mustChangePassword: true,
        activeSessions: 0,
      });
      expect(JSON.stringify(res.body)).not.toMatch(
        /reset-temp-456|passwordHash/,
      );

      for (const s of [s1, s2])
        await http()
          .get('/api/auth/me')
          .set(bearer(s.body.accessToken))
          .expect(401);
      await login(name('renamed'), PASSWORD).expect(401);
      const fresh = await login(name('renamed'), 'reset-temp-456').expect(200);
      expect(fresh.body.user.mustChangePassword).toBe(true);

      await http()
        .post(`/api/admin/accounts/${ids.target}/reset-password`)
        .set(asBoss())
        .send({ temporaryPassword: 'short' })
        .expect(400);
    });
  });

  // ───────────────────────── last-admin safety ─────────────────────────

  describe('admin lock-out safety', () => {
    it('an admin cannot deactivate, demote or reset themselves', async () => {
      const self = (path: string, body?: object) =>
        http()
          .post(`/api/admin/accounts/${ids.boss}/${path}`)
          .set(asBoss())
          .send(body);
      expect((await self('deactivate').expect(409)).body.code).toBe(
        'SELF_LOCKOUT',
      );
      expect(
        (
          await self('reset-password', {
            temporaryPassword: 'another-123',
          }).expect(409)
        ).body.code,
      ).toBe('SELF_LOCKOUT');
      const demote = await http()
        .put(`/api/admin/accounts/${ids.boss}/roles`)
        .set(asBoss())
        .send({ roles: ['TEACHER'] })
        .expect(409);
      expect(demote.body.code).toBe('SELF_LOCKOUT');
    });

    it('two admins deactivating each other at once never leave zero active admins', async () => {
      const boss2Token = await tokenOf(name('boss2'));
      const results = await Promise.all([
        http()
          .post(`/api/admin/accounts/${ids.boss2}/deactivate`)
          .set(asBoss()),
        http()
          .post(`/api/admin/accounts/${ids.boss}/deactivate`)
          .set(bearer(boss2Token)),
      ]);
      const activeAdmins = await prisma.user.count({
        where: { isActive: true, roles: { some: { role: 'ADMIN' } } },
      });
      expect(activeAdmins).toBeGreaterThan(0);
      for (const r of results) expect([200, 401, 409]).toContain(r.status);
      // Restore both for the following tests
      await prisma.user.updateMany({
        where: { id: { in: [ids.boss, ids.boss2] } },
        data: { isActive: true },
      });
      bossToken = await tokenOf(name('boss'));
    });
  });

  // ───────────────────────── own profile ─────────────────────────

  describe('own profile', () => {
    it('reads the signed-in person, account (read-only) and domain profiles', async () => {
      const token = await tokenOf(name('teacher'));
      const res = await http()
        .get('/api/profile')
        .set(bearer(token))
        .expect(200);
      expect(res.body).toMatchObject({
        person: { firstName: 'اختبار', lastName: `teacher-${RUN}` },
        account: {
          username: name('teacher'),
          roles: ['TEACHER'],
          mustChangePassword: false,
        },
        teacher: { joinedAt: '2024-09-01', status: 'ACTIVE' },
        student: null,
      });
      expect(JSON.stringify(res.body)).not.toMatch(/passwordHash/);
    });

    it('edits phone / email / address on the canonical Person only', async () => {
      const token = await tokenOf(name('teacher'));
      const res = await http()
        .patch('/api/profile')
        .set(bearer(token))
        .send({
          phone: '98 765 432',
          email: ' Me@Mail.TN ',
          address: 'دار شعبان الفهري',
        })
        .expect(200);
      expect(res.body.person).toMatchObject({
        phone: '98765432',
        email: 'me@mail.tn',
        address: 'دار شعبان الفهري',
      });

      // Same Person everywhere: admin view and /auth/me
      const admin = await http()
        .get(`/api/admin/accounts/${ids.teacher}`)
        .set(asBoss())
        .expect(200);
      expect(admin.body.person.phone).toBe('98765432');
      expect(
        (await http().get('/api/auth/me').set(bearer(token)).expect(200)).body
          .person.email,
      ).toBe('me@mail.tn');

      const cleared = await http()
        .patch('/api/profile')
        .set(bearer(token))
        .send({ email: null })
        .expect(200);
      expect(cleared.body.person).toMatchObject({
        email: null,
        phone: '98765432',
      });
      await http()
        .patch('/api/profile')
        .set(bearer(token))
        .send({ phone: '123' })
        .expect(400);
    });

    it('rejects every admin-managed field', async () => {
      const token = await tokenOf(name('teacher'));
      for (const body of [
        { firstName: 'X' },
        { lastName: 'X' },
        { username: 'hacker' },
        { roles: ['ADMIN'] },
        { isActive: false },
        { mustChangePassword: false },
        { photoUrl: 'https://evil.example/x.png' },
        { passwordHash: 'x' },
      ]) {
        await http()
          .patch('/api/profile')
          .set(bearer(token))
          .send(body)
          .expect(400);
      }
      const after = await http()
        .get('/api/profile')
        .set(bearer(token))
        .expect(200);
      expect(after.body.person.firstName).toBe('اختبار');
      expect(after.body.account.roles).toEqual(['TEACHER']);
    });

    it('pending password change: profile readable, not editable', async () => {
      const token = await tokenOf(name('temp'));
      await http().get('/api/profile').set(bearer(token)).expect(200);
      expect(
        (
          await http()
            .patch('/api/profile')
            .set(bearer(token))
            .send({ phone: '22345678' })
            .expect(403)
        ).body.code,
      ).toBe('PASSWORD_CHANGE_REQUIRED');
    });
  });

  // ───────────────────────── auth regression ─────────────────────────

  describe('auth regression', () => {
    it('login is case/whitespace-insensitive; refresh and /me still work', async () => {
      const res = await login(`  ${name('BOSS').toUpperCase()}  `).expect(200);
      expect(res.body.user.username).toBe(name('boss'));
      const refreshed = await http()
        .post('/api/auth/refresh')
        .set('Cookie', refreshCookie(res))
        .expect(200);
      await http()
        .get('/api/auth/me')
        .set(bearer(refreshed.body.accessToken))
        .expect(200);
    });

    it('the database itself refuses a non-normalized username', async () => {
      await expect(
        prisma.user.update({
          where: { id: ids.boss2 },
          data: { username: `${PREFIX}UPPER` },
        }),
      ).rejects.toThrow();
    });
  });

  it('Swagger documents the new endpoints without secret fields', async () => {
    const doc = (await http().get('/api/docs-json').expect(200)).body;
    for (const path of [
      '/api/admin/accounts',
      '/api/admin/accounts/{id}',
      '/api/admin/accounts/{id}/roles',
      '/api/admin/accounts/{id}/activate',
      '/api/admin/accounts/{id}/deactivate',
      '/api/admin/accounts/{id}/reset-password',
      '/api/profile',
    ]) {
      expect(doc.paths).toHaveProperty([path]);
    }
    expect(JSON.stringify(doc.components.schemas)).not.toMatch(
      /passwordHash|refreshTokenHash/,
    );
  });
});
