import { Injectable } from '@nestjs/common';

import { fromDbDate, toDbDate } from '../common/dates.js';
import { badRequest, notFound } from '../common/errors.js';
import { PageSizeService } from '../common/page-size.service.js';
import { paginationMeta } from '../common/pagination.js';
import { platformToday } from '../common/platform-clock.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { fromDbTime, toDbTime } from '../scheduling/time.js';
import type { CmsListQueryDto, ReorderDto } from './cms.dto.js';
import type { CollectionConfig, WriteContext } from './collections.js';
import { assertLink, assertMediaRef } from './media.js';

type Tx = Prisma.TransactionClient;
type Row = Record<string, unknown>;

/** The subset of a Prisma model delegate the generic CMS needs. */
interface Delegate {
  findMany(args: object): Promise<Row[]>;
  findUnique(args: object): Promise<Row | null>;
  count(args: object): Promise<number>;
  create(args: object): Promise<Row>;
  update(args: object): Promise<Row>;
  delete(args: object): Promise<Row>;
  aggregate(args: object): Promise<{ _max: { displayOrder: number | null } }>;
}

export const cmsNotFound = () =>
  notFound('CMS_CONTENT_NOT_FOUND', 'المحتوى غير موجود');

/**
 * Generic admin CMS operations, driven by one CollectionConfig per content
 * type (collections.ts). Visibility is the collection's own flag
 * (isPublished / isActive); ordered collections get displayOrder = last + 1
 * on creation and change order only through reorder() (a full permutation,
 * in one transaction), so the order never has gaps or ties.
 */
@Injectable()
export class CmsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pageSizes: PageSizeService,
  ) {}

  async list(cfg: CollectionConfig, query: CmsListQueryDto) {
    const pageSize = await this.pageSizes.resolve(query.pageSize);
    const where: Row = {
      ...(query.visible !== undefined
        ? { [cfg.visibility]: query.visible }
        : {}),
      ...(query.search
        ? {
            OR: cfg.searchFields.map((field) => ({
              [field]: { contains: query.search, mode: 'insensitive' },
            })),
          }
        : {}),
    };
    const db = this.delegate(this.prisma, cfg);
    const [total, rows] = await Promise.all([
      db.count({ where }),
      db.findMany({
        where,
        include: cfg.include,
        orderBy: cfg.adminOrderBy,
        skip: (query.page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    const today = await platformToday(this.prisma);
    return {
      data: rows.map((r) => this.serialize(cfg, r, today)),
      meta: paginationMeta(query.page, pageSize, total),
    };
  }

  async get(cfg: CollectionConfig, id: string) {
    const row = await this.delegate(this.prisma, cfg).findUnique({
      where: { id },
      include: cfg.include,
    });
    if (!row) throw cmsNotFound();
    return this.serialize(cfg, row, await platformToday(this.prisma));
  }

  async create(cfg: CollectionConfig, dto: object, userId: string) {
    const today = await platformToday(this.prisma);
    const id = await this.prisma.$transaction(async (tx) => {
      const ctx = this.context(cfg, tx, dto, userId, today);
      await cfg.prepare?.(ctx);
      if (cfg.ordered) {
        // Serializes creations/reorders of this collection (no duplicate order)
        await this.lockCollection(tx, cfg);
        const { _max } = await this.delegate(tx, cfg).aggregate({
          _max: { displayOrder: true },
        });
        ctx.data.displayOrder = (_max.displayOrder ?? 0) + 1;
      }
      const created = await this.delegate(tx, cfg).create({
        data: ctx.data,
        select: { id: true },
      });
      return created.id as string;
    });
    return this.get(cfg, id);
  }

  async update(cfg: CollectionConfig, id: string, dto: object, userId: string) {
    const today = await platformToday(this.prisma);
    await this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRawUnsafe<{ id: string }[]>(
        `SELECT id FROM "${cfg.table}" WHERE id = $1::uuid FOR UPDATE`,
        id,
      );
      if (!locked.length) throw cmsNotFound();
      const current = await this.delegate(tx, cfg).findUnique({
        where: { id },
      });
      const ctx = this.context(cfg, tx, dto, userId, today, current!);
      await cfg.prepare?.(ctx);
      if (Object.keys(ctx.data).length)
        await this.delegate(tx, cfg).update({ where: { id }, data: ctx.data });
    });
    return this.get(cfg, id);
  }

  /** Hard delete (CMS content has no history to keep; media files arrive with 10.10). */
  async remove(cfg: CollectionConfig, id: string) {
    await this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRawUnsafe<{ id: string }[]>(
        `SELECT id FROM "${cfg.table}" WHERE id = $1::uuid FOR UPDATE`,
        id,
      );
      if (!locked.length) throw cmsNotFound();
      await this.delegate(tx, cfg).delete({ where: { id } });
    });
  }

  /** New display order: `ids` must list every item exactly once (1, 2, 3… in that order). */
  async reorder(cfg: CollectionConfig, dto: ReorderDto) {
    await this.prisma.$transaction(async (tx) => {
      await this.lockCollection(tx, cfg);
      const existing = await this.delegate(tx, cfg).findMany({
        select: { id: true },
      });
      const all = new Set(existing.map((r) => r.id as string));
      if (
        dto.ids.length !== all.size ||
        dto.ids.some((itemId) => !all.has(itemId))
      ) {
        throw badRequest(
          'CMS_INVALID_ORDER',
          'الترتيب يجب أن يشمل كل عناصر القائمة مرة واحدة',
        );
      }
      for (const [index, itemId] of dto.ids.entries()) {
        await this.delegate(tx, cfg).update({
          where: { id: itemId },
          data: { displayOrder: index + 1 },
        });
      }
    });
    return this.list(cfg, { page: 1, pageSize: 100 } as CmsListQueryDto);
  }

  /* ------------------------------ helpers ------------------------------ */

  private delegate(db: Tx | PrismaService, cfg: CollectionConfig): Delegate {
    return (db as unknown as Record<string, Delegate>)[cfg.model];
  }

  private async lockCollection(tx: Tx, cfg: CollectionConfig) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`cms:${cfg.table}`}))`;
  }

  /** DTO → Prisma data (calendar days, times) + media/link safety checks. */
  private context(
    cfg: CollectionConfig,
    tx: Tx,
    dto: object,
    userId: string,
    today: string,
    current?: Row,
  ): WriteContext {
    // Only what the client sent: `field in input` then means "present in the request"
    const input = Object.fromEntries(
      Object.entries(dto).filter(([, value]) => value !== undefined),
    ) as Row;
    const data: Row = {};
    for (const [field, value] of Object.entries(input)) {
      if (cfg.mediaFields.includes(field))
        assertMediaRef(field, value as string | null);
      if (cfg.linkFields.includes(field))
        assertLink(field, value as string | null);
      if (cfg.dateFields.includes(field))
        data[field] = value === null ? null : toDbDate(value as string);
      else if (cfg.timeFields.includes(field))
        data[field] = value === null ? null : toDbTime(value as string);
      else data[field] = value;
    }
    return { tx, data, dto: input, current, userId, today };
  }

  /** Row → admin DTO: calendar days as YYYY-MM-DD, times as HH:mm, derived fields. */
  serialize(cfg: CollectionConfig, row: Row, today: string): Row {
    const out: Row = {};
    for (const [field, value] of Object.entries(row)) {
      if (cfg.hidden?.includes(field)) continue;
      if (cfg.dateFields.includes(field))
        out[field] = value instanceof Date ? fromDbDate(value) : null;
      else if (cfg.timeFields.includes(field))
        out[field] = value instanceof Date ? fromDbTime(value) : null;
      else out[field] = value;
    }
    return { ...out, ...cfg.decorate?.(row, today) };
  }
}
