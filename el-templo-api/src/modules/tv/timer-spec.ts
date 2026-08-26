/**
 * FormatParams -> TimerSpec normalization (phase 164, Pattern 5).
 *
 * `session_blocks.format_params` is a discriminated union of ~50 variants that
 * only the admin understands. The branch TV must not know any of them: it runs
 * a tiny ES2015 bundle with no test runner, so every branch of this decision
 * lives here, server-side, where vitest covers it.
 *
 * Two properties this module guarantees (T-164-06 — the params are written by
 * staff and land unvalidated in a JSON column):
 *
 *  1. Exhaustiveness: the `switch` ends in a `never` assertion, so
 *     adding a format to the catalog BREAKS the build instead of silently
 *     degrading a TV in a branch to a free stopwatch.
 *  2. No garbage out: every numeric field is sanitized (non-finite -> 0, never
 *     negative ms, never fewer than 1 round). A spec whose duration collapses
 *     to zero degrades to `countup` rather than to a timer that is already
 *     finished at t=0 — and it keeps `phaseAt` from ever dividing by a
 *     zero-length cycle.
 */
import type { FormatParams } from "../admin/format-params";
import type { TimerSpec } from "./types";

const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60_000;

const COUNTUP: TimerSpec = { kind: "countup" };

/** Non-finite or negative input collapses to 0 — never NaN, never negative. */
function sanitizeMs(value: number | undefined, msPerUnit: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  const ms = Math.round(value * msPerUnit);
  return ms > 0 ? ms : 0;
}

/** Rounds are always at least 1: a block with 0 rounds is meaningless on screen. */
function sanitizeRounds(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 1;
  const rounds = Math.floor(value);
  return rounds > 1 ? rounds : 1;
}

/** `countdown` only if there is something to count down; otherwise free stopwatch. */
function countdown(totalMs: number): TimerSpec {
  return totalMs > 0 ? { kind: "countdown", totalMs } : COUNTUP;
}

/**
 * Formats whose time cap is OPTIONAL (for_time, death_by, rounds_for_time...):
 * with a cap the TV counts the cap down, without one it counts up freely.
 */
function capOrCountup(timeCapMinutes: number | undefined): TimerSpec {
  return countdown(sanitizeMs(timeCapMinutes, MS_PER_MINUTE));
}

/**
 * Normalize any `session_blocks.format_params` value into one of the four
 * timer shapes the TV knows how to render.
 *
 * `null` (block without configured params) is a legitimate input and maps to
 * the free count-up stopwatch, same as `standard`/`chipper`.
 */
export function toTimerSpec(
  params: FormatParams | null,
  exerciseCount = 1,
): TimerSpec {
  if (!params) return COUNTUP;

  switch (params.type) {
    // ── work / rest cycles ────────────────────────────────────────────────
    // `tabata`, `interval` and `hiit` share the SAME field shape
    // (`workSeconds`/`restSeconds`/`rounds`), but their `rounds` means two
    // different things — so the two cases are deliberately split:
    //
    //  - `tabata`: `rounds` is the TOTAL count of work/rest intervals. When the
    //    block lists several exercises they ROTATE across those intervals (a
    //    tabata ×8 with 4 exercises runs each exercise twice). The interval
    //    count is `rounds` as-is — never multiplied by the exercise count.
    case "tabata": {
      const workMs = sanitizeMs(params.workSeconds, MS_PER_SECOND);
      const restMs = sanitizeMs(params.restSeconds, MS_PER_SECOND);
      if (workMs + restMs <= 0) return COUNTUP;
      return {
        kind: "work_rest",
        workMs,
        restMs,
        rounds: sanitizeRounds(params.rounds),
      };
    }

    //  - `interval` / `hiit`: these are CIRCUITS. `rounds` is the number of laps
    //    through ALL the block's exercises, so the timer runs
    //    `exerciseCount × rounds` work/rest cycles. Without the multiplication a
    //    "45\"/15\" ×2" HIIT with 2 exercises stopped after the 2nd exercise of
    //    the 1st lap (it did only 2 cycles instead of 4). `exerciseCount`
    //    defaults to 1, so a single-exercise block — or a caller that does not
    //    know the count — keeps the pre-fix cycle count.
    case "interval":
    case "hiit": {
      const workMs = sanitizeMs(params.workSeconds, MS_PER_SECOND);
      const restMs = sanitizeMs(params.restSeconds, MS_PER_SECOND);
      if (workMs + restMs <= 0) return COUNTUP;
      const laps = sanitizeRounds(params.rounds);
      const stations = exerciseCount > 0 ? exerciseCount : 1;
      return {
        kind: "work_rest",
        workMs,
        restMs,
        rounds: laps * stations,
      };
    }

    // ROM (mobility): a free stopwatch counting UP from zero for the whole
    // block. The coach paces the work and calls when to move on, so the screen
    // just shows elapsed time — no per-round reset and no prescribed countdown.
    // This supersedes the old `work_rest`/`workMs = 0` model of D-23, which
    // reset the digits every `restSeconds` (the block "only lasted the rest
    // window"): `rounds`/`restSeconds` are ignored and the block counts up as
    // long as it runs, same as `standard`/`chipper`.
    case "rom":
      return COUNTUP;

    // ── one countdown segment per round ───────────────────────────────────
    // `emom` and `every_x_seconds` express the total as minutes: the round
    // count is derived. `emom_for_time` is the same shape under another name.
    case "emom":
    case "every_x_seconds": {
      const intervalMs = sanitizeMs(params.intervalSeconds, MS_PER_SECOND);
      if (intervalMs <= 0) return COUNTUP;
      const totalMs = sanitizeMs(params.totalMinutes, MS_PER_MINUTE);
      return {
        kind: "interval",
        intervalMs,
        rounds: sanitizeRounds(Math.round(totalMs / intervalMs)),
      };
    }
    case "emom_for_time": {
      const intervalMs = sanitizeMs(params.intervalSeconds, MS_PER_SECOND);
      if (intervalMs <= 0) return COUNTUP;
      const totalMs = sanitizeMs(params.emomMinutes, MS_PER_MINUTE);
      return {
        kind: "interval",
        intervalMs,
        rounds: sanitizeRounds(Math.round(totalMs / intervalMs)),
      };
    }
    // `on_the_x` already carries its round count.
    case "on_the_x": {
      const intervalMs = sanitizeMs(params.intervalSeconds, MS_PER_SECOND);
      if (intervalMs <= 0) return COUNTUP;
      return {
        kind: "interval",
        intervalMs,
        rounds: sanitizeRounds(params.rounds),
      };
    }

    // ── single countdown ──────────────────────────────────────────────────
    case "amrap":
    case "amrap_series":
    case "time_cap":
    case "for_tech":
      return countdown(sanitizeMs(params.minutes, MS_PER_MINUTE));
    // `open_style` declares its minutes as optional.
    case "open_style":
      return countdown(sanitizeMs(params.minutes, MS_PER_MINUTE));

    // ── optional time cap: countdown with it, count-up without it ─────────
    case "for_time":
    case "for_max_reps":
    case "for_max_distancia":
    case "death_by":
    case "death_by_unbroken":
    case "rounds_for_time":
      return capOrCountup(params.timeCapMinutes);

    // ── free stopwatch ────────────────────────────────────────────────────
    // Everything else has no time structure the TV can render: volume-based,
    // technical and structural formats are paced by the coach, so the screen
    // shows elapsed time only.
    case "for_max_tiempo":
    case "chipper":
    case "ladder":
    case "ladder_block":
    case "ladder_corta":
    case "broken_ladder":
    case "pyramid":
    case "accumulate":
    case "for_max_carga":
    case "unbroken_reps":
    case "unbroken_chipper":
    case "ub_test":
    case "complex":
    case "combos":
    case "for_quality":
    case "tempo_sets":
    case "flow_guiado":
    case "stretching":
    case "cluster":
    case "couplet":
    case "triplet":
    case "singlet":
    case "benchmark_wod":
    case "hero_wod":
    case "buy_in_cash_out":
    case "i_go_you_go":
    case "floater_wod":
    case "acropolis":
    case "wave_loading":
    case "drop_set":
    case "rest_pause":
    case "task_priority":
    case "circuito_cooperativo":
    case "standard":
      return COUNTUP;

    default: {
      // Adding a variant to FormatParams must break the build here.
      const _exhaustive: never = params;
      void _exhaustive;
      return COUNTUP;
    }
  }
}
