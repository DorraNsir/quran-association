import { normalizeArabic, searchSurahs, SURAH_COUNT, SURAHS, surahByNumber, surahLabel } from './surahs';

// Node's fs through Jest (the app's tsconfig loads no Node types); Jest runs from mobile/
const { readFileSync } = jest.requireActual('fs') as { readFileSync: (path: string, encoding: 'utf8') => string };

describe('surah reference data (copied from the project, never generated)', () => {
  it('114 surahs, numbered 1…114 in mushaf order', () => {
    expect(SURAHS).toHaveLength(SURAH_COUNT);
    expect(SURAHS.map((s) => s.number)).toEqual(Array.from({ length: 114 }, (_, i) => i + 1));
  });

  it('identical to the web reference file (frontend/src/lib/quran/surahs.ts)', () => {
    const web = readFileSync('../frontend/src/lib/quran/surahs.ts', 'utf8');
    const entries = [...web.matchAll(/\{ number: (\d+), nameAr: "([^"]+)", nameLatin: "([^"]+)" \}/g)].map((m) => ({
      number: Number(m[1]),
      nameAr: m[2],
      nameLatin: m[3],
    }));
    expect(entries).toHaveLength(114);
    expect(SURAHS).toEqual(entries);
  });

  it('lookup and label; out-of-range numbers give nothing', () => {
    expect(surahByNumber(78)?.nameAr).toBe('النبأ');
    expect(surahLabel(114)).toBe('سورة الناس');
    expect(surahByNumber(0)).toBeUndefined();
    expect(surahByNumber(115)).toBeUndefined();
    expect(surahByNumber(1.5)).toBeUndefined();
    expect(surahLabel(0)).toBe('—');
  });
});

describe('surah search (the web combobox rules)', () => {
  it('by Arabic name, ignoring hamza forms, tashkeel and taa marbuta', () => {
    expect(searchSurahs('ابراهيم').map((s) => s.number)).toEqual([14]);
    expect(searchSurahs('الْمُلْك').map((s) => s.number)).toContain(67);
    expect(searchSurahs('الفاتحه').map((s) => s.number)).toEqual([1]);
  });

  it('by transliteration (with or without dashes, any case) and by number', () => {
    expect(searchSurahs('an-nas').map((s) => s.number)).toContain(114);
    expect(searchSurahs('annas').map((s) => s.number)).toContain(114);
    expect(searchSurahs('78').map((s) => s.number)).toContain(78);
  });

  it('empty query → all; no match → none', () => {
    expect(searchSurahs('  ')).toHaveLength(114);
    expect(searchSurahs('zzzz')).toHaveLength(0);
  });

  it('normalization', () => {
    expect(normalizeArabic('  أَحْمَدُ  آمنة ـ ')).toBe('احمد امنه');
  });
});
