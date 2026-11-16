import { ApiError } from '@/services/api';

import { noteFixture, notesFixture } from './__fixtures__/notes';
import { classifyNoteError, formatNoteDate, NOTE_MAX_LENGTH, searchNotes, sortNotes, validateNote, wasEdited } from './notes-model';

describe('validateNote (CreateTeacherNoteDto: trimmed, 1–2000)', () => {
  it('requires text after trimming', () => {
    expect(validateNote('')).toBe('required');
    expect(validateNote('  \n\t ')).toBe('required');
    expect(validateNote(' ملاحظة ')).toBeNull();
  });

  it('accepts 2000 characters, refuses 2001 (spaces around do not count)', () => {
    expect(validateNote('ا'.repeat(NOTE_MAX_LENGTH))).toBeNull();
    expect(validateNote(`  ${'ا'.repeat(NOTE_MAX_LENGTH)}  `)).toBeNull();
    expect(validateNote('ا'.repeat(NOTE_MAX_LENGTH + 1))).toBe('tooLong');
  });
});

describe('list order and search', () => {
  it('most recently updated first, then id (the API order)', () => {
    const notes = [
      noteFixture('a', 'أ', '2026-01-01T00:00:00.000Z'),
      noteFixture('c', 'ج', '2026-01-01T00:00:00.000Z', '2026-03-01T00:00:00.000Z'),
      noteFixture('b', 'ب', '2026-01-01T00:00:00.000Z'),
    ];
    expect(sortNotes(notes).map((n) => n.id)).toEqual(['c', 'b', 'a']);
  });

  it('the web search: tashkeel, hamza forms and ta marbuta folded; empty query keeps all', () => {
    const notes = notesFixture();
    expect(searchNotes(notes, '').map((n) => n.id)).toEqual(['n2', 'n1']);
    expect(searchNotes(notes, 'المَصاحف').map((n) => n.id)).toEqual(['n1']);
    expect(searchNotes(notes, 'الاربعاء').map((n) => n.id)).toEqual(['n2']); // أ → ا
    expect(searchNotes(notes, 'القاعه').map((n) => n.id)).toEqual(['n1']); // ة → ه
    expect(searchNotes(notes, 'غير موجود')).toEqual([]);
  });
});

describe('dates', () => {
  it('in the PLATFORM time zone (Africa/Tunis, UTC+1), time isolated LTR', () => {
    expect(formatNoteDate('2026-11-15T13:05:00.000Z', 'Africa/Tunis')).toBe('15 نوفمبر 2026 · ⁦14:05⁩');
    // Late evening UTC is already the next day in Tunis
    expect(formatNoteDate('2026-11-15T23:30:00.000Z', 'Africa/Tunis')).toBe('16 نوفمبر 2026 · ⁦00:30⁩');
  });

  it('«آخر تعديل» only when the note changed after creation', () => {
    const [edited, untouched] = notesFixture();
    expect(wasEdited(edited!)).toBe(true);
    expect(wasEdited(untouched!)).toBe(false);
  });
});

describe('classifyNoteError', () => {
  it('maps the server answers; never throws', () => {
    expect(classifyNoteError(new ApiError(0, 'NETWORK_ERROR', 'x'))).toBe('offline');
    expect(classifyNoteError(new ApiError(404, 'TEACHER_NOTE_NOT_FOUND', 'الملاحظة غير موجودة'))).toBe('notFound');
    expect(classifyNoteError(new ApiError(403, 'TEACHER_INACTIVE', 'x'))).toBe('forbidden');
    expect(classifyNoteError(new ApiError(400, 'VALIDATION_ERROR', 'نص الملاحظة مطلوب'))).toBe('invalid');
    expect(classifyNoteError(new Error('boom'))).toBe('unknown');
  });
});
