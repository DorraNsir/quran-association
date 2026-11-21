import {
  WorkAssignmentKind as K,
  WorkType as T,
} from '../generated/prisma/enums.js';
import {
  ACTIVE_EDITION_ID,
  describeAssignment,
  isGeneratedDescription,
  presentWorkload,
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
      // an ending ayah without its starting ayah
      expect(
        code(() =>
          resolveAssignment(T.MEMORIZATION, {
            kind: K.AYAH_RANGE,
            fromSurah: 2,
            toSurah: 2,
            toAyah: 5,
          }),
        ),
      ).toBe('WORK_ASSIGNMENT_FORMAT');
      // no starting page
      expect(
        code(() =>
          resolveAssignment(T.MEMORIZATION, { kind: K.PAGE_RANGE, toPage: 5 }),
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

  describe('optional ending surah (مراجعة / اختبار)', () => {
    it('omitted: the starting surah alone, stored canonically (toSurah = fromSurah, never empty)', () => {
      for (const type of [T.REVISION, T.EXAM]) {
        const a = resolveAssignment(type, {
          kind: K.SURAH_RANGE,
          fromSurah: 9,
        });
        expect([
          a.quranFromSurah,
          a.quranFromAyah,
          a.quranToSurah,
          a.quranToAyah,
        ]).toEqual([9, 1, 9, 129]);
        expect(a.quranWorkload.verses).toBe(129);
        expect(describeAssignment(type, a, null)).toBe('سورة التوبة');
        expect(
          sameAssignment(
            a,
            resolveAssignment(type, {
              kind: K.SURAH_RANGE,
              fromSurah: 9,
              toSurah: 9,
            }),
          ),
        ).toBe(true);
      }
    });
    it('both surahs: the whole inclusive range', () => {
      const a = resolveAssignment(T.REVISION, {
        kind: K.SURAH_RANGE,
        fromSurah: 9,
        toSurah: 24,
      });
      expect([
        a.quranFromSurah,
        a.quranFromAyah,
        a.quranToSurah,
        a.quranToAyah,
      ]).toEqual([9, 1, 24, 64]);
      expect(describeAssignment(T.REVISION, a, null)).toBe(
        'من سورة التوبة إلى سورة النور',
      );
    });
    it('precision without an ending surah: the verses belong to the starting surah', () => {
      const a = resolveAssignment(T.EXAM, {
        kind: K.SURAH_RANGE,
        fromSurah: 9,
        fromAyah: 10,
        toAyah: 40,
      });
      expect([
        a.quranFromSurah,
        a.quranFromAyah,
        a.quranToSurah,
        a.quranToAyah,
      ]).toEqual([9, 10, 9, 40]);
      expect(
        code(() =>
          resolveAssignment(T.EXAM, {
            kind: K.SURAH_RANGE,
            fromSurah: 9,
            toAyah: 130,
          }),
        ),
      ).toBe('WORK_ASSIGNMENT_REFERENCE');
      expect(
        code(() =>
          resolveAssignment(T.EXAM, {
            kind: K.SURAH_RANGE,
            fromSurah: 9,
            fromAyah: 40,
            toAyah: 10,
          }),
        ),
      ).toBe('WORK_ASSIGNMENT_REVERSED');
    });
    it('still refused: no starting surah, reversed surahs; verse ranges of حفظ still name both', () => {
      expect(
        code(() =>
          resolveAssignment(T.REVISION, { kind: K.SURAH_RANGE, toSurah: 9 }),
        ),
      ).toBe('WORK_ASSIGNMENT_FORMAT');
      expect(
        code(() =>
          resolveAssignment(T.REVISION, {
            kind: K.SURAH_RANGE,
            fromSurah: 24,
            toSurah: 9,
          }),
        ),
      ).toBe('WORK_ASSIGNMENT_REVERSED');
      expect(
        code(() =>
          resolveAssignment(T.MEMORIZATION, {
            kind: K.AYAH_RANGE,
            fromSurah: 2,
            fromAyah: 1,
            toAyah: 5,
          }),
        ),
      ).toBe('WORK_ASSIGNMENT_FORMAT');
    });
  });

  describe('complete hizbs + remaining pages in the stored workload', () => {
    it('exact when the range is whole hizbs; bounded remainder otherwise; unavailable without a complete hizb', () => {
      const juz30 = resolveAssignment(T.REVISION, {
        kind: K.SURAH_RANGE,
        fromSurah: 78,
        toSurah: 114,
      }).quranWorkload;
      expect(juz30.hizbsAndPages).toMatchObject({
        kind: 'exact',
        hizbs: 2,
        pages: 0,
      });
      const tawba = resolveAssignment(T.REVISION, {
        kind: K.SURAH_RANGE,
        fromSurah: 9,
      }).quranWorkload;
      expect(tawba.hizbsAndPages).toMatchObject({ kind: 'bounded', hizbs: 1 });
      expect(tawba.pages).toMatchObject({ kind: 'exact', value: 21 }); // whole pages, but hizb boundaries fall mid-page
      const short = resolveAssignment(T.MEMORIZATION, {
        kind: K.AYAH_RANGE,
        fromSurah: 19,
        fromAyah: 12,
        toSurah: 19,
        toAyah: 50,
      }).quranWorkload;
      expect(short.hizbsAndPages.kind).toBe('unavailable');
    });
  });

  describe('complete hizbs + remaining eighths in the stored workload (additive)', () => {
    const snap = (
      input: Parameters<typeof resolveAssignment>[1],
      type: Parameters<typeof resolveAssignment>[0] = T.REVISION,
    ) => resolveAssignment(type, input).quranWorkload;

    it('every new snapshot carries it, next to the unchanged fields', () => {
      const tawba = snap({ kind: K.SURAH_RANGE, fromSurah: 9 });
      // at-Tawba: pages bounded in the hizbs + pages form, exact in eighths
      expect(tawba.hizbsAndEighths).toEqual({
        kind: 'exact',
        hizbs: 1,
        eighths: 9,
        dataStatus: expect.any(String),
      });
      expect(tawba.hizbsAndPages).toMatchObject({ kind: 'bounded', hizbs: 1 });
      expect(tawba).toMatchObject({
        schemaVersion: 1,
        editionId: 'qalun-abi-nashit-tn-hannibal-mualim-v1',
        verses: 129,
        pages: { kind: 'exact', value: 21 },
        authoritative: false,
      });
    });

    it('exact, bounded and unavailable, with the strict hizb 1 (al-Fatiha)', () => {
      expect(
        snap({ kind: K.SURAH_RANGE, fromSurah: 78, toSurah: 114 })
          .hizbsAndEighths,
      ).toMatchObject({ kind: 'exact', hizbs: 2, eighths: 0 });
      expect(
        snap({ kind: K.SURAH_RANGE, fromSurah: 1, toSurah: 2 }).hizbsAndEighths,
      ).toMatchObject({ kind: 'exact', hizbs: 4, eighths: 7 });
      expect(
        snap({ kind: K.SURAH_RANGE, fromSurah: 2 }).hizbsAndEighths,
      ).toMatchObject({
        kind: 'bounded',
        hizbs: 3,
        eighths: { greaterThan: 14, lessThan: 15 },
      });
      expect(
        snap(
          {
            kind: K.AYAH_RANGE,
            fromSurah: 19,
            fromAyah: 12,
            toSurah: 19,
            toAyah: 50,
          },
          T.MEMORIZATION,
        ).hizbsAndEighths?.kind,
      ).toBe('unavailable');
      // a page range gets it too
      expect(
        snap({ kind: K.PAGE_RANGE, fromPage: 582, toPage: 604 }, T.MEMORIZATION)
          .hizbsAndEighths,
      ).toMatchObject({
        kind: 'exact',
        hizbs: 2,
        eighths: 0,
      });
    });
  });

  describe('approximate size in hizbs (display measure)', () => {
    const snap = (input: Parameters<typeof resolveAssignment>[1]) =>
      resolveAssignment(T.REVISION, input).quranWorkload;

    it('stored with new snapshots: about 5 for al-Baqara, about 16 for aṣ-Ṣāffāt → an-Nās, exact for juz 30', () => {
      expect(
        snap({ kind: K.SURAH_RANGE, fromSurah: 2 }).hizbEquivalent,
      ).toMatchObject({ kind: 'approximate', hizbs: 5 });
      const saffat = snap({ kind: K.SURAH_RANGE, fromSurah: 37, toSurah: 114 });
      expect(saffat.hizbEquivalent).toMatchObject({
        kind: 'approximate',
        hizbs: 16,
        step: 1,
      });
      expect(saffat.pages).toMatchObject({ kind: 'exact', value: 159 });
      expect(
        snap({ kind: K.SURAH_RANGE, fromSurah: 78, toSurah: 114 })
          .hizbEquivalent,
      ).toEqual({ kind: 'exact', hizbs: 2 });
    });

    it('an older snapshot: derived from its own stored measures at read time, the stored object untouched', () => {
      const { hizbEquivalent: expected, ...older } = snap({
        kind: K.SURAH_RANGE,
        fromSurah: 2,
      });
      const before = structuredClone(older);
      const served = presentWorkload(
        older as unknown as Record<string, unknown>,
      );
      expect(served?.hizbEquivalent).toEqual(expected);
      expect(older).toEqual(before); // not mutated
      // a stored value is served as stored (never re-derived)
      const stored = {
        ...older,
        hizbEquivalent: { kind: 'unavailable', reason: 'kept' },
      };
      expect(presentWorkload(stored)?.hizbEquivalent).toEqual({
        kind: 'unavailable',
        reason: 'kept',
      });
      // without the strict measures: served as is; null stays null
      expect(presentWorkload({ verses: 3 })).toEqual({ verses: 3 });
      expect(presentWorkload(null)).toBeNull();
    });
  });

  describe('حفظ modes: whole surah, verses (optional end), pages (optional end)', () => {
    const memo = (input: Parameters<typeof resolveAssignment>[1]) =>
      resolveAssignment(T.MEMORIZATION, input);
    const range = (a: ReturnType<typeof memo>) => [
      a.quranAssignmentKind,
      a.quranFromSurah,
      a.quranFromAyah,
      a.quranToSurah,
      a.quranToAyah,
      a.quranFromPage,
      a.quranToPage,
    ];

    it('whole surah: only the surah — stored as its full verse range from the reference (an-Nasr, al-Baqara)', () => {
      const nasr = memo({ kind: K.AYAH_RANGE, fromSurah: 110, toSurah: 110 });
      expect(range(nasr)).toEqual([
        K.AYAH_RANGE,
        110,
        1,
        110,
        QALUN_TN_V1.surahs[109]!.ayahCount,
        null,
        null,
      ]);
      expect(nasr.quranToAyah).toBe(3);
      expect(describeAssignment(T.MEMORIZATION, nasr, null)).toBe(
        'سورة النصر كاملة',
      );
      expect(nasr.quranWorkload).toMatchObject({
        verses: 3,
        editionId: ACTIVE_EDITION_ID,
        authoritative: false,
      });
      const baqara = memo({ kind: K.AYAH_RANGE, fromSurah: 2, toSurah: 2 });
      expect(range(baqara)).toEqual([K.AYAH_RANGE, 2, 1, 2, 286, null, null]);
      expect(describeAssignment(T.MEMORIZATION, baqara, null)).toBe(
        'سورة البقرة كاملة',
      );
      expect(baqara.quranWorkload.hizbEquivalent).toMatchObject({
        kind: 'approximate',
        hizbs: 5,
      });
      // the same verses typed in by hand: the same stored assignment (same workload)
      expect(
        range(
          memo({
            kind: K.AYAH_RANGE,
            fromSurah: 110,
            fromAyah: 1,
            toSurah: 110,
            toAyah: 3,
          }),
        ),
      ).toEqual(range(nasr));
    });

    it('verses: a starting verse alone is that verse; both give the inclusive range', () => {
      const one = memo({
        kind: K.AYAH_RANGE,
        fromSurah: 2,
        fromAyah: 255,
        toSurah: 2,
      });
      expect(range(one)).toEqual([K.AYAH_RANGE, 2, 255, 2, 255, null, null]);
      expect(describeAssignment(T.MEMORIZATION, one, null)).toBe(
        'سورة البقرة: الآية 255',
      );
      expect(one.quranWorkload.verses).toBe(1);
      const many = memo({
        kind: K.AYAH_RANGE,
        fromSurah: 2,
        fromAyah: 255,
        toSurah: 2,
        toAyah: 260,
      });
      expect(range(many)).toEqual([K.AYAH_RANGE, 2, 255, 2, 260, null, null]);
      expect(describeAssignment(T.MEMORIZATION, many, null)).toBe(
        'سورة البقرة: من الآية 255 إلى الآية 260',
      );
      expect(
        code(() =>
          memo({
            kind: K.AYAH_RANGE,
            fromSurah: 2,
            fromAyah: 260,
            toSurah: 2,
            toAyah: 255,
          }),
        ),
      ).toBe('WORK_ASSIGNMENT_REVERSED');
      expect(
        code(() =>
          memo({
            kind: K.AYAH_RANGE,
            fromSurah: 110,
            fromAyah: 4,
            toSurah: 110,
          }),
        ),
      ).toBe('WORK_ASSIGNMENT_REFERENCE');
      expect(
        code(() => memo({ kind: K.AYAH_RANGE, fromSurah: 115, toSurah: 115 })),
      ).toBe('WORK_ASSIGNMENT_REFERENCE');
    });

    it('pages: a starting page alone is that page; printed numbering 2–604; reversed refused', () => {
      const one = memo({ kind: K.PAGE_RANGE, fromPage: 79 });
      expect([one.quranFromPage, one.quranToPage]).toEqual([79, 79]);
      expect(describeAssignment(T.MEMORIZATION, one, null)).toBe('الصفحة 79');
      const many = memo({ kind: K.PAGE_RANGE, fromPage: 79, toPage: 82 });
      expect([many.quranFromPage, many.quranToPage]).toEqual([79, 82]);
      expect(describeAssignment(T.MEMORIZATION, many, null)).toBe(
        'من الصفحة 79 إلى الصفحة 82',
      );
      expect(many.quranWorkload.pages).toMatchObject({
        kind: 'exact',
        value: 4,
      });
      expect(
        code(() => memo({ kind: K.PAGE_RANGE, fromPage: 82, toPage: 79 })),
      ).toBe('WORK_ASSIGNMENT_REVERSED');
      for (const p of [1, 605])
        expect(code(() => memo({ kind: K.PAGE_RANGE, fromPage: p }))).toBe(
          'WORK_ASSIGNMENT_REFERENCE',
        );
      expect(memo({ kind: K.PAGE_RANGE, fromPage: 2 }).quranFromSurah).toBe(1);
      expect(memo({ kind: K.PAGE_RANGE, fromPage: 604 }).quranToSurah).toBe(
        114,
      );
    });

    it('older default wording of a whole-surah حفظ is still recognised as the server text', () => {
      const nasr = memo({ kind: K.AYAH_RANGE, fromSurah: 110, toSurah: 110 });
      expect(
        isGeneratedDescription('سورة النصر كاملة', T.MEMORIZATION, nasr, null),
      ).toBe(true);
      expect(
        isGeneratedDescription(
          'سورة النصر: من الآية 1 إلى الآية 3',
          T.MEMORIZATION,
          nasr,
          null,
        ),
      ).toBe(true);
      expect(
        isGeneratedDescription('حفظ مع التجويد', T.MEMORIZATION, nasr, null),
      ).toBe(false);
    });
  });
});
