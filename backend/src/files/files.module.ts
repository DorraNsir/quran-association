import { randomUUID } from 'node:crypto';

import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';

import type { EnvironmentVariables } from '../config/env.validation.js';
import { StudentSpaceModule } from '../student-space/student-space.module.js';
import { TeachingModule } from '../teaching/teaching.module.js';
import { FileCleanupScheduler } from './file-cleanup.scheduler.js';
import {
  AdminFilesController,
  FilesController,
  PublicFilesController,
} from './files.controller.js';
import { FilesService } from './files.service.js';
import {
  PersonPhotosController,
  PersonPhotosService,
} from './person-photos.controller.js';
import {
  STORAGE_DRIVER,
  type StorageDriver,
} from './storage/storage-driver.js';
import { StorageModule } from './storage/storage.module.js';
import { UploadPermissionGuard } from './upload-permission.guard.js';

/**
 * Shared file storage (Part 10.10), global so every module attaches files
 * through the same FilesService rules.
 */
@Global()
@Module({
  imports: [
    TeachingModule,
    StudentSpaceModule,
    StorageModule,
    MulterModule.registerAsync({
      imports: [StorageModule],
      inject: [STORAGE_DRIVER, ConfigService],
      useFactory: (
        storage: StorageDriver,
        config: ConfigService<EnvironmentVariables, true>,
      ) => ({
        // Streamed to a private temporary file (never fully buffered in memory),
        // under a random name; aborted (413) beyond the largest per-type limit
        storage: diskStorage({
          destination: storage.tempDir,
          filename: (_req, _file, done) => done(null, randomUUID()),
        }),
        // Browsers send UTF-8 filenames without a charset (Arabic names)
        defParamCharset: 'utf8',
        limits: {
          fileSize: Math.max(
            config.get('FILE_MAX_IMAGE_BYTES', { infer: true }),
            config.get('FILE_MAX_PDF_BYTES', { infer: true }),
            config.get('FILE_MAX_AUDIO_BYTES', { infer: true }),
          ),
          files: 1,
          fields: 5,
          fieldSize: 1024,
          parts: 8,
        },
      }),
    }),
  ],
  controllers: [
    FilesController,
    PublicFilesController,
    AdminFilesController,
    PersonPhotosController,
  ],
  providers: [
    FilesService,
    PersonPhotosService,
    UploadPermissionGuard,
    FileCleanupScheduler,
  ],
  exports: [FilesService],
})
export class FilesModule {}
