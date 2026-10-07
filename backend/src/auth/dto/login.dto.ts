import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

import { toNormalizedUsername } from '../../common/username.js';

export class LoginDto {
  /** Case-insensitive: trimmed + lowercased before lookup */
  @ApiProperty({ example: 'admin' })
  @Transform(toNormalizedUsername)
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  username!: string;

  /** Never trimmed or logged */
  @ApiProperty({ format: 'password' })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password!: string;
}
