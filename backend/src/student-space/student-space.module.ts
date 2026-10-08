import { Module } from '@nestjs/common';

import { StudentAccessService } from './student-access.service.js';

/** Student authorization (own profile, current class), shared by student-facing modules. */
@Module({ providers: [StudentAccessService], exports: [StudentAccessService] })
export class StudentSpaceModule {}
