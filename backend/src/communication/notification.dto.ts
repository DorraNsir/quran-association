import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

import { PaginationMetaDto, PaginationQueryDto } from '../common/pagination.js';
import { NotificationType } from '../generated/prisma/enums.js';

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
    enum: ['RESOURCE', 'ANNOUNCEMENT'],
    description:
      'The frontend picks the route of its current workspace; opening it is authorized again (a notification grants no access)',
  })
  entityType!: 'RESOURCE' | 'ANNOUNCEMENT';
  @ApiProperty() entityId!: string;
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
