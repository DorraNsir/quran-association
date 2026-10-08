import { Injectable } from '@nestjs/common';

import { conflict, isUniqueViolation, notFound } from '../../common/errors.js';
import { PageSizeService } from '../../common/page-size.service.js';
import { paginationMeta } from '../../common/pagination.js';
import { type Prisma, RecordStatus } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type {
  CreateGroupDto,
  GroupDetailDto,
  GroupDto,
  GroupListDto,
  GroupListQueryDto,
  UpdateGroupDto,
} from './group.dto.js';

const select = {
  id: true,
  name: true,
  audience: true,
  status: true,
  createdAt: true,
  _count: { select: { classes: true } },
  classes: { where: { status: 'ACTIVE' }, select: { id: true } },
} satisfies Prisma.GroupSelect;

export const groupNotFound = () =>
  notFound('GROUP_NOT_FOUND', 'المجموعة غير موجودة');
const nameTaken = () => conflict('GROUP_NAME_TAKEN', 'توجد مجموعة بهذا الاسم');

/** Groups are archived/deactivated, never deleted; their classes keep their own status. */
@Injectable()
export class GroupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pageSizes: PageSizeService,
  ) {}

  async list(query: GroupListQueryDto): Promise<GroupListDto> {
    const pageSize = await this.pageSizes.resolve(query.pageSize);
    const where: Prisma.GroupWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { audience: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.group.count({ where }),
      this.prisma.group.findMany({
        where,
        select,
        orderBy: { name: 'asc' },
        skip: (query.page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    const students = await this.activeStudentsByGroup(rows.map((g) => g.id));
    return {
      data: rows.map((g) => this.toDto(g, students.get(g.id) ?? 0)),
      meta: paginationMeta(query.page, pageSize, total),
    };
  }

  async get(id: string): Promise<GroupDetailDto> {
    const group = await this.prisma.group.findUnique({ where: { id }, select });
    if (!group) throw groupNotFound();
    const classes = await this.prisma.groupClass.findMany({
      where: { groupId: id },
      orderBy: [{ status: 'asc' }, { branch: { name: 'asc' } }],
      select: {
        id: true,
        status: true,
        branch: { select: { id: true, name: true } },
        room: { select: { id: true, name: true } },
        supervisor: {
          select: {
            person: { select: { firstName: true, lastName: true } },
            id: true,
          },
        },
        _count: {
          select: {
            assistants: true,
            students: { where: { status: 'ACTIVE' } },
          },
        },
      },
    });
    const activeStudents = classes.reduce(
      (sum, c) => sum + c._count.students,
      0,
    );
    return Object.assign(this.toDto(group, activeStudents), {
      classes: classes.map((c) => ({
        id: c.id,
        status: c.status,
        branch: c.branch,
        room: c.room,
        supervisor: { id: c.supervisor.id, ...c.supervisor.person },
        assistantsCount: c._count.assistants,
        activeStudentsCount: c._count.students,
      })),
    });
  }

  async create(dto: CreateGroupDto): Promise<GroupDetailDto> {
    try {
      const { id } = await this.prisma.group.create({
        data: { name: dto.name, audience: dto.audience },
        select: { id: true },
      });
      return this.get(id);
    } catch (error) {
      if (isUniqueViolation(error)) throw nameTaken();
      throw error;
    }
  }

  async update(id: string, dto: UpdateGroupDto): Promise<GroupDetailDto> {
    await this.get(id);
    try {
      await this.prisma.group.update({
        where: { id },
        data: { name: dto.name, audience: dto.audience },
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw nameTaken();
      throw error;
    }
    return this.get(id);
  }

  /** Like the admin UI: the group's classes are not changed (the admin moves students first). */
  async setStatus(id: string, status: RecordStatus): Promise<GroupDetailDto> {
    await this.get(id);
    await this.prisma.group.update({ where: { id }, data: { status } });
    return this.get(id);
  }

  private toDto(
    g: Prisma.GroupGetPayload<{ select: typeof select }>,
    activeStudentsCount: number,
  ): GroupDto {
    return {
      id: g.id,
      name: g.name,
      audience: g.audience,
      status: g.status,
      createdAt: g.createdAt,
      classesCount: g._count.classes,
      activeClassesCount: g.classes.length,
      activeStudentsCount,
    };
  }

  /** One aggregate query for the whole page (no N+1). */
  private async activeStudentsByGroup(groupIds: string[]) {
    if (groupIds.length === 0) return new Map<string, number>();
    const rows = await this.prisma.$queryRaw<
      { groupId: string; count: bigint }[]
    >`
      SELECT gc."groupId", count(*)::bigint AS count
      FROM students s JOIN group_classes gc ON gc.id = s."groupClassId"
      WHERE s.status = ${RecordStatus.ACTIVE}::"RecordStatus" AND gc."groupId" = ANY(${groupIds}::uuid[])
      GROUP BY gc."groupId"`;
    return new Map(rows.map((r) => [r.groupId, Number(r.count)]));
  }
}
