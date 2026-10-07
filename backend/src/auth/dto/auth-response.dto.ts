import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { Role } from '../../generated/prisma/enums.js';

/** Display identity for the header / user menu (canonical Person data). */
export class MePersonDto {
  @ApiProperty() id!: string;
  @ApiProperty() firstName!: string;
  @ApiProperty() lastName!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) photoUrl!:
    string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) email!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) phone!: string | null;
}

/** GET /api/auth/me — never contains hashes or secrets. */
export class MeDto {
  @ApiProperty() id!: string;
  @ApiProperty() username!: string;
  @ApiProperty({ type: MePersonDto }) person!: MePersonDto;
  @ApiProperty({ enum: Role, isArray: true, enumName: 'Role' }) roles!: Role[];
  @ApiProperty({
    description: 'True → the client must show the change-password screen first',
  })
  mustChangePassword!: boolean;
  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: 'Teacher profile (Teacher workspace)',
  })
  teacherId!: string | null;
  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: 'Student profile (Student workspace)',
  })
  studentId!: string | null;
}

/** Login / refresh / change-password: access token in the body, refresh token only in the HttpOnly cookie. */
export class AuthResponseDto {
  @ApiProperty({
    description:
      'Short-lived JWT — send as "Authorization: Bearer <token>"; keep in memory only',
  })
  accessToken!: string;
  @ApiProperty({ description: 'Access-token lifetime in seconds' })
  expiresIn!: number;
  @ApiProperty({ type: MeDto }) user!: MeDto;
}
