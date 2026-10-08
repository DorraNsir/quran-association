import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { AccountsController } from './accounts.controller.js';
import { AccountsService } from './accounts.service.js';
import { PageSizeService } from '../common/page-size.service.js';

@Module({
  imports: [AuthModule],
  controllers: [AccountsController],
  providers: [AccountsService, PageSizeService],
})
export class AccountsModule {}
