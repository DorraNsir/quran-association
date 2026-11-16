import { canEditStudent, canEditTeacher } from './attendance-draft';
import type { SessionAttendance } from './types';

/**
 * The session's attendance action, from the roster the server returned
 * (GET /teacher/sessions/:id/attendance) — never guessed:
 *  - view:     nothing may be changed now (not started, cancelled, or every
 *              row saved and the correction window closed);
 *  - record:   recording is open and nothing is recorded yet;
 *  - complete: something is recorded but students or team members remain;
 *  - edit:     everything is recorded and corrections are still allowed.
 * "May change" is exactly what the attendance screen allows (same rules).
 */
export type AttendanceActionKind = 'view' | 'record' | 'complete' | 'edit';

export function attendanceAction(dto: SessionAttendance): AttendanceActionKind {
  const canEdit = dto.students.some((s) => canEditStudent(dto, s)) || dto.teachers.some((t) => canEditTeacher(dto, t));
  if (!canEdit) return 'view';
  const anyRecorded = dto.students.some((s) => s.recorded) || dto.teachers.some((t) => t.recorded);
  if (!anyRecorded) return 'record';
  const studentsDone = dto.expectedCount === 0 || dto.complete;
  const teamDone = dto.teacherRecordedCount >= dto.teacherExpectedCount;
  return studentsDone && teamDone ? 'edit' : 'complete';
}
