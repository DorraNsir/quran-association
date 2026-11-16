/**
 * Response shapes of the teacher endpoints, copied from the backend DTOs
 * (fields the mobile app reads only):
 * - workspace/workspace.dto.ts      TeacherWorkspaceDto
 * - scheduling/session.dto.ts       SessionDto, SessionListDto
 * - attendance/attendance.dto.ts    AttendanceSummaryDto
 * - memorization/memorization.dto.ts ClassMemorizationDto
 */
export type Weekday = 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN';
export type RecordStatus = 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
export type ActivationStatus = 'ACTIVE' | 'INACTIVE';
export type SessionStatus = 'SCHEDULED' | 'COMPLETED' | 'CANCELLED';
export type Semester = 'SEMESTER_1' | 'SEMESTER_2';

export interface WsBranch {
  id: string;
  name: string;
  status: ActivationStatus;
}
export interface WsRoom {
  id: string;
  branchId: string;
  name: string;
}
export interface WsGroup {
  id: string;
  name: string;
  audience: string | null;
  status: RecordStatus;
}
export interface WsGroupClass {
  id: string;
  groupId: string;
  branchId: string;
  supervisorId: string;
  assistantIds: string[];
  status: RecordStatus;
}
export interface WsTeacher {
  id: string;
  firstName: string;
  lastName: string;
  photoUrl: string | null;
  status: ActivationStatus;
  joinedAt: string;
}
export interface WsSchedule {
  id: string;
  groupClassId: string;
  additionalGroupClassIds: string[];
  participants: { groupClassId: string; group: { id: string; name: string } }[];
  roomId: string;
  dayOfWeek: Weekday;
  startTime: string;
  endTime: string;
}
export type Gender = 'MALE' | 'FEMALE';

/** WsStudentDto: what a teacher may see of the students of their classes (no CIN, no address). */
export interface WsStudent {
  id: string;
  firstName: string;
  lastName: string;
  gender: Gender | null;
  dateOfBirth: string | null;
  phone: string | null;
  guardianPhone: string | null;
  photoUrl: string | null;
  registrationDate: string;
  groupClassId: string | null;
  status: RecordStatus;
}

export interface TeacherWorkspace {
  teacher: WsTeacher;
  branches: WsBranch[];
  rooms: WsRoom[];
  groups: WsGroup[];
  groupClasses: WsGroupClass[];
  teachers: WsTeacher[];
  schedules: WsSchedule[];
  students: WsStudent[];
}

export interface SessionClass {
  id: string;
  status: RecordStatus;
  group: { id: string; name: string; status: RecordStatus };
}
export interface SessionTeacher {
  id: string;
  firstName: string;
  lastName: string;
  role: 'SUPERVISOR' | 'ASSISTANT';
  status: ActivationStatus;
}
/** SessionAttendanceCountsDto: roster on the session date vs. saved records */
export interface SessionAttendanceCounts {
  expected: number;
  recorded: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
}
/** SessionDto — WHERE (room + branch) and WHO (team) are THIS session's snapshot. */
export interface Session {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  status: SessionStatus;
  cancellationReason: string | null;
  isExtra: boolean;
  completion: { completedAt: string; source: string; completedBy: string | null } | null;
  /** The HOST class */
  groupClass: SessionClass;
  /** «حصة مشتركة»: the other participating classes */
  additionalClasses: SessionClass[];
  room: { id: string; name: string; branch: { id: string; name: string } };
  /** Supervisor first */
  teachers: SessionTeacher[];
  attendance: SessionAttendanceCounts;
}
export interface Page<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface AttendanceSummary {
  recorded: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
  attended: number;
  eligible: number;
  rate: number | null;
  from: string | null;
  to: string | null;
}

export interface ClassMemorization {
  groupClass: { id: string; group: { id: string; name: string } };
  academicYear: { id: string; label: string };
  semester: Semester;
  students: {
    studentId: string;
    studentStatus: RecordStatus;
    currentMember: boolean;
    lastMemorizedSurahNumber: number | null;
  }[];
}

/* -------------------------------- attendance -------------------------------- */

/** AttendanceStatus (Prisma enum): حاضر، غائب، غياب مبرر، متأخر */
export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'EXCUSED' | 'LATE';

/** RosterStudentDto (backend attendance.dto.ts) */
export interface RosterStudent {
  studentId: string;
  firstName: string;
  lastName: string;
  photoUrl: string | null;
  /** The student's class (and group) ON the session date */
  groupClass: { id: string; group: { id: string; name: string } } | null;
  /** Enrolled in a participating class on the session date AND active that day → counts for completion */
  expected: boolean;
  recorded: boolean;
  /** null = not recorded yet (never "absent") */
  status: AttendanceStatus | null;
  note: string | null;
  recordedAt: string | null;
  recordedBy: string | null;
}

/** RosterTeacherDto */
export interface RosterTeacher {
  teacherId: string;
  firstName: string;
  lastName: string;
  photoUrl: string | null;
  /** Role in THIS session; null = recorded but no longer in its team */
  role: 'SUPERVISOR' | 'ASSISTANT' | null;
  recorded: boolean;
  status: AttendanceStatus | null;
  note: string | null;
}

/** SessionAttendanceDto — GET /teacher/sessions/:id/attendance (in the CALLER's scope) */
export interface SessionAttendance {
  sessionId: string;
  date: string;
  startTime: string;
  endTime: string;
  sessionStatus: SessionStatus;
  completionSource: string | null;
  groupClass: {
    id: string;
    group: { id: string; name: string };
    room: { id: string; name: string };
    branch: { id: string; name: string };
  };
  additionalClasses: { id: string; group: { id: string; name: string } }[];
  /** allStudents, or only the classes an ASSISTANT of a shared session is assigned to */
  scope: { allStudents: boolean; groupClassIds: string[] };
  expectedCount: number;
  recordedCount: number;
  complete: boolean;
  /** The caller may record now (the lesson has started, not cancelled) */
  editable: boolean;
  /** The caller may also change saved values (teacher correction window) */
  correctable: boolean;
  students: RosterStudent[];
  teacherExpectedCount: number;
  teacherRecordedCount: number;
  teachers: RosterTeacher[];
}
