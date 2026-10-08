import 'reflect-metadata';

import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

import { DURATION_PATTERN } from '../common/duration.js';

export enum NodeEnv {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

/**
 * Environment contract, validated once at startup (the app refuses to boot
 * with a missing or malformed value). Secrets only come from the environment.
 */
export class EnvironmentVariables {
  @IsEnum(NodeEnv)
  NODE_ENV: NodeEnv = NodeEnv.Development;

  /** 4000 by default — the Next.js frontend uses 3000 in development */
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT: number = 4000;

  @IsString()
  @Matches(/^postgres(ql)?:\/\/.+/, {
    message: 'DATABASE_URL must be a postgresql:// connection string',
  })
  DATABASE_URL!: string;

  /** Comma-separated origin(s) of the Next.js app — CORS (with credentials) and cookie-endpoint origin check */
  @IsString()
  @Matches(/^https?:\/\/[^,\s]+(,\s*https?:\/\/[^,\s]+)*$/, {
    message: 'FRONTEND_URL must be one or more comma-separated http(s) origins',
  })
  FRONTEND_URL: string = 'http://localhost:3000';

  /** HMAC secret of the access JWT — long random value, never committed */
  @IsString()
  @MinLength(32, {
    message: 'JWT_ACCESS_SECRET must be at least 32 characters',
  })
  JWT_ACCESS_SECRET!: string;

  /** Short-lived access token, e.g. 15m */
  @Matches(DURATION_PATTERN, {
    message: 'JWT_ACCESS_EXPIRES_IN must look like 15m, 1h…',
  })
  JWT_ACCESS_EXPIRES_IN: string = '15m';

  /** Sliding lifetime of a refresh session (renewed at each rotation), e.g. 7d */
  @Matches(DURATION_PATTERN, {
    message: 'REFRESH_TOKEN_EXPIRES_IN must look like 7d, 12h…',
  })
  REFRESH_TOKEN_EXPIRES_IN: string = '7d';

  /**
   * SameSite of the refresh cookie: "lax" when the frontend and API share a
   * site (localhost, or app./api. subdomains of one domain); "none" only for
   * a cross-site deployment (always Secure).
   */
  @IsIn(['lax', 'strict', 'none'])
  REFRESH_COOKIE_SAMESITE: 'lax' | 'strict' | 'none' = 'lax';

  /**
   * Days (today included) during which a teacher may record or correct the
   * attendance of their own sessions; older sessions: admins only.
   */
  @IsInt()
  @Min(1)
  @Max(366)
  TEACHER_ATTENDANCE_WINDOW_DAYS: number = 7;

  /**
   * Public registration form: at most REGISTRATION_RATE_LIMIT_MAX submissions
   * per client IP per REGISTRATION_RATE_LIMIT_WINDOW_SECONDS (in-memory,
   * single instance — no CAPTCHA in this part).
   */
  @IsInt()
  @Min(1)
  @Max(1000)
  REGISTRATION_RATE_LIMIT_MAX: number = 5;

  @IsInt()
  @Min(1)
  @Max(86400)
  REGISTRATION_RATE_LIMIT_WINDOW_SECONDS: number = 900;

  /**
   * How often (seconds) due SCHEDULED announcements are published; 0 turns
   * the in-process scheduler off (E2E tests drive it explicitly).
   */
  @IsInt()
  @Min(0)
  @Max(3600)
  ANNOUNCEMENT_SCHEDULER_INTERVAL_SECONDS: number = 30;
}

export function validateEnv(config: Record<string, unknown>) {
  const env = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
    // keep the class defaults when a variable is absent
    exposeDefaultValues: true,
  });
  const errors = validateSync(env, { skipMissingProperties: false });
  if (errors.length > 0) {
    const details = errors
      .map((e) => Object.values(e.constraints ?? {}).join(', '))
      .join('; ');
    throw new Error(`Invalid environment configuration: ${details}`);
  }
  if (
    env.NODE_ENV === NodeEnv.Production &&
    /change-me|placeholder|example/i.test(env.JWT_ACCESS_SECRET)
  ) {
    throw new Error(
      'Invalid environment configuration: JWT_ACCESS_SECRET is a placeholder',
    );
  }
  return env;
}
