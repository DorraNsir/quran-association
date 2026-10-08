import { ForbiddenException, Injectable } from '@nestjs/common';

import { RecordStatus, type Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

type Db = Prisma.TransactionClient | PrismaService;

/** The authenticated student's CURRENT class (null when not placed in a class). */
export interface StudentScope {
  studentId: string;
  groupClassId: string | null;
  groupId: string | null;
  branchId: string | null;
}

/**
 * Student authorization: the Student profile comes from the authenticated
 * account (User → Person → Student). Access to private class content follows
 * the CURRENT class only — enrollment history grants nothing here.
 */
@Injectable()
export class StudentAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async scopeOf(userId: string, db: Db = this.prisma): Promise<StudentScope> {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        person: {
          select: {
            student: {
              select: {
                id: true,
                status: true,
                groupClass: {
                  select: { id: true, groupId: true, branchId: true },
                },
              },
            },
          },
        },
      },
    });
    const student = user?.person.student;
    if (!student)
      throw new ForbiddenException({
        code: 'STUDENT_PROFILE_REQUIRED',
        message: 'لا يوجد ملف طالب مرتبط بهذا الحساب',
      });
    if (student.status !== RecordStatus.ACTIVE)
      throw new ForbiddenException({
        code: 'STUDENT_INACTIVE',
        message: 'ملف الطالب غير نشط',
      });
    return {
      studentId: student.id,
      groupClassId: student.groupClass?.id ?? null,
      groupId: student.groupClass?.groupId ?? null,
      branchId: student.groupClass?.branchId ?? null,
    };
  }
}
