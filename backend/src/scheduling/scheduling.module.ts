import { Module } from '@nestjs/common';

import { PageSizeService } from '../common/page-size.service.js';
import { ScheduleConflictService } from './schedule-conflicts.service.js';
import { SchedulesController } from './schedules.controller.js';
import { SchedulesService } from './schedules.service.js';
import { SessionsController } from './sessions.controller.js';
import { SessionsService } from './sessions.service.js';

/**
 * Weekly schedules + dated sessions (ADMIN). Exports the conflict service so
 * the academic module can protect class room/team/activation changes; this
 * module imports nothing from the academic module (no cycle).
 */
@Module({
  controllers: [SchedulesController, SessionsController],
  providers: [
    ScheduleConflictService,
    SchedulesService,
    SessionsService,
    PageSizeService,
  ],
  exports: [ScheduleConflictService],
})
export class SchedulingModule {}
