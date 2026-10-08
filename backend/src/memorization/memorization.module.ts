import { Module } from '@nestjs/common';

import { TeachingModule } from '../teaching/teaching.module.js';
import {
  AdminMemorizationController,
  TeacherMemorizationController,
} from './memorization.controller.js';
import { MemorizationService } from './memorization.service.js';

@Module({
  imports: [TeachingModule],
  controllers: [AdminMemorizationController, TeacherMemorizationController],
  providers: [MemorizationService],
})
export class MemorizationModule {}
