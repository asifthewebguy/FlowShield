import { describe, it, expect } from 'vitest';
import { validateEmail, validatePassword } from './auth';

describe('validateEmail', () => {
  it('accepts valid email addresses', () => {
    expect(validateEmail('user@example.com')).toBe(true);
    expect(validateEmail('name.surname@domain.co.uk')).toBe(true);
    expect(validateEmail('user+tag@gmail.com')).toBe(true);
  });

  it('rejects invalid email addresses', () => {
    expect(validateEmail('')).toBe(false);
    expect(validateEmail('notanemail')).toBe(false);
    expect(validateEmail('@domain.com')).toBe(false);
    expect(validateEmail('user@')).toBe(false);
    expect(validateEmail('user @domain.com')).toBe(false);
  });
});

describe('validatePassword', () => {
  it('accepts a valid password', () => {
    const result = validatePassword('MyPass123');
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('rejects passwords shorter than 8 characters', () => {
    const result = validatePassword('Ab1');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('8 characters');
  });

  it('rejects passwords without uppercase', () => {
    const result = validatePassword('mypass123');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('uppercase');
  });

  it('rejects passwords without lowercase', () => {
    const result = validatePassword('MYPASS123');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('lowercase');
  });

  it('rejects passwords without numbers', () => {
    const result = validatePassword('MyPassword');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('number');
  });
});
