export interface SessionData {
  id: string;
  startTime: Date;
  endTime?: Date;
  plannedDuration: number;
  actualDuration?: number;
  sessionType: 'WORK' | 'STUDY' | 'CREATIVE';
  productivityScore?: number;
  completed: boolean;
}

export interface UserPreferencesData {
  workStyle?: string;
  preferredDuration: number;
  primaryDistractions: string[];
  workEnvironment?: string;
  breakReminders: boolean;
  soundEnabled: boolean;
  darkMode: boolean;
}

export interface DailyStatsData {
  date: Date;
  totalFocusMinutes: number;
  avgProductivityScore?: number;
  topDistractions?: { app: string; minutes: number }[];
  peakFocusHour?: number;
  sessionsCompleted: number;
}

export interface GoalData {
  id: string;
  goalType: 'DAILY_TIME' | 'WEEKLY_TIME' | 'STREAK' | 'PRODUCTIVITY_SCORE';
  targetValue: number;
  currentValue: number;
  startDate: Date;
  endDate?: Date;
  active: boolean;
}

export interface OnboardingData {
  workStyle: string;
  preferredDuration: number;
  primaryDistractions: string[];
  workEnvironment: string;
}
