import { Injectable } from '@nestjs/common';

import { conflict, isUniqueViolation, notFound } from '../../common/errors.js';
import { paginationMeta } from '../../common/pagination.js';
import {
  ActivationStatus,
  type Prisma,
} from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { PageSizeService } from '../../common/page-size.service.js';
import type {
  BranchDto,
  BranchListDto,
  BranchListQueryDto,
  CreateBranchDto,
  UpdateBranchDto,
} from './branch.dto.js';

const select = {
  id: true,
  name: true,
  address: true,
  phone: true,
  status: true,
  _count: {
    select: {
      rooms: true,
      groupClasses: { where: { status: 'ACTIVE' } },
    },
  },
  rooms: { where: { status: 'ACTIVE' }, select: { id: true } },
} satisfies Prisma.BranchSelect;

function toDto(
  b: Prisma.BranchGetPayload<{ select: typeof select }>,
): BranchDto {
  return {
    id: b.id,
    name: b.name,
    address: b.address,
    phone: b.phone,
    status: b.status,
    roomsCount: b._count.rooms,
    activeRoomsCount: b.rooms.length,
    activeClassesCount: b._count.groupClasses,
  };
}

export const branchNotFound = () =>
  notFound('BRANCH_NOT_FOUND', 'الفرع غير موجود');
const nameTaken = () => conflict('BRANCH_NAME_TAKEN', 'يوجد فرع بهذا الاسم');

/** Branches are never deleted (rooms, classes and history reference them): they are deactivated. */
@Injectable()
export class BranchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pageSizes: PageSizeService,
  ) {}

  async list(query: BranchListQueryDto): Promise<BranchListDto> {
    const pageSize = await this.pageSizes.resolve(query.pageSize);
    const where: Prisma.BranchWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { address: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.branch.count({ where }),
      this.prisma.branch.findMany({
        where,
        select,
        orderBy: [{ name: 'asc' }],
        skip: (query.page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return {
      data: rows.map(toDto),
      meta: paginationMeta(query.page, pageSize, total),
    };
  }

  async get(id: string): Promise<BranchDto> {
    const branch = await this.prisma.branch.findUnique({
      where: { id },
      select,
    });
    if (!branch) throw branchNotFound();
    return toDto(branch);
  }

  async create(dto: CreateBranchDto): Promise<BranchDto> {
    try {
      const { id } = await this.prisma.branch.create({
        data: {
          name: dto.name,
          address: dto.address,
          phone: dto.phone ?? null,
        },
        select: { id: true },
      });
      return this.get(id);
    } catch (error) {
      if (isUniqueViolation(error)) throw nameTaken();
      throw error;
    }
  }

  async update(id: string, dto: UpdateBranchDto): Promise<BranchDto> {
    await this.get(id);
    try {
      await this.prisma.branch.update({
        where: { id },
        data: { name: dto.name, address: dto.address, phone: dto.phone },
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw nameTaken();
      throw error;
    }
    return this.get(id);
  }

  /**
   * Deactivating keeps rooms and classes untouched (like the admin UI: the
   * classes are then moved to another branch); no new class/room can be
   * opened in an inactive branch.
   */
  async setStatus(id: string, status: ActivationStatus): Promise<BranchDto> {
    await this.get(id);
    await this.prisma.branch.update({ where: { id }, data: { status } });
    return this.get(id);
  }
}
