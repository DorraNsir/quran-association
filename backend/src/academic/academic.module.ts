import { Module } from '@nestjs/common';

import { PageSizeService } from '../common/page-size.service.js';
import { SchedulingModule } from '../scheduling/scheduling.module.js';
import { AcademicYearsController } from './academic-years/academic-years.controller.js';
import { AcademicYearsService } from './academic-years/academic-years.service.js';
import { BranchesController } from './branches/branches.controller.js';
import { BranchesService } from './branches/branches.service.js';
import { GroupClassesController } from './group-classes/group-classes.controller.js';
import { GroupClassesService } from './group-classes/group-classes.service.js';
import { GroupsController } from './groups/groups.controller.js';
import { GroupsService } from './groups/groups.service.js';
import { RoomsController } from './rooms/rooms.controller.js';
import { RoomsService } from './rooms/rooms.service.js';
import { StudentsController } from './students/students.controller.js';
import { StudentsService } from './students/students.service.js';
import { TeachersController } from './teachers/teachers.controller.js';
import { TeachersService } from './teachers/teachers.service.js';

/** Academic structure administration (ADMIN only): years, branches, rooms, groups, classes, teachers, students. */
@Module({
  imports: [SchedulingModule],
  controllers: [
    AcademicYearsController,
    BranchesController,
    RoomsController,
    GroupsController,
    GroupClassesController,
    TeachersController,
    StudentsController,
  ],
  providers: [
    PageSizeService,
    AcademicYearsService,
    BranchesService,
    RoomsService,
    GroupsService,
    GroupClassesService,
    TeachersService,
    StudentsService,
  ],
})
export class AcademicModule {}
