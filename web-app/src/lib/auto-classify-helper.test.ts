import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  classify: vi.fn(),
  update: vi.fn(),
}));

vi.mock('@/lib/project-classifier', () => ({
  classifySessionProject: mocks.classify,
}));

vi.mock('@/lib/prisma', () => ({
  prisma: { session: { update: mocks.update } },
}));

import { autoClassifyIfNeeded, nextWeightedAverage } from './auto-classify-helper';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('autoClassifyIfNeeded', () => {
  const baseSession: any = { id: 's-1', userId: 'u-1', projectId: null };

  it('returns the session unchanged when projectId is already set', async () => {
    const session = { ...baseSession, projectId: 'p-existing' };
    const result = await autoClassifyIfNeeded('s-1', 'u-1', session);
    expect(result).toBe(session);
    expect(mocks.classify).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('returns the session unchanged when classifier finds no match', async () => {
    mocks.classify.mockResolvedValueOnce(null);
    const result = await autoClassifyIfNeeded('s-1', 'u-1', baseSession);
    expect(result).toBe(baseSession);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('updates the session with the guessed project on a hit', async () => {
    mocks.classify.mockResolvedValueOnce('p-2');
    mocks.update.mockResolvedValueOnce({ ...baseSession, projectId: 'p-2' });
    const result = await autoClassifyIfNeeded('s-1', 'u-1', baseSession);
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: 's-1' },
      data: { projectId: 'p-2' },
    });
    expect(result.projectId).toBe('p-2');
  });

  it('swallows classifier errors and returns the original session', async () => {
    mocks.classify.mockRejectedValueOnce(new Error('boom'));
    const result = await autoClassifyIfNeeded('s-1', 'u-1', baseSession);
    expect(result).toBe(baseSession);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});

describe('nextWeightedAverage', () => {
  it('returns the new score (rounded) when there is no prior data', () => {
    expect(nextWeightedAverage(null, 0, 80)).toBe(80);
    expect(nextWeightedAverage(undefined, 0, 87.4)).toBe(87);
    expect(nextWeightedAverage(70, 0, 90)).toBe(90); // count=0 dominates
  });

  it('averages across the existing count plus one', () => {
    // (80 * 1 + 60) / 2 = 70
    expect(nextWeightedAverage(80, 1, 60)).toBe(70);
    // (75 * 4 + 95) / 5 = 79
    expect(nextWeightedAverage(75, 4, 95)).toBe(79);
  });

  it('rounds to the nearest integer', () => {
    // (80 * 1 + 81) / 2 = 80.5 → 81
    expect(nextWeightedAverage(80, 1, 81)).toBe(81);
  });
});
