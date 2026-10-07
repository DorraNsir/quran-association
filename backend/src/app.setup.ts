import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { NodeEnv, type EnvironmentVariables } from './config/env.validation.js';

export const API_PREFIX = 'api';

/**
 * Global HTTP configuration, shared by main.ts and the e2e tests so both run
 * the exact same pipeline. No URI versioning yet: a single client (the
 * Next.js app) ships together with the API — /api/v1 can be added later
 * without breaking anything.
 */
export function configureApp(app: INestApplication) {
  const config =
    app.get<ConfigService<EnvironmentVariables, true>>(ConfigService);

  app.setGlobalPrefix(API_PREFIX);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableCors({
    origin: config
      .get('CORS_ORIGINS', { infer: true })
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    credentials: true,
  });
  app.enableShutdownHooks();

  if (config.get('NODE_ENV', { infer: true }) !== NodeEnv.Production) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Quran Association Platform API')
        .setDescription(
          'واجهة برمجة منصة الفرع المحلي عمر بن الخطاب بدار شعبان الفهري — Backend (NestJS + PostgreSQL).',
        )
        .setVersion('0.1.0')
        .build(),
    );
    SwaggerModule.setup(`${API_PREFIX}/docs`, app, document);
  }
}
