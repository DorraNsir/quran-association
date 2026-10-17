import { notFound } from '../common/errors.js';

/** Shared by the schedules and sessions services (kept here so they never import each other). */
export const classNotFound = () =>
  notFound('GROUP_CLASS_NOT_FOUND', 'القسم غير موجود');

/**
 * Reason written on the upcoming lessons cancelled because their weekly slot
 * was deleted (also by the 20261017090000 clean-up migration). Such a
 * cancellation is not a decision about that date, so it never stops a new
 * slot from planning a lesson there — unlike a date cancelled on purpose.
 */
export const SLOT_DELETED_REASON = 'حُذف الموعد الأسبوعي من البرنامج';
