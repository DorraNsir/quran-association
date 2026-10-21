import { oneOf, onlyId } from './cleanup-ids.js';

describe('E2E cleanup filters', () => {
  it('a known id: that row only', () => {
    expect(onlyId('a')).toEqual({ id: { in: ['a'] } });
    expect(oneOf('a')).toEqual({ in: ['a'] });
  });

  it('a missing id (setup failed): matches nothing, never an unrestricted filter', () => {
    expect(onlyId(undefined)).toEqual({ id: { in: [] } });
    expect(oneOf(undefined)).toEqual({ in: [] });
  });
});
