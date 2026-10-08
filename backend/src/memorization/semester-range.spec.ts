import { semesterRange } from './memorization.service.js';

const d = (s: string) => new Date(`${s}T00:00:00Z`);

describe('semesterRange (two semesters per academic year)', () => {
  const year = {
    startDate: d('2026-09-14'),
    endDate: d('2027-06-30'),
    semester2StartDate: d('2027-02-01'),
  };

  it('FIRST ends the day before the second semester starts', () => {
    expect(semesterRange(year, 'FIRST')).toEqual({
      from: '2026-09-14',
      to: '2027-01-31',
    });
  });

  it('SECOND runs from its start to the end of the year', () => {
    expect(semesterRange(year, 'SECOND')).toEqual({
      from: '2027-02-01',
      to: '2027-06-30',
    });
  });

  it('handles leap years', () => {
    expect(
      semesterRange(
        {
          ...year,
          semester2StartDate: d('2028-03-01'),
          endDate: d('2028-06-30'),
        },
        'FIRST',
      ).to,
    ).toBe('2028-02-29');
  });
});
