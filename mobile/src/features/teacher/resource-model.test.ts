import { ApiError } from '@/services/api';

import { linkResource, resourceFixture } from './__fixtures__/resources';
import {
  classifyResourceError,
  draftOf,
  formatSize,
  isSafeUrl,
  mimeOf,
  resourceBody,
  sizeLimitOf,
  targetLabels,
  validateResource,
  type ResourceDraft,
} from './resource-model';

const MB = 1024 * 1024;
const draft = (over: Partial<ResourceDraft> = {}): ResourceDraft => ({
  title: 'عنوان',
  description: '',
  type: 'EXTERNAL_LINK',
  url: 'https://example.org/page',
  classIds: ['c1'],
  file: null,
  ...over,
});
const pdf = (size: number | null = MB) => ({ uri: 'file:///cache/a.pdf', name: 'a.pdf', mimeType: 'application/pdf', size });

describe('isSafeUrl (http/https only — the backend SafeUrl rule)', () => {
  it.each(['https://www.youtube.com/watch?v=x', 'http://example.org', 'HTTPS://Example.org/a?b=1#c'])('accepts %s', (url) => {
    expect(isSafeUrl(url)).toBe(true);
  });
  it.each([
    'javascript:alert(1)',
    'data:text/html,<b>x</b>',
    'file:///etc/passwd',
    'intent://scan#Intent;end',
    '/api/files/123',
    'www.example.org',
    'https://exa mple.org',
    'https://localhost',
    '',
    null,
  ])('refuses %s', (url) => {
    expect(isSafeUrl(url)).toBe(false);
  });
});

describe('file rules (backend TYPE_MIMES and size limits)', () => {
  it('normalizes picker types and falls back on the extension', () => {
    expect(mimeOf({ name: 'a.mp3', mimeType: 'audio/mp3' })).toBe('audio/mpeg');
    expect(mimeOf({ name: 'a.m4a', mimeType: 'audio/x-m4a' })).toBe('audio/mp4');
    expect(mimeOf({ name: 'scan.PDF', mimeType: null })).toBe('application/pdf');
    expect(mimeOf({ name: 'x.bin', mimeType: 'application/octet-stream' })).toBeNull();
  });

  it('a generic or unusual type reported by the phone falls back on the extension (the server compares the declared type)', () => {
    expect(mimeOf({ name: 'tajwid.pdf', mimeType: 'application/octet-stream' })).toBe('application/pdf');
    expect(mimeOf({ name: 'tilawa.mp3', mimeType: 'audio/mpeg3' })).toBe('audio/mpeg');
    expect(mimeOf({ name: 'scan.pdf', mimeType: 'application/x-pdf' })).toBe('application/pdf');
    expect(mimeOf({ name: 'photo.jpg', mimeType: 'image/jpeg; charset=binary' })).toBe('image/jpeg');
    // Not an accepted format at all: refused before uploading
    expect(mimeOf({ name: 'photo.heic', mimeType: 'image/heic' })).toBeNull();
  });

  it('limits: images 5 MB, PDF 15 MB, audio 25 MB', () => {
    expect(sizeLimitOf('image/png')).toBe(5 * MB);
    expect(sizeLimitOf('application/pdf')).toBe(15 * MB);
    expect(sizeLimitOf('audio/mpeg')).toBe(25 * MB);
    expect(formatSize(2_516_582)).toBe('2.4 م.ب');
    expect(formatSize(300)).toBe('1 ك.ب');
  });
});

describe('validateResource', () => {
  it('title, link and classes', () => {
    expect(validateResource(draft({ title: '  ' }))).toBe('titleRequired');
    expect(validateResource(draft({ title: 'ا'.repeat(201) }))).toBe('titleTooLong');
    expect(validateResource(draft({ description: 'ا'.repeat(5001) }))).toBe('descriptionTooLong');
    expect(validateResource(draft({ url: 'javascript:alert(1)' }))).toBe('urlInvalid');
    expect(validateResource(draft({ classIds: [] }))).toBe('classesRequired');
    expect(validateResource(draft())).toBeNull();
  });

  it('files: required, matching the type, within the size limit', () => {
    expect(validateResource(draft({ type: 'PDF' }))).toBe('fileRequired');
    expect(validateResource(draft({ type: 'IMAGE', file: pdf() }))).toBe('fileTypeMismatch');
    expect(validateResource(draft({ type: 'PDF', file: pdf(16 * MB) }))).toBe('fileTooLarge');
    expect(validateResource(draft({ type: 'FILE', file: pdf() }))).toBeNull();
  });

  it('editing keeps the saved file only when the type is unchanged', () => {
    const saved = resourceFixture('r1');
    expect(validateResource(draft({ type: 'PDF' }), saved)).toBeNull();
    expect(validateResource(draft({ type: 'AUDIO' }), saved)).toBe('fileRequired');
  });
});

describe('request body (TeacherResourceDto)', () => {
  it('a link: its URL and fileId null; a file: the NEW fileId, or nothing to keep the saved one', () => {
    expect(resourceBody(draft({ title: ' رابط ', url: ' https://a.org ' }), undefined)).toEqual({
      title: 'رابط',
      description: '',
      type: 'EXTERNAL_LINK',
      externalUrl: 'https://a.org',
      fileId: null,
      groupClassIds: ['c1'],
    });
    expect(resourceBody(draft({ type: 'PDF', file: pdf() }), 'f9')).toMatchObject({ type: 'PDF', fileId: 'f9' });
    expect(resourceBody(draft({ type: 'PDF' }), undefined)).not.toHaveProperty('fileId');
  });

  it('draft: keeps only targets among MY current classes; preselects the class it was opened from', () => {
    const saved = resourceFixture('r1', {
      groupClasses: [
        { id: 'c1', group: { id: 'g1', name: 'أ' }, branch: { id: 'b1', name: 'ب' } },
        { id: 'cX', group: { id: 'g9', name: 'ج' }, branch: { id: 'b1', name: 'ب' } },
      ],
    });
    expect(draftOf(saved, new Set(['c1', 'c2'])).classIds).toEqual(['c1']);
    expect(draftOf(undefined, new Set(['c1', 'c2']), 'c2').classIds).toEqual(['c2']);
    expect(draftOf(undefined, new Set(['c1', 'c2']), 'cX').classIds).toEqual([]);
    expect(draftOf(undefined, new Set(['c1'])).classIds).toEqual(['c1']);
  });

  it('target labels: all students, groups, or «group — branch»', () => {
    expect(targetLabels(resourceFixture('r'), 'الكل')).toEqual(['مجموعة الفجر — الفرع الرئيسي']);
    expect(targetLabels(linkResource('r', { visibility: 'ALL_STUDENTS', groupClasses: [] }), 'الكل')).toEqual(['الكل']);
    expect(targetLabels(linkResource('r', { visibility: 'GROUP', groups: [{ id: 'g', name: 'مجموعة' }], groupClasses: [] }), 'الكل')).toEqual(['مجموعة']);
  });
});

describe('errors', () => {
  it('offline is never «denied»; 413 is «too large»', () => {
    expect(classifyResourceError(new ApiError(0, 'NETWORK_ERROR', 'x'))).toBe('offline');
    expect(classifyResourceError(new ApiError(413, 'FILE_TOO_LARGE', 'x'))).toBe('tooLarge');
    expect(classifyResourceError(new ApiError(404, 'RESOURCE_NOT_FOUND', 'x'))).toBe('notFound');
    expect(classifyResourceError(new ApiError(403, 'RESOURCE_EDIT_FORBIDDEN', 'x'))).toBe('forbidden');
    expect(classifyResourceError(new ApiError(400, 'FILE_TYPE_MISMATCH', 'x'))).toBe('invalid');
  });
});
