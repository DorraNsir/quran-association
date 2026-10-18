import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

import type { EnvironmentVariables } from '../config/env.validation.js';

/**
 * STUDENT_ONBOARDING_ENABLED, enforced on the server. Off: the public routes
 * and every admin MUTATION answer 404 (the feature "does not exist"); admin
 * reads stay available so stored submissions can still be consulted.
 */
@Injectable()
export class OnboardingEnabledGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    if (this.config.get('STUDENT_ONBOARDING_ENABLED', { infer: true }))
      return true;
    const request = context.switchToHttp().getRequest<Request>();
    const isPublic = request.path.includes('/public/');
    if (!isPublic && request.method === 'GET') return true;
    throw new NotFoundException({
      code: 'STUDENT_ONBOARDING_DISABLED',
      message: 'خدمة استكمال بيانات الطلبة غير متاحة حاليًا',
    });
  }
}
