import { QueryClient } from '@tanstack/react-query';

import { ApiError } from '@/services/api';

import { attendanceFixture } from './__fixtures__/sessions';
import { applySavedAttendance, attendanceKey, classifySaveError } from './attendance-save';

describe('save errors keep the edits; the kind decides the next step', () => {
  const err = (status: number, code: string) => new ApiError(status, code, 'x');

  it('classifies every documented PUT error', () => {
    expect(classifySaveError(err(409, 'ATTENDANCE_CHANGED'))).toBe('conflict');
    expect(classifySaveError(err(409, 'ATTENDANCE_CORRECTION_WINDOW_CLOSED'))).toBe('locked');
    expect(classifySaveError(err(409, 'ATTENDANCE_SESSION_CANCELLED'))).toBe('locked');
    expect(classifySaveError(err(409, 'ATTENDANCE_SESSION_FUTURE'))).toBe('locked');
    expect(classifySaveError(err(403, 'ATTENDANCE_STUDENT_NOT_ALLOWED'))).toBe('locked');
    expect(classifySaveError(err(403, 'TEACHER_CLASS_ACCESS_DENIED'))).toBe('locked');
    expect(classifySaveError(err(400, 'ATTENDANCE_TEACHER_NOT_IN_SESSION'))).toBe('locked'); // team changed meanwhile
    expect(classifySaveError(err(400, 'ATTENDANCE_STUDENT_NOT_IN_SESSION'))).toBe('invalid');
    expect(classifySaveError(new ApiError(0, 'NETWORK_ERROR', 'x'))).toBe('offline');
    expect(classifySaveError(err(500, 'HTTP_500'))).toBe('unknown');
    expect(classifySaveError(new Error('boom'))).toBe('unknown');
  });
});

describe('after a confirmed save', () => {
  it("shows the server's answer and refreshes session queries (details, lists, counts, dashboard, «حضوري») — not other teachers' data", async () => {
    // gcTime Infinity: no cache-cleanup timer left running after the test
    const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
    const t = ['teacher', 't-me'];
    const keys = {
      attendance: attendanceKey('t-me', 's1'),
      otherAttendance: attendanceKey('t-me', 's2'),
      detail: [...t, 'sessions', 'detail', 's1'],
      list: [...t, 'sessions', 'list', { order: 'desc' }],
      pending: [...t, 'sessions', 'pending-count', {}],
      upcoming: [...t, 'sessions', 'upcoming', '2026-11-16'],
      completed: [...t, 'sessions', 'completed-count'],
      workspace: [...t, 'workspace'],
      mySummary: [...t, 'attendance-summary', 'year-1'],
      otherTeacher: ['teacher', 't-other', 'sessions', 'detail', 's1'],
    };
    for (const key of Object.values(keys)) client.setQueryData(key, { old: true });
    const saved = attendanceFixture({ sessionStatus: 'COMPLETED', complete: true });

    await applySavedAttendance(client, 't-me', 's1', saved);

    expect(client.getQueryData(keys.attendance)).toEqual(saved);
    const stale = (key: readonly unknown[]) => client.getQueryState(key)?.isInvalidated;
    for (const key of [keys.detail, keys.list, keys.pending, keys.upcoming, keys.completed, keys.otherAttendance, keys.mySummary])
      expect(stale(key)).toBe(true);
    expect(stale(keys.attendance)).toBe(false); // already the server's answer
    expect(stale(keys.workspace)).toBe(false);
    expect(stale(keys.otherTeacher)).toBe(false);
    client.clear();
  });
});
