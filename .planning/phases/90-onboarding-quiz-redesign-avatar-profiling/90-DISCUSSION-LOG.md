# Phase 90: Onboarding Quiz Redesign & Avatar Profiling - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions captured in CONTEXT.md — this log preserves the analysis.

**Date:** 2026-04-06
**Phase:** 90-onboarding-quiz-redesign-avatar-profiling
**Mode:** discuss (with codebase analysis)
**Areas analyzed:** Schema Migration, Gender Availability, Re-onboarding, Avatar Resolution, Quiz Questions, Admin Visibility

## Context

User had already defined the 5-question quiz structure and avatar research earlier in the same conversation session. The avatar docs (`.docs/avatars-docs/`) were read comprehensively by a research agent, producing a full taxonomy of 11 avatars (A-K) with pain points, demographics, and program mappings.

## Assumptions Presented

### Schema Migration

| Assumption                                                   | Confidence | Evidence                                                   |
| ------------------------------------------------------------ | ---------- | ---------------------------------------------------------- |
| Add 5 new nullable columns to member_profiles                | Confident  | member-profiles.ts has 1:1 with users, old fields NOT NULL |
| Make old 4 columns nullable (new quiz doesn't populate them) | Likely     | New quiz questions have zero overlap with old fields       |

### Gender Availability

| Assumption                                                | Confidence | Evidence                                                                         |
| --------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------- |
| Add gender to /auth/me response and UserProfile interface | Confident  | users.ts:55 has enum, RegisterPage captures it, auth/routes.ts doesn't return it |

### Re-onboarding

| Assumption                                       | Confidence | Evidence                                                         |
| ------------------------------------------------ | ---------- | ---------------------------------------------------------------- |
| Convert INSERT-only to upsert for existing users | Likely     | DuplicateOnboardingError guard, Phase 78 D-14 blocked re-editing |

### Avatar Resolution

| Assumption                                 | Confidence | Evidence                                            |
| ------------------------------------------ | ---------- | --------------------------------------------------- |
| Pure deterministic function, not DB lookup | Likely     | goal-plans/constants.ts uses hardcoded maps pattern |

## Corrections Made

### Re-onboarding

- **Original assumption:** Convert to upsert, add re-onboarding endpoint for existing users
- **User correction:** No re-onboarding. Only new users get the avatar quiz. Existing users keep old profile data.
- **Reason:** "we don't care about them so don't bother re-onboarding them"

### Gender (other/unspecified)

- **Original:** Unclear — needed product decision
- **User decision:** Show ALL options (both men's and women's) for other/unspecified gender

### Avatar Matrix

- **Original:** Needed external definition
- **User decision:** Claude drafts the decision tree from avatar docs, user reviews
