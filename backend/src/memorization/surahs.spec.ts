import { SURAH_COUNT, surahName, surahNameLatin } from './surahs.js';

describe('canonical surahs', () => {
  it('has the 114 surahs in mushaf order', () => {
    expect(SURAH_COUNT).toBe(114);
    expect(surahName(1)).toBe('الفاتحة');
    expect(surahName(2)).toBe('البقرة');
    expect(surahName(3)).toBe('آل عمران');
    expect(surahName(114)).toBe('الناس');
    expect(surahNameLatin(114)).toBe('An-Nas');
    for (let n = 1; n <= 114; n++) expect(surahName(n)).toBeTruthy();
    expect(surahName(0)).toBeUndefined();
    expect(surahName(115)).toBeUndefined();
  });
});
