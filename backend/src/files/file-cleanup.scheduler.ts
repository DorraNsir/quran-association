import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { EnvironmentVariables } from '../config/env.validation.js';
import { FilesService } from './files.service.js';

/**
 * Runs the unreferenced-file cleanup every FILE_CLEANUP_INTERVAL_MINUTES
 * (0 = off). Safe with several runs/instances: each file is claimed with
 * FOR UPDATE SKIP LOCKED and only deleted while referenced by nothing.
 */
@Injectable()
export class FileCleanupScheduler
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(FileCleanupScheduler.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly files: FilesService,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  onApplicationBootstrap() {
    const minutes = this.config.get('FILE_CLEANUP_INTERVAL_MINUTES', {
      infer: true,
    });
    if (minutes <= 0) return;
    this.timer = setInterval(() => void this.tick(), minutes * 60_000);
    this.timer.unref();
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick() {
    if (this.running) return;
    this.running = true;
    try {
      const result = await this.files.cleanup();
      if (result.deletedFiles || result.orphanBytes || result.staleTemp)
        this.logger.log(`File cleanup: ${JSON.stringify(result)}`);
    } catch (error) {
      this.logger.error('File cleanup failed', error as Error);
    } finally {
      this.running = false;
    }
  }
}
