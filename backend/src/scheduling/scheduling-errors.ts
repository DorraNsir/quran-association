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

/**
 * Reason written on an upcoming lesson that has work planned («متابعة
 * العمل») when its weekly slot moves: it is kept (cancelled) instead of
 * deleted, so its work programs survive. Like a deleted slot's lessons, it
 * never stops the moved slot from planning its new lessons.
 */
export const SLOT_MOVED_REASON = 'تغيّر موعد الحصة الأسبوعي';

/** Cancellations that are not a decision about that date (they never block planning). */
export const SLOT_CHANGE_REASONS: readonly string[] = [
  SLOT_DELETED_REASON,
  SLOT_MOVED_REASON,
];
