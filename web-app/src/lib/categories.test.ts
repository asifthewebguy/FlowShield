/**
 * Tests for category-related utilities exported from the categories API route.
 * We import the pure functions directly — no HTTP layer involved.
 */
import { describe, it, expect } from 'vitest';
import {
  CATEGORIES,
  PRODUCTIVE_CATEGORIES,
  CATEGORY_ALIASES,
  normalizeCategory,
} from '../app/api/categories/route';

// ─── CATEGORIES constant ──────────────────────────────────────────────────────

describe('CATEGORIES', () => {
  it('is a non-empty readonly array', () => {
    expect(Array.isArray(CATEGORIES)).toBe(true);
    expect(CATEGORIES.length).toBeGreaterThan(0);
  });

  it('contains all expected canonical categories', () => {
    const expected = [
      'Development',
      'Work',
      'Communication',
      'Entertainment',
      'Social Media',
      'Browsing',
      'Creative',
      'Study',
      'Unknown',
    ];
    for (const cat of expected) {
      expect(CATEGORIES).toContain(cat);
    }
  });

  it('has no duplicate entries', () => {
    expect(new Set(CATEGORIES).size).toBe(CATEGORIES.length);
  });
});

// ─── PRODUCTIVE_CATEGORIES constant ──────────────────────────────────────────

describe('PRODUCTIVE_CATEGORIES', () => {
  it('is a subset of CATEGORIES', () => {
    for (const cat of PRODUCTIVE_CATEGORIES) {
      expect(CATEGORIES).toContain(cat);
    }
  });

  it('includes Development, Work, Creative, Study', () => {
    expect(PRODUCTIVE_CATEGORIES).toContain('Development');
    expect(PRODUCTIVE_CATEGORIES).toContain('Work');
    expect(PRODUCTIVE_CATEGORIES).toContain('Creative');
    expect(PRODUCTIVE_CATEGORIES).toContain('Study');
  });

  it('does not include Entertainment or Social Media', () => {
    expect(PRODUCTIVE_CATEGORIES).not.toContain('Entertainment');
    expect(PRODUCTIVE_CATEGORIES).not.toContain('Social Media');
  });
});

// ─── CATEGORY_ALIASES constant ────────────────────────────────────────────────

describe('CATEGORY_ALIASES', () => {
  it('maps Productivity to Work', () => {
    expect(CATEGORY_ALIASES['Productivity']).toBe('Work');
  });

  it('maps Social to Social Media', () => {
    expect(CATEGORY_ALIASES['Social']).toBe('Social Media');
  });

  it('all alias targets are in CATEGORIES', () => {
    for (const target of Object.values(CATEGORY_ALIASES)) {
      expect(CATEGORIES).toContain(target);
    }
  });
});

// ─── normalizeCategory ────────────────────────────────────────────────────────

describe('normalizeCategory', () => {
  it('maps desktop "Productivity" to web "Work"', () => {
    expect(normalizeCategory('Productivity')).toBe('Work');
  });

  it('maps desktop "Social" to web "Social Media"', () => {
    expect(normalizeCategory('Social')).toBe('Social Media');
  });

  it('passes through already-canonical categories unchanged', () => {
    expect(normalizeCategory('Development')).toBe('Development');
    expect(normalizeCategory('Work')).toBe('Work');
    expect(normalizeCategory('Entertainment')).toBe('Entertainment');
    expect(normalizeCategory('Unknown')).toBe('Unknown');
    expect(normalizeCategory('Browsing')).toBe('Browsing');
  });

  it('passes through unrecognised categories unchanged', () => {
    expect(normalizeCategory('SomeNewCategory')).toBe('SomeNewCategory');
    expect(normalizeCategory('')).toBe('');
  });

  it('is case-sensitive (no partial matching)', () => {
    // "productivity" (lowercase) should NOT be aliased
    expect(normalizeCategory('productivity')).toBe('productivity');
    expect(normalizeCategory('SOCIAL')).toBe('SOCIAL');
  });
});
