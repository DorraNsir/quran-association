import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';

import type { EnvironmentVariables } from '../config/env.validation.js';
import { PrismaClient } from '../generated/prisma/client.js';

/**
 * Prisma 7 client for Nest: the SQL driver adapter (node-postgres) is
 * mandatory and receives the validated DATABASE_URL. Connections are opened
 * lazily, so the API still starts (and /api/health reports it) when the
 * database is temporarily unreachable.
 *
 * Sessions run in UTC: the pg adapter exchanges TIMESTAMPTZ values without
 * an offset, so a server/database TimeZone other than UTC (e.g. Africa/Tunis)
 * would shift every instant written by Prisma by that offset relative to
 * SQL now() and AT TIME ZONE conversions. Calendar logic never relies on the
 * session zone: it uses the platform timezone explicitly.
 */
/** libpq startup options applied to every pooled connection. */
export const SESSION_OPTIONS = '-c TimeZone=UTC';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(config: ConfigService<EnvironmentVariables, true>) {
    super({
      adapter: new PrismaPg({
        connectionString: config.get('DATABASE_URL', { infer: true }),
        options: SESSION_OPTIONS,
      }),
    });
  }

  /** Cheap connectivity probe used by the health endpoint. */
  async isDatabaseUp(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      this.logger.warn(`Database unreachable: ${(error as Error).message}`);
      return false;
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
