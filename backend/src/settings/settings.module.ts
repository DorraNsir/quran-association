import { Module } from '@nestjs/common';

import { SettingsController } from './settings.controller.js';
import { SettingsService } from './settings.service.js';

/** Association settings (Part 10.10). */
@Module({
  controllers: [SettingsController],
  providers: [SettingsService],
})
export class SettingsModule {}
