import { Global, Module } from '@nestjs/common';

import { PrismaService } from './prisma.service.js';

/** One PrismaService for the whole app (feature modules inject it directly). */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
