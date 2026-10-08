import { applyDecorators } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { Roles } from '../auth/decorators/roles.decorator.js';
import { Role } from '../generated/prisma/enums.js';

/**
 * Teacher endpoints: TEACHER role (role check) + explicit class assignment
 * (resource check, TeacherAccessService) on every request.
 */
export const TeacherApi = () =>
  applyDecorators(
    Roles(Role.TEACHER),
    ApiBearerAuth(),
    ApiUnauthorizedResponse({ description: 'Missing / invalid access token' }),
    ApiForbiddenResponse({
      description:
        'FORBIDDEN_ROLE, TEACHER_PROFILE_REQUIRED, TEACHER_INACTIVE, TEACHER_CLASS_ACCESS_DENIED, PASSWORD_CHANGE_REQUIRED',
    }),
  );
