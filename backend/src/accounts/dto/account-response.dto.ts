import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { PaginationMetaDto } from '../../common/pagination.js';
import { Gender, Role } from '../../generated/prisma/enums.js';

export class AccountPersonDto {
  @ApiProperty() id!: string;
  @ApiProperty() firstName!: string;
  @ApiProperty() lastName!: string;
  @ApiPropertyOptional({ enum: Gender, enumName: 'Gender', nullable: true })
  gender!: Gender | null;
  @ApiPropertyOptional({ type: String, nullable: true }) photoUrl!:
    string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) phone!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) email!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) address!:
    string | null;
}

/** Account as seen by an admin — never hashes or session secrets. */
export class AccountDto {
  @ApiProperty() id!: string;
  @ApiProperty() username!: string;
  @ApiProperty() isActive!: boolean;
  @ApiProperty({ enum: Role, enumName: 'Role', isArray: true }) roles!: Role[];
  @ApiProperty() mustChangePassword!: boolean;
  @ApiPropertyOptional({ type: Date, nullable: true })
  lastLoginAt!: Date | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
  @ApiProperty({ type: AccountPersonDto }) person!: AccountPersonDto;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Linked Teacher domain profile',
  })
  teacherId!: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Linked Student domain profile',
  })
  studentId!: string | null;
}

export class AccountDetailDto extends AccountDto {
  @ApiProperty({
    description: 'Live (not revoked, not expired) sign-in sessions',
  })
  activeSessions!: number;
}

export class AccountListDto {
  @ApiProperty({ type: AccountDto, isArray: true }) data!: AccountDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta!: PaginationMetaDto;
}
