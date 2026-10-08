import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import { IsLocalDateTime, toLocalDateTime } from './dates.js';

class Body {
  @IsLocalDateTime() at!: string;
}
const valid = (at: unknown) =>
  validateSync(plainToInstance(Body, { at })).length === 0;

describe('local date-time (Africa/Tunis wall clock)', () => {
  it('accepts only "YYYY-MM-DDTHH:mm" without offset, on a real date', () => {
    expect(valid('2026-10-20T08:30')).toBe(true);
    expect(valid('2026-10-20T23:59')).toBe(true);
    for (const v of [
      '2026-10-20T24:00',
      '2026-02-30T10:00',
      '2026-10-20T08:30Z',
      '2026-10-20T08:30+01:00',
      '2026-10-20 08:30',
      '2026-10-20',
      12,
    ])
      expect([v, valid(v)]).toEqual([v, false]);
  });

  it('formats an instant in the zone (Tunis is UTC+1, no DST)', () => {
    expect(
      toLocalDateTime(new Date('2026-10-20T07:30:00Z'), 'Africa/Tunis'),
    ).toBe('2026-10-20T08:30');
    expect(
      toLocalDateTime(new Date('2026-12-31T23:30:00Z'), 'Africa/Tunis'),
    ).toBe('2027-01-01T00:30');
    expect(
      toLocalDateTime(new Date('2026-07-01T12:00:00Z'), 'Africa/Tunis'),
    ).toBe('2026-07-01T13:00');
  });
});
