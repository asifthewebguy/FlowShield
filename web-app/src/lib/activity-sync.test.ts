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

  it('honors windowTitle rules when activity object provides windowTitle', () => {
    const rules: RuleStub[] = [
      { keyword: 'spotify', matchField: 'windowTitle', category: 'Entertainment' },
    ];
    expect(
      resolveCategory(
        { applicationName: 'unknown.exe', windowTitle: 'Spotify - Daily Mix' },
        'Browsing',
        rules
      )
    ).toBe('Entertainment');
  });

  it('honors processName rules', () => {
    const rules: RuleStub[] = [
      { keyword: 'code', matchField: 'processName', category: 'Development' },
    ];
    expect(
      resolveCategory(
        { applicationName: 'editor', processName: 'code.exe' },
        'Browsing',
        rules
      )
    ).toBe('Development');
  });

  it('honors url rules', () => {
    const rules: RuleStub[] = [
      { keyword: 'youtube', matchField: 'url', category: 'Entertainment' },
    ];
    expect(
      resolveCategory(
        { applicationName: 'chrome.exe', url: 'https://www.youtube.com/watch?v=foo' },
        'Browsing',
        rules
      )
    ).toBe('Entertainment');
  });

  it('skips rules whose target field is missing', () => {
    const rules: RuleStub[] = [
      { keyword: 'messenger', matchField: 'windowTitle', category: 'Communication' },
    ];
    // No windowTitle present → rule does not match → fall through to applicationName? No,
    // there's no applicationName rule; fall back to client category.
    expect(
      resolveCategory({ applicationName: 'messenger.com' }, 'Browsing', rules)
    ).toBe('Browsing');
  });

  it('preserves backwards compatibility when called with a bare applicationName string', () => {
    const rules: RuleStub[] = [
      { keyword: 'messenger', matchField: 'applicationName', category: 'Communication' },
    ];
    expect(resolveCategory('messenger.com', 'Browsing', rules)).toBe('Communication');
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
