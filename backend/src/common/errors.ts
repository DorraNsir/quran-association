import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

import { Prisma } from '../generated/prisma/client.js';

/** Domain errors: stable machine code + Arabic message (same format as auth/accounts). */
export const notFound = (code: string, message: string) =>
  new NotFoundException({ code, message });
export const conflict = (code: string, message: string) =>
  new ConflictException({ code, message });
export const badRequest = (code: string, message: string) =>
  new BadRequestException({ code, message });

const knownError = (
  error: unknown,
): error is Prisma.PrismaClientKnownRequestError =>
  error instanceof Prisma.PrismaClientKnownRequestError;

/** Unique constraint violation (optionally on a given constraint/field name). */
export function isUniqueViolation(error: unknown, target?: string) {
  if (!knownError(error) || error.code !== 'P2002') return false;
  return !target || JSON.stringify(error.meta ?? {}).includes(target);
}

/** Any violation of a named database constraint (FK, CHECK, EXCLUDE, trigger). */
export function violatesConstraint(error: unknown, constraint: string) {
  const text =
    error instanceof Error
      ? `${error.message} ${JSON.stringify((error as { meta?: unknown }).meta ?? {})}`
      : '';
  return text.includes(constraint);
}
