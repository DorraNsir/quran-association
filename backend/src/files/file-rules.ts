import { FilePurpose } from '../generated/prisma/enums.js';
import type { FileKind } from './file-signature.js';

/**
 * Upload purposes: who may upload, which content kinds are accepted and
 * where the file may later be attached.
 *
 *  ASSOCIATION_LOGO      ADMIN               images   → association settings logo
 *  CMS_IMAGE             ADMIN               images   → website content (slides, news…)
 *  PROFILE_PHOTO         ADMIN               images   → a student's / teacher's photo
 *  EDUCATIONAL_RESOURCE  ADMIN, or TEACHER   images, PDF, audio → a resource
 *                        for a class they are CURRENTLY assigned to
 */
export const PURPOSE_KINDS: Record<FilePurpose, FileKind[]> = {
  [FilePurpose.ASSOCIATION_LOGO]: ['IMAGE'],
  [FilePurpose.CMS_IMAGE]: ['IMAGE'],
  [FilePurpose.PROFILE_PHOTO]: ['IMAGE'],
  [FilePurpose.EDUCATIONAL_RESOURCE]: ['IMAGE', 'PDF', 'AUDIO'],
};

/** Purposes whose files any ADMIN may attach (admin-managed content). */
export const ADMIN_MANAGED: FilePurpose[] = [
  FilePurpose.ASSOCIATION_LOGO,
  FilePurpose.CMS_IMAGE,
  FilePurpose.PROFILE_PHOTO,
  FilePurpose.EDUCATIONAL_RESOURCE,
];
