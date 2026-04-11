import { z } from 'zod';

export const LoginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
  rememberMe: z.boolean().optional(),
});

export const SignupSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  name: z.string().max(100).optional(),
});

export const CreateSessionSchema = z.object({
  plannedDuration: z.number().int().min(1).max(480),
  sessionType: z.enum(['WORK', 'STUDY', 'CREATIVE']).default('WORK'),
  projectId: z.string().uuid().optional().nullable(),
});

export const CreateGoalSchema = z.object({
  targetValue: z.number().int().min(1),
  type: z.enum(['DAILY_TIME', 'WEEKLY_TIME', 'STREAK', 'PRODUCTIVITY_SCORE']).default('DAILY_TIME'),
});

export const CreateProjectSchema = z.object({
  name: z.string().min(1, 'Project name is required').max(100),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Invalid hex color')
    .optional(),
  hourlyRate: z.number().positive('Hourly rate must be positive').optional(),
  budget: z.number().positive('Budget must be positive').optional(),
  plannedHours: z.number().positive('Planned hours must be positive').optional(),
});

export const UpdateProjectCostSchema = z.object({
  hourlyRate: z.number().positive('Hourly rate must be positive').nullable().optional(),
  budget: z.number().positive('Budget must be positive').nullable().optional(),
  plannedHours: z.number().positive('Planned hours must be positive').nullable().optional(),
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: 'At least one field must be provided' }
);

export const UpdatePreferencesSchema = z.object({
  workStyle: z.string().optional(),
  preferredDuration: z.number().int().min(5).max(240).optional(),
  primaryDistractions: z.array(z.string()).optional(),
  workEnvironment: z.string().optional(),
  breakReminders: z.boolean().optional(),
  soundEnabled: z.boolean().optional(),
  darkMode: z.boolean().optional(),
});

export const PushSendSchema = z.object({
  title: z.string().min(1).max(100),
  body: z.string().min(1).max(500),
  userId: z.string().uuid(),
});
