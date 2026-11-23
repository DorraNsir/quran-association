import * as ImagePicker from 'expo-image-picker';

import type { IconName, PillTone } from '@/components/ui';

/*
 * «الملاحظات والاقتراحات» (backend src/feedback): a teacher or a student sends feedback about the
 * application and follows their OWN submissions (/teacher/feedback, /student/feedback). The
 * sender, the date and the status are never sent: the server takes them from the account.
 */

export type FeedbackSpace = 'teacher' | 'student';
export type FeedbackCategory = 'BUG' | 'IMPROVEMENT' | 'OTHER';
export type FeedbackStatus = 'NEW' | 'REVIEWING' | 'RESOLVED' | 'CLOSED';

export const FEEDBACK_CATEGORIES: FeedbackCategory[] = ['BUG', 'IMPROVEMENT', 'OTHER'];
export const FEEDBACK_TITLE_MAX = 120;
export const FEEDBACK_TEXT_MAX = 3000;

export interface Feedback {
  id: string;
  category: FeedbackCategory;
  title: string;
  description: string;
  status: FeedbackStatus;
  screenshot: { id: string; url: string; mimeType: string; size: number } | null;
  response: string | null;
  respondedAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
}

/** Icon + words (never colour alone), subtle tones — the same meanings as the web. */
export const CATEGORY_LOOK: Record<FeedbackCategory, { icon: IconName; tone: PillTone }> = {
  BUG: { icon: 'error', tone: 'danger' },
  IMPROVEMENT: { icon: 'improve', tone: 'warning' },
  OTHER: { icon: 'notes', tone: 'muted' },
};

export const STATUS_LOOK: Record<FeedbackStatus, { icon: IconName; tone: PillTone }> = {
  NEW: { icon: 'info', tone: 'info' },
  REVIEWING: { icon: 'clock', tone: 'warning' },
  RESOLVED: { icon: 'success', tone: 'success' },
  CLOSED: { icon: 'ban', tone: 'muted' },
};

export interface FeedbackDraft {
  category: FeedbackCategory;
  title: string;
  description: string;
}

export type DraftErrors = Partial<Record<'title' | 'description', 'required' | 'tooLong'>>;

/** The form's own checks (the server checks the same). */
export function validateFeedback(d: FeedbackDraft): DraftErrors {
  const errors: DraftErrors = {};
  const title = d.title.trim();
  const description = d.description.trim();
  if (!title) errors.title = 'required';
  else if (title.length > FEEDBACK_TITLE_MAX) errors.title = 'tooLong';
  if (!description) errors.description = 'required';
  else if (description.length > FEEDBACK_TEXT_MAX) errors.description = 'tooLong';
  return errors;
}

/* ------------------------------- screenshot ------------------------------- */

export interface PickedScreenshot {
  uri: string;
  name: string;
  mimeType: string;
}

export const SCREENSHOT_MAX_BYTES = 5 * 1024 * 1024;
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];
const BY_EXTENSION: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
const EXTENSION: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

export type ScreenshotPickError = 'type' | 'size';

export class ScreenshotPickFailure extends Error {
  constructor(readonly kind: ScreenshotPickError) {
    super(kind);
    this.name = 'ScreenshotPickFailure';
  }
}

/** The image type as the server will expect it declared (aliases and extension fallback). */
export function screenshotMimeOf(asset: { mimeType?: string | null; fileName?: string | null; uri: string }): string | null {
  const raw = asset.mimeType?.toLowerCase();
  const declared = raw === 'image/jpg' ? 'image/jpeg' : raw;
  if (declared && ACCEPTED.includes(declared)) return declared;
  const ext = (asset.fileName ?? asset.uri).split('?')[0]!.split('.').pop()?.toLowerCase() ?? '';
  return BY_EXTENSION[ext] ?? null;
}

/**
 * The system photo picker (gallery only — never the camera, so no camera permission): one image,
 * not cropped (a screenshot stays whole), compressed. null when cancelled.
 */
export async function pickScreenshot(): Promise<PickedScreenshot | null> {
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 0.8 });
  if (result.canceled || !result.assets?.[0]) return null;
  const asset = result.assets[0];
  const mimeType = screenshotMimeOf(asset);
  if (!mimeType) throw new ScreenshotPickFailure('type');
  if (asset.fileSize && asset.fileSize > SCREENSHOT_MAX_BYTES) throw new ScreenshotPickFailure('size');
  return { uri: asset.uri, name: `screenshot.${EXTENSION[mimeType]}`, mimeType };
}
