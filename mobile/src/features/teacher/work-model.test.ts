import { ApiError } from '@/services/api';

import { workItem, workProgram } from './__fixtures__/work';
import {
  blankItem,
  classifyWorkError,
  evaluationBody,
  evaluationDraftOf,
  existingProgramId,
  isTransferable,
  newItemsOf,
  nextRecitation,
  phaseOf,
  progressLabel,
  progressOf,
  toDraft,
  updateBody,
  validateEvaluation,
  validatePlan,
} from './work-model';

describe('progress (the approved rule, same numbers as the server)', () => {
  it('only COMPLETED is done; CANCELLED is out of the active total; never a misleading %', () => {
    const p = progressOf([{ status: 'COMPLETED' }, { status: 'CANCELLED' }, { status: 'PARTIAL' }, { status: 'NOT_EVALUATED' }]);
    expect(p).toEqual({ total: 4, active: 3, completed: 1, pending: 1, unfinished: 1, cancelled: 1, rate: 33.3 });
    expect(progressLabel(p)).toBe('تم إنجاز 1 من أصل 3 أعمال نشطة');
    expect(progressLabel(progressOf([]))).toBe('لا توجد أعمال');
    expect(progressLabel(progressOf([{ status: 'CANCELLED' }]))).toBe('لا توجد أعمال نشطة');
    expect(progressLabel(progressOf([{ status: 'COMPLETED' }, { status: 'COMPLETED' }]))).toBe('تم إنجاز جميع الأعمال (2/2)');
    expect(progressOf([{ status: 'CANCELLED' }]).rate).toBeNull();
  });

  it('transferable results: not done, partial, postponed, cancelled (the API set)', () => {
    expect((['NOT_COMPLETED', 'PARTIAL', 'POSTPONED', 'CANCELLED'] as const).every(isTransferable)).toBe(true);
    expect(isTransferable('COMPLETED')).toBe(false);
    expect(isTransferable('NOT_EVALUATED')).toBe(false);
  });
});

describe('session phase, in PLATFORM time (Africa/Tunis)', () => {
  const s = { date: '2026-11-16', startTime: '17:00', endTime: '19:00' };
  it('upcoming / ongoing / past', () => {
    expect(phaseOf(s, 'Africa/Tunis', new Date('2026-11-16T15:30:00Z'))).toBe('UPCOMING'); // 16:30 in Tunis
    expect(phaseOf(s, 'Africa/Tunis', new Date('2026-11-16T16:30:00Z'))).toBe('ONGOING'); // 17:30
    expect(phaseOf(s, 'Africa/Tunis', new Date('2026-11-16T18:00:00Z'))).toBe('PAST'); // 19:00
    expect(phaseOf(s, 'Africa/Tunis', new Date('2026-11-15T12:00:00Z'))).toBe('UPCOMING');
  });
});

describe('next recitation proposal (the web rule)', () => {
  it('replaces the ordinal, drops a leading «إكمال», or prefixes one', () => {
    expect(nextRecitation({ description: 'العرضة الثانية من سورة التوبة', recitationNumber: 2 })).toEqual({ number: 3, description: 'العرضة الثالثة من سورة التوبة' });
    expect(nextRecitation({ description: 'إكمال العرضة الأولى من سورة يس', recitationNumber: 1 }).description).toBe('العرضة الثانية من سورة يس');
    expect(nextRecitation({ description: 'سورة الملك', recitationNumber: 10 })).toEqual({ number: 11, description: 'العرضة رقم 11 — سورة الملك' });
  });
});

describe('evaluation body: only what changed, with the versions it was loaded at', () => {
  it('nothing changed → nothing to send', () => {
    const p = workProgram();
    expect(evaluationBody(p, evaluationDraftOf(p), p.generalNotes!)).toEqual({ items: [], changed: false });
  });

  it('a changed status and a changed comment; notes sent with the PROGRAM version', () => {
    const p = workProgram();
    const draft = evaluationDraftOf(p);
    draft.i1 = { status: 'COMPLETED', comment: '' };
    draft.i2 = { ...draft.i2!, comment: '  أحسنت  ' };
    expect(evaluationBody(p, draft, 'ملاحظة جديدة')).toEqual({
      items: [
        { id: 'i1', version: 1, status: 'COMPLETED', evaluationComment: null },
        { id: 'i2', version: 3, status: 'PARTIAL', evaluationComment: 'أحسنت' },
      ],
      version: 1,
      generalNotes: 'ملاحظة جديدة',
      changed: true,
    });
  });

  it('limits: comment 1000, notes 2000', () => {
    const p = workProgram();
    const draft = evaluationDraftOf(p);
    expect(validateEvaluation(draft, '')).toBeNull();
    draft.i1 = { status: 'COMPLETED', comment: 'ا'.repeat(1001) };
    expect(validateEvaluation(draft, '')).toBe('commentTooLong');
    expect(validateEvaluation(evaluationDraftOf(p), 'ا'.repeat(2001))).toBe('notesTooLong');
  });
});

describe('planning', () => {
  it('validation follows the DTO', () => {
    const item = { ...blankItem(), description: 'حفظ' };
    expect(validatePlan({ studentId: '', sessionId: 's', items: [item], notes: '' })).toBe('studentRequired');
    expect(validatePlan({ studentId: 'st', sessionId: '', items: [item], notes: '' })).toBe('sessionRequired');
    expect(validatePlan({ studentId: 'st', sessionId: 's', items: [blankItem()], notes: '' })).toBe('itemsRequired');
    expect(validatePlan({ studentId: 'st', sessionId: 's', items: [{ ...item, description: 'ا'.repeat(2001) }], notes: '' })).toBe('descriptionTooLong');
    expect(validatePlan({ studentId: 'st', sessionId: 's', items: [{ ...item, type: 'RECITATION', recitationNumber: '0' }], notes: '' })).toBe('numberInvalid');
    expect(validatePlan({ studentId: 'st', sessionId: 's', items: [item], notes: 'ا'.repeat(2001) })).toBe('notesTooLong');
    expect(validatePlan({ studentId: 'st', sessionId: 's', items: [item, blankItem()], notes: '' })).toBeNull();
    // A next recitation keeps a number (WORK_RECITATION_NUMBER_REQUIRED)
    const locked = toDraft(workItem('x', { type: 'RECITATION', recitationNumber: 3, continuedFrom: { itemId: 'y', programId: 'p', sessionId: 's', sessionDate: '2026-11-01', recitationNumber: 2 } }));
    expect(validatePlan({ studentId: 'st', sessionId: 's', items: [{ ...locked, recitationNumber: '' }], notes: '' })).toBe('numberRequired');
  });

  it('new items: trimmed, blank ones dropped, number only for عرضة', () => {
    const items = [
      { ...blankItem(), description: '  حفظ سورة الملك  ' },
      { ...blankItem(), description: '   ' },
      { ...blankItem(), type: 'RECITATION' as const, description: 'العرضة الأولى', recitationNumber: '1' },
      { ...blankItem(), type: 'EXAM' as const, description: 'اختبار', recitationNumber: '4' },
    ];
    expect(newItemsOf(items)).toEqual([
      { type: 'REVISION', description: 'حفظ سورة الملك', recitationNumber: null },
      { type: 'RECITATION', description: 'العرضة الأولى', recitationNumber: 1 },
      { type: 'EXAM', description: 'اختبار', recitationNumber: null },
    ]);
  });

  it('edit body: only changed saved items (with their versions), new items, notes with the program version', () => {
    const p = workProgram();
    const drafts = p.items.map(toDraft);
    expect(updateBody(p, drafts, p.generalNotes!)).toEqual({ body: {}, changed: false });
    drafts[1] = { ...drafts[1]!, description: 'العرضة الثانية من سورة التوبة كاملة' };
    const added = { ...blankItem(), description: 'اختبار قصير', type: 'EXAM' as const };
    expect(updateBody(p, [...drafts, added], '')).toEqual({
      body: {
        version: 1,
        generalNotes: null,
        items: [{ id: 'i2', version: 3, type: 'RECITATION', description: 'العرضة الثانية من سورة التوبة كاملة', recitationNumber: 2 }],
        newItems: [{ type: 'EXAM', description: 'اختبار قصير', recitationNumber: null }],
      },
      changed: true,
    });
  });
});

describe('errors', () => {
  it('maps the server codes; a network failure is never «denied»', () => {
    expect(classifyWorkError(new ApiError(0, 'NETWORK_ERROR', 'x'))).toBe('offline');
    expect(classifyWorkError(new ApiError(409, 'WORK_ITEM_CHANGED', 'x'))).toBe('conflict');
    expect(classifyWorkError(new ApiError(409, 'WORK_PROGRAM_CHANGED', 'x'))).toBe('conflict');
    expect(classifyWorkError(new ApiError(409, 'WORK_SESSION_NOT_UPCOMING', 'x'))).toBe('notUpcoming');
    expect(classifyWorkError(new ApiError(404, 'WORK_PROGRAM_NOT_FOUND', 'x'))).toBe('notFound');
    expect(classifyWorkError(new ApiError(403, 'FORBIDDEN', 'x'))).toBe('forbidden');
    expect(classifyWorkError(new ApiError(400, 'VALIDATION_ERROR', 'x'))).toBe('invalid');
    const exists = new ApiError(409, 'WORK_PROGRAM_EXISTS', 'x', undefined, { code: 'WORK_PROGRAM_EXISTS', programId: 'w7' });
    expect(classifyWorkError(exists)).toBe('exists');
    expect(existingProgramId(exists)).toBe('w7');
    expect(existingProgramId(new ApiError(409, 'WORK_ITEM_CHANGED', 'x'))).toBeNull();
  });
});
