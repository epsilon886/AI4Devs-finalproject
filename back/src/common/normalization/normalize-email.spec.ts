import { normalizeEmail } from './normalize-email';

describe('normalizeEmail', () => {
  it('trims and lowercases an email value', () => {
    expect(normalizeEmail('  USER@Example.COM  ')).toBe('user@example.com');
  });

  it('keeps an empty value empty', () => {
    expect(normalizeEmail('   ')).toBe('');
  });

  it('normalizes without deciding whether the result is a valid email', () => {
    expect(normalizeEmail('  not an email  ')).toBe('not an email');
  });
});
