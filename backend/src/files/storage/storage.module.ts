import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { EnvironmentVariables } from '../../config/env.validation.js';
import { LocalStorageDriver } from './local-storage.driver.js';
import { STORAGE_DRIVER } from './storage-driver.js';

/** The configured storage driver (FILE_STORAGE_DRIVER: 'local' only for now). */
@Module({
  providers: [
    {
      provide: STORAGE_DRIVER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) =>
        new LocalStorageDriver(
          config.get('FILE_STORAGE_ROOT', { infer: true }),
        ),
    },
  ],
  exports: [STORAGE_DRIVER],
})
export class StorageModule {}
