import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { apiUrl, setAuthBridge } from '@/services/api';

import { avatarLetter, InitialsAvatar, resolvePhoto } from './avatar';

describe('avatar: ONE meaningful letter', () => {
  it('the examples: first letter of the full name', () => {
    expect(avatarLetter('حمادي الشوك')).toBe('ح');
    expect(avatarLetter('مريم الربودي')).toBe('م');
    expect(avatarLetter('فادي بالحاج')).toBe('ف');
  });

  it('skips leading spaces, diacritics, tatweel and punctuation; keeps hamza forms', () => {
    expect(avatarLetter('   سارة بن علي')).toBe('س');
    expect(avatarLetter('َُأحمد')).toBe('أ');
    expect(avatarLetter('ـــإيمان')).toBe('إ');
    expect(avatarLetter('«آمنة»')).toBe('آ');
    expect(avatarLetter('- يوسف')).toBe('ي');
  });

  it('Latin names upper-cased; empty, missing or letter-less names give nothing', () => {
    expect(avatarLetter('nour ben ali')).toBe('N');
    expect(avatarLetter('')).toBe('');
    expect(avatarLetter(null)).toBe('');
    expect(avatarLetter(undefined)).toBe('');
    expect(avatarLetter(' - ')).toBe('');
  });

  it('the component renders exactly one letter, hidden from screen readers (the name is read next to it)', async () => {
    await render(<InitialsAvatar name="حمادي الشوك" />);
    expect(screen.getByText('ح', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.queryByText('حم', { includeHiddenElements: true })).toBeNull();
  });
});

/** The avatar is hidden from screen readers (the name is always written beside it) */
const HIDDEN = { includeHiddenElements: true } as const;

describe('person photos (private files: token in the HEADER only)', () => {
  const signIn = (token: string | null) =>
    setAuthBridge({ getAccessToken: () => token, refresh: async () => 'renewed', onSessionEnded: () => undefined });
  afterEach(() => setAuthBridge(null));

  it('resolves a private "/api/files/…" path to the API URL with an Authorization header — never a token in the URL', () => {
    const photo = resolvePhoto('/api/files/f1', 'tok-1');
    expect(photo).toEqual({ uri: apiUrl('/api/files/f1'), headers: { Authorization: 'Bearer tok-1' }, private: true });
    expect(photo!.uri).not.toMatch(/tok-1/);
    expect(photo!.uri).toMatch(/^https?:\/\/.+\/api\/files\/f1$/);
  });

  it('a public absolute URL is used as is; nothing else is guessed', () => {
    expect(resolvePhoto('https://cdn.example.org/p.jpg', null)).toEqual({ uri: 'https://cdn.example.org/p.jpg', private: false });
    expect(resolvePhoto(null, 'tok')).toBeNull();
    expect(resolvePhoto('   ', 'tok')).toBeNull();
    expect(resolvePhoto('uploads/p.jpg', 'tok')).toBeNull(); // another relative path: not an API file
    expect(resolvePhoto('/api/files/f1', null)).toBeNull(); // signed out: no request
  });

  it('shows the photo over the letter: private ones in memory only, keyed by the URL', async () => {
    signIn('tok-1');
    await render(<InitialsAvatar name="أحمد السالمي" photoUrl="/api/files/f1" />);
    const image = screen.getByTestId('avatar-photo', HIDDEN);
    // The native view receives the source as a list
    expect(image.props.source[0]).toMatchObject({ uri: apiUrl('/api/files/f1'), headers: { Authorization: 'Bearer tok-1' }, cacheKey: apiUrl('/api/files/f1') });
    expect(image.props.cachePolicy).toBe('memory');
    expect(screen.getByText('أ', HIDDEN)).toBeTruthy(); // the letter stays underneath while it loads
  });

  it('no photo: the letter only', async () => {
    signIn('tok-1');
    await render(<InitialsAvatar name="آمنة" photoUrl={null} />);
    expect(screen.queryByTestId('avatar-photo', HIDDEN)).toBeNull();
    expect(screen.getByText('آ', HIDDEN)).toBeTruthy();
  });

  it('a photo that fails to load (missing file, no access, offline) falls back to the letter', async () => {
    signIn('tok-1');
    await render(<InitialsAvatar name="يوسف" photoUrl="/api/files/missing" />);
    await act(async () => {
      fireEvent(screen.getByTestId('avatar-photo', HIDDEN), 'error', { nativeEvent: { error: 'HTTP 404' } });
    });
    expect(screen.queryByTestId('avatar-photo', HIDDEN)).toBeNull();
    expect(screen.getByText('ي', HIDDEN)).toBeTruthy();
  });
});
