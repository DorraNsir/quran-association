import { render, screen } from '@testing-library/react-native';

import { TimeRange } from './time-range';

describe('TimeRange (no reliance on bidi reordering)', () => {
  it('renders start, dash, end as separate texts in that order — the first child is drawn on the right in RTL', async () => {
    await render(<TimeRange start="09:00" end="11:00" />);
    const texts = screen.getAllByText(/^(09:00|–|11:00)$/).map((n) => n.props.children);
    expect(texts).toEqual(['09:00', '–', '11:00']);
  });

  it('times are LTR runs with tabular digits; the range reads naturally to screen readers', async () => {
    await render(<TimeRange start="17:00" end="19:30" />);
    const start = screen.getByText('17:00');
    expect(start).toHaveStyle({ writingDirection: 'ltr' });
    expect(screen.getByLabelText('من 17:00 إلى 19:30')).toBeTruthy();
  });
});

describe('TimeRange order is fixed, whatever the device layout direction', () => {
  it('the row direction is forced to RTL: start always on the right, read first (LTR device or Expo Go before the RTL reload)', async () => {
    await render(<TimeRange start="08:30" end="10:00" />);
    expect(screen.getByLabelText('من 08:30 إلى 10:00')).toHaveStyle({ direction: 'rtl', flexDirection: 'row' });
  });

  it('shows the backend times exactly as given (no conversion, no reordering)', async () => {
    await render(<TimeRange start="23:15" end="00:45" />);
    expect(screen.getAllByText(/^\d\d:\d\d$/).map((n) => n.props.children)).toEqual(['23:15', '00:45']);
  });
});
