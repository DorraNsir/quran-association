import {
  BadRequestException,
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';

import type { AuthPrincipal } from '../auth/auth.types.js';
import { FilePurpose, Role } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { TeacherAccessService } from '../teaching/teacher-access.service.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Upload authorization, decided from ?purpose= (and ?groupClassId=) BEFORE
 * the multipart body is accepted — an unauthorized upload is refused
 * without storing a byte. Never a generic "authenticated may upload":
 *  - ASSOCIATION_LOGO, CMS_IMAGE, PROFILE_PHOTO: ADMIN only;
 *  - EDUCATIONAL_RESOURCE: ADMIN, or a TEACHER for a class (groupClassId)
 *    they are CURRENTLY assigned to.
 */
@Injectable()
export class UploadPermissionGuard implements CanActivate {
  constructor(
    private readonly teacherAccess: TeacherAccessService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthPrincipal }>();
    const user = req.user!;
    // Unknown parameters are refused HERE (before any byte is stored)
    const unknown = Object.keys(req.query).filter(
      (key) => key !== 'purpose' && key !== 'groupClassId',
    );
    if (unknown.length) {
      throw new BadRequestException({
        code: 'FILE_QUERY_INVALID',
        message: `معامل غير مقبول: ${unknown.join(', ')}`,
      });
    }
    const purpose = req.query.purpose;
    const groupClassId = req.query.groupClassId;
    if (typeof purpose !== 'string' || !(purpose in FilePurpose)) {
      throw new BadRequestException({
        code: 'FILE_PURPOSE_INVALID',
        message: `استعمال غير معروف (purpose): ${Object.keys(FilePurpose).join(', ')}`,
      });
    }
    if (
      groupClassId !== undefined &&
      (typeof groupClassId !== 'string' || !UUID.test(groupClassId))
    ) {
      throw new BadRequestException({
        code: 'FILE_CLASS_INVALID',
        message: 'معرّف القسم غير صالح',
      });
    }
    const isAdmin = user.roles.includes(Role.ADMIN);
    if (purpose !== FilePurpose.EDUCATIONAL_RESOURCE) {
      if (!isAdmin) throw forbidden();
      return true;
    }
    if (isAdmin) {
      if (
        groupClassId &&
        !(await this.prisma.groupClass.findUnique({
          where: { id: groupClassId },
          select: { id: true },
        }))
      )
        throw new BadRequestException({
          code: 'FILE_CLASS_INVALID',
          message: 'القسم غير موجود',
        });
      return true;
    }
    if (!user.roles.includes(Role.TEACHER)) throw forbidden();
    if (!groupClassId) {
      throw new BadRequestException({
        code: 'FILE_CLASS_REQUIRED',
        message: 'حدّد القسم الذي يُرفع له المورد (groupClassId)',
      });
    }
    const scope = await this.teacherAccess.currentScope(user.userId);
    if (!scope.classIds.includes(groupClassId)) {
      throw new ForbiddenException({
        code: 'FILE_CLASS_ACCESS_DENIED',
        message: 'لا يمكنك رفع ملف إلا لأقسامك الحالية',
      });
    }
    return true;
  }
}

const forbidden = () =>
  new ForbiddenException({
    code: 'FILE_PURPOSE_FORBIDDEN',
    message: 'لا تملك صلاحية رفع ملف لهذا الاستعمال',
  });
