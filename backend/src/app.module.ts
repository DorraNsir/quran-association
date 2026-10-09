import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AcademicModule } from './academic/academic.module.js';
import { AccountsModule } from './accounts/accounts.module.js';
import { AttendanceModule } from './attendance/attendance.module.js';
import { CmsModule } from './cms/cms.module.js';
import { CommunicationModule } from './communication/communication.module.js';
import { AuthModule } from './auth/auth.module.js';
import { validateEnv } from './config/env.validation.js';
import { FilesModule } from './files/files.module.js';
import { FinanceModule } from './finance/finance.module.js';
import { HealthModule } from './health/health.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { MemorizationModule } from './memorization/memorization.module.js';
import { ProfileModule } from './profile/profile.module.js';
import { SettingsModule } from './settings/settings.module.js';
import { RegistrationModule } from './registration/registration.module.js';
import { SchedulingModule } from './scheduling/scheduling.module.js';
import { WorkspaceModule } from './workspace/workspace.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
    }),
    PrismaModule,
    FilesModule,
    AuthModule,
    AccountsModule,
    ProfileModule,
    AcademicModule,
    SchedulingModule,
    AttendanceModule,
    MemorizationModule,
    RegistrationModule,
    FinanceModule,
    CommunicationModule,
    CmsModule,
    SettingsModule,
    WorkspaceModule,
    HealthModule,
  ],
})
export class AppModule {}
