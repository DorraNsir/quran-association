import { applyDecorators } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { Roles } from '../auth/decorators/roles.decorator.js';
import { Role } from '../generated/prisma/enums.js';

/**
 * Every academic-structure route is ADMIN-only (role authorization). Teacher
 * workspace APIs (later) will instead check explicit GroupClass assignments
 * (supervisor / assistant) — holding TEACHER never grants access to all classes.
 */
export const AdminApi = () =>
  applyDecorators(
    Roles(Role.ADMIN),
    ApiBearerAuth(),
    ApiUnauthorizedResponse({ description: 'Missing / invalid access token' }),
    ApiForbiddenResponse({
      description:
        'FORBIDDEN_ROLE (ADMIN required) or PASSWORD_CHANGE_REQUIRED',
    }),
  );
