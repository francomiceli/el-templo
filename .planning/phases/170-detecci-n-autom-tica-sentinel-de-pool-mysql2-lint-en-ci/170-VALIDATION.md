---
phase: 170
slug: detecci-n-autom-tica-sentinel-de-pool-mysql2-lint-en-ci
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-28
---

# Phase 170 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property               | Value                                              |
| ---------------------- | -------------------------------------------------- |
| **Framework**          | {vitest — see RESEARCH.md Validation Architecture} |
| **Config file**        | {el-templo-api/vitest.config.ts or equivalent}     |
| **Quick run command**  | `{quick command}`                                  |
| **Full suite command** | `{full command}`                                   |
| **Estimated runtime**  | ~{N} seconds                                       |

---

## Sampling Rate

- **After every task commit:** Run `{quick run command}`
- **After every plan wave:** Run `{full suite command}`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** {N} seconds

---

## Per-Task Verification Map

| Task ID   | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status     |
| --------- | ---- | ---- | ----------- | ---------- | --------------- | --------- | ----------------- | ----------- | ---------- |
| 170-01-01 | 01   | 1    | CON-05      | —          | —               | unit      | `{command}`       | ⬜          | ⬜ pending |

_Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky_

---

## Wave 0 Requirements

- [ ] {to be filled by planner from RESEARCH.md Validation Architecture}

_If none: "Existing infrastructure covers all phase requirements."_

---

## Manual-Only Verifications

| Behavior   | Requirement | Why Manual | Test Instructions |
| ---------- | ----------- | ---------- | ----------------- |
| {behavior} | {REQ}       | {reason}   | {steps}           |

_If none: "All phase behaviors have automated verification."_

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < {N}s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
