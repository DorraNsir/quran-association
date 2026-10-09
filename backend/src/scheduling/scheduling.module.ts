import { Module } from '@nestjs/common';

import { PageSizeService } from '../common/page-size.service.js';
import { ScheduleConflictService } from './schedule-conflicts.service.js';
import { SchedulesController } from './schedules.controller.js';
import { SchedulesService } from './schedules.service.js';
import { SessionsController } from './sessions.controller.js';
import { SessionsService } from './sessions.service.js';
import {
  StudentSessionsController,
  TeacherSessionsController,
} from './scoped-sessions.controller.js';
import { StudentSpaceModule } from '../student-space/student-space.module.js';
import { TeachingModule } from '../teaching/teaching.module.js';

/**
 * Weekly schedules + dated sessions (ADMIN). Exports the conflict service so
 * the academic module can protect class room/team/activation changes; this
 * module imports nothing from the academic module (no cycle).
 */
@Module({
  imports: [TeachingModule, StudentSpaceModule],
  controllers: [
    SchedulesController,
    SessionsController,
    TeacherSessionsController,
    StudentSessionsController,
  ],
  providers: [
    ScheduleConflictService,
    SchedulesService,
    SessionsService,
    PageSizeService,
  ],
  exports: [ScheduleConflictService, SessionsService],
})
export class SchedulingModule {}
