import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';

/** List pages default to the platform setting (/admin/settings → defaultPageSize, 10 if unset). */
@Injectable()
export class PageSizeService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(requested?: number): Promise<number> {
    if (requested) return requested;
    const settings = await this.prisma.platformSettings.findUnique({
      where: { id: 1 },
      select: { defaultPageSize: true },
    });
    return settings?.defaultPageSize ?? 10;
  }
}
