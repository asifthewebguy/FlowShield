import { describe, it, expect } from 'vitest';
import {
  tokenizeProjectName,
  scoreActivity,
  classifyFromSnapshots,
  type ActivitySnapshot,
  type ProjectSnapshot,
} from './project-classifier';

function activity(partial: Partial<ActivitySnapshot>): ActivitySnapshot {
  return {
    applicationName: null,
    processName: null,
    url: null,
    windowTitle: null,
    durationSeconds: 60,
    ...partial,
  };
}

describe('tokenizeProjectName', () => {
  it('splits on whitespace and punctuation, lowercases, drops short tokens', () => {
    expect(tokenizeProjectName('Acme Redesign')).toEqual(['acme', 'redesign']);
    expect(tokenizeProjectName('Acme-Redesign/v2')).toEqual(['acme', 'redesign']);
    expect(tokenizeProjectName('UI QA')).toEqual([]);
    expect(tokenizeProjectName('Foo_Bar.Baz')).toEqual(['foo', 'bar', 'baz']);
  });
});

describe('scoreActivity', () => {
  it('gives windowTitle and url the highest weight (3 each)', () => {
    const log = activity({ windowTitle: 'Acme Redesign - Figma', url: 'https://acme.com/redesign' });
    expect(scoreActivity(log, ['acme', 'redesign'])).toBe(3 + 3 + 3 + 3);
  });

  it('applicationName weighted at 2, processName at 1', () => {
    const log = activity({ applicationName: 'Acme Desktop', processName: 'acme.exe' });
    expect(scoreActivity(log, ['acme'])).toBe(2 + 1);
  });

  it('no tokens -> score 0', () => {
    const log = activity({ windowTitle: 'Acme' });
    expect(scoreActivity(log, [])).toBe(0);
  });

  it('no hits -> score 0', () => {
    const log = activity({ windowTitle: 'Completely unrelated' });
    expect(scoreActivity(log, ['acme'])).toBe(0);
  });
});

describe('classifyFromSnapshots', () => {
  const acme: ProjectSnapshot = { id: 'p-acme', name: 'Acme Redesign' };
  const widgets: ProjectSnapshot = { id: 'p-widgets', name: 'Widgets Platform' };
  const generic: ProjectSnapshot = { id: 'p-ui', name: 'UI' }; // too short, no tokens

  it('returns null when no projects exist', () => {
    const acts = [activity({ windowTitle: 'Any window' })];
    expect(classifyFromSnapshots(acts, [])).toBeNull();
  });

  it('returns null when no activity exists', () => {
    expect(classifyFromSnapshots([], [acme])).toBeNull();
  });

  it('picks the project whose tokens appear in the activity', () => {
    const acts = [
      activity({ windowTitle: 'Acme Redesign - Figma', durationSeconds: 600 }),
      activity({ windowTitle: 'Reddit - r/programming', durationSeconds: 60 }),
    ];
    expect(classifyFromSnapshots(acts, [acme, widgets])).toBe('p-acme');
  });

  it('weights by duration so a long session outranks a shorter competing one', () => {
    const acts = [
      activity({ windowTitle: 'Widgets dashboard', durationSeconds: 30 }),
      activity({ windowTitle: 'Acme Redesign - Figma', durationSeconds: 3600 }),
    ];
    expect(classifyFromSnapshots(acts, [acme, widgets])).toBe('p-acme');
  });

  it('assigns even a weak match when no stronger candidate exists', () => {
    const acts = [
      activity({ processName: 'acme.exe', durationSeconds: 30 }),
      activity({ windowTitle: 'Unrelated', durationSeconds: 30 }),
    ];
    // Only acme gets any hits (weight 1 via processName) -> must win.
    expect(classifyFromSnapshots(acts, [acme, widgets])).toBe('p-acme');
  });

  it('returns null when no project name matches anything', () => {
    const acts = [activity({ windowTitle: 'Just browsing' })];
    expect(classifyFromSnapshots(acts, [acme, widgets])).toBeNull();
  });

  it('skips projects whose name tokenizes to zero tokens', () => {
    const acts = [activity({ windowTitle: 'UI - some window' })];
    // The 'UI' project has no tokens (too short), so it cannot match.
    expect(classifyFromSnapshots(acts, [generic])).toBeNull();
  });
});
