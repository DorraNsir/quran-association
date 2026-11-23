import { ApiError } from '@/services/api';

import { workItem, workProgram, workSession } from './__fixtures__/work';
import { emptyDraft } from '../quran-reference/work-assignment';
import {
  assignmentError,
  blankItem,
  classifyWorkError,
  evaluationBody,
  evaluationDraftOf,
  evaluationBlockOf,
  existingProgramId,
  isEvaluationClosedError,
  isLegacyFreeText,
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
  type DraftItem, filterStudentGroups, recitationState, RECITATION_STATE_SHORT, RECITATION_STATES } from './work-model';

describe('progress (the approved rule, same numbers as the server)', () => {
  it('only COMPLETED is done; CANCELLED is out of the active total; never a misleading %', () => {
    const p = progressOf([{ status: 'COMPLETED' }, { status: 'CANCELLED' }, { status: 'PARTIAL' }, { status: 'NOT_EVALUATED' }]);
    expect(p).toEqual({ total: 4, active: 3, completed: 1, pending: 1, unfinished: 1, cancelled: 1, rate: 33.3 });
    expect(progressLabel(p)).toBe('تم إنجاز 1 من أصل 3 أعمال نشطة');
    expect(progressLabel(progressOf([]))).toBe('لا توجد أعمال');
    expect(progressLabel(progressOf([{ status: 'CANCELLED' }]))).toBe('لا توجد أعمال نشطة');
    expect(progressLabel(progressOf([{ status: 'COMPLETED' }, { status: 'COMPLETED' }]))).toBe('تم إنجاز جميع الأعمال (2/2)');
    // one done + one dropped: never «جميع الأعمال»
    expect(progressLabel(progressOf([{ status: 'COMPLETED' }, { status: 'CANCELLED' }]))).toBe('تم إنجاز 1 من أصل 2 أعمال');
    expect(progressOf([{ status: 'CANCELLED' }]).rate).toBeNull();
  });

  it('transferable results: not done, partial, postponed, cancelled (the API set)', () => {
    expect((['NOT_COMPLETED', 'PARTIAL', 'POSTPONED', 'CANCELLED'] as const).every((s) => isTransferable(s))).toBe(true);
    expect(isTransferable('COMPLETED')).toBe(false);
    expect(isTransferable('NOT_EVALUATED')).toBe(false);
    expect(isTransferable('NOT_EVALUATED', 'SCHEDULED')).toBe(false);
    expect(isTransferable('NOT_EVALUATED', 'COMPLETED')).toBe(false);
  });

  it('a cancelled session: its unevaluated work may be carried too (it is never evaluated)', () => {
    expect(isTransferable('NOT_EVALUATED', 'CANCELLED')).toBe(true);
    expect(isTransferable('COMPLETED', 'CANCELLED')).toBe(false);
  });
});

describe('evaluation follows the session (server verdict + platform clock)', () => {
  // 18 Nov 2026, 15:00 in Tunis (UTC+1)
  const now = new Date('2026-11-18T14:00:00Z');
  const tz = 'Africa/Tunis';
  const of = (
    status: 'SCHEDULED' | 'COMPLETED' | 'CANCELLED',
    date: string,
    startTime: string,
    blockedReason: 'SESSION_NOT_STARTED' | 'SESSION_CANCELLED' | null,
  ) => workProgram('w1', { session: workSession('s', date, { status, startTime, endTime: '23:00' }), evaluation: { allowed: !blockedReason, blockedReason } });

  it('before the start: closed', () => {
    expect(evaluationBlockOf(of('SCHEDULED', '2026-11-18', '16:00', 'SESSION_NOT_STARTED'), tz, now)).toBe('NOT_STARTED');
    expect(evaluationBlockOf(of('SCHEDULED', '2026-11-19', '08:00', 'SESSION_NOT_STARTED'), tz, now)).toBe('NOT_STARTED');
  });

  it('ongoing and completed: open', () => {
    expect(evaluationBlockOf(of('SCHEDULED', '2026-11-18', '14:30', null), tz, now)).toBeNull();
    expect(evaluationBlockOf(of('COMPLETED', '2026-11-10', '16:00', null), tz, now)).toBeNull();
  });

  it('the start minute came while the screen stayed open: the clock opens what the server said «not yet»', () => {
    expect(evaluationBlockOf(of('SCHEDULED', '2026-11-18', '15:00', 'SESSION_NOT_STARTED'), tz, now)).toBeNull();
  });

  it('the server decides: a phone clock behind never closes an open session; a cancelled one never opens', () => {
    expect(evaluationBlockOf(of('SCHEDULED', '2026-11-18', '16:00', null), tz, now)).toBeNull();
    expect(evaluationBlockOf(of('CANCELLED', '2026-11-10', '16:00', 'SESSION_CANCELLED'), tz, now)).toBe('CANCELLED');
  });

  it('the API refusals that close evaluation', () => {
    expect(isEvaluationClosedError(new ApiError(409, 'WORK_SESSION_NOT_STARTED', 'x'))).toBe(true);
    expect(isEvaluationClosedError(new ApiError(409, 'WORK_SESSION_CANCELLED', 'x'))).toBe(true);
    expect(isEvaluationClosedError(new ApiError(409, 'WORK_ITEM_CHANGED', 'x'))).toBe(false);
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
  // A complete structured item of each type (new items are structured only)
  const surahs = (type: 'REVISION' | 'EXAM', from: number, to: number): DraftItem => ({
    ...blankItem(),
    type,
    assignment: { ...emptyDraft(type), fromSurah: from, toSurah: to },
  });
  const recitation = (surah: number, n = ''): DraftItem => ({
    ...blankItem(),
    type: 'RECITATION',
    recitationNumber: n,
    assignment: { ...emptyDraft('RECITATION'), fromSurah: surah, toSurah: surah },
  });

  it('validation follows the DTO; new items must carry valid Quranic references', () => {
    const item = surahs('REVISION', 78, 114);
    expect(validatePlan({ studentId: '', sessionId: 's', items: [item], notes: '' })).toBe('studentRequired');
    expect(validatePlan({ studentId: 'st', sessionId: '', items: [item], notes: '' })).toBe('sessionRequired');
    expect(validatePlan({ studentId: 'st', sessionId: 's', items: [blankItem()], notes: '' })).toBe('itemsRequired');
    expect(validatePlan({ studentId: 'st', sessionId: 's', items: [recitation(36, '0')], notes: '' })).toBe('numberInvalid');
    expect(validatePlan({ studentId: 'st', sessionId: 's', items: [item], notes: 'ا'.repeat(2001) })).toBe('notesTooLong');
    expect(validatePlan({ studentId: 'st', sessionId: 's', items: [item, blankItem()], notes: '' })).toBeNull();
    // Incomplete references are refused, never turned into free text
    // only an ending surah (the starting one is required)
    const halfDone = { ...blankItem(), assignment: { ...emptyDraft('REVISION'), toSurah: 9 } };
    expect(validatePlan({ studentId: 'st', sessionId: 's', items: [halfDone], notes: '' })).toBe('assignmentInvalid');
    expect(assignmentError(halfDone)?.code).toBe('SURAHS_REQUIRED');
    // a starting surah alone is complete: that surah (the ending surah is optional)
    const single = { ...blankItem(), assignment: { ...emptyDraft('REVISION'), fromSurah: 9 } };
    expect(assignmentError(single)).toBeNull();
    expect(newItemsOf([single])).toEqual([{ type: 'REVISION', recitationNumber: null, assignment: { kind: 'SURAH_RANGE', fromSurah: 9, toSurah: 9 } }]);
    const typedOnly = { ...blankItem(), description: 'مراجعة جزء عمّ', assignment: { ...emptyDraft('REVISION'), toSurah: 3 } };
    expect(validatePlan({ studentId: 'st', sessionId: 's', items: [typedOnly], notes: '' })).toBe('assignmentInvalid');
    // A new item cannot be free text
    const free = { ...blankItem(), description: 'نص', assignment: { ...emptyDraft('REVISION'), mode: 'free' as const } };
    expect(assignmentError(free)?.code).toBe('STRUCTURE_REQUIRED');
    // A next recitation keeps a number (WORK_RECITATION_NUMBER_REQUIRED)
    const locked = toDraft(workItem('x', { type: 'RECITATION', recitationNumber: 3, continuedFrom: { itemId: 'y', programId: 'p', sessionId: 's', sessionDate: '2026-11-01', recitationNumber: 2 } }));
    expect(validatePlan({ studentId: 'st', sessionId: 's', items: [{ ...locked, recitationNumber: '' }], notes: '' })).toBe('numberRequired');
  });

  it('legacy free-text items stay valid as written; emptied text is refused; descriptions stay limited', () => {
    const legacy = toDraft(workItem('l1', { description: 'حفظ حر قديم' }));
    expect(isLegacyFreeText(legacy)).toBe(true);
    expect(assignmentError(legacy)).toBeNull();
    expect(validatePlan({ studentId: 'st', sessionId: 's', items: [legacy], notes: '' })).toBeNull();
    expect(validatePlan({ studentId: 'st', sessionId: 's', items: [{ ...legacy, description: ' ' }], notes: '' })).toBe('descriptionRequired');
    expect(validatePlan({ studentId: 'st', sessionId: 's', items: [{ ...legacy, description: 'ا'.repeat(2001) }], notes: '' })).toBe('descriptionTooLong');
  });

  it('new items: structured requests only, blank ones dropped, number only for عرضة', () => {
    const items = [
      { ...blankItem(), type: 'MEMORIZATION' as const, assignment: { ...emptyDraft('MEMORIZATION'), fromSurah: 67, toSurah: 67, fromAyah: '1', toAyah: '30' } },
      blankItem(),
      recitation(36, '1'),
      { ...surahs('EXAM', 46, 114), recitationNumber: '4' },
      { ...blankItem(), type: 'MEMORIZATION' as const, assignment: { ...emptyDraft('MEMORIZATION'), mode: 'pages' as const, fromPage: '10', toPage: '12' } },
    ];
    expect(newItemsOf(items)).toEqual([
      { type: 'MEMORIZATION', recitationNumber: null, assignment: { kind: 'AYAH_RANGE', fromSurah: 67, fromAyah: 1, toSurah: 67, toAyah: 30 } },
      { type: 'RECITATION', recitationNumber: 1, assignment: { kind: 'SURAH_RANGE', fromSurah: 36, toSurah: 36 } },
      { type: 'EXAM', recitationNumber: null, assignment: { kind: 'SURAH_RANGE', fromSurah: 46, toSurah: 114 } },
      { type: 'MEMORIZATION', recitationNumber: null, assignment: { kind: 'PAGE_RANGE', fromPage: 10, toPage: 12 } },
    ]);
  });

  it('edit body: only changed saved items (with their versions), new items, notes with the program version', () => {
    const p = workProgram();
    const drafts = p.items.map(toDraft);
    expect(updateBody(p, drafts, p.generalNotes!)).toEqual({ body: {}, changed: false });
    drafts[1] = { ...drafts[1]!, description: 'العرضة الثانية من سورة التوبة كاملة' };
    expect(updateBody(p, [...drafts, surahs('EXAM', 67, 67)], '')).toEqual({
      body: {
        version: 1,
        generalNotes: null,
        items: [{ id: 'i2', version: 3, type: 'RECITATION', description: 'العرضة الثانية من سورة التوبة كاملة', recitationNumber: 2 }],
        newItems: [{ type: 'EXAM', recitationNumber: null, assignment: { kind: 'SURAH_RANGE', fromSurah: 67, toSurah: 67 } }],
      },
      changed: true,
    });
  });

  it('explicit conversion of a legacy item: valid references required, its words are not resent', () => {
    const p = workProgram('w1', { items: [workItem('l1', { type: 'EXAM', description: 'اختبار حر قديم', version: 5 })] });
    const [legacy] = p.items.map(toDraft);
    const converted = { ...legacy!, assignment: { ...emptyDraft('EXAM'), fromSurah: 2 } };
    expect(assignmentError({ ...converted, assignment: emptyDraft('EXAM') })?.code).toBe('SURAHS_REQUIRED');
    expect(assignmentError(converted)).toBeNull(); // the starting surah alone is a complete choice
    const done = { ...converted, assignment: { ...converted.assignment, toSurah: 3 } };
    expect(assignmentError(done)).toBeNull();
    expect(updateBody(p, [done], p.generalNotes!).body).toEqual({
      items: [{ id: 'l1', version: 5, type: 'EXAM', recitationNumber: null, assignment: { kind: 'SURAH_RANGE', fromSurah: 2, toSurah: 3 } }],
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

describe('«البحث عن طالب» (filterStudentGroups)', () => {
  const groups = [
    { id: 'c1', label: 'مجموعة الفجر', students: [{ id: 'a', name: 'آمنة التونسي', photoUrl: null }, { id: 'b', name: 'مُحَمَّد بن علي', photoUrl: null }] },
    { id: 'c2', label: 'مجموعة الأمل', students: [{ id: 'c', name: 'Sara Ben Ali', photoUrl: '/api/files/x' }] },
    { id: 'c3', label: 'قسم فارغ', students: [] },
  ];
  const ids = (q: string) => filterStudentGroups(groups, q).map((g) => [g.id, g.students.map((s) => s.id)]);
  it('empty query: every group with students', () => expect(ids('  ')).toEqual([['c1', ['a', 'b']], ['c2', ['c']]]));
  it('Arabic: hamza, tashkeel and tatweel ignored', () => {
    expect(ids('امنه')).toEqual([['c1', ['a']]]);
    expect(ids('محمد')).toEqual([['c1', ['b']]]);
  });
  it('Latin: case-insensitive, partial', () => expect(ids('BEN a')).toEqual([['c2', ['c']]]));
  it('no match: nothing', () => expect(ids('زكرياء')).toEqual([]));
});

describe('recitationState («متابعة العرضات»: مجدولة vs بانتظار التقييم)', () => {
  const clock = { today: '2026-11-23', time: '15:00' };
  it('a session not started: «مجدولة»; started or past: «بانتظار التقييم»', () => {
    expect(recitationState('PENDING', '2026-11-24', undefined, clock)).toBe('SCHEDULED');
    expect(recitationState('PENDING', '2026-11-23', '16:00', clock)).toBe('SCHEDULED');
    expect(recitationState('PENDING', '2026-11-23', '15:00', clock)).toBe('PENDING'); // the start minute
    expect(recitationState('PENDING', '2026-11-23', '08:00', clock)).toBe('PENDING');
    expect(recitationState('PENDING', '2026-11-20', '23:00', clock)).toBe('PENDING');
    // today, start time unknown: as before (the server decides the evaluation)
    expect(recitationState('PENDING', '2026-11-23', undefined, clock)).toBe('PENDING');
  });
  it('results and a cancelled session are kept as they are, even in the future', () => {
    for (const e of ['COMPLETED', 'PARTIAL', 'NOT_COMPLETED', 'CANCELLED', 'POSTPONED', 'SESSION_CANCELLED'] as const)
      expect(recitationState(e, '2099-01-01', '08:00', clock)).toBe(e);
    expect(RECITATION_STATE_SHORT.SCHEDULED).toBe('مجدولة');
    expect(RECITATION_STATE_SHORT.PENDING).toBe('بانتظار التقييم');
    expect(RECITATION_STATES.slice(-3)).toEqual(['POSTPONED', 'PENDING', 'SCHEDULED']);
  });
});
