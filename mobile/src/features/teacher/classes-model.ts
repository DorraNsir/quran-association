import { teacherClasses, type TeacherClassSummary } from './dashboard-model';
import type { TeacherWorkspace, WsStudent } from './types';

/*
 * Classes and students of the signed-in teacher, from GET /teacher/workspace.
 * The backend already limits that bundle to MY non-archived classes and their
 * non-archived students; these helpers only select and shape — they never
 * widen what the API returned.
 */

export const fullName = (p: { firstName: string; lastName: string }) =>
  `${p.firstName} ${p.lastName}`;

/** One of MY classes, or null (unknown id, archived, or not assigned to me). */
export function findTeacherClass(ws: TeacherWorkspace, groupClassId: string): TeacherClassSummary | null {
  return teacherClasses(ws).find((c) => c.id === groupClassId) ?? null;
}

export interface RosterStudent {
  id: string;
  name: string;
  gender: WsStudent['gender'];
  /** Age on `today` when the date of birth is known (else null — never guessed) */
  age: number | null;
  photoUrl: string | null;
}


/**
 * «الطلبة» of a class: students CURRENTLY placed in that exact class
 * (groupClassId), ACTIVE only — the web class page's rule. A student of
 * another of my classes never appears here.
 */
export function classRoster(
  ws: TeacherWorkspace,
  groupClassId: string,
  today?: string,
): RosterStudent[] {
  if (!findTeacherClass(ws, groupClassId)) return [];
  return ws.students
    .filter((s) => s.groupClassId === groupClassId && s.status === 'ACTIVE')
    .map((s) => ({
      id: s.id,
      name: fullName(s),
      gender: s.gender,
      age: today && s.dateOfBirth ? ageOn(s.dateOfBirth, today) : null,
      photoUrl: s.photoUrl,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ar'));
}

export interface StudentProfile {
  student: WsStudent;
  name: string;
  /** Age today, when the date of birth is known */
  age: number | null;
  /** The student's current class — always one of mine */
  groupClass: TeacherClassSummary;
}

/**
 * A student of MY classes (web canTeacherAccessStudent: not archived, current
 * class is one of mine), or null — then the screen shows "not available".
 */
export function studentProfile(ws: TeacherWorkspace, studentId: string, today: string): StudentProfile | null {
  const student = ws.students.find((s) => s.id === studentId);
  if (!student || student.status === 'ARCHIVED' || !student.groupClassId) return null;
  const groupClass = findTeacherClass(ws, student.groupClassId);
  if (!groupClass) return null;
  return {
    student,
    name: fullName(student),
    age: student.dateOfBirth ? ageOn(student.dateOfBirth, today) : null,
    groupClass,
  };
}

/** Whole years on `reference` (web lib/domain.ts ageOn). */
export function ageOn(dateOfBirth: string, reference: string): number {
  const dob = new Date(dateOfBirth);
  const ref = new Date(reference);
  let age = ref.getUTCFullYear() - dob.getUTCFullYear();
  const beforeBirthday =
    ref.getUTCMonth() < dob.getUTCMonth() ||
    (ref.getUTCMonth() === dob.getUTCMonth() && ref.getUTCDate() < dob.getUTCDate());
  if (beforeBirthday) age--;
  return age;
}

/** "22 123 456" for an 8-digit Tunisian number (web formatPhone), else as stored. */
export function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.length === 8 ? `${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5)}` : phone;
}

/** tel: link — +216 for an 8-digit local number (as the web does), else the digits as stored. */
export function phoneHref(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, '');
  return /^\d{8}$/.test(digits) ? `tel:+216${digits}` : `tel:${digits}`;
}

/** Arabic count of students (web countLabels.students). */
export function studentsLabel(n: number): string {
  if (n === 0) return '0 طلبة';
  if (n === 1) return 'طالب واحد';
  if (n === 2) return 'طالبان';
  if (n <= 10) return `${n} طلبة`;
  return `${n} طالبًا`;
}

