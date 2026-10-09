import { Module } from '@nestjs/common';

import { PageSizeService } from '../common/page-size.service.js';
import { SchedulingModule } from '../scheduling/scheduling.module.js';
import { TeachingModule } from '../teaching/teaching.module.js';
import {
  AdminAttendanceController,
  StudentAttendanceController,
  TeacherAttendanceController,
  TeacherStudentAttendanceController,
} from './attendance.controller.js';
import { StudentSpaceModule } from '../student-space/student-space.module.js';
import { AttendanceService } from './attendance.service.js';

@Module({
  imports: [SchedulingModule, TeachingModule, StudentSpaceModule],
  controllers: [
    AdminAttendanceController,
    TeacherAttendanceController,
    TeacherStudentAttendanceController,
    StudentAttendanceController,
  ],
  providers: [AttendanceService, PageSizeService],
})
export class AttendanceModule {}
