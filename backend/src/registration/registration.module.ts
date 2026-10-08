import { Module } from '@nestjs/common';

import { AcademicModule } from '../academic/academic.module.js';
import { PageSizeService } from '../common/page-size.service.js';
import {
  RegistrationRateLimiter,
  RegistrationRateLimitGuard,
} from './registration-rate-limit.guard.js';
import {
  AdminRegistrationController,
  PublicRegistrationController,
} from './registration.controller.js';
import { RegistrationService } from './registration.service.js';

@Module({
  imports: [AcademicModule],
  controllers: [PublicRegistrationController, AdminRegistrationController],
  providers: [
    PageSizeService,
    RegistrationService,
    RegistrationRateLimiter,
    RegistrationRateLimitGuard,
  ],
})
export class RegistrationModule {}
