import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

import { AuthResponseDto } from './auth-response.dto.js';

/** Body of /auth/mobile/refresh and /auth/mobile/logout. */
export class MobileRefreshTokenDto {
  @ApiProperty({
    format: 'password',
    description:
      'Refresh token from the last mobile login/refresh — never logged',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  refreshToken!: string;
}

/**
 * Mobile login / refresh / change-password: same body as the web, plus the
 * refresh token, which a native client keeps in the OS keystore (there is no
 * cookie). Browsers never receive this shape (Origin refused).
 */
export class MobileAuthResponseDto extends AuthResponseDto {
  @ApiProperty({
    format: 'password',
    description:
      'Opaque rotating refresh token — store in the device keystore only; each use returns a new one',
  })
  refreshToken!: string;

  @ApiProperty({
    format: 'date-time',
    description: 'When the refresh session expires (sliding)',
  })
  refreshExpiresAt!: string;
}
