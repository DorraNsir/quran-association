import type { IconName } from '@/components/ui';
import { ApiError } from '@/services/api';

import type { PickedFile, Resource, ResourceType, TeacherResourceBody } from './resource-types';

/*
 * «الموارد التعليمية» rules — backend resources.service / resource.dto /
 * files (and the web's resource form). The server stays the authority:
 * visibility, ownership, the real file type (detected from its content) and
 * the size limits are re-checked there.
 */
export const TITLE_MAX = 200;
export const DESCRIPTION_MAX = 5000;
export const URL_MAX = 2000;
export const TARGETS_MAX = 50;

export const RESOURCE_TYPES: readonly ResourceType[] = ['PDF', 'IMAGE', 'AUDIO', 'FILE', 'VIDEO_LINK', 'EXTERNAL_LINK'];
export const LINK_TYPES: readonly ResourceType[] = ['VIDEO_LINK', 'EXTERNAL_LINK'];
export const isLinkType = (t: ResourceType) => LINK_TYPES.includes(t);

export const RESOURCE_ICON: Record<ResourceType, IconName> = {
  PDF: 'pdf',
  IMAGE: 'image',
  AUDIO: 'audio',
  FILE: 'file',
  VIDEO_LINK: 'video',
  EXTERNAL_LINK: 'link',
};

const MB = 1024 * 1024;
const IMAGE = ['image/jpeg', 'image/png', 'image/webp'];
const AUDIO = ['audio/mpeg', 'audio/mp4'];

/** Accepted stored types per resource type (backend TYPE_MIMES). */
export const TYPE_MIMES: Record<'PDF' | 'IMAGE' | 'AUDIO' | 'FILE', readonly string[]> = {
  PDF: ['application/pdf'],
  IMAGE,
  AUDIO,
  FILE: ['application/pdf', ...IMAGE, ...AUDIO],
};

/** Phone pickers report a few aliases for the same audio types. */
const ALIASES: Record<string, string> = { 'audio/mp3': 'audio/mpeg', 'audio/x-m4a': 'audio/mp4', 'audio/m4a': 'audio/mp4', 'image/jpg': 'image/jpeg' };
const BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
};

const ACCEPTED = new Set<string>(TYPE_MIMES.FILE);

/**
 * The chosen file's type, as the server will expect it declared: the
 * picker's type normalized (aliases); when the phone reports a generic or
 * unusual type (application/octet-stream, audio/mpeg3, none…), the type of
 * its extension; else null (refused). The server compares the DECLARED type
 * with the detected content (FILE_TYPE_MISMATCH otherwise).
 */
export function mimeOf(file: Pick<PickedFile, 'name' | 'mimeType'>): string | null {
  const raw = file.mimeType?.toLowerCase().split(';')[0]!.trim();
  const declared = raw ? (ALIASES[raw] ?? raw) : null;
  if (declared && ACCEPTED.has(declared)) return declared;
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  return BY_EXTENSION[ext] ?? null;
}

/** Backend limits: FILE_MAX_IMAGE_BYTES 5 MB, FILE_MAX_PDF_BYTES 15 MB, FILE_MAX_AUDIO_BYTES 25 MB. */
export function sizeLimitOf(mime: string): number {
  if (mime.startsWith('image/')) return 5 * MB;
  if (mime === 'application/pdf') return 15 * MB;
  return 25 * MB;
}

/** "2.4 م.ب" / "350 ك.ب" */
export function formatSize(bytes: number): string {
  if (bytes >= MB) return `${(bytes / MB).toFixed(1).replace(/\.0$/, '')} م.ب`;
  return `${Math.max(1, Math.round(bytes / 1024))} ك.ب`;
}

/**
 * http(s) only, with a host — never javascript:, data:, file:, intent: or
 * a relative path (the backend's SafeUrl rule, checked again before opening).
 */
export function isSafeUrl(value: string | null | undefined): value is string {
  if (!value) return false;
  const text = value.trim();
  if (!/^https?:\/\//i.test(text) || /\s/.test(text)) return false;
  try {
    const url = new URL(text);
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname.includes('.');
  } catch {
    return false;
  }
}

export const publisherName = (r: Pick<Resource, 'publishedBy'>) => `${r.publishedBy.firstName} ${r.publishedBy.lastName}`;

/** Who the resource reaches (the web's labels): «جميع الطلاب», group names, or «group — branch». */
export function targetLabels(r: Pick<Resource, 'visibility' | 'groups' | 'groupClasses'>, allStudents: string): string[] {
  if (r.visibility === 'ALL_STUDENTS') return [allStudents];
  if (r.visibility === 'GROUP') return r.groups.map((g) => g.name);
  return r.groupClasses.map((c) => `${c.group.name} — ${c.branch.name}`);
}

// ───────────────────────── form ─────────────────────────

export interface ResourceDraft {
  title: string;
  description: string;
  type: ResourceType;
  url: string;
  classIds: string[];
  /** A NEW file chosen on the phone (else the saved file is kept when the type is unchanged) */
  file: PickedFile | null;
}

export type ResourceInputError =
  | 'titleRequired'
  | 'titleTooLong'
  | 'descriptionTooLong'
  | 'urlInvalid'
  | 'fileRequired'
  | 'fileTypeMismatch'
  | 'fileTooLarge'
  | 'classesRequired'
  | 'tooManyClasses';

export function validateResource(draft: ResourceDraft, existing?: Resource): ResourceInputError | null {
  const title = draft.title.trim();
  if (!title) return 'titleRequired';
  if (title.length > TITLE_MAX) return 'titleTooLong';
  if (draft.description.trim().length > DESCRIPTION_MAX) return 'descriptionTooLong';
  if (isLinkType(draft.type)) {
    if (!isSafeUrl(draft.url) || draft.url.trim().length > URL_MAX) return 'urlInvalid';
  } else {
    const keepsFile = !draft.file && existing?.type === draft.type && Boolean(existing.file);
    if (!draft.file && !keepsFile) return 'fileRequired';
    if (draft.file) {
      const mime = mimeOf(draft.file);
      if (!mime || !TYPE_MIMES[draft.type as keyof typeof TYPE_MIMES].includes(mime)) return 'fileTypeMismatch';
      if (draft.file.size !== null && draft.file.size > sizeLimitOf(mime)) return 'fileTooLarge';
    }
  }
  if (draft.classIds.length === 0) return 'classesRequired';
  if (draft.classIds.length > TARGETS_MAX) return 'tooManyClasses';
  return null;
}

/** The web's body: a link carries its URL and fileId null; a file type its NEW fileId (or keeps the saved one). */
export function resourceBody(draft: ResourceDraft, fileId: string | undefined): TeacherResourceBody {
  return {
    title: draft.title.trim(),
    description: draft.description.trim(),
    type: draft.type,
    ...(isLinkType(draft.type) ? { externalUrl: draft.url.trim(), fileId: null } : fileId ? { fileId } : {}),
    groupClassIds: draft.classIds,
  };
}

export const draftOf = (r: Resource | undefined, allowedClassIds: ReadonlySet<string>, initialClassId?: string): ResourceDraft => ({
  title: r?.title ?? '',
  description: r?.description ?? '',
  type: r?.type ?? 'PDF',
  url: r?.externalUrl ?? '',
  // A teacher can only keep targets among their own current classes
  classIds: r
    ? r.groupClasses.map((c) => c.id).filter((id) => allowedClassIds.has(id))
    : initialClassId && allowedClassIds.has(initialClassId)
      ? [initialClassId]
      : allowedClassIds.size === 1
        ? [...allowedClassIds]
        : [],
  file: null,
});

export type ResourceErrorKind = 'offline' | 'notFound' | 'forbidden' | 'invalid' | 'tooLarge' | 'unknown';

/** Every failure keeps the form; offline is never shown as «denied». */
export function classifyResourceError(error: unknown): ResourceErrorKind {
  if (!(error instanceof ApiError)) return 'unknown';
  if (error.isNetwork) return 'offline';
  if (error.status === 413 || error.code === 'FILE_TOO_LARGE') return 'tooLarge';
  if (error.isNotFound) return 'notFound';
  if (error.isForbidden) return 'forbidden';
  if (error.status === 400) return 'invalid';
  return 'unknown';
}
