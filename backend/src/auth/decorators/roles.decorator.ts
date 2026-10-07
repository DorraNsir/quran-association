import { SetMetadata } from '@nestjs/common';

import type { Role } from '../../generated/prisma/enums.js';

export const ROLES_KEY = 'auth:roles';

/**
 * ROLE authorization: the user must hold AT LEAST ONE of these roles
 * (roles are cumulative — ADMIN + TEACHER passes @Roles(ADMIN) and
 * @Roles(TEACHER)).
 *
 * This only answers "is this user a TEACHER?". RESOURCE authorization
 * ("is this teacher assigned to THIS GroupClass?") is a separate check made
 * by the feature services from Part 10.4 on, using GroupClass.supervisorId /
 * GroupClassAssistant. Holding ADMIN never implies a teacher assignment.
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
