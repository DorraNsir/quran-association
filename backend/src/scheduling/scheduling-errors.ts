import { notFound } from '../common/errors.js';

/** Shared by the schedules and sessions services (kept here so they never import each other). */
export const classNotFound = () =>
  notFound('GROUP_CLASS_NOT_FOUND', 'القسم غير موجود');
