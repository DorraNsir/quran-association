import type { Announcement } from '../announcement-types';
import type { Page } from '../types';

/** TEST-ONLY data shaped like AnnouncementDto (never imported by app code). */
export function announcementFixture(id: string, extra: Partial<Announcement> = {}): Announcement {
  return {
    id,
    title: 'عطلة نهاية السداسي',
    content: 'تتوقف الحصص من 20 ديسمبر إلى 3 جانفي. نتمنى للجميع عطلة سعيدة.',
    audience: 'EVERYONE',
    status: 'PUBLISHED',
    state: 'ACTIVE',
    scheduledFor: null,
    scheduledForLocal: null,
    publishedAt: '2026-11-12T08:30:00.000Z',
    expiresAt: null,
    archivedAt: null,
    groupClasses: [],
    branches: [],
    publishedBy: { id: 'admin-1', firstName: 'إدارة', lastName: 'الجمعية' },
    canManage: false,
    createdAt: '2026-11-12T08:00:00.000Z',
    updatedAt: '2026-11-12T08:30:00.000Z',
    ...extra,
  };
}

/** One I wrote for my class c1. */
export const myAnnouncement = (id: string, extra: Partial<Announcement> = {}) =>
  announcementFixture(id, {
    title: 'مراجعة يوم السبت',
    content: 'مراجعة جماعية لسورة الملك يوم السبت.',
    audience: 'SPECIFIC_GROUP_CLASSES',
    groupClasses: [{ id: 'c1', group: { id: 'g1', name: 'مجموعة الفجر' }, branch: { id: 'b1', name: 'الفرع الرئيسي' } }],
    publishedBy: { id: 'u1', firstName: 'أحمد', lastName: 'السالمي' },
    canManage: true,
    ...extra,
  });

export const announcementPage = (data: Announcement[], page = 1, totalPages = 1, total = data.length): Page<Announcement> => ({
  data,
  meta: { page, pageSize: 20, total, totalPages },
});
