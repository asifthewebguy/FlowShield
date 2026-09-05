import { describe, it, expect } from 'vitest';
import {
  LoginSchema,
  SignupSchema,
  CreateSessionSchema,
  CreateGoalSchema,
  CreateProjectSchema,
  CreateTaskSchema,
  UpdateTaskSchema,
  UpdatePreferencesSchema,
  UpdateProfileSchema,
  PushSendSchema,
} from './schemas';

// ─── LoginSchema ──────────────────────────────────────────────────────────────

describe('LoginSchema', () => {
  it('accepts valid credentials', () => {
    const result = LoginSchema.safeParse({ email: 'user@example.com', password: 'secret' });
    expect(result.success).toBe(true);
  });

  it('accepts optional rememberMe', () => {
    const result = LoginSchema.safeParse({
      email: 'user@example.com',
      password: 'secret',
      rememberMe: true,
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid email', () => {
    const result = LoginSchema.safeParse({ email: 'not-an-email', password: 'secret' });
    expect(result.success).toBe(false);
  });

  it('rejects missing password', () => {
    const result = LoginSchema.safeParse({ email: 'user@example.com', password: '' });
    expect(result.success).toBe(false);
  });
});

// ─── SignupSchema ─────────────────────────────────────────────────────────────

describe('SignupSchema', () => {
  const valid = { email: 'user@example.com', password: 'StrongP@ss1', name: 'Alice' };

  it('accepts a valid signup payload', () => {
    expect(SignupSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts signup without optional name', () => {
    expect(SignupSchema.safeParse({ email: valid.email, password: valid.password }).success).toBe(true);
  });

  it('rejects password shorter than 8 characters', () => {
    const result = SignupSchema.safeParse({ ...valid, password: 'Ab1' });
    expect(result.success).toBe(false);
  });

  it('rejects password without uppercase letter', () => {
    const result = SignupSchema.safeParse({ ...valid, password: 'mypassword1' });
    expect(result.success).toBe(false);
  });

  it('rejects password without lowercase letter', () => {
    const result = SignupSchema.safeParse({ ...valid, password: 'MYPASSWORD1' });
    expect(result.success).toBe(false);
  });

  it('rejects password without a number', () => {
    const result = SignupSchema.safeParse({ ...valid, password: 'MyPassword' });
    expect(result.success).toBe(false);
  });

  it('rejects name longer than 100 characters', () => {
    const result = SignupSchema.safeParse({ ...valid, name: 'A'.repeat(101) });
    expect(result.success).toBe(false);
  });
});

// ─── CreateSessionSchema ──────────────────────────────────────────────────────

describe('CreateSessionSchema', () => {
  it('accepts a valid session with defaults', () => {
    const result = CreateSessionSchema.safeParse({ plannedDuration: 25 });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.sessionType).toBe('WORK');
  });

  it('accepts all valid session types', () => {
    for (const type of ['WORK', 'STUDY', 'CREATIVE'] as const) {
      const result = CreateSessionSchema.safeParse({ plannedDuration: 25, sessionType: type });
      expect(result.success).toBe(true);
    }
  });

  it('rejects duration below 1', () => {
    expect(CreateSessionSchema.safeParse({ plannedDuration: 0 }).success).toBe(false);
  });

  it('rejects duration above 480', () => {
    expect(CreateSessionSchema.safeParse({ plannedDuration: 481 }).success).toBe(false);
  });

  it('rejects invalid session type', () => {
    expect(
      CreateSessionSchema.safeParse({ plannedDuration: 25, sessionType: 'INVALID' }).success
    ).toBe(false);
  });

  it('rejects non-integer duration', () => {
    expect(CreateSessionSchema.safeParse({ plannedDuration: 25.5 }).success).toBe(false);
  });
});

// ─── CreateGoalSchema ─────────────────────────────────────────────────────────

describe('CreateGoalSchema', () => {
  it('accepts a valid goal', () => {
    const result = CreateGoalSchema.safeParse({ targetValue: 120, type: 'DAILY_TIME' });
    expect(result.success).toBe(true);
  });

  it('defaults type to DAILY_TIME', () => {
    const result = CreateGoalSchema.safeParse({ targetValue: 60 });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.type).toBe('DAILY_TIME');
  });

  it('rejects targetValue below 1', () => {
    expect(CreateGoalSchema.safeParse({ targetValue: 0 }).success).toBe(false);
  });

  it('accepts all valid goal types', () => {
    for (const type of ['DAILY_TIME', 'WEEKLY_TIME', 'STREAK', 'PRODUCTIVITY_SCORE'] as const) {
      expect(CreateGoalSchema.safeParse({ targetValue: 10, type }).success).toBe(true);
    }
  });
});

// ─── CreateProjectSchema ──────────────────────────────────────────────────────

describe('CreateProjectSchema', () => {
  it('accepts a valid project name', () => {
    expect(CreateProjectSchema.safeParse({ name: 'My Project' }).success).toBe(true);
  });

  it('accepts a valid hex color', () => {
    expect(
      CreateProjectSchema.safeParse({ name: 'Project', color: '#ff5733' }).success
    ).toBe(true);
  });

  it('rejects an empty name', () => {
    expect(CreateProjectSchema.safeParse({ name: '' }).success).toBe(false);
  });

  it('rejects name longer than 100 characters', () => {
    expect(CreateProjectSchema.safeParse({ name: 'X'.repeat(101) }).success).toBe(false);
  });

  it('rejects invalid hex color format', () => {
    expect(
      CreateProjectSchema.safeParse({ name: 'Project', color: 'red' }).success
    ).toBe(false);
    expect(
      CreateProjectSchema.safeParse({ name: 'Project', color: '#xyz' }).success
    ).toBe(false);
  });
});

// ─── UpdatePreferencesSchema ──────────────────────────────────────────────────

describe('UpdatePreferencesSchema', () => {
  it('accepts an empty update (all fields optional)', () => {
    expect(UpdatePreferencesSchema.safeParse({}).success).toBe(true);
  });

  it('accepts valid preferences', () => {
    const result = UpdatePreferencesSchema.safeParse({
      workStyle: 'deep',
      preferredDuration: 45,
      primaryDistractions: ['youtube', 'twitter'],
      darkMode: true,
      soundEnabled: false,
      breakReminders: true,
    });
    expect(result.success).toBe(true);
  });

  it('rejects preferredDuration below 5', () => {
    expect(UpdatePreferencesSchema.safeParse({ preferredDuration: 4 }).success).toBe(false);
  });

  it('rejects preferredDuration above 240', () => {
    expect(UpdatePreferencesSchema.safeParse({ preferredDuration: 241 }).success).toBe(false);
  });
});

// ─── PushSendSchema ───────────────────────────────────────────────────────────

describe('PushSendSchema', () => {
  const validId = '550e8400-e29b-41d4-a716-446655440000';

  it('accepts a valid push send payload', () => {
    const result = PushSendSchema.safeParse({
      title: 'Hello',
      body: 'World',
      userId: validId,
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty title', () => {
    expect(PushSendSchema.safeParse({ title: '', body: 'World', userId: validId }).success).toBe(false);
  });

  it('rejects title longer than 100 characters', () => {
    expect(
      PushSendSchema.safeParse({ title: 'A'.repeat(101), body: 'World', userId: validId }).success
    ).toBe(false);
  });

  it('rejects body longer than 500 characters', () => {
    expect(
      PushSendSchema.safeParse({ title: 'Hi', body: 'B'.repeat(501), userId: validId }).success
    ).toBe(false);
  });

  it('rejects non-UUID userId', () => {
    expect(
      PushSendSchema.safeParse({ title: 'Hi', body: 'World', userId: 'not-a-uuid' }).success
    ).toBe(false);
  });
});

describe('shareWindowDetails preference', () => {
  it('UpdatePreferencesSchema accepts shareWindowDetails: false', () => {
    const r = UpdatePreferencesSchema.safeParse({ shareWindowDetails: false });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.shareWindowDetails).toBe(false);
  });

  it('UpdatePreferencesSchema rejects a non-boolean shareWindowDetails', () => {
    const r = UpdatePreferencesSchema.safeParse({ shareWindowDetails: 'no' });
    expect(r.success).toBe(false);
  });

  it('UpdateProfileSchema accepts preferences.shareWindowDetails (strict object)', () => {
    const r = UpdateProfileSchema.safeParse({
      preferences: { primaryDistractions: [], shareWindowDetails: true },
    });
    expect(r.success).toBe(true);
  });
});

describe('CreateTaskSchema', () => {
  it('accepts a minimal task (title only)', () => {
    const result = CreateTaskSchema.safeParse({ title: 'Write the report' });
    expect(result.success).toBe(true);
  });

  it('rejects an empty title', () => {
    const result = CreateTaskSchema.safeParse({ title: '' });
    expect(result.success).toBe(false);
  });

  it('accepts tags as an array of strings', () => {
    const result = CreateTaskSchema.safeParse({ title: 'x', tags: ['deep-work', 'client-a'] });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.tags).toEqual(['deep-work', 'client-a']);
  });

  it('rejects a non-uuid projectId', () => {
    const result = CreateTaskSchema.safeParse({ title: 'x', projectId: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });

  it('rejects more than 20 tags', () => {
    const tags = Array.from({ length: 21 }, (_, i) => `tag-${i}`);
    const result = CreateTaskSchema.safeParse({ title: 'x', tags });
    expect(result.success).toBe(false);
  });
});

describe('UpdateTaskSchema', () => {
  it('accepts a bare status change', () => {
    const result = UpdateTaskSchema.safeParse({ status: 'DONE' });
    expect(result.success).toBe(true);
  });

  it('accepts an empty object (no-op patch)', () => {
    const result = UpdateTaskSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('rejects an invalid status value', () => {
    const result = UpdateTaskSchema.safeParse({ status: 'ARCHIVED' });
    expect(result.success).toBe(false);
  });
});

describe('CreateSessionSchema taskId', () => {
  it('accepts an optional taskId', () => {
    const result = CreateSessionSchema.safeParse({ plannedDuration: 25, taskId: '123e4567-e89b-12d3-a456-426614174000' });
    expect(result.success).toBe(true);
  });

  it('accepts a null taskId', () => {
    const result = CreateSessionSchema.safeParse({ plannedDuration: 25, taskId: null });
    expect(result.success).toBe(true);
  });

  it('omitting taskId still works (backward compatible)', () => {
    const result = CreateSessionSchema.safeParse({ plannedDuration: 25 });
    expect(result.success).toBe(true);
  });
});
