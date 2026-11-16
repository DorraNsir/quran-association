import type { Page, TeacherNote } from '../types';

/** TEST-ONLY notes shaped like TeacherNoteDto (never imported by app code). */
export const noteFixture = (id: string, content: string, createdAt: string, updatedAt = createdAt): TeacherNote => ({
  id,
  content,
  createdAt,
  updatedAt,
});

export function notesFixture(): TeacherNote[] {
  return [
    // API order: most recently updated first
    noteFixture('n2', 'مراجعة سورة الملك مع مجموعة الفجر يوم الأربعاء', '2026-11-10T08:00:00.000Z', '2026-11-15T13:05:00.000Z'),
    noteFixture('n1', 'تذكير: إحضار المصاحف الجديدة.\nوالتنسيق مع الإدارة بشأن القاعة 2', '2026-11-12T09:30:00.000Z'),
  ];
}

export const notesPage = (data: TeacherNote[], page = 1, totalPages = 1): Page<TeacherNote> => ({
  data,
  meta: { page, pageSize: 100, total: data.length, totalPages },
});
