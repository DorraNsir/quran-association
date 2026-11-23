import { Module } from '@nestjs/common';

import { CommunicationModule } from '../communication/communication.module.js';
import { PageSizeService } from '../common/page-size.service.js';
import { StudentSpaceModule } from '../student-space/student-space.module.js';
import { TeachingModule } from '../teaching/teaching.module.js';
import {
  AdminFeedbackController,
  StudentFeedbackController,
  TeacherFeedbackController,
} from './feedback.controller.js';
import { FeedbackService } from './feedback.service.js';

/** «الملاحظات والاقتراحات» (Feedback & Suggestions). Files: the global FilesModule. */
@Module({
  imports: [TeachingModule, StudentSpaceModule, CommunicationModule],
  controllers: [
    TeacherFeedbackController,
    StudentFeedbackController,
    AdminFeedbackController,
  ],
  providers: [PageSizeService, FeedbackService],
})
export class FeedbackModule {}
