import { QueryClient } from '@tanstack/react-query';

import { ApiError } from '@/services/api';

import { recordFixture, YEAR_FIXTURE } from './__fixtures__/memorization';
import { applySavedMemorization, classifyMemorizationError, validateMemorization } from './memorization-save';

describe('validation (the DTO rules, checked before sending)', () => {
  const base = { academicYearId: YEAR_FIXTURE.id, semester: 'FIRST' as const };
  it('a surah is required, an integer 1–114', () => {
    expect(validateMemorization({ ...base, lastMemorizedSurahNumber: null })).toBe('surahRequired');
    expect(validateMemorization({ ...base, lastMemorizedSurahNumber: 0 })).toBe('surahInvalid');
    expect(validateMemorization({ ...base, lastMemorizedSurahNumber: 115 })).toBe('surahInvalid');
    expect(validateMemorization({ ...base, lastMemorizedSurahNumber: 2.5 })).toBe('surahInvalid');
    expect(validateMemorization({ ...base, lastMemorizedSurahNumber: 1 })).toBeNull();
    expect(validateMemorization({ ...base, lastMemorizedSurahNumber: 114 })).toBeNull();
  });
});

describe('save errors keep the form; the kind decides the message', () => {
  it('classifies the documented PUT errors', () => {
    expect(classifyMemorizationError(new ApiError(0, 'NETWORK_ERROR', 'x'))).toBe('offline');
    expect(classifyMemorizationError(new ApiError(403, 'TEACHER_STUDENT_ACCESS_DENIED', 'x'))).toBe('denied');
    expect(classifyMemorizationError(new ApiError(404, 'STUDENT_NOT_FOUND', 'x'))).toBe('denied');
    expect(classifyMemorizationError(new ApiError(409, 'MEMORIZATION_STUDENT_NOT_ENROLLED', 'x'))).toBe('notEnrolled');
    expect(classifyMemorizationError(new ApiError(400, 'HTTP_400', 'x'))).toBe('invalid');
    expect(classifyMemorizationError(new ApiError(500, 'HTTP_500', 'x'))).toBe('unknown');
  });
});

describe('after a confirmed save', () => {
  it("stores the server's record and refreshes every memorization view (student, classes, dashboard) — nothing else", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
    const t = ['teacher', 't-me'];
    const keys = {
      student: [...t, 'memorization', 'student', 'st1', YEAR_FIXTURE.id, 'FIRST'],
      otherSemester: [...t, 'memorization', 'student', 'st1', YEAR_FIXTURE.id, 'SECOND'],
      classList: [...t, 'memorization', 'c1', YEAR_FIXTURE.id, 'FIRST'],
      workspace: [...t, 'workspace'],
      sessions: [...t, 'sessions', 'today', '2026-11-16'],
    };
    for (const key of Object.values(keys)) client.setQueryData(key, { old: true });
    const saved = recordFixture('st1', 'FIRST', 67, 'الملك', '2026-11-16T10:00:00Z');

    await applySavedMemorization(client, 't-me', 'st1', saved);

    expect(client.getQueryData(keys.student)).toEqual(saved);
    for (const key of [keys.student, keys.otherSemester, keys.classList])
      expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    expect(client.getQueryState(keys.workspace)?.isInvalidated).toBe(false);
    expect(client.getQueryState(keys.sessions)?.isInvalidated).toBe(false);
    client.clear();
  });
});
