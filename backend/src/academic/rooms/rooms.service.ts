import { Injectable } from '@nestjs/common';

import { conflict, isUniqueViolation, notFound } from '../../common/errors.js';
import { PageSizeService } from '../../common/page-size.service.js';
import { paginationMeta } from '../../common/pagination.js';
import {
  ActivationStatus,
  type Prisma,
} from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { branchNotFound } from '../branches/branches.service.js';
import type {
  CreateRoomDto,
  RoomDto,
  RoomListDto,
  RoomListQueryDto,
  UpdateRoomDto,
} from './room.dto.js';

const select = {
  id: true,
  name: true,
  status: true,
  branch: { select: { id: true, name: true, status: true } },
  _count: { select: { groupClasses: { where: { status: 'ACTIVE' } } } },
} satisfies Prisma.RoomSelect;

const toDto = (
  r: Prisma.RoomGetPayload<{ select: typeof select }>,
): RoomDto => ({
  id: r.id,
  name: r.name,
  status: r.status,
  branch: r.branch,
  activeClassesCount: r._count.groupClasses,
});

export const roomNotFound = () =>
  notFound('ROOM_NOT_FOUND', 'القاعة غير موجودة');
const nameTaken = () =>
  conflict('ROOM_NAME_TAKEN', 'توجد قاعة بهذا الاسم في هذا الفرع');
const branchInactive = () =>
  conflict('BRANCH_INACTIVE', 'الفرع غير مفعّل: لا يمكن فتح أو تفعيل قاعة فيه');

/** Rooms belong to exactly one branch (no copy of branch data). Deactivated, never deleted. */
@Injectable()
export class RoomsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pageSizes: PageSizeService,
  ) {}

  async list(query: RoomListQueryDto): Promise<RoomListDto> {
    const pageSize = await this.pageSizes.resolve(query.pageSize);
    const where: Prisma.RoomWhereInput = {
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? { name: { contains: query.search, mode: 'insensitive' } }
        : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.room.count({ where }),
      this.prisma.room.findMany({
        where,
        select,
        orderBy: [{ branch: { name: 'asc' } }, { name: 'asc' }],
        skip: (query.page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return {
      data: rows.map(toDto),
      meta: paginationMeta(query.page, pageSize, total),
    };
  }

  async get(id: string): Promise<RoomDto> {
    const room = await this.prisma.room.findUnique({ where: { id }, select });
    if (!room) throw roomNotFound();
    return toDto(room);
  }

  async create(dto: CreateRoomDto): Promise<RoomDto> {
    const branch = await this.prisma.branch.findUnique({
      where: { id: dto.branchId },
      select: { status: true },
    });
    if (!branch) throw branchNotFound();
    if (branch.status !== ActivationStatus.ACTIVE) throw branchInactive();
    try {
      const { id } = await this.prisma.room.create({
        data: { branchId: dto.branchId, name: dto.name },
        select: { id: true },
      });
      return this.get(id);
    } catch (error) {
      if (isUniqueViolation(error)) throw nameTaken();
      throw error;
    }
  }

  async update(id: string, dto: UpdateRoomDto): Promise<RoomDto> {
    await this.get(id);
    try {
      await this.prisma.room.update({
        where: { id },
        data: { name: dto.name },
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw nameTaken();
      throw error;
    }
    return this.get(id);
  }

  /** A room can only be (re)activated inside an active branch. */
  async setStatus(id: string, status: ActivationStatus): Promise<RoomDto> {
    const room = await this.get(id);
    if (
      status === ActivationStatus.ACTIVE &&
      room.branch.status !== ActivationStatus.ACTIVE
    )
      throw branchInactive();
    await this.prisma.room.update({ where: { id }, data: { status } });
    return this.get(id);
  }
}
