import { ApiError } from '@/services/api';

import { announcementFixture, myAnnouncement } from './__fixtures__/announcements';
import {
  audienceTargets,
  classifyAnnouncementError,
  createBody,
  dayOf,
  draftOfAnnouncement,
  isDay,
  updateBody,
  validateAnnouncement,
  type AnnouncementDraft,
} from './announcement-model';

const draft = (over: Partial<AnnouncementDraft> = {}): AnnouncementDraft => ({
  title: 'عنوان',
  content: 'نص',
  classIds: ['c1'],
  expiresAt: '',
  ...over,
});

describe('validateAnnouncement (TeacherAnnouncementDto)', () => {
  it('title, content, classes', () => {
    expect(validateAnnouncement(draft({ title: '  ' }), null)).toBe('titleRequired');
    expect(validateAnnouncement(draft({ title: 'ا'.repeat(201) }), null)).toBe('titleTooLong');
    expect(validateAnnouncement(draft({ content: ' ' }), null)).toBe('contentRequired');
    expect(validateAnnouncement(draft({ content: 'ا'.repeat(10001) }), null)).toBe('contentTooLong');
    expect(validateAnnouncement(draft({ classIds: [] }), null)).toBe('classesRequired');
    // A published one keeps its classes (locked): not checked
    expect(validateAnnouncement(draft({ classIds: [] }), null, true)).toBeNull();
    expect(validateAnnouncement(draft(), null)).toBeNull();
  });

  it('the last day: a real date, not before today for a NEW announcement', () => {
    expect(isDay('2026-02-29')).toBe(false);
    expect(isDay('2028-02-29')).toBe(true);
    expect(validateAnnouncement(draft({ expiresAt: '31/12/2026' }), '2026-11-16')).toBe('expiryInvalid');
    expect(validateAnnouncement(draft({ expiresAt: '2026-11-15' }), '2026-11-16')).toBe('expiryPast');
    expect(validateAnnouncement(draft({ expiresAt: '2026-11-16' }), '2026-11-16')).toBeNull();
    // Editing: the server compares with the publication day
    expect(validateAnnouncement(draft({ expiresAt: '2026-11-15' }), null)).toBeNull();
  });
});

describe('request bodies', () => {
  it('create: trimmed, classes, optional last day, the mode', () => {
    expect(createBody(draft({ title: ' إعلان ', content: ' نص ', expiresAt: ' 2026-12-31 ' }), 'DRAFT')).toEqual({
      title: 'إعلان',
      content: 'نص',
      groupClassIds: ['c1'],
      expiresAt: '2026-12-31',
      mode: 'DRAFT',
    });
    expect(createBody(draft(), 'PUBLISH_NOW')).not.toHaveProperty('expiresAt');
  });

  it('edit: only what changed; a PUBLISHED one never sends its classes (ANNOUNCEMENT_PUBLISHED_LOCKED)', () => {
    const published = myAnnouncement('a1');
    const d = draftOfAnnouncement(published, new Set(['c1', 'c2']));
    expect(updateBody(published, d)).toEqual({});
    expect(updateBody(published, { ...d, title: 'جديد', classIds: ['c2'], expiresAt: '2026-12-01' })).toEqual({ title: 'جديد', expiresAt: '2026-12-01' });
    const drafted = myAnnouncement('a2', { status: 'DRAFT', state: 'DRAFT', publishedAt: null, expiresAt: '2026-12-01' });
    expect(updateBody(drafted, { ...draftOfAnnouncement(drafted, new Set(['c1', 'c2'])), classIds: ['c1', 'c2'], expiresAt: '' })).toEqual({
      expiresAt: null,
      groupClassIds: ['c1', 'c2'],
    });
  });

  it('the draft keeps only targets among MY current classes; a new one has NO default audience', () => {
    const a = myAnnouncement('a1', {
      groupClasses: [
        { id: 'c1', group: { id: 'g1', name: 'أ' }, branch: { id: 'b', name: 'ب' } },
        { id: 'cX', group: { id: 'gX', name: 'ج' }, branch: { id: 'b', name: 'ب' } },
      ],
    });
    expect(draftOfAnnouncement(a, new Set(['c1'])).classIds).toEqual(['c1']);
    // Even with a single eligible class nothing is preselected (as on the web)
    expect(draftOfAnnouncement(undefined, new Set(['c1'])).classIds).toEqual([]);
    expect(draftOfAnnouncement(undefined, new Set(['c1', 'c2'])).classIds).toEqual([]);
  });
});

describe('display', () => {
  it('the publication day in PLATFORM time; the targets of class / branch audiences', () => {
    expect(dayOf(announcementFixture('a', { publishedAt: '2026-11-15T23:30:00.000Z' }), 'Africa/Tunis')).toBe('2026-11-16');
    expect(dayOf(announcementFixture('a', { publishedAt: null }), 'Africa/Tunis')).toBe('2026-11-12');
    expect(audienceTargets(myAnnouncement('a'))).toEqual(['مجموعة الفجر — الفرع الرئيسي']);
    expect(audienceTargets(announcementFixture('a', { audience: 'SPECIFIC_BRANCHES', branches: [{ id: 'b', name: 'فرع المرسى' }] }))).toEqual(['فرع المرسى']);
    expect(audienceTargets(announcementFixture('a', { audience: 'TEACHERS' }))).toEqual([]);
  });

  it('errors: offline is never «denied»; 409 is a conflict', () => {
    expect(classifyAnnouncementError(new ApiError(0, 'NETWORK_ERROR', 'x'))).toBe('offline');
    expect(classifyAnnouncementError(new ApiError(409, 'ANNOUNCEMENT_PUBLISH_CONFLICT', 'x'))).toBe('conflict');
    expect(classifyAnnouncementError(new ApiError(403, 'ANNOUNCEMENT_EDIT_FORBIDDEN', 'x'))).toBe('forbidden');
    expect(classifyAnnouncementError(new ApiError(404, 'ANNOUNCEMENT_NOT_FOUND', 'x'))).toBe('notFound');
    expect(classifyAnnouncementError(new ApiError(400, 'INVALID_DATE_RANGE', 'x'))).toBe('invalid');
  });
});
