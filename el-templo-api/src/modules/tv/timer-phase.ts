/**
 * Timer arithmetic for the branch TV (phase 164).
 *
 * Pure and deterministic on purpose: the elapsed time never travels over the
 * network (UI-SPEC "regla de oro"). The server publishes the start stamp and
 * every TV computes its own elapsed value, so this function must be a total
 * function of `(elapsedMs, spec)` with no clock of its own — that is exactly
 * what makes it testable here and portable to the kiosk bundle, which ports it
 * verbatim and re-checks it against the golden vectors at `?selftest=1`.
 *
 * Display semantics mirror the validated mockup (`164-tv-mockup-template.html`)
 * and the UI-SPEC states TRABAJO / DESCANSO / BLOQUE COMPLETO:
 * `displayMs` is already the number to render — remaining time for the phases
 * that count down, elapsed time for the ones that count up.
 *
 * T-164-07 / Pitfall 8: a TV with a wrong wall clock can compute an absurd
 * elapsed value. Anything negative, non-finite or beyond 24 h collapses to the
 * t=0 frame instead of rendering garbage in front of a class.
 */
import type { TimerFrame, TimerSpec } from "./types";

/** Beyond this, the input is a broken clock and not a real block. */
const MAX_ELAPSED_MS = 24 * 60 * 60 * 1000;

/** Counters are meaningless for the single-segment kinds; kept at 1/1. */
const SINGLE_ROUND = 1;

function clampProgress(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value < 1 ? value : 1;
}

/** BLOQUE COMPLETO: the same terminal frame for every kind that can finish. */
function finishedFrame(totalRounds: number): TimerFrame {
  return {
    phase: "done",
    displayMs: 0,
    round: totalRounds,
    totalRounds,
    progress: 1,
    finished: true,
  };
}

function countupFrame(elapsedMs: number): TimerFrame {
  return {
    phase: "run",
    displayMs: elapsedMs,
    round: SINGLE_ROUND,
    totalRounds: SINGLE_ROUND,
    progress: 0,
    finished: false,
  };
}

/**
 * Frame to render for a given elapsed time.
 *
 * `elapsedMs` is what the caller already computed from `startedAt`,
 * `pausedAt` and `pausedAccumMs` (D-17) — this function does not know about
 * pauses, only about how much time the block has actually run.
 */
export function phaseAt(elapsedMs: number, spec: TimerSpec): TimerFrame {
  // Pitfall 8 — a TV whose clock is off must show 0, never garbage.
  const elapsed =
    Number.isFinite(elapsedMs) && elapsedMs > 0 && elapsedMs <= MAX_ELAPSED_MS
      ? elapsedMs
      : 0;

  switch (spec.kind) {
    case "work_rest": {
      const cycleMs = spec.workMs + spec.restMs;
      // Defensive: `toTimerSpec` never emits a zero-length cycle, but a
      // hand-built spec must not divide by zero — degrade to a stopwatch.
      if (cycleMs <= 0) return countupFrame(elapsed);

      const totalMs = cycleMs * spec.rounds;
      if (elapsed >= totalMs) return finishedFrame(spec.rounds);

      const roundIndex = Math.floor(elapsed / cycleMs);
      const offsetMs = elapsed - roundIndex * cycleMs;
      // ROM (workMs === 0): the work itself is free, so the phase stays WORK
      // and the digits count UP inside the round instead of down.
      const isRom = spec.workMs === 0;
      const inWork = isRom || offsetMs < spec.workMs;

      return {
        phase: inWork ? "work" : "rest",
        displayMs: isRom
          ? offsetMs
          : inWork
            ? spec.workMs - offsetMs
            : cycleMs - offsetMs,
        round: roundIndex + 1,
        totalRounds: spec.rounds,
        progress: clampProgress(elapsed / totalMs),
        finished: false,
      };
    }

    case "interval": {
      if (spec.intervalMs <= 0) return countupFrame(elapsed);

      const totalMs = spec.intervalMs * spec.rounds;
      if (elapsed >= totalMs) return finishedFrame(spec.rounds);

      const roundIndex = Math.floor(elapsed / spec.intervalMs);
      const offsetMs = elapsed - roundIndex * spec.intervalMs;

      return {
        phase: "work",
        displayMs: spec.intervalMs - offsetMs,
        round: roundIndex + 1,
        totalRounds: spec.rounds,
        progress: clampProgress(elapsed / totalMs),
        finished: false,
      };
    }

    case "countdown": {
      if (spec.totalMs <= 0) return finishedFrame(SINGLE_ROUND);
      if (elapsed >= spec.totalMs) return finishedFrame(SINGLE_ROUND);

      return {
        phase: "run",
        displayMs: spec.totalMs - elapsed,
        round: SINGLE_ROUND,
        totalRounds: SINGLE_ROUND,
        progress: clampProgress(elapsed / spec.totalMs),
        finished: false,
      };
    }

    case "countup":
      // A free stopwatch has no end: the coach moves to the next block.
      return countupFrame(elapsed);

    default: {
      // Adding a shape to TimerSpec must break the build here.
      const _exhaustive: never = spec;
      void _exhaustive;
      return countupFrame(elapsed);
    }
  }
}
