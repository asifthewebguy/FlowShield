import { describe, it, expect } from 'vitest';
import { resolveCategory } from './activity-sync';

// Minimal shape — only fields resolveCategory cares about
interface RuleStub {
  keyword: string;
  matchField: string;
  category: string;
}

const noRules: RuleStub[] = [];

describe('resolveCategory', () => {
  it('trusts client category when it is specific (not Browsing or Unknown)', () => {
    const rules: RuleStub[] = [
      { keyword: 'github', matchField: 'applicationName', category: 'Development' },
    ];
    // Client already sent 'Development' — no lookup needed
    expect(resolveCategory('github.com', 'Development', rules)).toBe('Development');
  });

  it('applies normalizeCategory alias when trusting client', () => {
    // Desktop sends 'Productivity' — should map to 'Work'
    expect(resolveCategory('word.exe', 'Productivity', noRules)).toBe('Work');
  });

  it('looks up rule when client sends Browsing', () => {
    const rules: RuleStub[] = [
      { keyword: 'messenger', matchField: 'applicationName', category: 'Communication' },
    ];
    expect(resolveCategory('messenger.com', 'Browsing', rules)).toBe('Communication');
  });

  it('looks up rule when client sends Unknown', () => {
    const rules: RuleStub[] = [
      { keyword: 'photos.google', matchField: 'applicationName', category: 'Creative' },
    ];
    expect(resolveCategory('photos.google.com', 'Unknown', rules)).toBe('Creative');
  });

  it('falls back to client category when no rule matches', () => {
    expect(resolveCategory('obscure-site.com', 'Browsing', noRules)).toBe('Browsing');
  });

  it('ignores rules with matchField other than applicationName', () => {
    const rules: RuleStub[] = [
      { keyword: 'messenger', matchField: 'windowTitle', category: 'Communication' },
    ];
    expect(resolveCategory('messenger.com', 'Browsing', rules)).toBe('Browsing');
  });

  it('uses first matching rule (rules pre-sorted by priority desc)', () => {
    // User rule (priority 10, isGlobal false) comes first in the pre-sorted array
    const rules: RuleStub[] = [
      { keyword: 'github', matchField: 'applicationName', category: 'Work' },       // user override
      { keyword: 'github', matchField: 'applicationName', category: 'Development' }, // global default
    ];
    expect(resolveCategory('github.com', 'Browsing', rules)).toBe('Work');
  });

  it('is case-insensitive on applicationName', () => {
    const rules: RuleStub[] = [
      { keyword: 'messenger', matchField: 'applicationName', category: 'Communication' },
    ];
    expect(resolveCategory('Messenger.COM', 'Browsing', rules)).toBe('Communication');
  });
});
