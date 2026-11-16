import {
  dayOfMonth,
  formatCountOf,
  formatDate,
  formatDateCompact,
  formatDateLong,
  formatDayMonth,
  formatMonth,
  formatPercent,
  ltr,
  sameYear,
  weekdayOf,
} from './format';

describe('Arabic dates (same names as the web, ar-TN-u-nu-latn)', () => {
  it('full date with weekday', () => {
    expect(formatDateLong('2026-11-16')).toBe('الاثنين 16 نوفمبر 2026');
    expect(formatDateLong('2026-11-15')).toBe('الأحد 15 نوفمبر 2026');
  });

  it('compact card date', () => {
    expect(formatDateCompact('2026-11-17')).toBe('الثلاثاء، 17 نوفمبر');
  });

  it('day + month, and date with year (Tunisian month names, Latin digits)', () => {
    expect(formatDayMonth('2027-01-05')).toBe('5 جانفي');
    expect(formatDate('2027-07-31')).toBe('31 جويلية 2027');
    expect(formatDate('2026-08-01')).toBe('1 أوت 2026');
  });

  it('matches the web formatter for every month', () => {
    const web = new Intl.DateTimeFormat('ar-TN-u-nu-latn', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });
    for (let m = 1; m <= 12; m++) {
      const date = `2026-${String(m).padStart(2, '0')}-09`;
      expect(formatDate(date)).toBe(web.format(new Date(`${date}T00:00:00Z`)));
    }
  });

  it('reads the calendar day, never shifted by a timezone (ISO date-times too)', () => {
    expect(weekdayOf('2026-11-16')).toBe('MON');
    expect(formatDayMonth('2026-11-16T23:30:00.000Z')).toBe('16 نوفمبر');
  });

  it('rejects anything that is not a calendar date', () => {
    expect(() => formatDate('16/11')).toThrow(RangeError);
  });

  it('day of month and month name (with year on demand)', () => {
    expect(dayOfMonth('2026-11-06')).toBe(6);
    expect(formatMonth('2026-11-06')).toBe('نوفمبر');
    expect(formatMonth('2027-01-06', true)).toBe('جانفي 2027');
  });

  it('sameYear', () => {
    expect(sameYear('2026-12-31', '2026-01-01')).toBe(true);
    expect(sameYear('2027-01-01', '2026-12-31')).toBe(false);
  });
});

describe('bidi-safe numbers', () => {
  it('isolates LTR content with LRI…PDI', () => {
    expect(ltr('2026-2027')).toBe('⁦2026-2027⁩');
  });

  it('percent: whole number, isolated; null is a dash', () => {
    expect(formatPercent(83.4)).toBe('⁦83%⁩');
    expect(formatPercent(null)).toBe('—');
  });

  it('count over total in words', () => {
    expect(formatCountOf(8, 10)).toBe('8 من 10');
  });
});
