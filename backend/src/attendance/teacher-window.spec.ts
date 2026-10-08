import { withinTeacherWindow } from './attendance.service.js';

describe('withinTeacherWindow (today included)', () => {
  const today = '2026-10-08';
  it('7 days: today … 6 days ago are open, 7 days ago is closed', () => {
    expect(withinTeacherWindow('2026-10-08', today, 7)).toBe(true);
    expect(withinTeacherWindow('2026-10-02', today, 7)).toBe(true);
    expect(withinTeacherWindow('2026-10-01', today, 7)).toBe(false);
  });
  it('1 day: only today; crosses month boundaries correctly', () => {
    expect(withinTeacherWindow('2026-10-08', today, 1)).toBe(true);
    expect(withinTeacherWindow('2026-10-07', today, 1)).toBe(false);
    expect(withinTeacherWindow('2026-09-09', today, 30)).toBe(true);
    expect(withinTeacherWindow('2026-09-08', today, 30)).toBe(false);
  });
});
