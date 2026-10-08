import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { EnvironmentVariables } from '../config/env.validation.js';
import { AnnouncementsService } from './announcements.service.js';

/**
 * Publishes due SCHEDULED announcements every
 * ANNOUNCEMENT_SCHEDULER_INTERVAL_SECONDS (default 30 s; 0 = off), and once
 * at startup to catch up on anything due while the API was down.
 *
 * A plain timer is enough (no @nestjs/schedule, no queue): correctness does
 * not depend on the timer. Each due announcement is claimed in the database
 * (FOR UPDATE SKIP LOCKED + status check) and published with its
 * notifications in one transaction, so overlapping runs — in this process or
 * in several API instances — publish it exactly once. Publication may lag
 * scheduledFor by up to one interval.
 */
@Injectable()
export class AnnouncementScheduler
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(AnnouncementScheduler.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly announcements: AnnouncementsService,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  onApplicationBootstrap() {
    const seconds = this.config.get('ANNOUNCEMENT_SCHEDULER_INTERVAL_SECONDS', {
      infer: true,
    });
    if (seconds > 0) this.start(seconds * 1000);
  }

  onApplicationShutdown() {
    this.stop();
  }

  start(intervalMs: number) {
    this.stop();
    void this.tick();
    this.timer = setInterval(() => void this.tick(), intervalMs);
    // Never keeps the process alive on its own
    this.timer.unref();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  /** One run; skipped if the previous run of this process is still going. */
  async tick(): Promise<string[]> {
    if (this.running) return [];
    this.running = true;
    try {
      return await this.announcements.publishDue();
    } catch (error) {
      // Retried at the next tick (nothing was half-published: per-announcement transactions)
      this.logger.error('Scheduled publication run failed', error as Error);
      return [];
    } finally {
      this.running = false;
    }
  }
}
