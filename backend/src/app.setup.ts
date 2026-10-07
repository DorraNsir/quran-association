import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';

import { REFRESH_COOKIE } from './auth/refresh-cookie.js';
import { NodeEnv, type EnvironmentVariables } from './config/env.validation.js';
import { parseOrigins } from './config/frontend-origins.js';

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
  // Refresh token travels in an HttpOnly cookie
  app.use(cookieParser());
  // Credentialed CORS: explicit frontend origin(s) only — never "*"
  app.enableCors({
    origin: parseOrigins(config.get('FRONTEND_URL', { infer: true })),
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
        .setVersion('0.2.0')
        .addBearerAuth({
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Access token from /api/auth/login or /api/auth/refresh',
        })
        .addCookieAuth(REFRESH_COOKIE, {
          type: 'apiKey',
          in: 'cookie',
          name: REFRESH_COOKIE,
          description:
            'HttpOnly refresh cookie (set by the API, path /api/auth)',
        })
        .build(),
    );
    SwaggerModule.setup(`${API_PREFIX}/docs`, app, document);
  }
}
