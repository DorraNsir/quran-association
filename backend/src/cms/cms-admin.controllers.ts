import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  type Type,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiCreatedResponse,
  ApiExtraModels,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';

import { AdminApi } from '../academic/admin-api.decorator.js';
import type { AuthPrincipal } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { CmsListQueryDto, CmsPageMetaDto, ReorderDto } from './cms.dto.js';
import { CmsService } from './cms.service.js';
import { COLLECTIONS, type CollectionConfig } from './collections.js';

const WRITE_ERRORS =
  'Validation, CMS_UNSAFE_URL, CMS_MEDIA_UNAVAILABLE (uploads need the file storage of Part 10.10), CMS_INVALID_DATE, CMS_INVALID_PUBLICATION_DATE, CMS_CTA_INCOMPLETE, CMS_REFERENCE_INVALID, CMS_GRADUATE_CONSENT_REQUIRED, CMS_GUARDIAN_CONSENT_REQUIRED (as applicable)';

/** Same options as the global pipe, for a body whose class is chosen per collection. */
const bodyPipe = (expectedType: Type) =>
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    expectedType,
  });

/**
 * One ADMIN-only controller per collection under /api/admin/cms/<slug>,
 * generated from its CollectionConfig (same routes, codes and rules for
 * every content type; its own DTOs for validation and Swagger).
 */
function cmsAdminControllers(cfg: CollectionConfig): Type[] {
  @ApiTags(`admin / cms / ${cfg.slug}`)
  @ApiExtraModels(cfg.outputDto, CmsPageMetaDto)
  @AdminApi()
  @Controller(`admin/cms/${cfg.slug}`)
  class CmsAdminController {
    constructor(@Inject(CmsService) private readonly cms: CmsService) {}

    @Get()
    @ApiOperation({
      summary: `${cfg.label} — all items, hidden ones included (search, visible filter, pagination)`,
    })
    @ApiOkResponse({
      schema: {
        properties: {
          data: {
            type: 'array',
            items: { $ref: getSchemaPath(cfg.outputDto) },
          },
          meta: { $ref: getSchemaPath(CmsPageMetaDto) },
        },
      },
    })
    list(@Query() query: CmsListQueryDto) {
      return this.cms.list(cfg, query);
    }

    @Get(':id')
    @ApiOkResponse({ type: cfg.outputDto })
    @ApiNotFoundResponse({ description: 'CMS_CONTENT_NOT_FOUND' })
    get(@Param('id', ParseUUIDPipe) id: string) {
      return this.cms.get(cfg, id);
    }

    @Post()
    @ApiOperation({
      summary: `Create (${cfg.ordered ? 'appended last in the display order' : 'dated content'})`,
    })
    @ApiBody({ type: cfg.inputDto })
    @ApiCreatedResponse({ type: cfg.outputDto })
    @ApiBadRequestResponse({ description: WRITE_ERRORS })
    create(
      @Body(bodyPipe(cfg.inputDto)) dto: object,
      @CurrentUser() user: AuthPrincipal,
    ) {
      return this.cms.create(cfg, dto, user.userId);
    }

    @Patch(':id')
    @ApiOperation({
      summary: `Edit — including visibility (${cfg.visibility}); null clears an optional field`,
    })
    @ApiBody({ type: cfg.updateDto })
    @ApiOkResponse({ type: cfg.outputDto })
    @ApiBadRequestResponse({ description: WRITE_ERRORS })
    @ApiNotFoundResponse({ description: 'CMS_CONTENT_NOT_FOUND' })
    update(
      @Param('id', ParseUUIDPipe) id: string,
      @Body(bodyPipe(cfg.updateDto)) dto: object,
      @CurrentUser() user: AuthPrincipal,
    ) {
      return this.cms.update(cfg, id, dto, user.userId);
    }

    @Delete(':id')
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({
      summary: `Delete permanently (to only hide it: PATCH ${cfg.visibility}=false)`,
    })
    @ApiNoContentResponse()
    @ApiNotFoundResponse({ description: 'CMS_CONTENT_NOT_FOUND' })
    remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
      return this.cms.remove(cfg, id);
    }
  }

  @ApiTags(`admin / cms / ${cfg.slug}`)
  @AdminApi()
  @Controller(`admin/cms/${cfg.slug}`)
  class CmsOrderController {
    constructor(@Inject(CmsService) private readonly cms: CmsService) {}

    @Put('order')
    @ApiOperation({
      summary: 'Set the display order (every item, once, in the new order)',
    })
    @ApiOkResponse({
      description: 'The collection in its new order (first 100)',
    })
    @ApiBadRequestResponse({ description: 'Validation, CMS_INVALID_ORDER' })
    reorder(@Body() dto: ReorderDto) {
      return this.cms.reorder(cfg, dto);
    }
  }

  const name = cfg.model.charAt(0).toUpperCase() + cfg.model.slice(1);
  Object.defineProperty(CmsAdminController, 'name', {
    value: `${name}CmsController`,
  });
  Object.defineProperty(CmsOrderController, 'name', {
    value: `${name}CmsOrderController`,
  });
  // Only ordered collections get PUT /order (no route clash: the main controller has no PUT)
  return cfg.ordered
    ? [CmsAdminController, CmsOrderController]
    : [CmsAdminController];
}

/** Every generated CMS admin controller. */
export const CMS_ADMIN_CONTROLLERS: Type[] =
  COLLECTIONS.flatMap(cmsAdminControllers);
