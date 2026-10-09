import { Module } from '@nestjs/common';

import {
  PlatformPreferencesController,
  SettingsController,
} from './settings.controller.js';
import { SettingsService } from './settings.service.js';

/** Association settings (Part 10.10). */
@Module({
  controllers: [SettingsController, PlatformPreferencesController],
  providers: [SettingsService],
})
export class SettingsModule {}
