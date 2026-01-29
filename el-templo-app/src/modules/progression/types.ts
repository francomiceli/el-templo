/**
 * TypeScript interfaces for progression data
 *
 * Matches the API response structure from /progression endpoints.
 */

export interface ProgressionLevel {
  current: 'alfa' | 'delta' | 'sigma' | 'omega' | 'spartan';
  displayName: string;
  greekLetter: string;
}

export interface ProgressionStats {
  totalSessions: number;
  totalDaysTrained: number;
  sessionsThisWeek: number;
  currentStreak: number;
}

export interface RpeTrend {
  labels: string[];
  data: (number | null)[];
  averageRpe: number;
}

export interface EvaluationStatus {
  eligible: boolean;
  averageRpeLast2Weeks: number | null;
  pendingRequest: boolean;
  requestedAt: string | null;
}

export interface ProgressionResponse {
  level: ProgressionLevel;
  stats: ProgressionStats;
  rpeTrend: RpeTrend;
  evaluation: EvaluationStatus;
}
