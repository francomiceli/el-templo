---
phase: 76-known-issues-fix
verified: 2026-03-26T14:54:00Z
status: passed
score: 3/3 must-haves verified
re_verification: false
---

# Phase 76: Known Issues Fix Verification Report

**Phase Goal:** Three known bugs from v5.0 testing are resolved so the bot runs without errors in production
**Verified:** 2026-03-26T14:54:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                                                               | Status   | Evidence                                                                                                                                                                           |
| --- | ----------------------------------------------------------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Scheduler SQL queries use correct DB column names (booking_status, subscription_status) and do not error at runtime                 | VERIFIED | `class-reminder.ts` line 93: `b.booking_status = 'reservado'`. `trial-followup.ts` lines 106 and 116: `s.subscription_status` and `s2.subscription_status IN ('active', 'paused')` |
| 2   | OpenAI assistant messages with tool_calls include the tool_calls array so subsequent tool role messages pass validation             | VERIFIED | `openai.ts` lines 107-119: `case "assistant"` branch maps `msg.toolCalls` to `tool_calls` array with `id`, `type: "function"`, and serialized `arguments`                          |
| 3   | Argentine phone normalization is applied in all three send functions (sendTextMessage, sendInteractiveMessage, sendTemplateMessage) | VERIFIED | `client.ts` lines 75, 152, 250: identical `phone.replace(/^549(\d{10})$/, "54$1")` present in all three functions                                                                  |

**Score:** 3/3 truths verified

### Required Artifacts

| Artifact                                         | Expected                                                         | Status   | Details                                                                                                                                                         |
| ------------------------------------------------ | ---------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `el-templo-bot/src/schedulers/class-reminder.ts` | Class reminder with correct column name booking_status           | VERIFIED | Line 93 contains `b.booking_status = 'reservado'`; no bare `b.status`                                                                                           |
| `el-templo-bot/src/schedulers/trial-followup.ts` | Trial followup with correct column name subscription_status      | VERIFIED | Lines 106 and 116 both use `subscription_status`; no bare `s.status` or `s2.status`                                                                             |
| `el-templo-bot/src/ai/openai.ts`                 | OpenAI mapMessage that includes tool_calls on assistant messages | VERIFIED | Lines 107-119 conditionally include `tool_calls` array when `msg.toolCalls` is non-empty                                                                        |
| `el-templo-bot/src/whatsapp/client.ts`           | Phone normalization in all three send functions                  | VERIFIED | Normalization regex present at lines 75, 152, 250                                                                                                               |
| `el-templo-bot/test/class-reminder.test.ts`      | Test verifying SQL contains booking_status                       | VERIFIED | Test "SQL query uses booking_status column (not bare status)" at line 190 captures and asserts on the SQL template strings                                      |
| `el-templo-bot/test/trial-followup.test.ts`      | Test verifying SQL contains subscription_status in both clauses  | VERIFIED | Test "SQL query uses subscription_status column (not bare status)" at line 263 asserts `subscription_status` appears at least twice and bare aliases are absent |
| `el-templo-bot/test/ai-handler.test.ts`          | Test verifying OpenAI tool_calls included on assistant messages  | VERIFIED | Test "includes tool_calls on assistant messages that have toolCalls" at line 302 asserts exact shape of mapped assistant message                                |

### Key Link Verification

| From                | To                  | Via                                  | Status | Details                                                                                                                                    |
| ------------------- | ------------------- | ------------------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `class-reminder.ts` | bookings table      | raw SQL query                        | WIRED  | `booking_status = 'reservado'` in WHERE clause; pattern matches exactly                                                                    |
| `trial-followup.ts` | subscriptions table | raw SQL query                        | WIRED  | `subscription_status = 'active'` in main WHERE; `subscription_status IN ('active', 'paused')` in NOT EXISTS subquery                       |
| `openai.ts`         | OpenAI Chat API     | mapMessage assistant with tool_calls | WIRED  | `tool_calls: msg.toolCalls.map(...)` at lines 111-118; result flows into `openaiMessages` array passed to `client.chat.completions.create` |

### Requirements Coverage

| Requirement | Source Plan | Description                                                                                      | Status    | Evidence                                                                                                                   |
| ----------- | ----------- | ------------------------------------------------------------------------------------------------ | --------- | -------------------------------------------------------------------------------------------------------------------------- |
| FIX-01      | 76-01       | Scheduler queries use correct column names matching actual DB schema                             | SATISFIED | `booking_status` and `subscription_status` present in both scheduler SQL queries                                           |
| FIX-02      | 76-01       | Session message history validated before sending to AI (prevents OpenAI tool context corruption) | SATISFIED | `mapMessage` now includes `tool_calls` on assistant messages, which is the root cause of the validation error              |
| FIX-03      | 76-01       | Argentine phone normalization applied in sendInteractiveMessage and sendTemplateMessage          | SATISFIED | All three functions in `client.ts` apply `phone.replace(/^549(\d{10})$/, "54$1")` before constructing the API request body |

All three requirement IDs from the plan frontmatter are accounted for. All three map to Phase 76 in REQUIREMENTS.md. No orphaned requirements.

### Anti-Patterns Found

No anti-patterns detected. No TODO/FIXME/placeholder comments, empty implementations, or stub return values in the modified files.

### Human Verification Required

None. All three fixes are logic/data corrections that are fully verifiable by code inspection and unit tests.

## Test Results

All 101 bot unit tests pass with no regressions:

```
Test Files  8 passed (8)
      Tests  101 passed (101)
   Duration  540ms
```

Notable test coverage added in this phase:

- `runClassReminder > SQL query uses booking_status column (not bare status)` — captures the SQL template literal strings and asserts `booking_status` is present and `b.status` (bare alias) is absent
- `runTrialFollowup > SQL query uses subscription_status column (not bare status)` — asserts `subscription_status` appears at least twice (main clause + NOT EXISTS) and bare aliases absent
- `OpenAiProvider - tool_calls mapping > includes tool_calls on assistant messages that have toolCalls` — asserts exact OpenAI message shape including serialized `arguments` string
- `OpenAiProvider - tool_calls mapping > does not include tool_calls on plain assistant messages` — regression guard ensuring the fix is conditional only

## Gaps Summary

None. All three bugs are fixed, all must-haves are satisfied, all requirement IDs are accounted for, and no regressions were introduced.

---

_Verified: 2026-03-26T14:54:00Z_
_Verifier: Claude (gsd-verifier)_
