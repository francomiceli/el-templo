/**
 * TV module — public contract (phase 164).
 *
 * This file is the ONLY interface between three runtimes with very different
 * capabilities: the API (Node), the kiosk page served to the branch TV
 * (standalone ES2015 bundle, Chromium ~68 floor — D-24) and the coach remote
 * control inside el-templo-admin (Vue SPA). Every symbol here is consumed by
 * plans 164-04/05/08/10/11/12, so renaming a field is a six-plan change.
 *
 * Design rules baked into the shapes below:
 *
 *  - Pure contract: no drizzle, no fastify, no runtime imports. Both the API
 *    and the standalone kiosk bundle compile against it.
 *  - The elapsed time NEVER travels over the wire (UI-SPEC "regla de oro"):
 *    the server publishes the start stamp and every TV computes locally.
 *  - No member/personal data crosses this boundary (T-164-08): only exercises,
 *    prescriptions and screen state. The TV hangs on a public wall.
 *  - No `any` (CLAUDE.md / C-03).
 */

// =============================================================================
// Timer — normalized spec and computed frame
// =============================================================================

/**
 * Normalized timer shape.
 *
 * `FormatParams` has ~50 discriminated variants; the TV must not know any of
 * them. `toTimerSpec()` collapses all of them into these four shapes so the
 * kiosk carries one small, testable state machine (Pattern 5).
 */
export type TimerSpec =
  /** Alternating work/rest cycles: tabata, interval, hiit, rom (workMs = 0). */
  | { kind: "work_rest"; workMs: number; restMs: number; rounds: number }
  /** One countdown segment per round: emom, every_x_seconds, on_the_x. */
  | { kind: "interval"; intervalMs: number; rounds: number }
  /** Single countdown: amrap, time_cap, for_tech, anything with a time cap. */
  | { kind: "countdown"; totalMs: number }
  /** Free count-up stopwatch: standard, chipper, for_time without cap. */
  | { kind: "countup" };

/**
 * Phase currently displayed by the TV.
 *
 * `work`/`rest` drive the pulsing TRABAJO / DESCANSO states of the UI-SPEC,
 * `run` is the neutral phase of countdown/countup, `done` is BLOQUE COMPLETO.
 */
export type TvTimerPhase = "work" | "rest" | "run" | "done";

/**
 * Result of `phaseAt(elapsedMs, spec)` — everything the timer zone renders.
 *
 * `displayMs` is already the number to render (remaining time for the phases
 * that count down, elapsed time for the ones that count up), so the kiosk only
 * formats digits. `progress` is 0..1 over the whole block, for the bar.
 */
export interface TimerFrame {
  phase: TvTimerPhase;
  displayMs: number;
  round: number;
  totalRounds: number;
  progress: number;
  finished: boolean;
}

/**
 * Timer lifecycle as persisted per branch.
 *
 * There is no "finished" status on purpose: finishing is derived from elapsed
 * time against the spec (`TimerFrame.finished`), never written to the DB — a
 * TV that reconnects mid-block must reach the same conclusion on its own.
 */
export type TvTimerStatus = "idle" | "running" | "paused";

// =============================================================================
// Screen state
// =============================================================================

/**
 * What the TV is showing.
 *
 * D-06: `idle` = clock + logo + phrase, also used as the silent fallback when
 * the session of the day is missing or unapproved (D-09 — members never see
 * internal errors). D-08: `closing` after the last block, until the coach ends
 * the class. `class` = the live block.
 */
export type TvScreen = "idle" | "class" | "closing";

/**
 * Regular weekday session vs. Saturday ROM session (D-23, Pitfall 2), plus
 * the two override modes of the phase 160 week (SEM-15): `combos` and
 * `tecnica`.
 *
 * In `rom` the roles are ROM_LOWER/ROM_CORE/ROM_UPPER and only two tiers exist
 * (alfa = BÁSICO, delta = AVANZADO), so the level selector must be built from
 * `TvClassPayload.levels` and never from a hardcoded list.
 *
 * `combos` and `tecnica` behave like `regular` for level structure (6 tiers,
 * same canonical order — `REGULAR_LEVEL_ORDER` in `class-day.ts`); the only
 * thing that changes is the block roster (`COMBOS_ROLES`/`TECNICA_ROLES` in
 * `roster.ts` instead of `REGULAR_ROLES`).
 */
export type TvClassMode = "regular" | "rom" | "combos" | "tecnica";

// =============================================================================
// Poll payload (TV reads)
// =============================================================================

/**
 * One entry of the block roster, used for the "BLOQUE n / M" dots.
 *
 * `shared: true` marks INITIUM/PYROS: a block without levels, where the level
 * selector is disabled because the list is the same for everyone.
 */
export interface TvBlockSummary {
  role: string;
  title: string;
  shared: boolean;
}

/**
 * One exercise line. `videoUrl` comes already assembled by the API
 * (`assembleVideoUrl()`); `null` means the kiosk renders the placeholder.
 *
 * `contraction` and `dose` travel SEPARATE (phase 164 rediseño, app parity —
 * `CompactExerciseList.vue`): `contraction` is the raw abbreviation ('CON' /
 * 'EXC' / 'ISO') for the badge and its color, `dose` is the already-formatted
 * volume string ("8-10", `20"`, or "" when the format dictates the volume —
 * tabata/interval/hiit/…, `FORMAT_DICTATED_TYPES`). The kiosk never concatenates
 * or parses these; it just paints each in its own slot.
 */
export interface TvExercise {
  name: string;
  contraction: string;
  dose: string;
  videoUrl: string | null;
}

/**
 * One level column of the live block (phase 164 rediseño — two levels side by
 * side; the control picks the LEVEL by PAIRS). `header` is the full label
 * that used to be `TvClassPayload.listHeader` — per-level ("NIVEL α |
 * Dominadas 70%") when the block has levels, or the shared header
 * ("PYROS | TODOS LOS NIVELES") when the block is shared (INITIUM).
 *
 * A shared block always yields exactly ONE column. A non-shared block yields
 * one column per level of the pair that is present in `classDay.levels`
 * (`LEVEL_PAIRS` in `roster.ts`) — one or two, never more.
 */
export interface TvLevelColumn {
  header: string;
  exercises: TvExercise[];
}

/**
 * Timer state as published to the TV.
 *
 * `startedAt` is an epoch-ms stamp, never a countdown (UI-SPEC point 4).
 * D-17: pausing freezes and resumes exactly where it was, which is why the
 * pause is expressed as `pausedAt` + `pausedAccumMs` instead of rewriting
 * `startedAt` — a running clock plus an accumulator survives several pauses
 * without drifting.
 * D-19: `soundEnabled` starts OFF; the coach turns the beeps on from the phone.
 */
export interface TvTimerState {
  spec: TimerSpec;
  status: TvTimerStatus;
  startedAt: number | null;
  pausedAt: number | null;
  pausedAccumMs: number;
  soundEnabled: boolean;
}

/**
 * The live block. `null` in the poll response whenever `screen !== "class"`.
 *
 * D-15: `level` persists across block changes (changing block resets the timer
 * and the exercise, not the chosen level).
 * Pitfall 1: `blockRole` is the persisted identity of the block; `blockIndex`
 * is DERIVED from this roster on every read, never stored — two levels of the
 * same day can have rosters of different length, so a stored index would jump
 * to another block (or out of range) when the coach switches level.
 *
 * `visualBlockIndex`/`visualBlockCount` are ALSO derived on every read, same
 * as `blockIndex`, but count "visual blocks" instead of roster entries:
 * DEUTEROS_1 and DEUTEROS_2 are two paths of the SAME block (`visualGroupOf`
 * in `roster.ts`), so the "BLOQUE n / M" dots show 4, not 5, for a regular
 * day. `blockIndex`/`blocks` stay the real roster identity — nothing else
 * reads `visualBlockIndex`/`visualBlockCount` for logic, only for painting.
 */
export interface TvClassPayload {
  mode: TvClassMode;
  levels: string[];
  level: string;
  levelLabel: string;
  blocks: TvBlockSummary[];
  blockRole: string;
  blockIndex: number;
  visualBlockIndex: number;
  visualBlockCount: number;
  title: string;
  mobilityLine: string | null;
  /** 1 entrada (bloque shared, o un solo nivel del par presente hoy) o 2
   *  (ambos niveles del par presentes) — nunca más. Ver `TvLevelColumn`. */
  columns: TvLevelColumn[];
  exerciseIndex: number;
  timer: TvTimerState;
}

/**
 * Full poll response — `GET /tv/state` with a device token.
 *
 * Pattern 6 (clock correction): `serverNow` is mandatory on every poll. A TV
 * with a wrong wall clock would otherwise compute garbage from
 * `Date.now() - startedAt`; the kiosk keeps `serverNow - Date.now()` as a
 * smoothed offset.
 * The branch clock is published as `utcOffsetMinutes` + a preformatted
 * `dateLabel` on purpose: an embedded TV Chromium may ship reduced ICU, so the
 * kiosk must be able to build HH:MM:SS with `getUTC*` and never depend on
 * `Intl.DateTimeFormat({ timeZone })`.
 *
 * Deliberately absent: the phrase shown on the idle/closing screens. It lives
 * in the admin PDF builder and is inlined into the kiosk at build time
 * (plan 164-04); duplicating it here would be a third copy.
 */
export interface TvPollResponse {
  serverNow: number;
  branch: { name: string; utcOffsetMinutes: number; dateLabel: string };
  screen: TvScreen;
  class: TvClassPayload | null;
}

// =============================================================================
// Control payload (coach writes)
// =============================================================================

/**
 * Block roster entry for the remote control.
 *
 * Adds `exerciseCountByLevel` so the phone can clamp the exercise index when
 * the coach switches level without an extra round-trip (Pitfall 1).
 */
export interface TvControlBlock extends TvBlockSummary {
  exerciseCountByLevel: Record<string, number>;
}

/** Raw persisted state, as the control needs it (no rendering strings). */
export interface TvControlState {
  screen: TvScreen;
  blockRole: string;
  level: string;
  exerciseIndex: number;
  timerStatus: TvTimerStatus;
  timerStartedAt: number | null;
  pausedAt: number | null;
  pausedAccumMs: number;
  soundEnabled: boolean;
}

/**
 * Everything the coach control page needs to render its blind button grid
 * (D-13) for one branch.
 *
 * `sessionApproved: false` is what drives the explicit "la sesión de hoy no
 * está aprobada" warning with disabled controls (D-10) — the mirror image of
 * the silent idle screen the TV shows in the same situation (D-09).
 * `state: null` means no class has been started today.
 */
export interface TvControlContext {
  branch: { id: number; name: string };
  sessionApproved: boolean;
  mode: TvClassMode;
  levels: string[];
  blocks: TvControlBlock[];
  state: TvControlState | null;
}

/**
 * Write command from the coach's phone. Every field is optional and absolute:
 * a partial update touches only what it names.
 *
 * D-18: `timer` is an idempotent command of exactly four values — there is no
 * "skip round" or "adjust round" in v1, so a double tap on a bad connection
 * cannot advance anything twice (relative commands — "the block after this
 * one", "one more round" — are an explicit anti-pattern here).
 * D-12: last write wins, no locks.
 */
export interface TvStateWrite {
  branchId: number;
  screen?: TvScreen;
  blockRole?: string;
  level?: string;
  exerciseIndex?: number;
  timer?: "start" | "pause" | "resume" | "reset";
  soundEnabled?: boolean;
}
