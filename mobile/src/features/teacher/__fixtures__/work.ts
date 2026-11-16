import type { Page } from '../types';
import type { EligibleSession, WorkItem, WorkProgram, WorkSession } from '../work-types';
import { progressOf } from '../work-model';

/** TEST-ONLY data shaped like the work-followup DTOs (never imported by app code). */
export const workSession = (id: string, date: string, extra: Partial<WorkSession> = {}): WorkSession => ({
  id,
  date,
  startTime: '17:00',
  endTime: '19:00',
  status: 'SCHEDULED',
  groupClassId: 'c1',
  groupName: 'مجموعة الفجر',
  branchName: 'الفرع الرئيسي',
  ...extra,
});

export const workItem = (id: string, extra: Partial<WorkItem> = {}): WorkItem => ({
  id,
  version: 1,
  position: 0,
  type: 'MEMORIZATION',
  description: 'حفظ صفحتين من سورة البقرة',
  status: 'NOT_EVALUATED',
  recitationNumber: null,
  evaluationComment: null,
  evaluatedAt: null,
  evaluatedBy: null,
  carriedFrom: null,
  continuedFrom: null,
  carriedTo: [],
  continuedBy: [],
  ...extra,
});

export function workProgram(id = 'w1', extra: Partial<WorkProgram> = {}): WorkProgram {
  const items = extra.items ?? [
    workItem('i1'),
    workItem('i2', { position: 1, type: 'RECITATION', description: 'العرضة الثانية من سورة التوبة', recitationNumber: 2, status: 'PARTIAL', version: 3, evaluationComment: 'أكمل الربع الأخير', evaluatedAt: '2026-11-09T16:30:00.000Z', evaluatedBy: 'سارة بن علي' }),
    workItem('i3', { position: 2, type: 'REVISION', description: 'مراجعة جزء عمّ', status: 'COMPLETED', version: 2 }),
  ];
  return {
    id,
    version: 1,
    student: { id: 'st1', firstName: 'محمد', lastName: 'التونسي', photoUrl: null },
    session: workSession('s9', '2026-11-09'),
    generalNotes: 'تحسّن ملحوظ في التجويد',
    lastEditedBy: 'أحمد السالمي',
    createdAt: '2026-11-01T10:00:00.000Z',
    updatedAt: '2026-11-09T16:30:00.000Z',
    progress: progressOf(items),
    items,
    ...extra,
  };
}

export const eligible = (id: string, date: string, programId: string | null = null): EligibleSession => ({
  ...workSession(id, date),
  programId,
});

export const workPage = (data: WorkProgram[], page = 1, totalPages = 1, total = data.length): Page<WorkProgram> => ({
  data,
  meta: { page, pageSize: 20, total, totalPages },
});
