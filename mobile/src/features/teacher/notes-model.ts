import { formatDate, ltr } from '@/i18n/format';
import { ApiError } from '@/services/api';

import { normalizeArabic } from '../quran/surahs';
import { platformClock } from './dashboard-model';
import type { TeacherNote } from './types';

/*
 * «ملاحظاتي» rules (backend workspace.service / CreateTeacherNoteDto, same as
 * the web's teacher-notes.tsx):
 *  - a PRIVATE note of the signed-in teacher: only its author lists, edits or
 *    deletes it (supervisor or assistant makes no difference — a note belongs
 *    to no class, student or session);
 *  - its only field is the text: trimmed, 1–2000 characters;
 *  - createdAt / updatedAt are set by the server; most recently updated first.
 */
export const NOTE_MAX_LENGTH = 2000;

export type NoteInputError = 'required' | 'tooLong';

/** The DTO's rules, checked before sending (the server checks them again). */
export function validateNote(content: string): NoteInputError | null {
  const text = content.trim();
  if (!text) return 'required';
  if (text.length > NOTE_MAX_LENGTH) return 'tooLong';
  return null;
}

/** Most recently updated first, then id (the API's order, kept after local cache updates). */
export function sortNotes(notes: readonly TeacherNote[]): TeacherNote[] {
  return [...notes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id));
}

/** The web's search: case, tashkeel and tatweel ignored; أ/إ/آ, ة, ى folded — on the complete loaded list. */
export function searchNotes(notes: readonly TeacherNote[], query: string): TeacherNote[] {
  const needle = normalizeArabic(query);
  if (!needle) return [...notes];
  return notes.filter((n) => normalizeArabic(n.content).includes(needle));
}

/** "16 نوفمبر 2026 · 14:05" in the PLATFORM time zone (never the phone's), time isolated LTR. */
export function formatNoteDate(timestamp: string, timeZone: string | undefined): string {
  const { today, time } = platformClock(timeZone, new Date(timestamp));
  return `${formatDate(today)} · ${ltr(time)}`;
}

/** Edited after creation (the web shows «آخر تعديل» only then). */
export const wasEdited = (note: TeacherNote) => note.updatedAt !== note.createdAt;

export type NoteMutationError = 'offline' | 'notFound' | 'forbidden' | 'invalid' | 'unknown';

/** Every failure keeps the text on screen; the kind decides what is offered next. */
export function classifyNoteError(error: unknown): NoteMutationError {
  if (!(error instanceof ApiError)) return 'unknown';
  if (error.isNetwork) return 'offline';
  // Deleted meanwhile — or not mine (the API answers 404 for another teacher's note)
  if (error.isNotFound || error.code === 'TEACHER_NOTE_NOT_FOUND') return 'notFound';
  if (error.isForbidden) return 'forbidden';
  if (error.status === 400) return 'invalid';
  return 'unknown';
}
