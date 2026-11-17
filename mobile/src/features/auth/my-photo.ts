import { File as ExpoFile } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';

import { api } from '@/services/api';

/*
 * The signed-in person's OWN photo (teacher or student):
 *  - upload: POST /api/files?purpose=PROFILE_PHOTO (multipart field `file`;
 *    JPEG / PNG / WebP, 5 MB; the server detects the real type);
 *  - attach: PUT /api/{role}/profile/photo { fileId } — only a file THEY
 *    uploaded (FILE_NOT_FOUND otherwise); remove: DELETE the same path.
 * The person always comes from the account (no id in the request).
 */
export type PhotoRole = 'teacher' | 'student';

export interface PersonPhoto {
  personId: string;
  photoFileId: string | null;
  photoUrl: string | null;
}

export interface PickedPhoto {
  uri: string;
  name: string;
  mimeType: string;
  size: number | null;
}

export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];
const BY_EXTENSION: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
const EXTENSION: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

export type PhotoPickError = 'permission' | 'type' | 'size';

export class PhotoPickFailure extends Error {
  constructor(readonly kind: PhotoPickError) {
    super(kind);
    this.name = 'PhotoPickFailure';
  }
}

/** The real image type as the server will expect it declared (aliases and extension fallback). */
export function photoMimeOf(asset: { mimeType?: string | null; fileName?: string | null; uri: string }): string | null {
  const raw = asset.mimeType?.toLowerCase();
  const declared = raw === 'image/jpg' ? 'image/jpeg' : raw;
  if (declared && ACCEPTED.includes(declared)) return declared;
  const ext = (asset.fileName ?? asset.uri).split('?')[0]!.split('.').pop()?.toLowerCase() ?? '';
  return BY_EXTENSION[ext] ?? null;
}

/**
 * Asks for the needed permission ONLY now (camera or photo library), then
 * opens it: a square crop, compressed (JPEG). null when cancelled.
 */
export async function pickPhoto(source: 'camera' | 'library'): Promise<PickedPhoto | null> {
  const permission =
    source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) throw new PhotoPickFailure('permission');
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 };
  const result = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled || !result.assets?.[0]) return null;
  const asset = result.assets[0];
  const mimeType = photoMimeOf(asset);
  if (!mimeType) throw new PhotoPickFailure('type');
  if (asset.fileSize && asset.fileSize > PHOTO_MAX_BYTES) throw new PhotoPickFailure('size');
  return { uri: asset.uri, name: `photo.${EXTENSION[mimeType]}`, mimeType, size: asset.fileSize ?? null };
}

/** Upload (multipart through expo/fetch: a part exposing bytes()), then attach to MY profile. */
export async function saveMyPhoto(role: PhotoRole, photo: PickedPhoto): Promise<PersonPhoto> {
  const form = new FormData();
  const local = new ExpoFile(photo.uri);
  form.append('file', {
    name: photo.name,
    type: photo.mimeType,
    bytes: async () => new Uint8Array(await local.arrayBuffer()),
  } as unknown as Blob);
  const stored = await api<{ id: string }>('/files', {
    method: 'POST',
    query: { purpose: 'PROFILE_PHOTO' },
    form,
    timeoutMs: 120_000,
  });
  return api<PersonPhoto>(`/${role}/profile/photo`, { method: 'PUT', body: { fileId: stored.id } });
}

export const removeMyPhoto = (role: PhotoRole) => api<PersonPhoto>(`/${role}/profile/photo`, { method: 'DELETE' });
