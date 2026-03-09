import { describe, it, expect } from 'vitest';
import {
  LoginSchema,
  SignupSchema,
  CreateSessionSchema,
  CreateGoalSchema,
  CreateProjectSchema,
  UpdatePreferencesSchema,
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
