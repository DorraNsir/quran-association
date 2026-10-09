import { Module } from '@nestjs/common';

import { TeachingModule } from '../teaching/teaching.module.js';
import {
  AdminMemorizationController,
  StudentMemorizationController,
  TeacherMemorizationController,
} from './memorization.controller.js';
import { StudentSpaceModule } from '../student-space/student-space.module.js';
import { MemorizationService } from './memorization.service.js';

@Module({
  imports: [TeachingModule, StudentSpaceModule],
  controllers: [
    AdminMemorizationController,
    TeacherMemorizationController,
    StudentMemorizationController,
  ],
  providers: [MemorizationService],
})
export class MemorizationModule {}
