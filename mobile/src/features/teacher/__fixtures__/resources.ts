import type { Page } from '../types';
import type { Resource } from '../resource-types';

/** TEST-ONLY data shaped like ResourceDto (never imported by app code). */
export function resourceFixture(id: string, extra: Partial<Resource> = {}): Resource {
  return {
    id,
    title: 'أحكام النون الساكنة',
    description: 'ملخص مصوّر لأحكام النون الساكنة والتنوين',
    type: 'PDF',
    externalUrl: null,
    file: { id: `f-${id}`, fileName: 'ahkam-noun.pdf', mimeType: 'application/pdf', size: 2_516_582, url: `/api/files/f-${id}` },
    visibility: 'GROUP_CLASS',
    groups: [],
    groupClasses: [{ id: 'c1', group: { id: 'g1', name: 'مجموعة الفجر' }, branch: { id: 'b1', name: 'الفرع الرئيسي' } }],
    publishedBy: { id: 'u1', firstName: 'أحمد', lastName: 'السالمي' },
    canManage: true,
    createdAt: '2026-11-10T09:00:00.000Z',
    updatedAt: '2026-11-10T09:00:00.000Z',
    ...extra,
  };
}

export const linkResource = (id: string, extra: Partial<Resource> = {}) =>
  resourceFixture(id, {
    title: 'تلاوة سورة الملك',
    description: '',
    type: 'VIDEO_LINK',
    externalUrl: 'https://www.youtube.com/watch?v=abc123',
    file: null,
    ...extra,
  });

export const resourcePage = (data: Resource[], page = 1, totalPages = 1, total = data.length): Page<Resource> => ({
  data,
  meta: { page, pageSize: 20, total, totalPages },
});
