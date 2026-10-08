import { Module } from '@nestjs/common';

import { PageSizeService } from '../common/page-size.service.js';
import { CMS_ADMIN_CONTROLLERS } from './cms-admin.controllers.js';
import { CmsService } from './cms.service.js';
import { PublicSiteController } from './public-site.controller.js';
import { PublicSiteService } from './public-site.service.js';

/** Public website (read-only) + ADMIN CMS (Part 10.9). */
@Module({
  controllers: [PublicSiteController, ...CMS_ADMIN_CONTROLLERS],
  providers: [PageSizeService, CmsService, PublicSiteService],
})
export class CmsModule {}
