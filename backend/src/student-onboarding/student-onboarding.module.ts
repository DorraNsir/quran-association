import { Module } from '@nestjs/common';

import { AcademicModule } from '../academic/academic.module.js';
import { PageSizeService } from '../common/page-size.service.js';
import { OnboardingEnabledGuard } from './onboarding-enabled.guard.js';
import {
  AdminStudentOnboardingController,
  OnboardingRateLimiter,
  OnboardingRateLimitGuard,
  PublicStudentOnboardingController,
} from './student-onboarding.controller.js';
import { StudentOnboardingService } from './student-onboarding.service.js';

/**
 * TEMPORARY «استكمال بيانات الطلبة» (STUDENT_ONBOARDING_ENABLED). Self-contained
 * and removable: deleting this module (and its routes / UI) leaves every
 * student, person, enrollment and account untouched. Students are created
 * through AcademicModule's StudentsService — never by a second path.
 */
@Module({
  imports: [AcademicModule],
  controllers: [
    AdminStudentOnboardingController,
    PublicStudentOnboardingController,
  ],
  providers: [
    StudentOnboardingService,
    PageSizeService,
    OnboardingEnabledGuard,
    OnboardingRateLimiter,
    OnboardingRateLimitGuard,
  ],
})
export class StudentOnboardingModule {}
