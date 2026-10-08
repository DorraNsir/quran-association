import { ForbiddenException, Injectable } from '@nestjs/common';

import { badRequest, notFound } from '../common/errors.js';
import { PageSizeService } from '../common/page-size.service.js';
import { paginationMeta } from '../common/pagination.js';
import {
  ActivationStatus,
  type Prisma,
  RecordStatus,
  ResourceType,
  ResourceVisibility,
} from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StudentAccessService } from '../student-space/student-access.service.js';
import { TeacherAccessService } from '../teaching/teacher-access.service.js';
import { studentResourceWhere, teacherResourceWhere } from './audience.js';
import { NotificationsService } from './notifications.service.js';
import type {
  AdminResourceDto,
  ResourceDto,
  ResourceListDto,
  ResourceListQueryDto,
  TeacherResourceDto,
  UpdateAdminResourceDto,
  UpdateTeacherResourceDto,
} from './resource.dto.js';

type Tx = Prisma.TransactionClient;

const nameOf = { select: { id: true, name: true } } as const;

const select = {
  id: true,
  title: true,
  description: true,
  type: true,
  externalUrl: true,
  fileName: true,
  mimeType: true,
  fileSize: true,
  visibility: true,
  publishedByUserId: true,
  publishedBy: {
    select: {
      id: true,
      person: { select: { firstName: true, lastName: true } },
    },
  },
  targets: {
    select: {
      group: nameOf,
      groupClass: { select: { id: true, group: nameOf, branch: nameOf } },
    },
  },
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ResourceSelect;

type Row = Prisma.ResourceGetPayload<{ select: typeof select }>;

function toDto(r: Row, canManage: boolean): ResourceDto {
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    type: r.type,
    externalUrl: r.externalUrl,
    // Metadata only: the stored file URL is never returned (no storage yet)
    file: r.fileName
      ? { fileName: r.fileName, mimeType: r.mimeType, fileSize: r.fileSize }
      : null,
    visibility: r.visibility,
    groups: r.targets.flatMap((t) => (t.group ? [t.group] : [])),
    groupClasses: r.targets.flatMap((t) =>
      t.groupClass ? [t.groupClass] : [],
    ),
    publishedBy: { id: r.publishedBy.id, ...r.publishedBy.person },
    canManage,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

const LINK_TYPES: ResourceType[] = [
  ResourceType.VIDEO_LINK,
  ResourceType.EXTERNAL_LINK,
];

export const resourceNotFound = () =>
  notFound('RESOURCE_NOT_FOUND', 'المورد غير موجود');
const targetInvalid = (message: string) =>
  badRequest('RESOURCE_TARGET_INVALID', message);
const classAccessDenied = () =>
  new ForbiddenException({
    code: 'RESOURCE_CLASS_ACCESS_DENIED',
    message: 'لا يمكنك النشر إلا لحلقاتك الحالية',
  });

type Targets = {
  visibility: ResourceVisibility;
  groupIds: string[];
  groupClassIds: string[];
};

/**
 * Educational resources (الموارد التعليمية): private content for students,
 * published by an admin (any audience) or by a teacher (only toward the
 * classes they are CURRENTLY assigned to). Published on creation — there is
 * no draft state in the model — and the reached student accounts are
 * notified in the same transaction. One resource row whatever the number of
 * teachers of the class (no duplication). Links only for now: file types
 * need the storage of Part 10.10.
 */
@Injectable()
export class ResourcesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pageSizes: PageSizeService,
    private readonly notifications: NotificationsService,
    private readonly teacherAccess: TeacherAccessService,
    private readonly studentAccess: StudentAccessService,
  ) {}

  /* ------------------------------ reads ------------------------------ */

  listForAdmin(query: ResourceListQueryDto, userId: string) {
    return this.list(query, {}, userId, () => true);
  }

  async listForTeacher(query: ResourceListQueryDto, userId: string) {
    const scope = await this.teacherAccess.currentScope(userId);
    return this.list(
      query,
      teacherResourceWhere(scope, userId),
      userId,
      (r) => r.publishedByUserId === userId,
    );
  }

  async listForStudent(query: ResourceListQueryDto, userId: string) {
    const scope = await this.studentAccess.scopeOf(userId);
    return this.list(query, studentResourceWhere(scope), userId, () => false);
  }

  async getForAdmin(id: string): Promise<ResourceDto> {
    return toDto(await this.find({ id }), true);
  }

  async getForTeacher(id: string, userId: string): Promise<ResourceDto> {
    const scope = await this.teacherAccess.currentScope(userId);
    const row = await this.find({
      id,
      ...teacherResourceWhere(scope, userId),
    });
    return toDto(row, row.publishedByUserId === userId);
  }

  async getForStudent(id: string, userId: string): Promise<ResourceDto> {
    const scope = await this.studentAccess.scopeOf(userId);
    return toDto(
      await this.find({ id, ...studentResourceWhere(scope) }),
      false,
    );
  }

  /* ------------------------------ writes ------------------------------ */

  async createAsAdmin(
    dto: AdminResourceDto,
    userId: string,
  ): Promise<ResourceDto> {
    const targets = this.targetsOf(
      dto.visibility,
      dto.groupIds,
      dto.groupClassIds,
    );
    return this.create(dto, targets, userId);
  }

  async createAsTeacher(
    dto: TeacherResourceDto,
    userId: string,
  ): Promise<ResourceDto> {
    const scope = await this.teacherAccess.currentScope(userId);
    if (!dto.groupClassIds.every((id) => scope.classIds.includes(id)))
      throw classAccessDenied();
    return this.create(
      dto,
      {
        visibility: ResourceVisibility.GROUP_CLASS,
        groupIds: [],
        groupClassIds: dto.groupClassIds,
      },
      userId,
    );
  }

  async updateAsAdmin(
    id: string,
    dto: UpdateAdminResourceDto,
  ): Promise<ResourceDto> {
    const current = await this.find({ id });
    const visibility = dto.visibility ?? current.visibility;
    const retarget =
      dto.visibility !== undefined ||
      dto.groupIds !== undefined ||
      dto.groupClassIds !== undefined;
    const keep = visibility === current.visibility;
    const targets = retarget
      ? this.targetsOf(
          visibility,
          dto.groupIds ??
            (keep ? current.targets.flatMap((t) => t.group?.id ?? []) : []),
          dto.groupClassIds ??
            (keep
              ? current.targets.flatMap((t) => t.groupClass?.id ?? [])
              : []),
        )
      : undefined;
    await this.update(current, dto, targets);
    return this.getForAdmin(id);
  }

  async updateAsTeacher(
    id: string,
    dto: UpdateTeacherResourceDto,
    userId: string,
  ): Promise<ResourceDto> {
    const scope = await this.teacherAccess.currentScope(userId);
    const current = await this.ownedByTeacher(id, userId, scope);
    const classIds =
      dto.groupClassIds ??
      current.targets.flatMap((t) => t.groupClass?.id ?? []);
    // Editing requires a CURRENT assignment to every class it will reach
    if (!classIds.every((c) => scope.classIds.includes(c)))
      throw classAccessDenied();
    await this.update(
      current,
      dto,
      dto.groupClassIds
        ? {
            visibility: ResourceVisibility.GROUP_CLASS,
            groupIds: [],
            groupClassIds: dto.groupClassIds,
          }
        : undefined,
    );
    return this.getForTeacher(id, userId);
  }

  /** Hard delete: targets and the notifications pointing to it go too (no dangling links). */
  async removeAsAdmin(id: string): Promise<void> {
    await this.find({ id });
    await this.prisma.resource.delete({ where: { id } });
  }

  /** A teacher deletes only what they published (even after leaving the class). */
  async removeAsTeacher(id: string, userId: string): Promise<void> {
    const scope = await this.teacherAccess.currentScope(userId);
    await this.ownedByTeacher(id, userId, scope);
    await this.prisma.resource.delete({ where: { id } });
  }

  /* ------------------------------ helpers ------------------------------ */

  private async list(
    query: ResourceListQueryDto,
    base: Prisma.ResourceWhereInput,
    userId: string,
    canManage: (r: Row) => boolean,
  ): Promise<ResourceListDto> {
    const pageSize = await this.pageSizes.resolve(query.pageSize);
    const where: Prisma.ResourceWhereInput = {
      AND: [
        base,
        {
          ...(query.type ? { type: query.type } : {}),
          ...(query.visibility ? { visibility: query.visibility } : {}),
          ...(query.mine ? { publishedByUserId: userId } : {}),
          ...(query.groupClassId
            ? { targets: { some: { groupClassId: query.groupClassId } } }
            : {}),
        },
        query.groupId ? { targets: { some: { groupId: query.groupId } } } : {},
        query.search
          ? {
              OR: [
                { title: { contains: query.search, mode: 'insensitive' } },
                {
                  description: {
                    contains: query.search,
                    mode: 'insensitive',
                  },
                },
              ],
            }
          : {},
      ],
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.resource.count({ where }),
      this.prisma.resource.findMany({
        where,
        select,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return {
      data: rows.map((r) => toDto(r, canManage(r))),
      meta: paginationMeta(query.page, pageSize, total),
    };
  }

  /** Missing and not-visible resources look the same (no existence leak). */
  private async find(where: Prisma.ResourceWhereInput): Promise<Row> {
    const row = await this.prisma.resource.findFirst({ where, select });
    if (!row) throw resourceNotFound();
    return row;
  }

  private async ownedByTeacher(
    id: string,
    userId: string,
    scope: Awaited<ReturnType<TeacherAccessService['currentScope']>>,
  ) {
    const row = await this.find({ id, ...teacherResourceWhere(scope, userId) });
    if (row.publishedByUserId !== userId)
      throw new ForbiddenException({
        code: 'RESOURCE_EDIT_FORBIDDEN',
        message: 'لا يمكنك تعديل مورد نشره شخص آخر',
      });
    return row;
  }

  private targetsOf(
    visibility: ResourceVisibility,
    groupIds: string[] = [],
    groupClassIds: string[] = [],
  ): Targets {
    if (visibility === ResourceVisibility.ALL_STUDENTS) {
      if (groupIds.length || groupClassIds.length)
        throw targetInvalid('المورد الموجّه لكل الطلبة لا يحدَّد له هدف');
    } else if (visibility === ResourceVisibility.GROUP) {
      if (!groupIds.length || groupClassIds.length)
        throw targetInvalid('اختر مجموعة واحدة على الأقل (groupIds فقط)');
    } else if (!groupClassIds.length || groupIds.length) {
      throw targetInvalid('اختر حلقة واحدة على الأقل (groupClassIds فقط)');
    }
    return { visibility, groupIds, groupClassIds };
  }

  /** Links only (until file storage); http(s) URL required. */
  private assertContent(type: ResourceType, externalUrl: string | null) {
    if (!LINK_TYPES.includes(type)) {
      throw badRequest(
        'RESOURCE_FILE_UPLOAD_UNAVAILABLE',
        'رفع الملفات غير متاح بعد — استعمل رابطًا (VIDEO_LINK أو EXTERNAL_LINK)',
      );
    }
    if (!externalUrl)
      throw badRequest('RESOURCE_URL_REQUIRED', 'الرابط مطلوب لهذا النوع');
  }

  /** Targets exist and are active (a new audience never points to closed groups/classes). */
  private async assertTargets(tx: Tx, t: Targets) {
    if (t.groupIds.length) {
      const n = await tx.group.count({
        where: { id: { in: t.groupIds }, status: RecordStatus.ACTIVE },
      });
      if (n !== t.groupIds.length)
        throw targetInvalid('مجموعة غير موجودة أو غير نشطة');
    }
    if (t.groupClassIds.length) {
      const n = await tx.groupClass.count({
        where: {
          id: { in: t.groupClassIds },
          status: RecordStatus.ACTIVE,
          branch: { status: ActivationStatus.ACTIVE },
        },
      });
      if (n !== t.groupClassIds.length)
        throw targetInvalid('حلقة غير موجودة أو غير نشطة');
    }
  }

  private targetRows(t: Targets) {
    return [
      ...t.groupIds.map((groupId) => ({ groupId })),
      ...t.groupClassIds.map((groupClassId) => ({ groupClassId })),
    ];
  }

  /** Resource + targets + notifications, atomically. */
  private async create(
    dto: TeacherResourceDto | AdminResourceDto,
    targets: Targets,
    userId: string,
  ): Promise<ResourceDto> {
    this.assertContent(dto.type, dto.externalUrl ?? null);
    const id = await this.prisma.$transaction(async (tx) => {
      await this.assertTargets(tx, targets);
      const created = await tx.resource.create({
        data: {
          title: dto.title,
          description: dto.description ?? '',
          type: dto.type,
          externalUrl: dto.externalUrl,
          visibility: targets.visibility,
          publishedByUserId: userId,
          targets: { create: this.targetRows(targets) },
        },
        select: { id: true },
      });
      await this.notifications.notifyResource(tx, created.id, dto.title);
      return created.id;
    });
    return toDto(await this.find({ id }), true);
  }

  /** Edits never notify again (and never duplicate the resource). */
  private async update(
    current: Row,
    dto: UpdateTeacherResourceDto | UpdateAdminResourceDto,
    targets: Targets | undefined,
  ) {
    const type = dto.type ?? current.type;
    const externalUrl =
      dto.externalUrl !== undefined ? dto.externalUrl : current.externalUrl;
    if (dto.type !== undefined || dto.externalUrl !== undefined)
      this.assertContent(type, externalUrl);
    await this.prisma.$transaction(async (tx) => {
      if (targets) {
        await this.assertTargets(tx, targets);
        await tx.resourceTarget.deleteMany({
          where: { resourceId: current.id },
        });
      }
      await tx.resource.update({
        where: { id: current.id },
        data: {
          title: dto.title,
          description: dto.description,
          type: dto.type,
          externalUrl: dto.externalUrl,
          ...(targets
            ? {
                visibility: targets.visibility,
                targets: { create: this.targetRows(targets) },
              }
            : {}),
        },
      });
    });
  }
}
