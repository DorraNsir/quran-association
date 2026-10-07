import { ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service.js';
import { HealthController } from './health.controller.js';

describe('HealthController', () => {
  async function controllerWith(databaseUp: boolean) {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: PrismaService,
          useValue: { isDatabaseUp: async () => databaseUp },
        },
      ],
    }).compile();
    return moduleRef.get(HealthController);
  }

  it('reports ok when the database answers', async () => {
    const result = await (await controllerWith(true)).check();
    expect(result).toMatchObject({ status: 'ok', database: 'up' });
    expect(typeof result.uptimeSeconds).toBe('number');
  });

  it('returns 503 when the database is down', async () => {
    await expect((await controllerWith(false)).check()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
