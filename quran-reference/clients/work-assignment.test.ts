// node --test clients/work-assignment.test.ts — the shared client rules (copied into web + mobile)
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  adaptDraft,
  assignmentSummary,
  OVERALL_BLOCKED,
  OVERALL_EVALUATION,
  overallChangeText,
  overallPendingNote,
  overallRowText,
  PERFORMANCE_LABEL,
  WORK_PERFORMANCES,
  completionParts,
  completionText,
  programStatus,
  workTypeBadges,
  workloadSections,
  workTypesSummary,
  WORKLOAD_ORDER,
  nextRecitationText,
  RECITATION_ENTRY_LABEL,
  recitationLabel,
  recitationsCount,
  recitationSummaryText,
  rowRecitationText,
  ayahCount,
  canonicalOf,
  countLabel,
  defaultDescription,
  draftFromAssignment,
  emptyDraft,
  formatHizbEquivalent,
  hizbAmount,
  formatMeasure,
  showsVerseCount,
  freeDraft,
  isBlankDraft,
  isDefaultDescription,
  modesForItem,
  pageEnd,
  pageStart,
  sameAssignment,
  toPayload,
  validateDraft,
  validateItemDraft,
  withSurah,
  workloadLines,
  workloadSummary,
  FIRST_PAGE,
  LAST_PAGE,
  EDITION_ID,
  type AssignmentDraft,
  type WorkAssignment,
  type WorkloadSnapshot,
} from './work-assignment.ts';
import { renderCopy, renderData, TARGETS } from '../scripts/sync-clients.mjs';

const ds = JSON.parse(readFileSync(new URL('../data/qalun-tn-v1.json', import.meta.url), 'utf8'));
const NAMES: Record<number, string> = { 2: 'البقرة', 3: 'آل عمران', 36: 'يس', 46: 'الأحقاف', 55: 'الرحمن', 67: 'الملك', 78: 'النبأ', 114: 'الناس' };
const name = (n: number) => NAMES[n] ?? `#${n}`;
const draft = (type: Parameters<typeof emptyDraft>[0], p: Partial<AssignmentDraft>): AssignmentDraft => ({ ...emptyDraft(type), ...p });

describe('reference data = the dataset (no separate copy of counts or pages)', () => {
  test('edition, 114 counts summing to 6236, printed pages 2–604', () => {
    assert.equal(EDITION_ID, ds.editionId);
    for (let s = 1; s <= 114; s++) assert.equal(ayahCount(s), ds.surahs[s - 1].ayahCount);
    assert.equal([...Array(114)].reduce((t, _, i) => t + ayahCount(i + 1), 0), 6236);
    assert.deepEqual([FIRST_PAGE, LAST_PAGE], [2, 604]);
    for (const p of ds.pageStarts) assert.deepEqual(pageStart(p.page), { surah: p.surah, ayah: p.ayah });
    assert.equal(pageStart(1), null);
    assert.equal(pageStart(605), null);
    assert.deepEqual(pageEnd(604), { surah: 114, ayah: 6 });
    assert.deepEqual(pageEnd(591), { surah: 87, ayah: 14 }); // this edition; Hafs differs
    assert.equal(ayahCount(0), 0);
  });
});

describe('validation mirrors the backend contract', () => {
  test('حفظ by verses: one surah, both verses, in range, in order', () => {
    assert.equal(validateDraft('MEMORIZATION', draft('MEMORIZATION', {}))?.code, 'SURAH_REQUIRED');
    assert.equal(validateDraft('MEMORIZATION', draft('MEMORIZATION', { fromSurah: 2, toSurah: 2 }))?.code, 'AYAHS_REQUIRED');
    assert.equal(validateDraft('MEMORIZATION', draft('MEMORIZATION', { fromSurah: 2, toSurah: 2, fromAyah: '1', toAyah: '287' }))?.code, 'AYAH_INVALID');
    assert.equal(validateDraft('MEMORIZATION', draft('MEMORIZATION', { fromSurah: 2, toSurah: 2, fromAyah: '0', toAyah: '3' }))?.code, 'AYAH_INVALID');
    assert.equal(validateDraft('MEMORIZATION', draft('MEMORIZATION', { fromSurah: 2, toSurah: 2, fromAyah: '1.5', toAyah: '3' }))?.code, 'AYAH_INVALID');
    assert.equal(validateDraft('MEMORIZATION', draft('MEMORIZATION', { fromSurah: 2, toSurah: 2, fromAyah: '20', toAyah: '6' }))?.code, 'AYAH_REVERSED');
    const ok = draft('MEMORIZATION', { fromSurah: 2, toSurah: 2, fromAyah: '6', toAyah: '20' });
    assert.equal(validateDraft('MEMORIZATION', ok), null);
    assert.deepEqual(toPayload(ok), { kind: 'AYAH_RANGE', fromSurah: 2, fromAyah: 6, toSurah: 2, toAyah: 20 });
  });

  test('حفظ by pages: printed pages 2–604 of this edition, in order; never surah fields', () => {
    const p = (f: string, t: string) => draft('MEMORIZATION', { mode: 'pages', fromPage: f, toPage: t });
    assert.equal(validateDraft('MEMORIZATION', p('', '3'))?.code, 'PAGES_REQUIRED');
    assert.equal(validateDraft('MEMORIZATION', p('1', '3'))?.code, 'PAGE_INVALID');
    assert.equal(validateDraft('MEMORIZATION', p('600', '605'))?.code, 'PAGE_INVALID');
    assert.equal(validateDraft('MEMORIZATION', p('12', '10'))?.code, 'PAGE_REVERSED');
    assert.equal(validateDraft('MEMORIZATION', p('48', '52')), null); // spans al-Baqara → Al Imran
    assert.deepEqual(toPayload({ ...p('10', '12'), fromSurah: 2, toSurah: 3 }), { kind: 'PAGE_RANGE', fromPage: 10, toPage: 12 });
  });

  test('مراجعة / اختبار: surah range, optional verses', () => {
    for (const type of ['REVISION', 'EXAM'] as const) {
      assert.equal(validateDraft(type, draft(type, { fromSurah: 3 })), null); // ending surah optional
      assert.equal(validateDraft(type, draft(type, {}))?.code, 'SURAHS_REQUIRED'); // starting surah required
      assert.equal(validateDraft(type, draft(type, { fromSurah: 5, toSurah: 3 }))?.code, 'SURAH_REVERSED');
      assert.equal(validateDraft(type, draft(type, { fromSurah: 46, toSurah: 114 })), null);
      assert.deepEqual(toPayload(draft(type, { fromSurah: 46, toSurah: 114 })), { kind: 'SURAH_RANGE', fromSurah: 46, toSurah: 114 });
      const precise = draft(type, { fromSurah: 2, toSurah: 3, precise: true, fromAyah: '142', toAyah: '' });
      assert.equal(validateDraft(type, precise), null);
      assert.deepEqual(toPayload(precise), { kind: 'SURAH_RANGE', fromSurah: 2, toSurah: 3, fromAyah: 142 });
      assert.equal(validateDraft(type, { ...precise, toAyah: '201' })?.code, 'AYAH_INVALID'); // Al Imran has 200
      assert.equal(validateDraft(type, draft(type, { fromSurah: 3, toSurah: 3, precise: true, fromAyah: '20', toAyah: '10' }))?.code, 'RANGE_REVERSED');
      assert.equal(validateDraft(type, draft(type, { mode: 'pages', fromPage: '2', toPage: '3' }))?.code, 'MODE_NOT_ALLOWED');
    }
  });

  test('عرضة: exactly one whole surah', () => {
    assert.equal(validateDraft('RECITATION', draft('RECITATION', {}))?.code, 'SURAH_REQUIRED');
    const d = draft('RECITATION', { fromSurah: 55, toSurah: 55, fromAyah: '3', toAyah: '9' }); // stray verses ignored
    assert.equal(validateDraft('RECITATION', d), null);
    assert.deepEqual(toPayload(d), { kind: 'SURAH_RANGE', fromSurah: 55, toSurah: 55 });
    for (const mode of ['ayahs', 'pages', 'surahs'] as const) assert.equal(validateDraft('RECITATION', draft('RECITATION', { mode }))?.code, 'MODE_NOT_ALLOWED');
  });

  test('a blank selection is blank in any format; one choice is enough to be a selection', () => {
    for (const type of ['MEMORIZATION', 'REVISION', 'RECITATION', 'EXAM'] as const) assert.ok(isBlankDraft(emptyDraft(type)));
    assert.ok(isBlankDraft({ ...emptyDraft('REVISION'), mode: 'surah' }));
    assert.equal(isBlankDraft(draft('MEMORIZATION', { mode: 'pages', fromPage: '10' })), false);
    assert.equal(isBlankDraft(draft('EXAM', { toSurah: 3 })), false);
  });

  test('free text is always allowed and sends no assignment', () => {
    for (const type of ['MEMORIZATION', 'REVISION', 'RECITATION', 'EXAM'] as const) {
      assert.equal(validateDraft(type, freeDraft(type)), null);
      assert.equal(toPayload(freeDraft(type)), null);
    }
  });
});

describe('editing', () => {
  const saved = (p: Partial<WorkAssignment>): WorkAssignment => ({
    kind: 'SURAH_RANGE', editionId: EDITION_ID, fromSurah: 78, fromAyah: 1, toSurah: 114, toAyah: 6, fromPage: null, toPage: null, ...p,
  });
  test('prepopulation round-trips every format; legacy → free text', () => {
    const cases: [Parameters<typeof emptyDraft>[0], WorkAssignment][] = [
      ['MEMORIZATION', saved({ kind: 'AYAH_RANGE', fromSurah: 2, fromAyah: 6, toSurah: 2, toAyah: 20 })],
      ['MEMORIZATION', saved({ kind: 'PAGE_RANGE', fromSurah: 2, fromAyah: 62, toSurah: 2, toAyah: 83, fromPage: 10, toPage: 12 })],
      ['REVISION', saved({})],
      ['EXAM', saved({ fromSurah: 2, fromAyah: 142, toSurah: 3, toAyah: 91 })],
      ['RECITATION', saved({ fromSurah: 36, toSurah: 36, toAyah: 83 })],
    ];
    for (const [type, a] of cases) {
      const d = draftFromAssignment(type, a);
      assert.equal(validateDraft(type, d), null, `${type} ${a.kind}`);
      assert.ok(sameAssignment(a, toPayload(d)), `${type} ${a.kind} unchanged`);
    }
    assert.equal(draftFromAssignment('REVISION', null).mode, 'free');
    assert.ok(sameAssignment(null, null));
    assert.equal(sameAssignment(saved({}), null), false);
  });
  test('canonical page ranges match the edition (what the server derives)', () => {
    assert.deepEqual(canonicalOf({ kind: 'PAGE_RANGE', fromPage: 592, toPage: 592 })?.fromAyah, 15);
    assert.equal(canonicalOf({ kind: 'PAGE_RANGE', fromPage: 1, toPage: 2 }), null);
  });
  test('type change keeps the surah, drops what no longer applies; a new surah clears unfitting verses', () => {
    const memo = draft('MEMORIZATION', { fromSurah: 2, toSurah: 2, fromAyah: '250', toAyah: '286' });
    assert.deepEqual([adaptDraft(memo, 'RECITATION').mode, adaptDraft(memo, 'RECITATION').fromSurah, adaptDraft(memo, 'RECITATION').fromAyah], ['surah', 2, '']);
    assert.equal(adaptDraft(memo, 'EXAM').mode, 'surahs');
    assert.equal(adaptDraft(freeDraft('MEMORIZATION'), 'EXAM').mode, 'free');
    const moved = withSurah(memo, 1);
    assert.deepEqual([moved.fromSurah, moved.fromAyah, moved.toAyah], [1, '', '']);
    assert.deepEqual([withSurah(memo, 3).fromAyah, withSurah(memo, 3).toAyah], ['', '']); // Al Imran: 200
  });
});

describe('display', () => {
  const a = (p: Partial<WorkAssignment>): WorkAssignment => ({ kind: 'SURAH_RANGE', editionId: EDITION_ID, fromSurah: 46, fromAyah: 1, toSurah: 114, toAyah: 6, fromPage: null, toPage: null, ...p });
  test('default descriptions use the backend wording', () => {
    assert.equal(defaultDescription('MEMORIZATION', a({ kind: 'AYAH_RANGE', fromSurah: 2, fromAyah: 6, toSurah: 2, toAyah: 20 }), name, null), 'سورة البقرة: من الآية 6 إلى الآية 20');
    assert.equal(defaultDescription('MEMORIZATION', a({ kind: 'PAGE_RANGE', fromPage: 10, toPage: 12 }), name, null), 'من الصفحة 10 إلى الصفحة 12');
    assert.equal(defaultDescription('REVISION', a({ fromSurah: 78 }), name, null), 'من سورة النبأ إلى سورة الناس');
    assert.equal(defaultDescription('EXAM', a({ fromSurah: 67, toSurah: 67, toAyah: 30 }), name, null), 'سورة الملك');
    assert.equal(defaultDescription('RECITATION', a({ fromSurah: 36, toSurah: 36, toAyah: 83 }), name, 'الثانية'), 'العرضة الثانية من سورة يس');
  });
  test('summaries: a recitation is its surah; a page range names its verses', () => {
    assert.equal(assignmentSummary('RECITATION', a({ fromSurah: 55, toSurah: 55, toAyah: 78 }), name), 'سورة الرحمن');
    assert.equal(assignmentSummary('EXAM', a({}), name), 'من سورة الأحقاف إلى سورة الناس');
    assert.equal(
      assignmentSummary('MEMORIZATION', a({ kind: 'PAGE_RANGE', fromSurah: 2, fromAyah: 62, toSurah: 2, toAyah: 83, fromPage: 10, toPage: 12 }), name),
      'من الصفحة 10 إلى الصفحة 12 (البقرة 62 – البقرة 83)',
    );
  });
  test('Arabic counts', () => {
    assert.deepEqual([1, 2, 3, 10, 11, 100].map((n) => countLabel(n, 'pages')), ['صفحة واحدة', 'صفحتان', '3 صفحات', '10 صفحات', '11 صفحة', '100 صفحة']);
    // after «بين» / «أقل من» the dual takes its genitive form
    assert.deepEqual([1, 2, 3].map((n) => countLabel(n, 'pages', true)), ['صفحة واحدة', 'صفحتين', '3 صفحات']);
    assert.deepEqual([1, 2, 5, 12].map((n) => countLabel(n, 'verses')), ['آية واحدة', 'آيتان', '5 آيات', '12 آية']);
    assert.deepEqual([1, 2, 4, 20].map((n) => countLabel(n, 'hizbs')), ['حزب واحد', 'حزبان', '4 أحزاب', '20 حزبًا']);
    assert.equal(countLabel(2, 'hizbs', true), 'حزبين');
    assert.equal(countLabel(2, 'juz', true), 'جزأين');
  });
  test('Arabic counts of eighths and hizbs', () => {
    assert.deepEqual([1, 2, 3, 10, 11].map((n) => countLabel(n, 'eighths')), ['ثمن واحد', 'ثمنان', '3 أثمان', '10 أثمان', '11 ثمنًا']);
    assert.deepEqual([1, 2, 3].map((n) => countLabel(n, 'hizbs')), ['حزب واحد', 'حزبان', '3 أحزاب']);
  });
  test('precision is never upgraded: exact, bounded, unavailable — concise bounds (unit said once)', () => {
    assert.deepEqual(formatMeasure({ kind: 'exact', value: 3, touched: 3, dataStatus: 'x' }, 'pages'), { text: '3 صفحات', precision: 'exact' });
    assert.deepEqual(formatMeasure({ kind: 'bounded', greaterThan: 0, lessThan: 1, touched: 1, partialAtStart: true, partialAtEnd: true, dataStatus: 'x' }, 'pages'), { text: 'أقل من صفحة', precision: 'bounded' });
    const b = (greaterThan: number, lessThan: number) => ({ kind: 'bounded' as const, greaterThan, lessThan, touched: lessThan, partialAtStart: true, partialAtEnd: false, dataStatus: 'x' });
    assert.deepEqual(formatMeasure(b(2, 3), 'pages'), { text: 'بين صفحتين و3 صفحات', precision: 'bounded' });
    assert.equal(formatMeasure(b(0, 2), 'pages').text, 'أقل من صفحتين');
    assert.equal(formatMeasure(b(1, 2), 'pages').text, 'بين صفحة وصفحتين');
    assert.equal(formatMeasure(b(5, 6), 'pages').text, 'بين 5 و6 صفحات');
    assert.equal(formatMeasure(b(10, 11), 'pages').text, 'بين 10 و11 صفحة');
    assert.equal(formatMeasure(b(47, 48), 'pages').text, 'بين 47 و48 صفحة');
    assert.equal(formatMeasure(b(0, 1), 'hizbs').text, 'أقل من حزب');
    assert.equal(formatMeasure(b(0, 1), 'quarters').text, 'أقل من ربع حزب');
    // an estimate (opt-in on the server) is labelled approximate and keeps its bounds
    assert.deepEqual(formatMeasure({ ...b(2, 3), estimate: { value: 2.43 } }, 'pages'), { text: 'بين صفحتين و3 صفحات (2.4 تقريبًا)', precision: 'estimated' });
    assert.deepEqual(formatMeasure({ kind: 'unavailable', reason: 'r' }, 'hizbs'), { text: 'غير متاح', precision: 'unavailable' });
    // never a line count: the reference has no line positions
    for (const m of [b(2, 3), b(0, 1), b(47, 48)]) assert.doesNotMatch(formatMeasure(m, 'pages').text, /سطر|أسطر/);
  });
  test('hizb amounts in halves: singular, dual, plural, after «من» / «إلى»', () => {
    assert.deepEqual([0.5, 1, 1.5, 2, 2.5, 3, 3.5, 10, 11, 16, 11.5].map((h) => hizbAmount(h)), [
      'نصف حزب', 'حزب واحد', 'حزب ونصف', 'حزبان', 'حزبان ونصف', '3 أحزاب', '3 أحزاب ونصف', '10 أحزاب', '11 حزبًا', '16 حزبًا', '11 حزبًا ونصف',
    ]);
    assert.deepEqual([2, 2.5].map((h) => hizbAmount(h, true)), ['حزبين', 'حزبين ونصف']);
  });
  test('size in hizbs: exact without «تقريبًا», approximate with it, conservative between; nothing below one hizb', () => {
    const eighths = { greaterThan: 0, lessThan: 1 };
    assert.deepEqual(formatHizbEquivalent({ kind: 'exact', hizbs: 1 }), { text: 'حزب واحد', precision: 'exact' });
    assert.equal(formatHizbEquivalent({ kind: 'exact', hizbs: 2 })?.text, 'حزبان');
    assert.equal(formatHizbEquivalent({ kind: 'exact', hizbs: 3 })?.text, '3 أحزاب');
    assert.equal(formatHizbEquivalent({ kind: 'exact', hizbs: 60 })?.text, '60 حزبًا');
    const approx = (hizbs: number) => formatHizbEquivalent({ kind: 'approximate', hizbs, step: 0.5, eighths });
    assert.deepEqual(approx(5), { text: '5 أحزاب تقريبًا', precision: 'approximate' });
    assert.equal(approx(1)?.text, 'حزب واحد تقريبًا');
    assert.equal(approx(1.5)?.text, 'حزب ونصف تقريبًا');
    assert.equal(approx(2)?.text, 'حزبان تقريبًا');
    assert.equal(approx(16)?.text, '16 حزبًا تقريبًا');
    assert.equal(formatHizbEquivalent({ kind: 'between', from: 1.5, to: 2, step: 0.5, eighths })?.text, 'من حزب ونصف إلى حزبين تقريبًا');
    assert.equal(formatHizbEquivalent({ kind: 'between', from: 10, to: 11, step: 1, eighths })?.text, 'من 10 أحزاب إلى 11 حزبًا تقريبًا');
    // below one hizb (for some possible amount): not in hizbs
    assert.equal(approx(0.5), null);
    assert.equal(formatHizbEquivalent({ kind: 'between', from: 0.5, to: 1, step: 0.5, eighths }), null);
    assert.equal(formatHizbEquivalent({ kind: 'unavailable', reason: 'x' }), null);
    assert.equal(formatHizbEquivalent(undefined), null);
  });
  test('verse counts: shown for 1 ≤ verses < 100 only', () => {
    assert.deepEqual([0, 1, 99, 100, 101, 6236].map(showsVerseCount), [false, true, true, false, false, false]);
  });

  describe('workload lines', () => {
    const exact = (value: number) => ({ kind: 'exact' as const, value, touched: value, dataStatus: 'x' });
    const bounded = (greaterThan: number, lessThan: number) => ({ kind: 'bounded' as const, greaterThan, lessThan, touched: lessThan, partialAtStart: true, partialAtEnd: true, dataStatus: 'x' });
    const base: WorkloadSnapshot = { editionId: EDITION_ID, verses: 15, surahs: { whole: 0, touched: 1 }, pages: exact(3), juz: exact(1), hizbs: bounded(0, 1), quarters: exact(1), eighths: exact(1), dataStatus: 'x', authoritative: false };
    const texts = (type: Parameters<typeof workloadLines>[0], w: WorkloadSnapshot) => workloadLines(type, w).lines.map((l) => l.text);
    const approx = (hizbs: number) => ({ kind: 'approximate' as const, hizbs, step: hizbs >= 10 ? 1 : 0.5, eighths: { greaterThan: 0, lessThan: 1 } });

    test('small assignments: verse count (< 100) + pages; no page hint', () => {
      const maryam = { ...base, verses: 39, pages: bounded(2, 3), hizbEquivalent: { kind: 'between' as const, from: 0, to: 0.5, step: 0.5, eighths: {} } };
      assert.deepEqual(workloadSummary('MEMORIZATION', maryam), { text: '39 آية · بين صفحتين و3 صفحات', exact: false, hint: null });
      assert.deepEqual(texts('REVISION', { ...base, verses: 83, pages: bounded(5, 6), hizbEquivalent: approx(0.5) }), ['83 آية', 'بين 5 و6 صفحات']);
    });

    test('large assignments: one size in hizbs, the exact total pages as a hint, no breakdown', () => {
      const baqara = { ...base, verses: 286, pages: bounded(47, 48), hizbsAndPages: { kind: 'bounded' as const, hizbs: 3, pages: { greaterThan: 16, lessThan: 18 }, dataStatus: 'x' }, hizbEquivalent: approx(5) };
      assert.deepEqual(workloadSummary('REVISION', baqara), { text: '5 أحزاب تقريبًا', exact: false, hint: null });
      const saffat = { ...base, verses: 2448, pages: exact(159), hizbEquivalent: approx(16) };
      assert.deepEqual(workloadSummary('REVISION', saffat), { text: '16 حزبًا تقريبًا', exact: false, hint: '159 صفحة' });
      assert.deepEqual(workloadLines('REVISION', saffat).lines.map((l) => [l.unit, l.precision]), [['hizbEquivalent', 'approximate']]);
      const juz30 = { ...base, verses: 564, pages: exact(23), hizbEquivalent: { kind: 'exact' as const, hizbs: 2 } };
      assert.deepEqual(workloadSummary('EXAM', juz30), { text: 'حزبان', exact: true, hint: '23 صفحة' });
      for (const w of [baqara, saffat, juz30]) assert.doesNotMatch(workloadSummary('REVISION', w).text, /صفحة|صفحات|بين/);
      // a short but large assignment keeps its verse count
      assert.deepEqual(texts('MEMORIZATION', { ...base, verses: 67, pages: exact(10), hizbEquivalent: { kind: 'exact', hizbs: 1 } }), ['67 آية', 'حزب واحد']);
    });

    test('verse threshold: 1, 99 shown; 100, 101 hidden', () => {
      for (const [verses, shown] of [[1, true], [99, true], [100, false], [101, false]] as const) {
        assert.equal(texts('REVISION', { ...base, verses }).includes(countLabel(verses, 'verses')), shown, String(verses));
        assert.equal(texts('REVISION', { ...base, verses, hizbEquivalent: approx(2) }).some((t) => /آي/.test(t)), shown, `${verses} (hizbs)`);
      }
    });

    test('snapshots without the size in hizbs (or unavailable): the page measure, never invented', () => {
      assert.deepEqual(workloadSummary('EXAM', { ...base, verses: 300, pages: bounded(47, 48) }), { text: 'بين 47 و48 صفحة', exact: false, hint: null });
      assert.deepEqual(texts('EXAM', { ...base, verses: 300, hizbEquivalent: { kind: 'unavailable', reason: 'x' } }), ['3 صفحات']);
      const empty = { ...base, verses: 300, pages: { kind: 'unavailable' as const, reason: 'x' } };
      assert.deepEqual(workloadSummary('EXAM', empty), { text: '', exact: true, hint: null });
      for (const w of [empty, base]) assert.doesNotMatch(JSON.stringify(workloadSummary('EXAM', w)), /undefined|NaN/);
    });

    test('recitation (عرضة): the verse count below 100, otherwise the size', () => {
      assert.deepEqual(texts('RECITATION', base), ['15 آية']);
      assert.equal(workloadLines('RECITATION', base).hint, null);
      assert.deepEqual(texts('RECITATION', { ...base, verses: 286, pages: bounded(47, 48), hizbEquivalent: approx(5) }), ['5 أحزاب تقريبًا']);
    });

    test('no repeated verification sentence: the status stays in the data only', () => {
      const out = [workloadLines('EXAM', base), workloadSummary('EXAM', base)];
      for (const o of out) {
        assert.ok(!('note' in o));
        assert.doesNotMatch(JSON.stringify(o), /قيد التحقق|مرجع المصحف/);
      }
    });
  });
});

describe('copies (drift)', () => {
  test('clients/quran-reference.data.ts and the app copies are current', () => {
    assert.equal(readFileSync(new URL('./quran-reference.data.ts', import.meta.url), 'utf8'), renderData());
    for (const dir of TARGETS)
      for (const f of ['quran-reference.data.ts', 'work-assignment.ts'])
        assert.equal(readFileSync(`${dir}/${f}`, 'utf8'), renderCopy(f), `${dir}/${f}`);
  });
});

describe('contract with the REAL backend (clients/fixtures/backend-contract.json, from backend/dist)', () => {
  type Case = { type: 'MEMORIZATION' | 'REVISION' | 'RECITATION' | 'EXAM'; payload: Parameters<typeof canonicalOf>[0]; assignment: WorkAssignment; workload: WorkloadSnapshot; defaultDescription: string };
  const cases: Case[] = JSON.parse(readFileSync(new URL('./fixtures/backend-contract.json', import.meta.url), 'utf8'));
  const ARABIC: Record<number, string> = { 110: 'النصر', 2: 'البقرة', 3: 'آل عمران', 36: 'يس', 46: 'الأحقاف', 55: 'الرحمن', 67: 'الملك', 78: 'النبأ', 114: 'الناس' };

  test('every case covered: the four types, all three formats', () => {
    assert.deepEqual(new Set(cases.map((c) => c.type)), new Set(['MEMORIZATION', 'REVISION', 'RECITATION', 'EXAM']));
    assert.deepEqual(new Set(cases.map((c) => c.payload.kind)), new Set(['AYAH_RANGE', 'PAGE_RANGE', 'SURAH_RANGE']));
  });

  test('the client derives the same canonical range and edition as the server', () => {
    for (const c of cases) {
      const { editionId, ...range } = c.assignment;
      assert.equal(editionId, EDITION_ID);
      assert.deepEqual(canonicalOf(c.payload), range, JSON.stringify(c.payload));
      assert.ok(sameAssignment(c.assignment, c.payload));
    }
  });

  test('an item saved by the server re-opens in the form as a valid, unchanged selection', () => {
    for (const c of cases) {
      const d = draftFromAssignment(c.type, c.assignment);
      assert.equal(validateDraft(c.type, d), null, JSON.stringify(c.payload));
      assert.ok(sameAssignment(c.assignment, toPayload(d)), JSON.stringify(c.payload));
    }
  });

  test('the server default description is recognised word for word', () => {
    for (const c of cases) {
      const name = (n: number) => ARABIC[n] ?? '?';
      if (![c.assignment.fromSurah, c.assignment.toSurah].every((n) => ARABIC[n])) continue;
      assert.equal(defaultDescription(c.type, c.assignment, name, c.type === 'RECITATION' ? 'الثانية' : null), c.defaultDescription);
    }
  });

  test('server workloads are displayed with their own precision (never upgraded)', () => {
    for (const c of cases)
      for (const line of workloadLines(c.type, c.workload).lines) {
        if (line.unit === 'verses') continue;
        if (line.unit === 'hizbEquivalent') {
          assert.equal(line.precision, c.workload.hizbEquivalent?.kind === 'exact' ? 'exact' : 'approximate');
          continue;
        }
        assert.equal(line.precision, c.workload[line.unit].kind, `${c.type} ${line.unit}`);
        if (line.precision === 'bounded') assert.match(line.text, /بين|أقل من/);
      }
  });

  test('size in hizbs from one hizb (server value), otherwise pages; verse count below 100; exact page hint', () => {
    for (const c of cases) {
      assert.ok(c.workload.hizbEquivalent, 'the server stores the size in hizbs');
      const { lines, hint } = workloadLines(c.type, c.workload);
      for (const line of lines) {
        if (line.unit === 'verses') continue;
        assert.equal(line.unit, formatHizbEquivalent(c.workload.hizbEquivalent) ? 'hizbEquivalent' : 'pages');
      }
      assert.equal(lines.some((l) => l.unit === 'verses'), c.workload.verses < 100);
      if (hint) assert.equal(c.workload.pages.kind, 'exact');
    }
  });
});

describe('structured-only for new items; free text only for legacy items', () => {
  test('modes: new items structured only; a legacy free-text item may stay free', () => {
    assert.deepEqual(modesForItem('MEMORIZATION', false), ['wholeSurah', 'ayahs', 'pages']);
    assert.deepEqual(modesForItem('REVISION', false), ['surahs']);
    assert.deepEqual(modesForItem('EXAM', false), ['surahs']);
    assert.deepEqual(modesForItem('RECITATION', false), ['surah']);
    assert.deepEqual(modesForItem('REVISION', true), ['surahs', 'free']);
  });
  test('a free-text draft is refused unless the item is legacy free text', () => {
    assert.equal(validateItemDraft('EXAM', freeDraft('EXAM'), false)?.code, 'STRUCTURE_REQUIRED');
    assert.equal(validateItemDraft('EXAM', freeDraft('EXAM'), true), null);
  });
  test('incomplete structured drafts are refused (no fallback)', () => {
    assert.equal(validateItemDraft('MEMORIZATION', emptyDraft('MEMORIZATION'), false)?.code, 'SURAH_REQUIRED');
    assert.equal(validateItemDraft('MEMORIZATION', { ...emptyDraft('MEMORIZATION'), mode: 'pages' }, false)?.code, 'PAGES_REQUIRED');
    assert.equal(validateItemDraft('REVISION', emptyDraft('REVISION'), false)?.code, 'SURAHS_REQUIRED');
    assert.equal(validateItemDraft('RECITATION', emptyDraft('RECITATION'), false)?.code, 'SURAH_REQUIRED');
    // a legacy item converted explicitly needs valid references too
    assert.equal(validateItemDraft('EXAM', emptyDraft('EXAM'), true)?.code, 'SURAHS_REQUIRED');
  });
});

describe('optional ending surah (مراجعة / اختبار)', () => {
  test('only a starting surah: valid; sent as the starting surah alone (canonical); same as naming it twice', () => {
    for (const type of ['REVISION', 'EXAM'] as const) {
      const d = draft(type, { fromSurah: 9, toSurah: null });
      assert.equal(validateDraft(type, d), null);
      assert.deepEqual(toPayload(d), { kind: 'SURAH_RANGE', fromSurah: 9, toSurah: 9 });
      assert.deepEqual(canonicalOf({ kind: 'SURAH_RANGE', fromSurah: 9 }), { kind: 'SURAH_RANGE', fromSurah: 9, fromAyah: 1, toSurah: 9, toAyah: 129, fromPage: null, toPage: null });
    }
  });
  test('two surahs: the inclusive range; reversed refused; the starting surah stays required', () => {
    assert.deepEqual(toPayload(draft('REVISION', { fromSurah: 9, toSurah: 24 })), { kind: 'SURAH_RANGE', fromSurah: 9, toSurah: 24 });
    assert.equal(validateDraft('EXAM', draft('EXAM', { fromSurah: 24, toSurah: 9 }))?.code, 'SURAH_REVERSED');
    assert.equal(validateDraft('EXAM', draft('EXAM', { fromSurah: null, toSurah: 9 }))?.code, 'SURAHS_REQUIRED');
  });
  test('precision without an ending surah: the verses belong to the starting surah', () => {
    const d = draft('EXAM', { fromSurah: 9, toSurah: null, precise: true, fromAyah: '10', toAyah: '40' });
    assert.equal(validateDraft('EXAM', d), null);
    assert.deepEqual(toPayload(d), { kind: 'SURAH_RANGE', fromSurah: 9, toSurah: 9, fromAyah: 10, toAyah: 40 });
    assert.equal(validateDraft('EXAM', { ...d, toAyah: '130' })?.code, 'AYAH_INVALID');
    assert.equal(validateDraft('EXAM', { ...d, fromAyah: '40', toAyah: '10' })?.code, 'RANGE_REVERSED');
  });
  test('editing: a single-surah item re-opens with no ending surah; a multi-surah one with it; both unchanged', () => {
    const one: WorkAssignment = { kind: 'SURAH_RANGE', editionId: EDITION_ID, fromSurah: 9, fromAyah: 1, toSurah: 9, toAyah: 129, fromPage: null, toPage: null };
    const many: WorkAssignment = { ...one, toSurah: 24, toAyah: 64 };
    assert.equal(draftFromAssignment('REVISION', one).toSurah, null);
    assert.equal(draftFromAssignment('REVISION', many).toSurah, 24);
    for (const a of [one, many]) assert.ok(sameAssignment(a, toPayload(draftFromAssignment('EXAM', a))));
    // clearing the ending surah of a multi-surah item: the starting surah alone
    const cleared = { ...draftFromAssignment('REVISION', many), toSurah: null };
    assert.ok(sameAssignment(one, toPayload(cleared)));
  });
  test('switching type keeps the ending surah only when it differs', () => {
    assert.equal(adaptDraft(draft('MEMORIZATION', { fromSurah: 9, toSurah: 9 }), 'REVISION').toSurah, null);
    assert.equal(adaptDraft(draft('EXAM', { fromSurah: 9, toSurah: 24 }), 'REVISION').toSurah, 24);
  });
});

describe('حفظ modes: whole surah, verses (optional end), pages (optional end)', () => {
  const name = (n: number) => ({ 110: 'النصر', 2: 'البقرة' })[n] ?? String(n);
  const memo = (patch: Partial<ReturnType<typeof emptyDraft>>) => ({ ...emptyDraft('MEMORIZATION'), ...patch });
  const saved = (p: ReturnType<typeof toPayload>) => ({ ...canonicalOf(p!)!, editionId: EDITION_ID });

  test('three modes, «بالآيات» by default', () => {
    assert.deepEqual(modesForItem('MEMORIZATION', false), ['wholeSurah', 'ayahs', 'pages']);
    assert.equal(emptyDraft('MEMORIZATION').mode, 'ayahs');
  });

  test('whole surah: only the surah is sent; canonical range from the reference (an-Nasr 110:1–3, al-Baqara 2:1–286)', () => {
    const d = memo({ mode: 'wholeSurah', fromSurah: 110, toSurah: 110, fromAyah: '2', toAyah: '3', fromPage: '79' });
    assert.equal(validateDraft('MEMORIZATION', d), null);
    assert.deepEqual(toPayload(d), { kind: 'AYAH_RANGE', fromSurah: 110, toSurah: 110 }); // stale fields of other modes never sent
    assert.deepEqual(canonicalOf(toPayload(d)!), { kind: 'AYAH_RANGE', fromSurah: 110, fromAyah: 1, toSurah: 110, toAyah: ayahCount(110), fromPage: null, toPage: null });
    assert.equal(ayahCount(110), 3);
    assert.deepEqual(canonicalOf(toPayload(memo({ mode: 'wholeSurah', fromSurah: 2, toSurah: 2 }))!)?.toAyah, 286);
    assert.equal(defaultDescription('MEMORIZATION', saved(toPayload(d)), name, null), 'سورة النصر كاملة');
    assert.equal(validateDraft('MEMORIZATION', memo({ mode: 'wholeSurah' }))?.code, 'SURAH_REQUIRED');
  });

  test('verses: the starting verse is required, the ending one optional', () => {
    const one = memo({ mode: 'ayahs', fromSurah: 2, toSurah: 2, fromAyah: '255' });
    assert.equal(validateDraft('MEMORIZATION', one), null);
    assert.deepEqual(toPayload(one), { kind: 'AYAH_RANGE', fromSurah: 2, fromAyah: 255, toSurah: 2 });
    assert.deepEqual(canonicalOf(toPayload(one)!), { kind: 'AYAH_RANGE', fromSurah: 2, fromAyah: 255, toSurah: 2, toAyah: 255, fromPage: null, toPage: null });
    assert.equal(defaultDescription('MEMORIZATION', saved(toPayload(one)), name, null), 'سورة البقرة: الآية 255');
    const many = { ...one, toAyah: '260' };
    assert.deepEqual(toPayload(many), { kind: 'AYAH_RANGE', fromSurah: 2, fromAyah: 255, toSurah: 2, toAyah: 260 });
    assert.equal(defaultDescription('MEMORIZATION', saved(toPayload(many)), name, null), 'سورة البقرة: من الآية 255 إلى الآية 260');
    // cleared ending verse: back to the single verse
    assert.deepEqual(toPayload({ ...many, toAyah: '' }), toPayload(one));
    assert.equal(validateDraft('MEMORIZATION', { ...one, fromAyah: '' })?.code, 'AYAHS_REQUIRED');
    assert.equal(validateDraft('MEMORIZATION', { ...one, fromAyah: '', toAyah: '260' })?.field, 'fromAyah');
    assert.equal(validateDraft('MEMORIZATION', { ...many, fromAyah: '261' })?.code, 'AYAH_REVERSED');
    assert.equal(validateDraft('MEMORIZATION', { ...one, fromAyah: '287' })?.code, 'AYAH_INVALID');
    assert.equal(validateDraft('MEMORIZATION', { ...one, toAyah: '287' })?.field, 'toAyah');
    assert.equal(validateDraft('MEMORIZATION', memo({ mode: 'ayahs', fromAyah: '1' }))?.code, 'SURAH_REQUIRED');
    // another surah: verses that no longer fit are cleared
    assert.deepEqual([withSurah(many, 110).fromAyah, withSurah(many, 110).toAyah], ['', '']);
    assert.deepEqual([withSurah({ ...one, fromAyah: '2', toAyah: '3' }, 110).fromAyah, withSurah({ ...one, fromAyah: '2', toAyah: '3' }, 110).toAyah], ['2', '3']);
  });

  test('pages: the starting page is required, the ending one optional; printed numbering 2–604', () => {
    const one = memo({ mode: 'pages', fromPage: '79', fromSurah: 2, fromAyah: '5' });
    assert.equal(validateDraft('MEMORIZATION', one), null);
    assert.deepEqual(toPayload(one), { kind: 'PAGE_RANGE', fromPage: 79 }); // no stale surah / verse
    assert.deepEqual([canonicalOf(toPayload(one)!)?.fromPage, canonicalOf(toPayload(one)!)?.toPage], [79, 79]);
    assert.equal(defaultDescription('MEMORIZATION', saved(toPayload(one)), name, null), 'الصفحة 79');
    const many = { ...one, toPage: '82' };
    assert.deepEqual(toPayload(many), { kind: 'PAGE_RANGE', fromPage: 79, toPage: 82 });
    assert.equal(defaultDescription('MEMORIZATION', saved(toPayload(many)), name, null), 'من الصفحة 79 إلى الصفحة 82');
    assert.deepEqual(toPayload({ ...many, toPage: '' }), toPayload(one));
    assert.equal(validateDraft('MEMORIZATION', { ...one, fromPage: '' })?.code, 'PAGES_REQUIRED');
    assert.equal(validateDraft('MEMORIZATION', { ...one, fromPage: '', toPage: '82' })?.field, 'fromPage');
    assert.equal(validateDraft('MEMORIZATION', { ...many, fromPage: '83' })?.code, 'PAGE_REVERSED');
    for (const p of ['1', '605']) assert.equal(validateDraft('MEMORIZATION', { ...one, fromPage: p })?.code, 'PAGE_INVALID');
    assert.equal(validateDraft('MEMORIZATION', { ...one, toPage: '605' })?.field, 'toPage');
  });

  test('re-opening: the right mode and fields; a single verse / page with its end left empty', () => {
    const a = (p: Partial<WorkAssignment>): WorkAssignment => ({ kind: 'AYAH_RANGE', editionId: EDITION_ID, fromSurah: 110, fromAyah: 1, toSurah: 110, toAyah: 3, fromPage: null, toPage: null, ...p });
    assert.deepEqual(draftFromAssignment('MEMORIZATION', a({})), memo({ mode: 'wholeSurah', fromSurah: 110, toSurah: 110 }));
    assert.deepEqual(draftFromAssignment('MEMORIZATION', a({ fromSurah: 2, toSurah: 2, fromAyah: 255, toAyah: 255 })), memo({ mode: 'ayahs', fromSurah: 2, toSurah: 2, fromAyah: '255' }));
    assert.deepEqual(draftFromAssignment('MEMORIZATION', a({ fromSurah: 2, toSurah: 2, fromAyah: 255, toAyah: 260 })), memo({ mode: 'ayahs', fromSurah: 2, toSurah: 2, fromAyah: '255', toAyah: '260' }));
    const page: WorkAssignment = { ...canonicalOf({ kind: 'PAGE_RANGE', fromPage: 79, toPage: 79 })!, editionId: EDITION_ID };
    assert.deepEqual(draftFromAssignment('MEMORIZATION', page), memo({ mode: 'pages', fromPage: '79' }));
    // every re-opened item is valid and unchanged when saved again
    for (const s of [a({}), a({ fromSurah: 2, toSurah: 2, fromAyah: 255, toAyah: 255 }), page]) {
      const d = draftFromAssignment('MEMORIZATION', s);
      assert.equal(validateDraft('MEMORIZATION', d), null);
      assert.ok(sameAssignment(s, toPayload(d)!));
    }
  });

  test('older items: the previous default wording of a whole surah is not shown as a teacher note', () => {
    const nasr: WorkAssignment = { kind: 'AYAH_RANGE', editionId: EDITION_ID, fromSurah: 110, fromAyah: 1, toSurah: 110, toAyah: 3, fromPage: null, toPage: null };
    assert.equal(isDefaultDescription('سورة النصر كاملة', 'MEMORIZATION', nasr, name, null), true);
    assert.equal(isDefaultDescription('سورة النصر: من الآية 1 إلى الآية 3', 'MEMORIZATION', nasr, name, null), true);
    assert.equal(isDefaultDescription('حفظ مع التجويد', 'MEMORIZATION', nasr, name, null), false);
  });
});

describe('«متابعة العرضات» wording (display only)', () => {
  test('al-Mujadila: numbered recitations with their results; «لا تحتسب» only for مؤجلة', () => {
    assert.deepEqual(
      [[1, 'CANCELLED'], [2, 'POSTPONED'], [2, 'COMPLETED'], [3, 'PARTIAL']].map(([n, e]) => recitationLabel(n as number, e as 'CANCELLED')),
      ['العرضة 1 — ملغاة', 'العرضة 2 — مؤجلة · لا تحتسب', 'العرضة 2 — منجزة', 'العرضة 3 — جزئي'],
    );
    assert.equal(nextRecitationText(4), 'التالية: العرضة 4');
    const labels = Object.entries(RECITATION_ENTRY_LABEL);
    assert.deepEqual(labels.filter(([, l]) => /تحتسب/.test(l)).map(([k]) => k), ['POSTPONED']);
    assert.ok(labels.every(([, l]) => !/محتسب|تُحتسب|دورة/.test(l)));
  });
  test('counts: «3 عرضات», never «محتسبة»; compact lines', () => {
    assert.deepEqual([0, 1, 2, 3, 10, 11].map(recitationsCount), ['لا عرضات بعد', 'عرضة واحدة', 'عرضتان', '3 عرضات', '10 عرضات', '11 عرضة']);
    assert.equal(recitationSummaryText('سورة المجادلة', 3), 'سورة المجادلة · 3 عرضات');
    const name = (n: number) => (n === 58 ? 'سورة المجادلة' : 'سورة يس');
    assert.equal(rowRecitationText([{ recitation: { surah: 58, attempts: 3 } }, {}, { recitation: null }], name), 'سورة المجادلة · 3 عرضات');
    assert.equal(rowRecitationText([{}], name), null);
  });
});

describe('compact Work Program rows (display only)', () => {
  test('work kinds in a fixed order, counted when repeated', () => {
    assert.equal(workTypesSummary(['RECITATION', 'MEMORIZATION', 'REVISION']), 'حفظ · مراجعة · عرضة');
    assert.equal(workTypesSummary(['REVISION', 'EXAM', 'REVISION']), 'مراجعة (2) · اختبار');
    assert.equal(workTypesSummary([]), '');
  });
  test('evaluation state in a few words', () => {
    assert.deepEqual(programStatus({ active: 3, completed: 0, pending: 3 }), { kind: 'pending', text: 'لم يُقيَّم بعد' });
    assert.deepEqual(programStatus({ active: 3, completed: 1, pending: 2 }), { kind: 'partial', text: 'قُيِّم جزئيًا · 1/3 منجز' });
    assert.deepEqual(programStatus({ active: 3, completed: 3, pending: 0 }), { kind: 'done', text: 'كل الأعمال منجزة' });
    assert.deepEqual(programStatus({ active: 3, completed: 2, pending: 0 }), { kind: 'unfinished', text: '2/3 منجز' });
    assert.deepEqual(programStatus({ active: 0, completed: 0, pending: 0 }), { kind: 'cancelled', text: 'كل الأعمال ملغاة' });
  });
  test('ordering wording: advisory, never a ranking', () => {
    assert.match(WORKLOAD_ORDER.explanation, /ليس هذا تصنيفًا/);
    assert.doesNotMatch(Object.values(WORKLOAD_ORDER).join(' '), /الأول|الثاني|الثالث|رتبة/);
  });
});

describe('advisory order sections (display only, server order kept)', () => {
  const p = (id: string, comparable: boolean, group: number | null) => ({ id, workloadOrder: { comparable, group } });
  test('usual order: one section; advisory order: groups (labelled when several), then the not comparable ones', () => {
    assert.deepEqual(workloadSections([p('a', true, 0)], false).map((s) => s.kind), ['all']);
    const sections = workloadSections([p('c', true, 0), p('a', true, 1), p('d', true, 1), p('b', false, null)], true);
    assert.deepEqual(
      sections.map((s) => [s.kind, s.label, s.programs.map((x) => x.id)]),
      [
        ['group', null, ['c']],
        ['group', WORKLOAD_ORDER.comparable, ['a', 'd']],
        ['unavailable', WORKLOAD_ORDER.unavailable, ['b']],
      ],
    );
  });
});

describe('«التقييم العام» wording (display only)', () => {
  test('four levels, best first, with their Arabic labels', () => {
    assert.deepEqual(WORK_PERFORMANCES, ['EXCELLENT', 'VERY_GOOD', 'GOOD', 'NEEDS_IMPROVEMENT']);
    assert.deepEqual(WORK_PERFORMANCES.map((l) => PERFORMANCE_LABEL[l]), ['ممتاز', 'جيد جدًا', 'جيد', 'يحتاج تحسين']);
  });
  test('row indicator only when given; the empty state reads differently from an unevaluated item', () => {
    assert.equal(overallRowText('VERY_GOOD'), 'التقييم العام: جيد جدًا');
    assert.equal(overallRowText(null), null);
    assert.equal(OVERALL_EVALUATION.none, 'لم يُحدَّد التقييم العام بعد');
    assert.notEqual(OVERALL_EVALUATION.none, 'لم يُقيَّم بعد');
  });
  test('blocked wording of its own (not the items’ message repeated)', () => {
    assert.match(OVERALL_BLOCKED.notStarted, /بعد بداية الحصة/);
    assert.match(OVERALL_BLOCKED.cancelled, /ملغاة/);
  });
  test('an explicit correction; a pending-items note that never blocks', () => {
    assert.equal(overallChangeText('GOOD', 'EXCELLENT'), 'تغيير التقييم العام من «جيد» إلى «ممتاز»');
    assert.equal(overallPendingNote(0), null);
    assert.match(overallPendingNote(1) ?? '', /^عمل واحد لم يُقيَّم بعد — يمكن/);
    assert.match(overallPendingNote(2) ?? '', /^عملان لم يُقيَّما بعد/);
    assert.match(overallPendingNote(3) ?? '', /^3 أعمال لم تُقيَّم بعد/);
  });
});

describe('program cards (display only)', () => {
  test('work-type badges in a fixed order, counted when repeated', () => {
    assert.deepEqual(workTypeBadges(['EXAM', 'RECITATION', 'MEMORIZATION', 'EXAM', 'REVISION']).map((b) => b.label), ['حفظ', 'مراجعة', 'عرضة', 'اختبار (2)']);
    assert.deepEqual(workTypeBadges([]), []);
  });
  test('completion: exact, concise, one part per result', () => {
    assert.equal(completionText(['COMPLETED', 'COMPLETED']), '2 منجزان');
    assert.equal(completionText(['CANCELLED', 'COMPLETED', 'CANCELLED', 'CANCELLED', 'CANCELLED']), '1 منجز · 4 ملغاة');
    assert.equal(completionText(['PARTIAL', 'COMPLETED']), '1 منجز · 1 جزئي');
    assert.equal(completionText(['NOT_EVALUATED', 'NOT_EVALUATED']), '2 بانتظار التقييم');
    assert.equal(completionText(['COMPLETED', 'COMPLETED', 'COMPLETED', 'NOT_COMPLETED', 'POSTPONED']), '3 منجزة · 1 غير منجز · 1 مؤجل');
    assert.deepEqual(completionParts(['CANCELLED']).map((p) => [p.status, p.count]), [['CANCELLED', 1]]);
    // never «كل الأعمال منجزة» (even with dropped items)
    assert.doesNotMatch(completionText(['COMPLETED', 'CANCELLED']), /كل الأعمال/);
  });
});
