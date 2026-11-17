/*
 * «الموارد التعليمية» DTOs — backend communication/resource.dto.ts and
 * files/file.dto.ts (teacher routes).
 */
export type ResourceType = 'PDF' | 'IMAGE' | 'AUDIO' | 'VIDEO_LINK' | 'EXTERNAL_LINK' | 'FILE';
export type ResourceVisibility = 'ALL_STUDENTS' | 'GROUP' | 'GROUP_CLASS';

export interface ResourceFile {
  id: string;
  fileName: string;
  mimeType: string;
  /** Bytes */
  size: number;
  /** "/api/files/…" — an AUTHENTICATED download (Bearer header), authorized from the resource */
  url: string;
}

export interface Resource {
  id: string;
  title: string;
  description: string;
  type: ResourceType;
  externalUrl: string | null;
  file: ResourceFile | null;
  visibility: ResourceVisibility;
  groups: { id: string; name: string }[];
  groupClasses: { id: string; group: { id: string; name: string }; branch: { id: string; name: string } }[];
  publishedBy: { id: string; firstName: string; lastName: string };
  /** The server's answer: I may edit / delete it (I published it) */
  canManage: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ResourceFilters {
  search?: string;
  type?: ResourceType;
  groupClassId?: string;
  /** Only what I published */
  mine?: boolean;
}

/** TeacherResourceDto: always GROUP_CLASS, toward my current classes. */
export interface TeacherResourceBody {
  title: string;
  description: string;
  type: ResourceType;
  externalUrl?: string;
  fileId?: string | null;
  groupClassIds: string[];
}

/** StoredFileDto — POST /api/files */
export interface StoredFile {
  id: string;
  purpose: string;
  mimeType: string;
  size: number;
  originalName: string;
  createdAt: string;
  url: string;
}

/** A file chosen on the phone (document picker), not uploaded yet. */
export interface PickedFile {
  uri: string;
  name: string;
  mimeType: string | null;
  size: number | null;
}
