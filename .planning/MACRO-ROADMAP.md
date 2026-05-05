# Macro Roadmap (Bot → Production → CRM)

**Purpose:** Cross-milestone sequence that survives individual `/gsd:complete-milestone` and `/gsd:new-milestone` cycles. ROADMAP.md captures the active milestone in detail; this file captures what comes after, why, and the constraints that propagate forward.

**Last updated:** 2026-05-05

---

## Sequence

```
v5.3.3 — Post-v5.3.2 Live Test Fixes (current)
         ↓ ships when bot is ready for production deploy
v5.4.0 — Production Deployment
         ↓ ships when bot is live and stable on prod infrastructure
Kero CRM — starts after v5.4.0 is live and stable
```

This ordering is **non-negotiable**: bot must reach real production BEFORE Kero CRM development starts. Reason: CRM development assumes a stable, production-grade bot to integrate with. Building CRM against a dev-environment bot would couple Kero's iteration cadence to bot infra changes.

---

## v5.3.3 — Post-v5.3.2 Live Test Fixes

**Status:** active milestone (next to be opened post v5.3.2 archive)
**Environment:** dev-only (local + ngrok + Meta test number — same as v5.3.2)
**Goal:** Close 5 BUGs + 2 BACKLOG items surfaced by post-v5.3.2 live test, leaving the bot **ready for production deploy** (NOT ready for CRM integration).

**Phase structure** (locked, see `.planning/v5.3.3-prework-notes.md` for details):

- Phase A — BUG-01 race condition / debounce
- Phase B — BUG-02 OpenAI timeout + interim UX
- Phase C — BUG-03 + BUG-05 booking + graceful degradation
- Phase D — BUG-04 context-awareness
- Phase E — BACKLOG-01 + BACKLOG-02 + regression lock

**Closing constraint:** Phase E's final live test should validate the bot is **production-deploy-ready**, not CRM-integration-ready. Acceptance criteria for v5.3.3 should focus on behavioral/handler correctness and stability — not on persistence layer, not on CRM hooks, not on multi-tenancy. Those land in v5.4.0 or Kero phase 1.

---

## v5.4.0 — Production Deployment

**Status:** planned, not yet scoped
**Environment:** production (real infra, no dev shortcuts)
**Goal:** Move bot from dev tunnel to real production with all the operational concerns that ngrok+test-number hide.

**Expected scope (to be refined when milestone is opened):**

1. **Infrastructure:** EC2 deployment of `el-templo-bot` (existing pattern from `el-templo-api` is the obvious template — Phase 18 set up domain + subdomain + deploy pipeline; Phase 58 production-deployment work and Phase 77 GitHub Actions deployment are also reference points)
2. **Meta tokens:** Replace temporary test tokens with **permanent** Meta WhatsApp Business tokens
3. **Phone number:** Move off the Meta test number to a **production phone number** (real DID, real porting if applicable)
4. **Meta Business verification:** Complete Meta Business verification process (legal entity, business documents, etc.) — has lead time, plan accordingly
5. **Monitoring:** Production-grade observability for the bot — Pino → file with rotation OR Pino → external sink (Sentry already wired for the API per CLAUDE.md, but bot-side Sentry coverage needs verification); structured logs queryable for incident response (the BUG-02 "logs are gone" failure mode CAN'T happen in prod)
6. **Secrets management:** Real secrets in real secret store, not `.env` files
7. **Rollback:** Deploy pipeline must support rollback (existing pattern: build → backup current → rsync → migrate → restart → smoke test → auto-rollback per CLAUDE.md)

**Open question to resolve at milestone planning time:** Does v5.4.0 also include the bot↔DB persistence layer (see Kero dependency below), or is that pushed to Kero phase 1? Both are defensible — flag explicitly when scoping v5.4.0.

---

## Kero CRM — starts after v5.4.0 is live and stable

**Status:** future, not yet scoped
**Goal:** CRM functionality for managing leads/conversations/members in a structured way (separate from the existing admin app).

### Critical bot ↔ Kero integration constraint (FLAGGED, not yet decided)

**The bot currently persists conversation state to Redis (per `el-templo-bot/.../redis-memory-layer` from phases 69 and beyond) but logs full conversation TRANSCRIPTS only to Pino (stdout in dev, eventually to file/sink in v5.4.0).**

For Kero to read conversations, the bot needs **durable conversation persistence in a queryable store** — not just Pino logs, not just Redis (Redis is short-lived state, not a transcript archive).

**Decision deferred:** which milestone owns this persistence work?

| Option                                                                                    | Pros                                                                                       | Cons                                                                                                                                                              |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **v5.4.0 owns it** (bot writes transcripts to MySQL/Postgres alongside production deploy) | Bot ships prod-complete; Kero starts with data already flowing; no schema changes mid-Kero | Expands v5.4.0 scope; more deploy risk in one milestone                                                                                                           |
| **Kero phase 1 owns it** (v5.4.0 ships logs-only, Kero adds the persistence layer)        | v5.4.0 stays narrowly scoped to deploy mechanics                                           | Bot has to be re-deployed when Kero phase 1 ships; potential for transcript backfill problem (conversations from v5.4.0 → Kero-launch are lost or need migration) |

**Recommendation when v5.4.0 is scoped:** decide deliberately. Default lean is "v5.4.0 owns it" because the backfill problem is worse than the scope expansion, but this is genuinely a judgment call that depends on v5.4.0's deploy timeline.

**Don't forget:** this constraint is invisible from the v5.3.3 phase plans. If you scope v5.3.3 → v5.4.0 without re-reading this file, the persistence question gets dropped.

---

## Constraints that propagate across milestones

These survive milestone boundaries — re-check them when planning each new milestone:

1. **Bot env mode:** v5.3.3 closes in dev. v5.4.0 opens in prod. Don't accidentally ship dev-only assumptions (ngrok URLs, test tokens, hardcoded local API endpoints) into prod via inherited config.
2. **No-escalation rule (v5.3.2 SC#3):** soft rejections only, NOT tool failures. Carries through every future bot phase. Already noted in v5.3.3 Phase C; will continue to apply in v5.4.0 and Kero.
3. **Pino logging discipline (CLAUDE.md):** never `console.log`, always Pino. v5.4.0 needs to extend this with rotation/sink, not weaken it.
4. **Bot↔CRM persistence:** see above. The single biggest hidden dependency between bot and Kero milestones.

---

## Maintenance

- Update this file whenever a milestone-spanning decision is made (bot scope, Kero scope, persistence model, infra commitments).
- Don't archive this file at milestone completion. It's persistent state, not milestone-scoped state.
- When all three sequence items have shipped (v5.3.3, v5.4.0, Kero), reassess whether this file still serves a purpose or whether the macro view has shifted.
