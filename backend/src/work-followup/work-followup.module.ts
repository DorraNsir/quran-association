import { Module } from '@nestjs/common';

import { PageSizeService } from '../common/page-size.service.js';
import { StudentSpaceModule } from '../student-space/student-space.module.js';
import { TeachingModule } from '../teaching/teaching.module.js';
import {
  AdminWorkFollowupController,
  StudentWorkFollowupController,
  TeacherWorkFollowupController,
} from './work-followup.controller.js';
import { WorkFollowupService } from './work-followup.service.js';

/** «متابعة العمل»: work programs of students for dated sessions (admin + teacher; students read their own). */
@Module({
  imports: [TeachingModule, StudentSpaceModule],
  controllers: [
    AdminWorkFollowupController,
    TeacherWorkFollowupController,
    StudentWorkFollowupController,
  ],
  providers: [WorkFollowupService, PageSizeService],
})
export class WorkFollowupModule {}
