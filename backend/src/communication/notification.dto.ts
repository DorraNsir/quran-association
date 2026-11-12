import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

import { PaginationMetaDto, PaginationQueryDto } from '../common/pagination.js';
import {
  NotificationEntity,
  NotificationType,
} from '../generated/prisma/enums.js';

export class NotificationListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  unreadOnly?: boolean;
}

export class NotificationDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: NotificationType, enumName: 'NotificationType' })
  type!: NotificationType;
  @ApiProperty({ example: 'إعلان جديد' }) title!: string;
  @ApiProperty() message!: string;
  @ApiProperty({
    enum: NotificationEntity,
    enumName: 'NotificationEntity',
    nullable: true,
    description:
      'The frontend picks the route of its current workspace; opening it is authorized again (a notification grants no access). Null only for a notification about nothing to open (none yet).',
  })
  entityType!: NotificationEntity | null;
  @ApiProperty({ type: String, nullable: true }) entityId!: string | null;
  @ApiProperty({
    description:
      'False once its content was deleted: the notification stays in the history but opens nothing',
  })
  available!: boolean;
  @ApiProperty() createdAt!: Date;
  @ApiPropertyOptional({ type: Date, nullable: true }) readAt!: Date | null;
  @ApiProperty({ description: 'readAt !== null' }) isRead!: boolean;
}

export class NotificationListDto {
  @ApiProperty({ type: NotificationDto, isArray: true })
  data!: NotificationDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta!: PaginationMetaDto;
}

export class UnreadCountDto {
  @ApiProperty() count!: number;
}

export class ReadAllResultDto {
  @ApiProperty({ description: 'Notifications newly marked as read' })
  updated!: number;
}
