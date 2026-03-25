# Phase 81: Streaks & Engagement Mechanics - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Persist attendance streaks (current + longest) on member_profiles with plan-aware rest day tolerance. Display an inline streak row on Tu Día when active (hidden when broken). Award AURA bonuses at streak milestones (7, 14, 30, 60, 100 days). No milestone celebration screens, no changes to existing CelebrationScreen.

</domain>

<decisions>
## Implementation Decisions

### Streak Logic

- **D-01:** Streaks are plan-aware. Rest days between planned training days do NOT break the streak. A streak only breaks when a member misses a planned training day. Uses subscription schedule data (fixedDays / classesPerWeek) to determine expected training days.
- **D-02:** Persist `currentStreak`, `longestStreak`, `streakUpdatedAt` on the existing `member_profiles` table. No separate streaks table.
- **D-03:** Update streak after each session completion (not on page load). The existing on-the-fly calculation in progression service is replaced by the persisted value.
- **D-04:** When streak breaks (missed a planned training day), `currentStreak` resets to 0 silently. No notification, no "streak lost" message. The streak row just disappears from Tu Día.
- **D-05:** `longestStreak` only increases, never decreases. Updated whenever `currentStreak` exceeds it.

### Streak Display

- **D-06:** Streak shows as an inline row on Tu Día between the greeting and the session/booking cards. NOT a full card — a subtle row with fire icon + "X días de racha" text.
- **D-07:** Streak row only renders when `currentStreak > 0`. When streak is 0 or broken, nothing shows — no empty state, no guilt messaging.
- **D-08:** Fill the `<!-- streak: Phase 81 -->` placeholder in WeeklySummaryCard — not applicable anymore since we removed that card's streak slot. Streak lives in its own inline row on MiCamino.vue instead.

### Celebration & Animations

- **D-09:** NO milestone celebration screens in this phase. No full-screen overlays. No changes to the existing CelebrationScreen.vue (post-session flame + quote stays as-is).
- **D-10:** No confetti, no particle bursts for streaks. Keep it clean and minimal.

### AURA Rewards

- **D-11:** Regular session completion awards 10 AURA (this is a new baseline — verify if already implemented or needs to be added in this phase).
- **D-12:** Streak milestones award AURA bonuses (one-time per milestone, uses existing `streak_bonus` source type):
  - 7-day streak: +20 AURA
  - 14-day streak: +35 AURA
  - 30-day streak: +50 AURA
  - 60-day streak: +100 AURA
  - 100-day streak: +200 AURA
- **D-13:** AURA milestone awards are silent — added to balance after session completion. No celebration screen, no popup. The member sees their balance increase.
- **D-14:** Milestone thresholds should be configurable via system_settings (same pattern as segmentation thresholds from Phase 79). Keys like `streak.milestone_7_aura=20`, etc.

### Claude's Discretion

- Streak calculation service architecture (extend existing progression service vs new StreakService)
- How to detect "missed planned training day" (cron check vs on-login vs on-session-completion)
- Whether to backfill streaks from existing session history on first run
- Streak row component design (inline div vs thin card vs badge)
- How the 10 AURA per session completion integrates (if not already implemented)

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements

- `.planning/REQUIREMENTS-v4.4.md` — ENG-11 (streak tracking + display), ENG-12 (post-session celebration — no changes this phase), ENG-13 (milestone celebrations — deferred), ENG-14 (AURA for streak milestones)

### Prior Phase Context

- `.planning/phases/78-onboarding-user-profiling/78-CONTEXT.md` — member_profiles table schema
- `.planning/phases/79-behavioral-segmentation/79-CONTEXT.md` — system_settings pattern for configurable thresholds
- `.planning/phases/80-tu-dia-daily-game-plan/80-CONTEXT.md` — Tu Día card layout, MiCamino structure

### Existing Code (integration points)

- `el-templo-api/src/modules/progression/service.ts` — Existing `calculateStreak()` function (to be replaced)
- `el-templo-api/src/modules/progression/routes.ts` — Returns `currentStreak` in stats (line 162)
- `el-templo-api/src/db/schema/member-profiles.ts` — Table to extend with streak columns
- `el-templo-api/src/db/schema/aura-config.ts` — `streak_bonus` source type already exists
- `el-templo-api/src/modules/aura/service.ts` — AuraService.award() for milestone rewards
- `el-templo-api/src/db/schema/subscription-schedules.ts` — Schedule data for plan-aware rest day detection
- `el-templo-app/src/modules/progression/pages/MiCamino.vue` — Where streak row goes (between greeting and cards)
- `el-templo-app/src/modules/training/components/player/CelebrationScreen.vue` — Existing post-session celebration (no changes)
- `el-templo-app/src/modules/progression/types.ts` — `currentStreak` already in ProgressionStats type

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- **calculateStreak()** in progression/service.ts — Current on-the-fly calculation. Logic can be adapted for the persisted version.
- **AuraService.award()** — Used for onboarding completion (Phase 78). Same pattern for streak milestones.
- **system_settings pattern** (Phase 79) — SettingsService + system_settings table for configurable thresholds.
- **streak_bonus source type** — Already in aura_config and aura_transactions enums. No enum migration needed.
- **CelebrationScreen.vue** — Post-session screen. Not modified but context for where AURA notifications could appear later.

### Established Patterns

- Constructor DI for services
- member_profiles as the extension point for member data (segment, onboarding, now streaks)
- system_settings for configurable thresholds
- Progression store for frontend stat data

### Integration Points

- Session completion handler — where streak update + AURA award should trigger
- `/api/progression/stats` — already returns `currentStreak`, now from persisted value
- MiCamino.vue template — insert streak row between SegmentGreeting and card template loop

</code_context>

<specifics>
## Specific Ideas

- Streak display is intentionally subtle — fire icon + text, not a card. Appears only when active, vanishes when broken.
- Plan-aware tolerance prevents frustration: a 3x/week member doesn't lose their streak on rest days.
- AURA milestone amounts scale: 20 → 35 → 50 → 100 → 200. Designed to be meaningful on top of the 10 AURA per session base.
- No guilt mechanics — no "you lost your streak" messaging, no streak freeze power-ups, no recovery options. Just quiet reset.
- The 10 AURA per session baseline may need to be implemented in this phase if not already active.

</specifics>

<deferred>
## Deferred Ideas

- **Milestone celebration screens** — Full-screen celebration with particle burst on streak milestones. Could come in a future engagement phase.
- **Streak freeze / recovery** — "Use 50 AURA to recover your streak." Gamification mechanic for later.
- **Streak leaderboard** — Show top streakers in the gym. Social/competitive feature.
- **Visual streak calendar** — GitHub-style contribution grid showing training days. Cool but complex UI.
- **Post-check-in streak** — Count QR check-ins as streak contributions (not just app sessions). Needs attendance module integration.

</deferred>

---

_Phase: 81-streaks-engagement-mechanics_
_Context gathered: 2026-03-24_
