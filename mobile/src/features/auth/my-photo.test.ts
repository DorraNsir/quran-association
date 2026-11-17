import { photoMimeOf, PhotoPickFailure, pickPhoto, removeMyPhoto, saveMyPhoto } from './my-photo';

/*
 * The own-photo flow: permissions asked only when chosen, the picked image
 * checked, then uploaded (multipart, field «file») and attached through the
 * role's OWN endpoint. Native modules and the network are replaced.
 */
const mockPicker = {
  requestCameraPermissionsAsync: jest.fn(),
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
};
jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: () => mockPicker.requestCameraPermissionsAsync(),
  requestMediaLibraryPermissionsAsync: () => mockPicker.requestMediaLibraryPermissionsAsync(),
  launchCameraAsync: (o: unknown) => mockPicker.launchCameraAsync(o),
  launchImageLibraryAsync: (o: unknown) => mockPicker.launchImageLibraryAsync(o),
}));
jest.mock('expo-file-system', () => ({
  File: class {
    uri: string;
    constructor(uri: string) {
      this.uri = uri;
    }
    async arrayBuffer() {
      return new TextEncoder().encode(`JPEG of ${this.uri}`).buffer;
    }
  },
}));

/** React Native's FormData as the phone has it (Jest's Node FormData stringifies objects). */
class MockFormData {
  readonly parts: [string, unknown][] = [];
  append(name: string, value: unknown) {
    this.parts.push([name, value]);
  }
  entries() {
    return this.parts;
  }
}
const realFormData = globalThis.FormData;
beforeAll(() => {
  globalThis.FormData = MockFormData as unknown as typeof FormData;
});
afterAll(() => {
  globalThis.FormData = realFormData;
});
beforeEach(() => {
  Object.values(mockPicker).forEach((f) => f.mockReset());
});

const granted = { granted: true };
const asset = (extra: object = {}) => ({ canceled: false, assets: [{ uri: 'file:///cache/ImagePicker/x.jpg', mimeType: 'image/jpeg', fileName: 'IMG_1.jpg', fileSize: 120_000, ...extra }] });

describe('picking', () => {
  it('asks the CAMERA permission only for the camera, then opens it (square crop, compressed)', async () => {
    mockPicker.requestCameraPermissionsAsync.mockResolvedValue(granted);
    mockPicker.launchCameraAsync.mockResolvedValue(asset());
    const photo = await pickPhoto('camera');
    expect(mockPicker.requestMediaLibraryPermissionsAsync).not.toHaveBeenCalled();
    expect(mockPicker.launchCameraAsync).toHaveBeenCalledWith({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    expect(photo).toEqual({ uri: 'file:///cache/ImagePicker/x.jpg', name: 'photo.jpg', mimeType: 'image/jpeg', size: 120_000 });
  });

  it('permission refused: nothing is opened', async () => {
    mockPicker.requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: false });
    await expect(pickPhoto('library')).rejects.toEqual(new PhotoPickFailure('permission'));
    expect(mockPicker.launchImageLibraryAsync).not.toHaveBeenCalled();
  });

  it('cancelled: null; an unsupported type or a file over 5 MB is refused before any upload', async () => {
    mockPicker.requestMediaLibraryPermissionsAsync.mockResolvedValue(granted);
    mockPicker.launchImageLibraryAsync.mockResolvedValueOnce({ canceled: true, assets: null });
    expect(await pickPhoto('library')).toBeNull();
    mockPicker.launchImageLibraryAsync.mockResolvedValueOnce(asset({ mimeType: 'image/heic', fileName: 'IMG.HEIC', uri: 'file:///x.heic' }));
    await expect(pickPhoto('library')).rejects.toMatchObject({ kind: 'type' });
    mockPicker.launchImageLibraryAsync.mockResolvedValueOnce(asset({ fileSize: 6 * 1024 * 1024 }));
    await expect(pickPhoto('library')).rejects.toMatchObject({ kind: 'size' });
  });

  it('the image type: declared, aliased, or from the extension', () => {
    expect(photoMimeOf({ mimeType: 'image/jpg', uri: 'a' })).toBe('image/jpeg');
    expect(photoMimeOf({ mimeType: null, fileName: 'a.PNG', uri: 'a' })).toBe('image/png');
    expect(photoMimeOf({ mimeType: 'application/octet-stream', uri: 'file:///a.webp' })).toBe('image/webp');
    expect(photoMimeOf({ mimeType: 'image/heic', uri: 'file:///a.heic' })).toBeNull();
  });
});

describe('saving through MY endpoint', () => {
  type Call = { method: string; path: string; params: URLSearchParams; body?: unknown; form?: unknown };
  const calls: Call[] = [];
  beforeEach(() => {
    calls.length = 0;
    globalThis.fetch = jest.fn(async (url: string, init?: RequestInit) => {
      const u = new URL(url);
      const form = init?.body instanceof MockFormData ? init.body : undefined;
      calls.push({ method: init?.method ?? 'GET', path: u.pathname, params: u.searchParams, body: form ? undefined : init?.body ? JSON.parse(String(init.body)) : undefined, form });
      const body = u.pathname.endsWith('/files') ? { id: 'file-9' } : { personId: 'p1', photoFileId: 'file-9', photoUrl: '/api/files/file-9' };
      return { status: 200, ok: true, text: async () => JSON.stringify(body) };
    }) as unknown as typeof fetch;
  });

  it('teacher: PROFILE_PHOTO upload (field «file», the real type), then PUT /api/teacher/profile/photo { fileId }', async () => {
    const saved = await saveMyPhoto('teacher', { uri: 'file:///x.jpg', name: 'photo.jpg', mimeType: 'image/jpeg', size: 10 });
    const [upload, attach] = calls;
    expect(upload!.path).toBe('/api/files');
    expect(upload!.params.get('purpose')).toBe('PROFILE_PHOTO');
    // What expo/fetch (SDK 58) really sends for this FormData
    const { convertFormDataAsync } = jest.requireActual('expo/src/winter/fetch/convertFormData');
    const { body } = await convertFormDataAsync(upload!.form, 'B');
    expect(new TextDecoder().decode(body)).toBe(
      '--B\r\ncontent-disposition: form-data; name="file"; filename="photo.jpg"\r\ncontent-type: image/jpeg\r\n\r\nJPEG of file:///x.jpg\r\n--B--\r\n',
    );
    expect(attach).toMatchObject({ method: 'PUT', path: '/api/teacher/profile/photo', body: { fileId: 'file-9' } });
    expect(saved.photoUrl).toBe('/api/files/file-9');
  });

  it('removing: DELETE the role\'s own endpoint (a student uses /student)', async () => {
    await removeMyPhoto('student');
    expect(calls).toEqual([expect.objectContaining({ method: 'DELETE', path: '/api/student/profile/photo' })]);
  });
});
