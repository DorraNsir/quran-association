import { Module } from '@nestjs/common';

import { PageSizeService } from '../common/page-size.service.js';
import { StudentSpaceModule } from '../student-space/student-space.module.js';
import { TeachingModule } from '../teaching/teaching.module.js';
import {
  AdminAnnouncementsController,
  StudentAnnouncementsController,
  TeacherAnnouncementsController,
} from './announcements.controller.js';
import { AnnouncementsService } from './announcements.service.js';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';
import {
  AdminResourcesController,
  StudentResourcesController,
  TeacherResourcesController,
} from './resources.controller.js';
import { ResourcesService } from './resources.service.js';

/** Resources, announcements and in-app notifications (Part 10.8). */
@Module({
  imports: [TeachingModule, StudentSpaceModule],
  controllers: [
    AdminResourcesController,
    TeacherResourcesController,
    StudentResourcesController,
    AdminAnnouncementsController,
    TeacherAnnouncementsController,
    StudentAnnouncementsController,
    NotificationsController,
  ],
  providers: [
    PageSizeService,
    NotificationsService,
    ResourcesService,
    AnnouncementsService,
  ],
})
export class CommunicationModule {}
