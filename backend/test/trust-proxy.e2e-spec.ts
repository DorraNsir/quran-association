import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { validateEnv } from '../src/config/env.validation.js';

// The environment is read once, when AppModule is first imported (as on Railway at start)
process.env.TRUST_PROXY = '1';
const { AppModule } = await import('../src/app.module.js');
const { configureApp } = await import('../src/app.setup.js');

type Express = { get: (key: string) => unknown };

/**
 * Behind Railway's proxy every request comes from the proxy: TRUST_PROXY
 * makes req.ip the visitor's address (the registration rate limit is per IP).
 */
describe('TRUST_PROXY (e2e)', () => {
  afterAll(() => {
    delete process.env.TRUST_PROXY;
  });

  it('is off by default (local development) and bounded', () => {
    const base = {
      DATABASE_URL: 'postgresql://u:p@localhost:5432/x',
      JWT_ACCESS_SECRET: 'a'.repeat(40),
    };
    expect(validateEnv(base).TRUST_PROXY).toBe(0);
    expect(validateEnv({ ...base, TRUST_PROXY: '1' }).TRUST_PROXY).toBe(1);
    expect(() => validateEnv({ ...base, TRUST_PROXY: '-1' })).toThrow();
    expect(() => validateEnv({ ...base, TRUST_PROXY: 'yes' })).toThrow();
  });

  it('trusts the configured number of proxy hops', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    const app: INestApplication = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    const express = app.getHttpAdapter().getInstance() as Express;
    expect(express.get('trust proxy')).toBe(1);
    await app.close();
  });
});
