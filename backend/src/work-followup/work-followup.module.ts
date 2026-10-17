import { Module } from '@nestjs/common';

import { PageSizeService } from '../common/page-size.service.js';
import { TeachingModule } from '../teaching/teaching.module.js';
import {
  AdminWorkFollowupController,
  TeacherWorkFollowupController,
} from './work-followup.controller.js';
import { WorkFollowupService } from './work-followup.service.js';

/** «متابعة العمل»: work programs of students for dated sessions (admin + teacher). */
@Module({
  imports: [TeachingModule],
  controllers: [AdminWorkFollowupController, TeacherWorkFollowupController],
  providers: [WorkFollowupService, PageSizeService],
})
export class WorkFollowupModule {}
