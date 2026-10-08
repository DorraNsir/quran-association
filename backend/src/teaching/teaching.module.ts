import { Module } from '@nestjs/common';

import { TeacherAccessService } from './teacher-access.service.js';

/** Teacher resource authorization (assignment-based), shared by teacher-facing modules. */
@Module({ providers: [TeacherAccessService], exports: [TeacherAccessService] })
export class TeachingModule {}
