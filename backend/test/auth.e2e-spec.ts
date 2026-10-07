import { randomUUID } from 'node:crypto';

import { Controller, Get, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';

import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { CurrentUser } from '../src/auth/decorators/current-user.decorator.js';
import { Roles } from '../src/auth/decorators/roles.decorator.js';
import { PasswordService } from '../src/auth/password.service.js';
import type { AuthPrincipal } from '../src/auth/auth.types.js';
import { Role } from '../src/generated/prisma/enums.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

/** Test-only routes to exercise the global guards (not part of the real API). */
@Controller('probe')
class ProbeController {
  @Get('any')
  any(@CurrentUser() user: AuthPrincipal) {
    return { userId: user.userId };
  }
  @Get('admin')
  @Roles(Role.ADMIN)
  admin() {
    return { ok: true };
  }
  @Get('teacher')
  @Roles(Role.TEACHER)
  teacher() {
    return { ok: true };
  }
  @Get('student')
  @Roles(Role.STUDENT)
  student() {
    return { ok: true };
  }
}

const RUN = randomUUID().slice(0, 8);
const PASSWORD = 'initial-pass-123';
const name = (n: string) => `e2e-${RUN}-${n}`;
const FRONTEND = 'http://localhost:3000';

describe('Authentication & authorization (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const created: { personIds: string[] } = { personIds: [] };

  async function createAccount(
    key: string,
    roles: Role[],
    opts: {
      isActive?: boolean;
      mustChangePassword?: boolean;
      teacher?: boolean;
      student?: boolean;
    } = {},
  ) {
    const passwordHash = await new PasswordService().hash(PASSWORD);
    const person = await prisma.person.create({
      data: {
        firstName: 'اختبار',
        lastName: key,
        user: {
          create: {
            username: name(key),
            passwordHash,
            isActive: opts.isActive ?? true,
            mustChangePassword: opts.mustChangePassword ?? false,
            roles: { create: roles.map((role) => ({ role })) },
          },
        },
        ...(opts.teacher
          ? { teacher: { create: { joinedAt: new Date('2024-09-01') } } }
          : {}),
        ...(opts.student
          ? {
              student: { create: { registrationDate: new Date('2025-09-15') } },
            }
          : {}),
      },
    });
    created.personIds.push(person.id);
  }

  const http = () => request(app.getHttpServer());
  const login = (key: string, password = PASSWORD) =>
    http()
      .post('/api/auth/login')
      .send({ username: name(key), password });

  /** "qa_refresh=<value>" from a response, for the next request's Cookie header. */
  function refreshCookie(res: request.Response) {
    const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
    const cookie = cookies.find((c) => c.startsWith('qa_refresh='));
    return { raw: cookie ?? '', pair: cookie?.split(';')[0] ?? '' };
  }
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [ProbeController],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    await createAccount('multi', [Role.ADMIN, Role.TEACHER], { teacher: true });
    await createAccount('student', [Role.STUDENT], { student: true });
    await createAccount('inactive', [Role.ADMIN], { isActive: false });
    await createAccount('temp', [Role.TEACHER], {
      mustChangePassword: true,
      teacher: true,
    });
    await createAccount('changer', [Role.ADMIN]);
    await createAccount('deactivated', [Role.ADMIN]);
  });

  afterAll(async () => {
    // Sessions and roles cascade with the user; profiles are removed explicitly.
    await prisma.user.deleteMany({
      where: { username: { startsWith: `e2e-${RUN}-` } },
    });
    await prisma.teacher.deleteMany({
      where: { personId: { in: created.personIds } },
    });
    await prisma.student.deleteMany({
      where: { personId: { in: created.personIds } },
    });
    await prisma.person.deleteMany({
      where: { id: { in: created.personIds } },
    });
    await app.close();
  });

  describe('login', () => {
    it('valid credentials → access token, safe user, HttpOnly refresh cookie, lastLoginAt', async () => {
      const res = await login('multi').expect(200);
      expect(typeof res.body.accessToken).toBe('string');
      expect(res.body.expiresIn).toBe(900);
      expect(res.body.user).toMatchObject({
        username: name('multi'),
        roles: ['ADMIN', 'TEACHER'],
        mustChangePassword: false,
        person: { firstName: 'اختبار', lastName: 'multi' },
      });
      expect(res.body.user.teacherId).toEqual(expect.any(String));
      expect(JSON.stringify(res.body)).not.toMatch(
        /passwordHash|refreshTokenHash|\$argon2/,
      );

      const { raw } = refreshCookie(res);
      expect(raw).toMatch(/HttpOnly/i);
      expect(raw).toMatch(/Path=\/api\/auth/);
      expect(raw).toMatch(/SameSite=Lax/i);
      expect(res.body.accessToken).not.toContain(
        raw.split(';')[0].split('=')[1],
      );

      const user = await prisma.user.findUniqueOrThrow({
        where: { username: name('multi') },
      });
      expect(user.lastLoginAt).not.toBeNull();
    });

    it('wrong password and unknown username get the SAME generic 401', async () => {
      const wrong = await login('multi', 'not-the-password').expect(401);
      const unknown = await http()
        .post('/api/auth/login')
        .send({ username: name('nobody'), password: PASSWORD })
        .expect(401);
      expect(wrong.body.code).toBe('INVALID_CREDENTIALS');
      expect(unknown.body).toEqual(wrong.body);
      expect(refreshCookie(wrong).raw).toBe('');
    });

    it('inactive account: 403 only once the password is proven (401 otherwise)', async () => {
      expect((await login('inactive').expect(403)).body.code).toBe(
        'ACCOUNT_INACTIVE',
      );
      expect(
        (await login('inactive', 'wrong-password').expect(401)).body.code,
      ).toBe('INVALID_CREDENTIALS');
    });

    it('rejects malformed bodies (400) including unknown fields', async () => {
      await http()
        .post('/api/auth/login')
        .send({ username: name('multi') })
        .expect(400);
      await http()
        .post('/api/auth/login')
        .send({ username: name('multi'), password: PASSWORD, role: 'ADMIN' })
        .expect(400);
    });
  });

  describe('protected routes', () => {
    it('401 without a token or with a forged one', async () => {
      expect((await http().get('/api/auth/me').expect(401)).body.code).toBe(
        'UNAUTHENTICATED',
      );
      await http().get('/api/auth/me').set(bearer('a.b.c')).expect(401);
    });

    it('GET /api/auth/me returns the profile with a valid token', async () => {
      const { accessToken } = (await login('student').expect(200)).body;
      const me = await http()
        .get('/api/auth/me')
        .set(bearer(accessToken))
        .expect(200);
      expect(me.body).toMatchObject({
        username: name('student'),
        roles: ['STUDENT'],
        teacherId: null,
      });
      expect(me.body.studentId).toEqual(expect.any(String));
      expect(me.body).not.toHaveProperty('passwordHash');
    });

    it('public routes stay public', async () => {
      await http().get('/api/health').expect(200);
    });
  });

  describe('role authorization', () => {
    it('ADMIN + TEACHER passes @Roles(ADMIN) and @Roles(TEACHER), not @Roles(STUDENT)', async () => {
      const { accessToken } = (await login('multi')).body;
      await http().get('/api/probe/admin').set(bearer(accessToken)).expect(200);
      await http()
        .get('/api/probe/teacher')
        .set(bearer(accessToken))
        .expect(200);
      const denied = await http()
        .get('/api/probe/student')
        .set(bearer(accessToken))
        .expect(403);
      expect(denied.body.code).toBe('FORBIDDEN_ROLE');
    });

    it('a STUDENT is refused admin/teacher routes', async () => {
      const { accessToken } = (await login('student')).body;
      await http()
        .get('/api/probe/student')
        .set(bearer(accessToken))
        .expect(200);
      await http().get('/api/probe/admin').set(bearer(accessToken)).expect(403);
      await http()
        .get('/api/probe/teacher')
        .set(bearer(accessToken))
        .expect(403);
    });
  });

  describe('refresh', () => {
    it('rotates the refresh token; replaying the old one revokes the session', async () => {
      const first = await login('multi');
      const cookie1 = refreshCookie(first).pair;

      const second = await http()
        .post('/api/auth/refresh')
        .set('Cookie', cookie1)
        .expect(200);
      const cookie2 = refreshCookie(second).pair;
      expect(cookie2).not.toBe(cookie1);
      expect(typeof second.body.accessToken).toBe('string');
      await http()
        .get('/api/auth/me')
        .set(bearer(second.body.accessToken))
        .expect(200);

      // Replay of the rotated-out token → refused AND the whole session is revoked
      expect(
        (
          await http()
            .post('/api/auth/refresh')
            .set('Cookie', cookie1)
            .expect(401)
        ).body.code,
      ).toBe('SESSION_INVALID');
      await http().post('/api/auth/refresh').set('Cookie', cookie2).expect(401);
      await http()
        .get('/api/auth/me')
        .set(bearer(second.body.accessToken))
        .expect(401);
    });

    it('401 without a cookie; 403 from a foreign browser origin', async () => {
      await http().post('/api/auth/refresh').expect(401);
      const cookie = refreshCookie(await login('multi')).pair;
      expect(
        (
          await http()
            .post('/api/auth/refresh')
            .set('Cookie', cookie)
            .set('Origin', 'https://evil.example')
            .expect(403)
        ).body.code,
      ).toBe('FORBIDDEN_ORIGIN');
      await http()
        .post('/api/auth/refresh')
        .set('Cookie', cookie)
        .set('Origin', FRONTEND)
        .expect(200);
    });
  });

  describe('logout', () => {
    it('logout revokes the current session and clears the cookie', async () => {
      const res = await login('multi');
      const cookie = refreshCookie(res).pair;
      const out = await http()
        .post('/api/auth/logout')
        .set('Cookie', cookie)
        .expect(204);
      expect(refreshCookie(out).raw).toMatch(
        /qa_refresh=;.*Expires=Thu, 01 Jan 1970/,
      );
      await http().post('/api/auth/refresh').set('Cookie', cookie).expect(401);
      await http()
        .get('/api/auth/me')
        .set(bearer(res.body.accessToken))
        .expect(401);
    });

    it('logout-all revokes every session of the user', async () => {
      const a = await login('multi');
      const b = await login('multi');
      await http()
        .post('/api/auth/logout-all')
        .set(bearer(a.body.accessToken))
        .expect(204);
      for (const s of [a, b]) {
        await http()
          .post('/api/auth/refresh')
          .set('Cookie', refreshCookie(s).pair)
          .expect(401);
        await http()
          .get('/api/auth/me')
          .set(bearer(s.body.accessToken))
          .expect(401);
      }
    });
  });

  describe('change password', () => {
    it('verifies, enforces the policy, rotates sessions and replaces the password', async () => {
      const current = await login('changer');
      const other = await login('changer');
      const auth = bearer(current.body.accessToken);

      const wrong = await http()
        .post('/api/auth/change-password')
        .set(auth)
        .send({ currentPassword: 'nope-nope', newPassword: 'brand-new-pass' })
        .expect(400);
      expect(wrong.body.code).toBe('WRONG_CURRENT_PASSWORD');
      await http()
        .post('/api/auth/change-password')
        .set(auth)
        .send({ currentPassword: PASSWORD, newPassword: 'short' })
        .expect(400);

      const changed = await http()
        .post('/api/auth/change-password')
        .set(auth)
        .send({ currentPassword: PASSWORD, newPassword: 'brand-new-pass' })
        .expect(200);
      expect(changed.body.user.mustChangePassword).toBe(false);
      await http()
        .get('/api/auth/me')
        .set(bearer(changed.body.accessToken))
        .expect(200);
      await http()
        .post('/api/auth/refresh')
        .set('Cookie', refreshCookie(changed).pair)
        .expect(200);

      // Other session and the pre-change credentials of this one are revoked
      await http()
        .get('/api/auth/me')
        .set(bearer(other.body.accessToken))
        .expect(401);
      await http()
        .post('/api/auth/refresh')
        .set('Cookie', refreshCookie(other).pair)
        .expect(401);
      await http().get('/api/auth/me').set(auth).expect(401);

      await login('changer', PASSWORD).expect(401);
      await login('changer', 'brand-new-pass').expect(200);
      const stored = await prisma.user.findUniqueOrThrow({
        where: { username: name('changer') },
      });
      expect(stored.passwordHash.startsWith('$argon2id$')).toBe(true);
    });
  });

  describe('mustChangePassword', () => {
    it('allows login + me + change-password only, then unlocks the API', async () => {
      const res = await login('temp').expect(200);
      expect(res.body.user.mustChangePassword).toBe(true);
      const auth = bearer(res.body.accessToken);

      expect(
        (await http().get('/api/probe/any').set(auth).expect(403)).body.code,
      ).toBe('PASSWORD_CHANGE_REQUIRED');
      await http().get('/api/probe/teacher').set(auth).expect(403);
      await http().get('/api/auth/me').set(auth).expect(200);

      const changed = await http()
        .post('/api/auth/change-password')
        .set(auth)
        .send({ currentPassword: PASSWORD, newPassword: 'my-own-password' })
        .expect(200);
      const unlocked = bearer(changed.body.accessToken);
      await http().get('/api/probe/any').set(unlocked).expect(200);
      await http().get('/api/probe/teacher').set(unlocked).expect(200);
    });
  });

  describe('account deactivated while signed in', () => {
    it('loses access immediately (no waiting for token expiry)', async () => {
      const res = await login('deactivated');
      await prisma.user.update({
        where: { username: name('deactivated') },
        data: { isActive: false },
      });
      expect(
        (
          await http()
            .get('/api/auth/me')
            .set(bearer(res.body.accessToken))
            .expect(403)
        ).body.code,
      ).toBe('ACCOUNT_INACTIVE');
      await http()
        .post('/api/auth/refresh')
        .set('Cookie', refreshCookie(res).pair)
        .expect(403);
    });
  });

  describe('Swagger', () => {
    it('documents the auth endpoints and the bearer scheme, without secret fields', async () => {
      const doc = (await http().get('/api/docs-json').expect(200)).body;
      for (const path of [
        'login',
        'refresh',
        'logout',
        'logout-all',
        'me',
        'change-password',
      ]) {
        expect(doc.paths).toHaveProperty(`/api/auth/${path}`);
      }
      expect(doc.components.securitySchemes.bearer).toMatchObject({
        type: 'http',
        scheme: 'bearer',
      });
      expect(JSON.stringify(doc.components.schemas)).not.toMatch(
        /passwordHash|refreshTokenHash/,
      );
    });
  });
});
