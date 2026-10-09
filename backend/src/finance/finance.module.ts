import { Module } from '@nestjs/common';

import { PageSizeService } from '../common/page-size.service.js';
import { FinanceSummaryService } from './finance-summary.service.js';
import {
  FinanceSummaryController,
  GroupFeesController,
  ObligationsController,
  PaymentsController,
  StudentFinanceController,
} from './finance.controller.js';
import { StudentSpaceModule } from '../student-space/student-space.module.js';
import { GroupFeesService } from './group-fees.service.js';
import { ObligationsService } from './obligations.service.js';
import { PaymentsService } from './payments.service.js';

@Module({
  imports: [StudentSpaceModule],
  controllers: [
    StudentFinanceController,
    GroupFeesController,
    ObligationsController,
    PaymentsController,
    FinanceSummaryController,
  ],
  providers: [
    PageSizeService,
    GroupFeesService,
    ObligationsService,
    PaymentsService,
    FinanceSummaryService,
  ],
})
export class FinanceModule {}
