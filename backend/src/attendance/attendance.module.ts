import { Module } from '@nestjs/common';

import { PageSizeService } from '../common/page-size.service.js';
import { SchedulingModule } from '../scheduling/scheduling.module.js';
import { TeachingModule } from '../teaching/teaching.module.js';
import {
  AdminAttendanceController,
  TeacherAttendanceController,
} from './attendance.controller.js';
import { AttendanceService } from './attendance.service.js';

@Module({
  imports: [SchedulingModule, TeachingModule],
  controllers: [AdminAttendanceController, TeacherAttendanceController],
  providers: [AttendanceService, PageSizeService],
})
export class AttendanceModule {}
