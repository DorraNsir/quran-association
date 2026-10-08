import {
  daysBetween,
  eachDate,
  fromDbTime,
  overlaps,
  toDbTime,
  weekdayOf,
} from './time.js';

describe('scheduling time helpers', () => {
  it('overlap rule: newStart < existingEnd AND newEnd > existingStart', () => {
    const existing = { start: '17:00', end: '19:00' };
    expect(overlaps({ start: '18:00', end: '20:00' }, existing)).toBe(true);
    expect(overlaps({ start: '16:00', end: '17:30' }, existing)).toBe(true);
    expect(overlaps({ start: '17:30', end: '18:30' }, existing)).toBe(true); // inside
    expect(overlaps({ start: '16:00', end: '20:00' }, existing)).toBe(true); // around
    expect(overlaps({ start: '19:00', end: '20:00' }, existing)).toBe(false); // touching end
    expect(overlaps({ start: '15:00', end: '17:00' }, existing)).toBe(false); // touching start
  });

  it('round-trips TIME values without any timezone shift', () => {
    expect(fromDbTime(toDbTime('00:00'))).toBe('00:00');
    expect(fromDbTime(toDbTime('17:30'))).toBe('17:30');
    expect(fromDbTime(toDbTime('23:59'))).toBe('23:59');
  });

  it('maps calendar dates to weekdays and iterates ranges', () => {
    expect(weekdayOf('2026-10-06')).toBe('TUE');
    expect(weekdayOf('2026-10-08')).toBe('THU');
    expect(weekdayOf('2026-10-11')).toBe('SUN');
    expect(eachDate('2026-10-30', '2026-11-02')).toEqual([
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
      '2026-11-02',
    ]);
    expect(eachDate('2027-03-27', '2027-03-29')).toHaveLength(3); // across a DST change elsewhere
    expect(daysBetween('2026-10-01', '2026-10-31')).toBe(30);
  });
});
