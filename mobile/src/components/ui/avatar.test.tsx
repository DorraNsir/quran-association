import { render, screen } from '@testing-library/react-native';

import { avatarLetter, InitialsAvatar } from './avatar';

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
