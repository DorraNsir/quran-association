import {
  WorkAssignmentKind as K,
  WorkType as T,
} from '../generated/prisma/enums.js';
import {
  ACTIVE_EDITION_ID,
  describeAssignment,
  resolveAssignment,
  sameAssignment,
} from './quran-assignment.js';
import { QALUN_TN_V1 } from './generated/qalun-tn-v1.data.js';

const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return (e as { getResponse: () => { code: string } }).getResponse().code;
  }
  return 'NO_ERROR';
};

describe('structured Quranic assignments (Qalun, Tunisian edition)', () => {
  it('the active edition is the generated Qalun dataset (6236 verses, Kufan count)', () => {
    expect(ACTIVE_EDITION_ID).toBe(QALUN_TN_V1.editionId);
    expect(QALUN_TN_V1.totalAyahs).toBe(6236);
    expect(QALUN_TN_V1.countingSystem).toBe('KUFI');
  });

  describe('حفظ — MEMORIZATION', () => {
    it('one surah, ayah range → canonical range, edition, server workload', () => {
      const a = resolveAssignment(T.MEMORIZATION, {
        kind: K.AYAH_RANGE,
        fromSurah: 2,
        fromAyah: 6,
        toSurah: 2,
        toAyah: 20,
      });
      expect(a).toMatchObject({
        quranFromSurah: 2,
        quranFromAyah: 6,
        quranToSurah: 2,
        quranToAyah: 20,
        quranFromPage: null,
        quranEditionId: ACTIVE_EDITION_ID,
      });
      expect(a.quranWorkload).toMatchObject({
        verses: 15,
        editionId: ACTIVE_EDITION_ID,
        authoritative: false,
      });
      expect(a.quranWorkload.pages.kind).toBe('bounded'); // partial pages are never exact
      expect(a.quranWorkload.datasetSha256).toBe(QALUN_TN_V1.sourceSha256);
    });

    it('page range → whole pages, exact; the verse range of those pages of THIS edition', () => {
      const a = resolveAssignment(T.MEMORIZATION, {
        kind: K.PAGE_RANGE,
        fromPage: 10,
        toPage: 12,
      });
      expect(a.quranWorkload.pages).toMatchObject({ kind: 'exact', value: 3 });
      expect([a.quranFromPage, a.quranToPage]).toEqual([10, 12]);
      // page 592 of this Qalun edition starts at 87:15 (the Hafs layout would give 87:16)
      const p = resolveAssignment(T.MEMORIZATION, {
        kind: K.PAGE_RANGE,
        fromPage: 592,
        toPage: 592,
      });
      expect([p.quranFromSurah, p.quranFromAyah]).toEqual([87, 15]);
    });

    it('refused: two surahs, conflicting formats, missing ayahs, surah-range format', () => {
      expect(
        code(() =>
          resolveAssignment(T.MEMORIZATION, {
            kind: K.AYAH_RANGE,
            fromSurah: 2,
            fromAyah: 280,
            toSurah: 3,
            toAyah: 5,
          }),
        ),
      ).toBe('WORK_ASSIGNMENT_FORMAT');
      expect(
        code(() =>
          resolveAssignment(T.MEMORIZATION, {
            kind: K.AYAH_RANGE,
            fromSurah: 2,
            fromAyah: 1,
            toSurah: 2,
            toAyah: 5,
            fromPage: 2,
          }),
        ),
      ).toBe('WORK_ASSIGNMENT_FORMAT');
      expect(
        code(() =>
          resolveAssignment(T.MEMORIZATION, {
            kind: K.PAGE_RANGE,
            fromPage: 2,
            toPage: 3,
            fromSurah: 2,
          }),
        ),
      ).toBe('WORK_ASSIGNMENT_FORMAT');
      expect(
        code(() =>
          resolveAssignment(T.MEMORIZATION, {
            kind: K.AYAH_RANGE,
            fromSurah: 2,
            toSurah: 2,
          }),
        ),
      ).toBe('WORK_ASSIGNMENT_FORMAT');
      expect(
        code(() =>
          resolveAssignment(T.MEMORIZATION, {
            kind: K.SURAH_RANGE,
            fromSurah: 2,
            toSurah: 2,
          }),
        ),
      ).toBe('WORK_ASSIGNMENT_FORMAT');
    });

    it('refused: invalid and reversed references', () => {
      expect(
        code(() =>
          resolveAssignment(T.MEMORIZATION, {
            kind: K.AYAH_RANGE,
            fromSurah: 2,
            fromAyah: 1,
            toSurah: 2,
            toAyah: 287,
          }),
        ),
      ).toBe('WORK_ASSIGNMENT_REFERENCE');
      expect(
        code(() =>
          resolveAssignment(T.MEMORIZATION, {
            kind: K.AYAH_RANGE,
            fromSurah: 2,
            fromAyah: 20,
            toSurah: 2,
            toAyah: 6,
          }),
        ),
      ).toBe('WORK_ASSIGNMENT_REVERSED');
      expect(
        code(() =>
          resolveAssignment(T.MEMORIZATION, {
            kind: K.PAGE_RANGE,
            fromPage: 1,
            toPage: 3,
          }),
        ),
      ).toBe('WORK_ASSIGNMENT_REFERENCE'); // no page 1
      expect(
        code(() =>
          resolveAssignment(T.MEMORIZATION, {
            kind: K.PAGE_RANGE,
            fromPage: 600,
            toPage: 605,
          }),
        ),
      ).toBe('WORK_ASSIGNMENT_REFERENCE');
      expect(
        code(() =>
          resolveAssignment(T.MEMORIZATION, {
            kind: K.PAGE_RANGE,
            fromPage: 12,
            toPage: 10,
          }),
        ),
      ).toBe('WORK_ASSIGNMENT_REVERSED');
    });
  });

  describe('مراجعة / اختبار — REVISION, EXAM', () => {
    it('surah range, whole surahs by default, ayah precision optional', () => {
      for (const type of [T.REVISION, T.EXAM]) {
        const whole = resolveAssignment(type, {
          kind: K.SURAH_RANGE,
          fromSurah: 78,
          toSurah: 114,
        });
        expect([
          whole.quranFromSurah,
          whole.quranFromAyah,
          whole.quranToSurah,
          whole.quranToAyah,
        ]).toEqual([78, 1, 114, 6]);
        expect(whole.quranWorkload.juz).toMatchObject({
          kind: 'exact',
          value: 1,
        });
        const precise = resolveAssignment(type, {
          kind: K.SURAH_RANGE,
          fromSurah: 2,
          fromAyah: 142,
          toSurah: 3,
          toAyah: 91,
        });
        expect(precise.quranWorkload.verses).toBe(286 - 142 + 1 + 91);
        expect(precise.quranWorkload.surahs).toEqual({ whole: 0, touched: 2 });
      }
    });

    it('refused: reversed surahs, ayah outside its surah, page or ayah-range formats', () => {
      expect(
        code(() =>
          resolveAssignment(T.REVISION, {
            kind: K.SURAH_RANGE,
            fromSurah: 5,
            toSurah: 3,
          }),
        ),
      ).toBe('WORK_ASSIGNMENT_REVERSED');
      expect(
        code(() =>
          resolveAssignment(T.EXAM, {
            kind: K.SURAH_RANGE,
            fromSurah: 1,
            fromAyah: 8,
            toSurah: 2,
          }),
        ),
      ).toBe('WORK_ASSIGNMENT_REFERENCE');
      expect(
        code(() =>
          resolveAssignment(T.REVISION, {
            kind: K.SURAH_RANGE,
            fromSurah: 3,
            fromAyah: 20,
            toSurah: 3,
            toAyah: 10,
          }),
        ),
      ).toBe('WORK_ASSIGNMENT_REVERSED');
      expect(
        code(() =>
          resolveAssignment(T.REVISION, {
            kind: K.PAGE_RANGE,
            fromPage: 2,
            toPage: 3,
          }),
        ),
      ).toBe('WORK_ASSIGNMENT_FORMAT');
      expect(
        code(() =>
          resolveAssignment(T.EXAM, {
            kind: K.AYAH_RANGE,
            fromSurah: 2,
            fromAyah: 1,
            toSurah: 2,
            toAyah: 5,
          }),
        ),
      ).toBe('WORK_ASSIGNMENT_FORMAT');
      expect(
        code(() =>
          resolveAssignment(T.EXAM, {
            kind: K.SURAH_RANGE,
            fromSurah: 115,
            toSurah: 115,
          }),
        ),
      ).toBe('WORK_ASSIGNMENT_REFERENCE');
    });
  });

  describe('عرضة — RECITATION', () => {
    it('exactly one complete surah', () => {
      const a = resolveAssignment(T.RECITATION, {
        kind: K.SURAH_RANGE,
        fromSurah: 36,
        toSurah: 36,
      });
      expect([a.quranFromAyah, a.quranToAyah]).toEqual([1, 83]);
      expect(a.quranWorkload.surahs).toEqual({ whole: 1, touched: 1 });
    });
    it('refused: several surahs, ayahs, pages', () => {
      expect(
        code(() =>
          resolveAssignment(T.RECITATION, {
            kind: K.SURAH_RANGE,
            fromSurah: 36,
            toSurah: 37,
          }),
        ),
      ).toBe('WORK_ASSIGNMENT_FORMAT');
      expect(
        code(() =>
          resolveAssignment(T.RECITATION, {
            kind: K.SURAH_RANGE,
            fromSurah: 36,
            fromAyah: 1,
            toSurah: 36,
          }),
        ),
      ).toBe('WORK_ASSIGNMENT_FORMAT');
      expect(
        code(() =>
          resolveAssignment(T.RECITATION, {
            kind: K.PAGE_RANGE,
            fromPage: 440,
            toPage: 445,
          }),
        ),
      ).toBe('WORK_ASSIGNMENT_FORMAT');
    });
  });

  it('default Arabic descriptions', () => {
    const d = (
      type: T,
      input: Parameters<typeof resolveAssignment>[1],
      ord: string | null = null,
    ) => describeAssignment(type, resolveAssignment(type, input), ord);
    expect(
      d(T.MEMORIZATION, {
        kind: K.AYAH_RANGE,
        fromSurah: 2,
        fromAyah: 6,
        toSurah: 2,
        toAyah: 20,
      }),
    ).toBe('سورة البقرة: من الآية 6 إلى الآية 20');
    expect(
      d(T.MEMORIZATION, { kind: K.PAGE_RANGE, fromPage: 10, toPage: 12 }),
    ).toBe('من الصفحة 10 إلى الصفحة 12');
    expect(
      d(T.REVISION, { kind: K.SURAH_RANGE, fromSurah: 78, toSurah: 114 }),
    ).toBe('من سورة النبأ إلى سورة الناس');
    expect(d(T.EXAM, { kind: K.SURAH_RANGE, fromSurah: 67, toSurah: 67 })).toBe(
      'سورة الملك',
    );
    expect(
      d(
        T.RECITATION,
        { kind: K.SURAH_RANGE, fromSurah: 36, toSurah: 36 },
        'الثانية',
      ),
    ).toBe('العرضة الثانية من سورة يس');
  });

  it('sameAssignment compares format, edition, range and pages (not the workload)', () => {
    const a = resolveAssignment(T.REVISION, {
      kind: K.SURAH_RANGE,
      fromSurah: 1,
      toSurah: 2,
    });
    const b = resolveAssignment(T.EXAM, {
      kind: K.SURAH_RANGE,
      fromSurah: 1,
      toSurah: 2,
    });
    expect(sameAssignment(a, b)).toBe(true);
    expect(sameAssignment(a, null)).toBe(false);
    expect(sameAssignment(null, null)).toBe(true);
  });
});
