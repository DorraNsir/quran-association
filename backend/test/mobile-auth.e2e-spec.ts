import { randomUUID } from 'node:crypto';

import { Controller, Get, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';

import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import {
  AUTH_RATE_LIMITS,
  type AuthRateLimits,
} from '../src/auth/auth-rate-limit.js';
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
}

const RUN = randomUUID().slice(0, 8);
const PASSWORD = 'initial-pass-123';
const name = (n: string) => `e2e-mob-${RUN}-${n}`;
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

/** Small limits for the rate-limit suite (the main suite keeps the defaults). */
const TIGHT: AuthRateLimits = {
  windowMs: 60_000,
  loginPerIp: 12,
  loginPerUsername: 3,
  passwordChangePerUser: 2,
};

describe('Mobile authentication (e2e)', () => {
  let app: INestApplication<App>;
  let limited: INestApplication<App>;
  let prisma: PrismaService;
  const personIds: string[] = [];

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
    personIds.push(person.id);
  }

  async function boot(limits?: AuthRateLimits) {
    let builder = Test.createTestingModule({
      imports: [AppModule],
      controllers: [ProbeController],
    });
    if (limits)
      builder = builder.overrideProvider(AUTH_RATE_LIMITS).useValue(limits);
    const instance = (await builder.compile()).createNestApplication<
      INestApplication<App>
    >();
    configureApp(instance);
    await instance.init();
    return instance;
  }

  const http = () => request(app.getHttpServer());
  const mobileLogin = (key: string, password = PASSWORD) =>
    http()
      .post('/api/auth/mobile/login')
      .send({ username: name(key), password });
  const mobileRefresh = (refreshToken: string) =>
    http().post('/api/auth/mobile/refresh').send({ refreshToken });

  beforeAll(async () => {
    app = await boot();
    limited = await boot(TIGHT);
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
    await createAccount('reset', [Role.TEACHER], { teacher: true });
    for (const key of ['rl-user', 'rl-web', 'rl-pwd', 'rl-ip', 'rl-xff'])
      await createAccount(key, [Role.ADMIN]);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { username: { startsWith: `e2e-mob-${RUN}-` } },
    });
    await prisma.teacher.deleteMany({ where: { personId: { in: personIds } } });
    await prisma.student.deleteMany({ where: { personId: { in: personIds } } });
    await prisma.person.deleteMany({ where: { id: { in: personIds } } });
    await limited.close();
    await app.close();
  });

  describe('login', () => {
    it('returns the tokens in the body and sets NO cookie', async () => {
      const before = new Date();
      const res = await mobileLogin('multi').expect(200);
      expect(res.headers['set-cookie']).toBeUndefined();
      expect(typeof res.body.accessToken).toBe('string');
      expect(res.body.expiresIn).toBeGreaterThan(0);
      expect(res.body.refreshToken).toMatch(/^[0-9a-f-]{36}\.[\w-]{40,}$/);
      expect(new Date(res.body.refreshExpiresAt).getTime()).toBeGreaterThan(
        Date.now(),
      );
      expect(res.body.user).toMatchObject({
        username: name('multi'),
        roles: ['ADMIN', 'TEACHER'],
        mustChangePassword: false,
      });
      expect(res.body.user.teacherId).toEqual(expect.any(String));
      expect(JSON.stringify(res.body)).not.toMatch(
        /passwordHash|refreshTokenHash/,
      );
      const stored = await prisma.user.findUniqueOrThrow({
        where: { username: name('multi') },
      });
      expect(stored.lastLoginAt!.getTime()).toBeGreaterThanOrEqual(
        before.getTime() - 1000,
      );
    });

    it('same generic 401 for an unknown user and a wrong password', async () => {
      const wrong = await mobileLogin('multi', 'wrong-password').expect(401);
      const unknown = await mobileLogin('nobody').expect(401);
      expect(wrong.body).toEqual(unknown.body);
      expect(wrong.body.code).toBe('INVALID_CREDENTIALS');
    });

    it('inactive account: 403 only once the password is proven', async () => {
      await mobileLogin('inactive', 'wrong-password').expect(401);
      expect((await mobileLogin('inactive').expect(403)).body.code).toBe(
        'ACCOUNT_INACTIVE',
      );
    });

    it('rejects malformed bodies, including unknown fields', async () => {
      await http().post('/api/auth/mobile/login').send({}).expect(400);
      await http()
        .post('/api/auth/mobile/login')
        .send({ username: name('multi'), password: PASSWORD, extra: 1 })
        .expect(400);
    });

    it('refuses browsers (any Origin header) — defence in depth', async () => {
      for (const origin of ['http://localhost:3000', 'https://evil.example']) {
        expect(
          (
            await http()
              .post('/api/auth/mobile/login')
              .set('Origin', origin)
              .send({ username: name('multi'), password: PASSWORD })
              .expect(403)
          ).body.code,
        ).toBe('FORBIDDEN_ORIGIN');
      }
    });
  });

  describe('access token', () => {
    it('works on protected routes with the same role rules as the web', async () => {
      const multi = await mobileLogin('multi');
      await http()
        .get('/api/auth/me')
        .set(bearer(multi.body.accessToken))
        .expect(200);
      await http()
        .get('/api/probe/admin')
        .set(bearer(multi.body.accessToken))
        .expect(200);

      const student = await mobileLogin('student');
      expect(student.body.user.studentId).toEqual(expect.any(String));
      expect(
        (
          await http()
            .get('/api/probe/admin')
            .set(bearer(student.body.accessToken))
            .expect(403)
        ).body.code,
      ).toBe('FORBIDDEN_ROLE');
      await http()
        .get('/api/probe/teacher')
        .set(bearer(student.body.accessToken))
        .expect(403);
    });
  });

  describe('refresh', () => {
    it('rotates; replaying the old token revokes the whole session', async () => {
      const first = await mobileLogin('multi');
      const second = await mobileRefresh(first.body.refreshToken).expect(200);
      expect(second.headers['set-cookie']).toBeUndefined();
      expect(second.body.refreshToken).not.toBe(first.body.refreshToken);
      await http()
        .get('/api/auth/me')
        .set(bearer(second.body.accessToken))
        .expect(200);

      expect(
        (await mobileRefresh(first.body.refreshToken).expect(401)).body.code,
      ).toBe('SESSION_INVALID');
      await mobileRefresh(second.body.refreshToken).expect(401);
      await http()
        .get('/api/auth/me')
        .set(bearer(second.body.accessToken))
        .expect(401);
    });

    it('two concurrent refreshes with the same token: exactly one succeeds', async () => {
      const res = await mobileLogin('multi');
      const results = await Promise.all([
        mobileRefresh(res.body.refreshToken),
        mobileRefresh(res.body.refreshToken),
      ]);
      expect(results.map((r) => r.status).sort((x, y) => x - y)).toEqual([
        200, 401,
      ]);
    });

    it('400 without a token; 401 for a malformed one; 403 from a browser', async () => {
      await http().post('/api/auth/mobile/refresh').send({}).expect(400);
      await mobileRefresh('not-a-token').expect(401);
      const res = await mobileLogin('multi');
      await http()
        .post('/api/auth/mobile/refresh')
        .set('Origin', 'http://localhost:3000')
        .send({ refreshToken: res.body.refreshToken })
        .expect(403);
      // The refused request did not consume the token
      await mobileRefresh(res.body.refreshToken).expect(200);
    });
  });

  describe('logout', () => {
    it('revokes the session immediately and is idempotent', async () => {
      const res = await mobileLogin('multi');
      await http()
        .post('/api/auth/mobile/logout')
        .send({ refreshToken: res.body.refreshToken })
        .expect(204);
      await mobileRefresh(res.body.refreshToken).expect(401);
      await http()
        .get('/api/auth/me')
        .set(bearer(res.body.accessToken))
        .expect(401);
      await http()
        .post('/api/auth/mobile/logout')
        .send({ refreshToken: res.body.refreshToken })
        .expect(204);
      await http()
        .post('/api/auth/mobile/logout')
        .send({ refreshToken: 'garbage' })
        .expect(204);
    });

    it('logout-all from mobile also ends web sessions', async () => {
      const mobile = await mobileLogin('multi');
      const web = await http()
        .post('/api/auth/login')
        .send({ username: name('multi'), password: PASSWORD })
        .expect(200);
      const webCookie = ([] as string[])
        .concat(web.headers['set-cookie'] ?? [])
        .find((c) => c.startsWith('qa_refresh='))!
        .split(';')[0];
      await http()
        .post('/api/auth/logout-all')
        .set(bearer(mobile.body.accessToken))
        .expect(204);
      await mobileRefresh(mobile.body.refreshToken).expect(401);
      await http()
        .post('/api/auth/refresh')
        .set('Cookie', webCookie)
        .expect(401);
    });
  });

  describe('forced password change', () => {
    it('only me + change-password until changed; new tokens in the body', async () => {
      const res = await mobileLogin('temp').expect(200);
      expect(res.body.user.mustChangePassword).toBe(true);
      const auth = bearer(res.body.accessToken);
      expect(
        (await http().get('/api/probe/any').set(auth).expect(403)).body.code,
      ).toBe('PASSWORD_CHANGE_REQUIRED');
      await http().get('/api/auth/me').set(auth).expect(200);

      const changed = await http()
        .post('/api/auth/mobile/change-password')
        .set(auth)
        .send({ currentPassword: PASSWORD, newPassword: 'my-own-password' })
        .expect(200);
      expect(changed.headers['set-cookie']).toBeUndefined();
      expect(changed.body.user.mustChangePassword).toBe(false);
      await http()
        .get('/api/probe/teacher')
        .set(bearer(changed.body.accessToken))
        .expect(200);
      // The pre-change session is gone; the new refresh token works
      await mobileRefresh(res.body.refreshToken).expect(401);
      await mobileRefresh(changed.body.refreshToken).expect(200);
    });

    it('verifies the current password, enforces the policy, ends other sessions', async () => {
      const current = await mobileLogin('changer');
      const other = await mobileLogin('changer');
      const auth = bearer(current.body.accessToken);
      expect(
        (
          await http()
            .post('/api/auth/mobile/change-password')
            .set(auth)
            .send({
              currentPassword: 'nope-nope',
              newPassword: 'brand-new-pass',
            })
            .expect(400)
        ).body.code,
      ).toBe('WRONG_CURRENT_PASSWORD');
      await http()
        .post('/api/auth/mobile/change-password')
        .set(auth)
        .send({ currentPassword: PASSWORD, newPassword: 'short' })
        .expect(400);
      await http()
        .post('/api/auth/mobile/change-password')
        .send({ currentPassword: PASSWORD, newPassword: 'brand-new-pass' })
        .expect(401);

      const changed = await http()
        .post('/api/auth/mobile/change-password')
        .set(auth)
        .send({ currentPassword: PASSWORD, newPassword: 'brand-new-pass' })
        .expect(200);
      await mobileRefresh(other.body.refreshToken).expect(401);
      await http()
        .get('/api/auth/me')
        .set(bearer(other.body.accessToken))
        .expect(401);
      await mobileRefresh(changed.body.refreshToken).expect(200);
      await mobileLogin('changer', 'brand-new-pass').expect(200);
    });
  });

  describe('revocation by account changes', () => {
    it('deactivation: access 403 and refresh 403 (session revoked)', async () => {
      const res = await mobileLogin('deactivated');
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
      await mobileRefresh(res.body.refreshToken).expect(403);
      await prisma.user.update({
        where: { username: name('deactivated') },
        data: { isActive: true },
      });
      // Reactivation does not resurrect the revoked session
      await mobileRefresh(res.body.refreshToken).expect(401);
    });

    it('an admin password reset ends the mobile session', async () => {
      const admin = await mobileLogin('multi');
      const target = await mobileLogin('reset');
      const account = await prisma.user.findUniqueOrThrow({
        where: { username: name('reset') },
      });
      await http()
        .post(`/api/admin/accounts/${account.id}/reset-password`)
        .set(bearer(admin.body.accessToken))
        .send({ temporaryPassword: 'temporary-pass-1' })
        .expect(200);
      await mobileRefresh(target.body.refreshToken).expect(401);
      await http()
        .get('/api/auth/me')
        .set(bearer(target.body.accessToken))
        .expect(401);
    });
  });

  describe('rate limiting (tight limits; web and mobile share the counters)', () => {
    const lhttp = () => request(limited.getHttpServer());
    const attempt = (
      path: string,
      key: string,
      password: string,
      ip?: string,
    ) => {
      const req = lhttp()
        .post(path)
        .send({ username: name(key), password });
      return ip ? req.set('X-Forwarded-For', ip) : req;
    };

    it('locks a username after N failures (429 + Retry-After) even with the right password', async () => {
      for (let i = 0; i < TIGHT.loginPerUsername; i++)
        await attempt('/api/auth/mobile/login', 'rl-user', 'wrong').expect(401);
      const blocked = await attempt(
        '/api/auth/mobile/login',
        'rl-user',
        PASSWORD,
      ).expect(429);
      expect(blocked.body.code).toBe('TOO_MANY_REQUESTS');
      expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
      // The web endpoint is blocked too: neither can bypass the other
      await attempt('/api/auth/login', 'rl-user', PASSWORD).expect(429);
    });

    it('the web login is limited and unknown usernames get the same 429', async () => {
      for (let i = 0; i < TIGHT.loginPerUsername; i++) {
        await attempt('/api/auth/login', 'rl-web', 'wrong').expect(401);
        await attempt('/api/auth/login', 'ghost', 'wrong').expect(401);
      }
      const known = await attempt('/api/auth/login', 'rl-web', PASSWORD).expect(
        429,
      );
      const ghost = await attempt('/api/auth/login', 'ghost', PASSWORD).expect(
        429,
      );
      expect(known.body.code).toBe(ghost.body.code);
      expect(known.body.message).toBe(ghost.body.message);
      expect(known.headers['set-cookie']).toBeUndefined();
    });

    it('per-IP limit across usernames; X-Forwarded-For is ignored with TRUST_PROXY=0', async () => {
      // The suite above already used some of this IP's capacity; fill the rest
      // with distinct unknown usernames, each sending a spoofed forwarded IP.
      let status = 401;
      for (let i = 0; i < TIGHT.loginPerIp && status !== 429; i++)
        status = (
          await attempt(
            '/api/auth/mobile/login',
            `ipfill-${i}`,
            'wrong',
            `10.0.0.${i}`,
          )
        ).status;
      const res = await attempt(
        '/api/auth/mobile/login',
        'rl-ip',
        PASSWORD,
        '203.0.113.9',
      );
      expect(res.status).toBe(429);
    });

    it('change-password: repeated wrong current passwords → 429 per account', async () => {
      // Use the default-limit app to log in (the limited app's IP is exhausted)
      const res = await mobileLogin('rl-pwd').expect(200);
      const auth = bearer(res.body.accessToken);
      for (let i = 0; i < TIGHT.passwordChangePerUser; i++)
        await lhttp()
          .post('/api/auth/mobile/change-password')
          .set(auth)
          .send({ currentPassword: 'wrong-one', newPassword: 'brand-new-pass' })
          .expect(400);
      const blocked = await lhttp()
        .post('/api/auth/change-password')
        .set(auth)
        .send({ currentPassword: PASSWORD, newPassword: 'brand-new-pass' })
        .expect(429);
      expect(blocked.headers['retry-after']).toBeDefined();
    });
  });

  describe('Swagger', () => {
    it('documents the mobile endpoints without secret hashes', async () => {
      const doc = (await http().get('/api/docs-json').expect(200)).body;
      for (const path of ['login', 'refresh', 'logout', 'change-password'])
        expect(doc.paths).toHaveProperty(`/api/auth/mobile/${path}`);
      expect(doc.components.schemas).toHaveProperty('MobileAuthResponseDto');
      expect(JSON.stringify(doc.components.schemas)).not.toMatch(
        /passwordHash|refreshTokenHash/,
      );
    });
  });
});
