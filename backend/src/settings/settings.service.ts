import { Injectable } from '@nestjs/common';

import { fromDbDate } from '../common/dates.js';
import { badRequest, conflict } from '../common/errors.js';
import { FilesService, privateFileUrl } from '../files/files.service.js';
import { FilePurpose, type Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { SettingsDto, UpdateSettingsDto } from './settings.dto.js';

type Tx = Prisma.TransactionClient;

/** https:// links, restricted to the expected site for social profiles. */
const LINK_HOSTS: Record<string, string[] | null> = {
  mapUrl: null,
  facebookUrl: ['facebook.com', 'fb.com'],
  instagramUrl: ['instagram.com'],
  youtubeUrl: ['youtube.com', 'youtu.be'],
};

function assertLink(field: string, value: string | null | undefined) {
  if (value === null || value === undefined) return;
  let url: URL | null = null;
  try {
    url = new URL(value);
  } catch {
    url = null;
  }
  const hosts = LINK_HOSTS[field];
  const host = url?.hostname.toLowerCase() ?? '';
  const ok =
    url !== null &&
    url.protocol === 'https:' &&
    !url.username &&
    !url.password &&
    host.includes('.') &&
    (!hosts || hosts.some((h) => host === h || host.endsWith(`.${h}`)));
  if (!ok)
    throw badRequest(
      'SETTINGS_INVALID_URL',
      `رابط غير مقبول في الحقل «${field}»`,
    );
}

const notInitialized = () =>
  conflict(
    'SETTINGS_NOT_INITIALIZED',
    'الإعدادات غير مهيّأة بعد (شغّل تهيئة قاعدة البيانات: npm run db:seed)',
  );

/**
 * Association settings (إعدادات الجمعية) — the three existing singletons
 * (id = 1, CHECK): AssociationSettings (identity + logo), PlatformSettings
 * (display behaviour; the timezone stays Africa/Tunis, read-only) and
 * SiteSettings (website presentation). The current academic year stays
 * owned by AcademicYear.isCurrent (read-only here). Partial updates in one
 * transaction with the rows locked, so concurrent saves never interleave.
 */
@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly files: FilesService,
  ) {}

  async get(): Promise<SettingsDto> {
    const [association, platform, website, year] = await Promise.all([
      this.prisma.associationSettings.findUnique({ where: { id: 1 } }),
      this.prisma.platformSettings.findUnique({ where: { id: 1 } }),
      this.prisma.siteSettings.findUnique({ where: { id: 1 } }),
      this.prisma.academicYear.findFirst({
        where: { isCurrent: true },
        select: { id: true, label: true, startDate: true, endDate: true },
      }),
    ]);
    return {
      association: association
        ? {
            name: association.name,
            phone: association.phone,
            email: association.email,
            address: association.address,
            logoFileId: association.logoFileId,
            logoUrl: association.logoFileId
              ? privateFileUrl(association.logoFileId)
              : null,
            updatedAt: association.updatedAt,
          }
        : null,
      platform: platform
        ? {
            timezone: platform.timezone,
            dateFormat: platform.dateFormat,
            defaultCalendarView: platform.defaultCalendarView,
            defaultPageSize: platform.defaultPageSize,
            updatedAt: platform.updatedAt,
          }
        : null,
      website: website ? (({ id: _id, ...rest }) => rest)(website) : null,
      currentAcademicYear: year
        ? {
            id: year.id,
            label: year.label,
            startDate: fromDbDate(year.startDate),
            endDate: fromDbDate(year.endDate),
          }
        : null,
    };
  }

  async update(dto: UpdateSettingsDto, userId: string): Promise<SettingsDto> {
    if (!dto.association && !dto.platform && !dto.website)
      throw badRequest('SETTINGS_EMPTY_UPDATE', 'لا توجد إعدادات لتحديثها');
    for (const field of Object.keys(LINK_HOSTS))
      assertLink(
        field,
        dto.website?.[field as keyof typeof dto.website] as string | null,
      );
    await this.prisma.$transaction(async (tx) => {
      if (dto.association) {
        await this.lock(tx, 'association_settings');
        const { logoFileId, ...identity } = dto.association;
        // The new logo must be an image uploaded for the logo; the old one is
        // never deleted here (the cleanup removes it once referenced by nothing)
        if (logoFileId)
          await this.files.assertAttachable(
            tx,
            logoFileId,
            FilePurpose.ASSOCIATION_LOGO,
            { userId, isAdmin: true },
            { kinds: ['IMAGE'] },
          );
        await tx.associationSettings.update({
          where: { id: 1 },
          data: { ...identity, logoFileId },
        });
      }
      if (dto.platform) {
        await this.lock(tx, 'platform_settings');
        await tx.platformSettings.update({
          where: { id: 1 },
          data: dto.platform,
        });
      }
      if (dto.website) {
        await this.lock(tx, 'site_settings');
        await tx.siteSettings.update({ where: { id: 1 }, data: dto.website });
      }
    });
    return this.get();
  }

  /** Singleton row lock; a missing singleton is a setup error (never created here). */
  private async lock(tx: Tx, table: string) {
    const rows = await tx.$queryRawUnsafe<{ id: number }[]>(
      `SELECT id FROM "${table}" WHERE id = 1 FOR UPDATE`,
    );
    if (!rows.length) throw notInitialized();
  }
}
