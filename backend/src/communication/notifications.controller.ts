import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import type { AuthPrincipal } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import {
  NotificationDto,
  NotificationListDto,
  NotificationListQueryDto,
  ReadAllResultDto,
  UnreadCountDto,
} from './notification.dto.js';
import { NotificationsService } from './notifications.service.js';

/** Any authenticated account (ADMIN, TEACHER, STUDENT) — always its OWN notifications only. */
@ApiTags('notifications')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing / invalid access token' })
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({
    summary: 'My notifications, newest first (unreadOnly filter)',
  })
  @ApiOkResponse({ type: NotificationListDto })
  list(
    @Query() query: NotificationListQueryDto,
    @CurrentUser() user: AuthPrincipal,
  ): Promise<NotificationListDto> {
    return this.notifications.list(user.userId, query);
  }

  @Get('unread-count')
  @ApiOkResponse({ type: UnreadCountDto })
  unreadCount(@CurrentUser() user: AuthPrincipal): Promise<UnreadCountDto> {
    return this.notifications.unreadCount(user.userId);
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Mark all my notifications as read' })
  @ApiOkResponse({ type: ReadAllResultDto })
  readAll(@CurrentUser() user: AuthPrincipal): Promise<ReadAllResultDto> {
    return this.notifications.markAllRead(user.userId);
  }

  @Patch(':id/read')
  @ApiOperation({
    summary: 'Mark one of my notifications as read (idempotent)',
  })
  @ApiOkResponse({ type: NotificationDto })
  @ApiNotFoundResponse({
    description: 'NOTIFICATION_NOT_FOUND (also another user’s notification)',
  })
  read(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthPrincipal,
  ): Promise<NotificationDto> {
    return this.notifications.markRead(user.userId, id);
  }
}
