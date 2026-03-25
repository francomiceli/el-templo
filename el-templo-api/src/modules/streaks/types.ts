// Module: streaks

export const STREAK_SETTINGS_KEYS = {
  MILESTONE_7_AURA: "streak.milestone_7_aura",
  MILESTONE_14_AURA: "streak.milestone_14_aura",
  MILESTONE_30_AURA: "streak.milestone_30_aura",
  MILESTONE_60_AURA: "streak.milestone_60_aura",
  MILESTONE_100_AURA: "streak.milestone_100_aura",
} as const;

export const STREAK_DEFAULTS = {
  MILESTONE_7_AURA: 20,
  MILESTONE_14_AURA: 35,
  MILESTONE_30_AURA: 50,
  MILESTONE_60_AURA: 100,
  MILESTONE_100_AURA: 200,
} as const;

export const STREAK_MILESTONES = [7, 14, 30, 60, 100] as const;

export interface StreakMilestoneConfig {
  milestone7Aura: number;
  milestone14Aura: number;
  milestone30Aura: number;
  milestone60Aura: number;
  milestone100Aura: number;
}

/** Maps a milestone day count to its config key for AURA lookup */
export const MILESTONE_TO_CONFIG_KEY: Record<
  number,
  keyof StreakMilestoneConfig
> = {
  7: "milestone7Aura",
  14: "milestone14Aura",
  30: "milestone30Aura",
  60: "milestone60Aura",
  100: "milestone100Aura",
};
