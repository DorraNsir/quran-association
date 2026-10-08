import { applyDecorators } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { Roles } from '../auth/decorators/roles.decorator.js';
import { Role } from '../generated/prisma/enums.js';

/**
 * Student endpoints: STUDENT role (role check) + the Student profile linked
 * to the authenticated account (StudentAccessService) — never a client-sent id.
 */
export const StudentApi = () =>
  applyDecorators(
    Roles(Role.STUDENT),
    ApiBearerAuth(),
    ApiUnauthorizedResponse({ description: 'Missing / invalid access token' }),
    ApiForbiddenResponse({
      description:
        'FORBIDDEN_ROLE, STUDENT_PROFILE_REQUIRED, STUDENT_INACTIVE, PASSWORD_CHANGE_REQUIRED',
    }),
  );
