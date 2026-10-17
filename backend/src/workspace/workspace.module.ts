import { Module } from '@nestjs/common';

import { PageSizeService } from '../common/page-size.service.js';
import { StudentSpaceModule } from '../student-space/student-space.module.js';
import { TeachingModule } from '../teaching/teaching.module.js';
import {
  AdminDashboardController,
  StudentWorkspaceController,
  TeacherWorkspaceController,
} from './workspace.controller.js';
import { WorkspaceService } from './workspace.service.js';

/** Workspace read models (teacher / student bundles), teacher notes and admin key figures. */
@Module({
  imports: [TeachingModule, StudentSpaceModule],
  controllers: [
    TeacherWorkspaceController,
    StudentWorkspaceController,
    AdminDashboardController,
  ],
  providers: [WorkspaceService, PageSizeService],
})
export class WorkspaceModule {}
