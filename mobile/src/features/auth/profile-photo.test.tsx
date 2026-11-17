import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Alert } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ar } from '@/i18n/ar';
import { ApiError } from '@/services/api';

import { PhotoPickFailure } from './my-photo';
import { ProfilePhotoEditor } from './profile-photo';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
const mockSetOwnPhoto = jest.fn();
jest.mock('./auth-provider', () => ({ session: { setOwnPhoto: (u: string | null) => mockSetOwnPhoto(u) } }));
const mockPick = jest.fn();
const mockSave = jest.fn();
const mockRemove = jest.fn();
jest.mock('./my-photo', () => ({
  ...jest.requireActual('./my-photo'),
  pickPhoto: (s: string) => mockPick(s),
  saveMyPhoto: (r: string, p: unknown) => mockSave(r, p),
  removeMyPhoto: (r: string) => mockRemove(r),
}));

const p = ar.photo;
let client: QueryClient;
async function renderEditor(photoUrl: string | null) {
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  jest.spyOn(client, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </SafeAreaProvider>
  );
  await render(<ProfilePhotoEditor role="teacher" name="حمدي الشوك" photoUrl={photoUrl} />, { wrapper });
}
const open = () => fireEvent.press(screen.getByLabelText(p.change));
const picked = { uri: 'file:///x.jpg', name: 'photo.jpg', mimeType: 'image/jpeg', size: 1 };

beforeEach(() => {
  [mockPick, mockSave, mockRemove, mockSetOwnPhoto].forEach((f) => f.mockReset());
});

describe('own photo — the options sheet', () => {
  it('camera and gallery always; «حذف الصورة» only when there is a photo', async () => {
    await renderEditor(null);
    await open();
    expect(screen.getByLabelText(p.camera)).toBeTruthy();
    expect(screen.getByLabelText(p.library)).toBeTruthy();
    expect(screen.queryByLabelText(p.remove)).toBeNull();
  });

  it('a new photo from the gallery: saved by the server, then the session photo and the teacher data refreshed', async () => {
    mockPick.mockResolvedValue(picked);
    mockSave.mockResolvedValue({ personId: 'p1', photoFileId: 'f9', photoUrl: '/api/files/f9' });
    await renderEditor(null);
    await open();
    await fireEvent.press(screen.getByLabelText(p.library));
    await act(async () => undefined);
    expect(mockPick).toHaveBeenCalledWith('library');
    expect(mockSave).toHaveBeenCalledWith('teacher', picked);
    expect(mockSetOwnPhoto).toHaveBeenCalledWith('/api/files/f9');
    expect(client.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['teacher'] });
    expect(screen.getByText(p.updated)).toBeTruthy();
  });

  it('cancelled picker: nothing saved, nothing changed', async () => {
    mockPick.mockResolvedValue(null);
    await renderEditor(null);
    await open();
    await fireEvent.press(screen.getByLabelText(p.camera));
    await act(async () => undefined);
    expect(mockSave).not.toHaveBeenCalled();
    expect(mockSetOwnPhoto).not.toHaveBeenCalled();
  });

  it('camera permission refused: explained, nothing saved', async () => {
    mockPick.mockRejectedValue(new PhotoPickFailure('permission'));
    await renderEditor(null);
    await open();
    await fireEvent.press(screen.getByLabelText(p.camera));
    await act(async () => undefined);
    expect(screen.getByText(p.permissionCamera)).toBeTruthy();
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('a server or network failure keeps the old photo and says why', async () => {
    mockPick.mockResolvedValue(picked);
    mockSave.mockRejectedValue(new ApiError(0, 'NETWORK_ERROR', 'x'));
    await renderEditor('/api/files/old');
    await open();
    await fireEvent.press(screen.getByLabelText(p.library));
    await act(async () => undefined);
    expect(screen.getByText(p.offline)).toBeTruthy();
    expect(mockSetOwnPhoto).not.toHaveBeenCalled();
  });

  it('delete asks first; confirmed, the server removes it and the session follows (null)', async () => {
    mockRemove.mockResolvedValue({ personId: 'p1', photoFileId: null, photoUrl: null });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => buttons?.find((b) => b.style === 'destructive')?.onPress?.());
    await renderEditor('/api/files/old');
    await open();
    await fireEvent.press(screen.getByLabelText(p.remove));
    await act(async () => undefined);
    expect(alert).toHaveBeenCalledWith(p.removeTitle, p.removeMessage, expect.any(Array));
    expect(mockRemove).toHaveBeenCalledWith('teacher');
    expect(mockSetOwnPhoto).toHaveBeenCalledWith(null);
    expect(screen.getByText(p.removed)).toBeTruthy();
    alert.mockRestore();
  });
});
