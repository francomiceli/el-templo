/**
 * Phase 85 (AVAT-01 / AVAT-05) — per-avatar Tone Guide contract.
 *
 * These tests lock in the renderer-level guarantee that when a `currentAvatar`
 * is passed to `getSystemPrompt`, the rendered prompt:
 *   1. Contains the per-avatar keywords documented below (AVAT-05)
 *   2. Renders the tone guide for ANY active playbook, not just PB1 (AVAT-01)
 *   3. Stays absent when no avatar is set (no leakage to un-profiled leads)
 *   4. Is deterministic across repeated calls (no Date/Math.random in path)
 *   5. Produces 4 textually distinct guides — no keyword reuse across avatars
 *
 * The keyword map below is the source of truth for the AVAT-05 contract.
 * `system-prompt.ts:AVATAR_TONE_GUIDES` MUST contain these keywords
 * verbatim. If a guide is reworded, update this map in lockstep.
 *
 * Pure tests: no IO, no mocks, no Redis, no DB.
 */

import { describe, it, expect } from "vitest";

import { getSystemPrompt } from "../src/ai/system-prompt.js";
import { PLAYBOOKS } from "../src/playbooks/index.js";
import type { PlaybookId } from "../src/playbooks/types.js";
import {
  ALL_AVATARS,
  AVATAR_KEYWORDS,
  ALL_AVATAR_KEYWORDS as ALL_KEYWORDS,
} from "./fixtures/avatar-keywords.js";

const ALL_PLAYBOOKS: PlaybookId[] = ["PB1", "PB2", "PB3", "PB4", "PB5"];

// ─── AVAT-05 — per-avatar tone keywords appear when profile is set ──────────

describe("AVAT-05 — per-avatar tone keywords appear when profile is set", () => {
  for (const avatar of ALL_AVATARS) {
    it(`${avatar}: both documented keywords are present in rendered prompt`, () => {
      const out = getSystemPrompt({
        clientState: "lead",
        currentAvatar: avatar,
      });
      const [k1, k2] = AVATAR_KEYWORDS[avatar];
      expect(out).toContain(k1);
      expect(out).toContain(k2);
    });
  }
});

// ─── AVAT-05 — keywords are unique across avatars ───────────────────────────

describe("AVAT-05 — keywords are unique across avatars", () => {
  for (const avatarA of ALL_AVATARS) {
    for (const avatarB of ALL_AVATARS) {
      if (avatarA === avatarB) continue;
      it(`${avatarA}'s keywords do NOT appear in ${avatarB}'s rendered prompt`, () => {
        const out = getSystemPrompt({
          clientState: "lead",
          currentAvatar: avatarB,
        });
        const [k1, k2] = AVATAR_KEYWORDS[avatarA];
        expect(out).not.toContain(k1);
        expect(out).not.toContain(k2);
      });
    }
  }
});

// ─── AVAT-01 — tone guide renders for ALL playbooks, not just PB1 ───────────

describe("AVAT-01 — tone guide renders for ALL playbooks, not just PB1", () => {
  for (const pbId of ALL_PLAYBOOKS) {
    it(`${pbId}: intermedio keywords still present when activePlaybook=${pbId}`, () => {
      const entryStage = PLAYBOOKS[pbId].entryStageId;
      const out = getSystemPrompt({
        clientState: "lead",
        currentAvatar: "intermedio",
        activePlaybook: pbId,
        currentStage: entryStage,
      });
      const [k1, k2] = AVATAR_KEYWORDS.intermedio;
      expect(out).toContain(k1);
      expect(out).toContain(k2);
    });
  }
});

// ─── AVAT-01 — tone guide is absent when no avatar is set ───────────────────

describe("AVAT-01 — tone guide is absent when no avatar is set", () => {
  it("renders no avatar keywords when currentAvatar is omitted", () => {
    const out = getSystemPrompt({ clientState: "lead" });
    for (const keyword of ALL_KEYWORDS) {
      expect(
        out,
        `keyword "${keyword}" leaked into un-profiled prompt`,
      ).not.toContain(keyword);
    }
  });

  it("renders no avatar keywords when currentAvatar is null", () => {
    const out = getSystemPrompt({ clientState: "lead", currentAvatar: null });
    for (const keyword of ALL_KEYWORDS) {
      expect(out).not.toContain(keyword);
    }
  });
});

// ─── AVAT-01 — Perfil detectado header preserved (phase 83-02 compat) ───────

describe("AVAT-01 — Perfil detectado header present when avatar is known", () => {
  for (const avatar of ALL_AVATARS) {
    it(`${avatar}: header references the avatar id and discovery-skip rule`, () => {
      const out = getSystemPrompt({
        clientState: "lead",
        currentAvatar: avatar,
      });
      expect(out).toContain(`*Perfil detectado: ${avatar}*`);
      expect(out).toContain("NO repitas las preguntas de discovery");
    });
  }
});

// ─── AVAT-05 — purity / determinism ─────────────────────────────────────────

describe("AVAT-05 — purity / determinism", () => {
  it("100 repeated renders for the same input are byte-identical", () => {
    const input = {
      clientState: "lead" as const,
      currentAvatar: "gym_crossover" as const,
    };
    const first = getSystemPrompt(input);
    for (let i = 0; i < 100; i++) {
      expect(getSystemPrompt(input)).toBe(first);
    }
  });

  it("4 avatars produce 4 textually distinct rendered prompts", () => {
    const renders = ALL_AVATARS.map((a) =>
      getSystemPrompt({ clientState: "lead", currentAvatar: a }),
    );
    const unique = new Set(renders);
    expect(unique.size).toBe(ALL_AVATARS.length);
  });
});
