/**
 * Unit tests for format-params.ts
 *
 * Tests the factory function (getDefaultFormatParams) and label function
 * against all 46 DB format names. Pure functions — no DB needed.
 */

import { describe, it, expect } from "vitest";
import {
  getDefaultFormatParams,
  formatParamsLabel,
  type FormatParams,
} from "../../src/modules/admin/format-params";

const DEFAULT_CONTEXT = { intensity: 70, exerciseCount: 3 };

/** All format names as they exist in the `formats` DB table */
const DB_FORMAT_NAMES = [
  "Accumulate X",
  "AMRAP",
  "AMRAP Series",
  "Benchmark",
  "Benchmark WOD",
  "Broken Ladder",
  "Buy-in / Cash-out",
  "Chipper",
  "Circuito cooperativo",
  "Cluster",
  "Complex",
  "Couplet",
  "Death By",
  "Death By Unbroken",
  "Drop Set",
  "EMOM",
  "EMOM + For Time",
  "Every X Seconds",
  "Flow Guiado",
  "For Max (Carga)",
  "For Max (Reps)",
  "For Max (Tiempo)",
  "For Quality",
  "For Tech",
  "For Time",
  "Hero WOD",
  "HIIT",
  "I Go, You Go",
  "Interval Training",
  "Ladder",
  "Ladder Block",
  "Ladder corta",
  "On the 2:00 / 3:00",
  "Open Style",
  "Pyramid",
  "Rest-Pause",
  "Rounds for Time",
  "Singlet",
  "Tabata",
  "Task Priority",
  "Task Priority vs Time Priority",
  "Tempo Sets",
  "Time Cap",
  "Triplet",
  "Unbroken Reps",
  "Wave Loading",
];

describe("getDefaultFormatParams", () => {
  it("maps every DB format name to a non-standard type", () => {
    const unmapped: string[] = [];
    for (const name of DB_FORMAT_NAMES) {
      const params = getDefaultFormatParams(name, DEFAULT_CONTEXT);
      if (params.type === "standard") {
        unmapped.push(name);
      }
    }
    expect(unmapped).toEqual([]);
  });

  it("returns correct types for time-based formats", () => {
    expect(getDefaultFormatParams("AMRAP", DEFAULT_CONTEXT).type).toBe("amrap");
    expect(getDefaultFormatParams("AMRAP Series", DEFAULT_CONTEXT).type).toBe(
      "amrap_series",
    );
    expect(getDefaultFormatParams("EMOM", DEFAULT_CONTEXT).type).toBe("emom");
    expect(getDefaultFormatParams("Tabata", DEFAULT_CONTEXT).type).toBe(
      "tabata",
    );
    expect(
      getDefaultFormatParams("Interval Training", DEFAULT_CONTEXT).type,
    ).toBe("interval");
    expect(getDefaultFormatParams("HIIT", DEFAULT_CONTEXT).type).toBe("hiit");
    expect(getDefaultFormatParams("Time Cap", DEFAULT_CONTEXT).type).toBe(
      "time_cap",
    );
    expect(
      getDefaultFormatParams("Every X Seconds", DEFAULT_CONTEXT).type,
    ).toBe("every_x_seconds");
    expect(
      getDefaultFormatParams("On the 2:00 / 3:00", DEFAULT_CONTEXT).type,
    ).toBe("on_the_x");
    expect(getDefaultFormatParams("For Time", DEFAULT_CONTEXT).type).toBe(
      "for_time",
    );
    expect(
      getDefaultFormatParams("For Max (Tiempo)", DEFAULT_CONTEXT).type,
    ).toBe("for_max_tiempo");
  });

  it("returns correct types for volume-based formats", () => {
    expect(getDefaultFormatParams("Chipper", DEFAULT_CONTEXT).type).toBe(
      "chipper",
    );
    expect(getDefaultFormatParams("Death By", DEFAULT_CONTEXT).type).toBe(
      "death_by",
    );
    expect(
      getDefaultFormatParams("Death By Unbroken", DEFAULT_CONTEXT).type,
    ).toBe("death_by_unbroken");
    expect(getDefaultFormatParams("Ladder", DEFAULT_CONTEXT).type).toBe(
      "ladder",
    );
    expect(getDefaultFormatParams("Ladder Block", DEFAULT_CONTEXT).type).toBe(
      "ladder_block",
    );
    expect(getDefaultFormatParams("Ladder corta", DEFAULT_CONTEXT).type).toBe(
      "ladder_corta",
    );
    expect(getDefaultFormatParams("Pyramid", DEFAULT_CONTEXT).type).toBe(
      "pyramid",
    );
    expect(getDefaultFormatParams("Accumulate X", DEFAULT_CONTEXT).type).toBe(
      "accumulate",
    );
    expect(getDefaultFormatParams("For Max (Reps)", DEFAULT_CONTEXT).type).toBe(
      "for_max_reps",
    );
    expect(
      getDefaultFormatParams("For Max (Carga)", DEFAULT_CONTEXT).type,
    ).toBe("for_max_carga");
    expect(getDefaultFormatParams("Unbroken Reps", DEFAULT_CONTEXT).type).toBe(
      "unbroken_reps",
    );
  });

  it("returns correct types for technical formats", () => {
    expect(getDefaultFormatParams("Complex", DEFAULT_CONTEXT).type).toBe(
      "complex",
    );
    expect(getDefaultFormatParams("For Quality", DEFAULT_CONTEXT).type).toBe(
      "for_quality",
    );
    expect(getDefaultFormatParams("For Tech", DEFAULT_CONTEXT).type).toBe(
      "for_tech",
    );
    expect(getDefaultFormatParams("Tempo Sets", DEFAULT_CONTEXT).type).toBe(
      "tempo_sets",
    );
    expect(getDefaultFormatParams("Flow Guiado", DEFAULT_CONTEXT).type).toBe(
      "flow_guiado",
    );
    expect(getDefaultFormatParams("Cluster", DEFAULT_CONTEXT).type).toBe(
      "cluster",
    );
  });

  it("returns correct types for structure-based formats", () => {
    expect(
      getDefaultFormatParams("Rounds for Time", DEFAULT_CONTEXT).type,
    ).toBe("rounds_for_time");
    expect(getDefaultFormatParams("Couplet", DEFAULT_CONTEXT).type).toBe(
      "couplet",
    );
    expect(getDefaultFormatParams("Triplet", DEFAULT_CONTEXT).type).toBe(
      "triplet",
    );
    expect(getDefaultFormatParams("Singlet", DEFAULT_CONTEXT).type).toBe(
      "singlet",
    );
    expect(getDefaultFormatParams("Benchmark WOD", DEFAULT_CONTEXT).type).toBe(
      "benchmark_wod",
    );
    expect(getDefaultFormatParams("Hero WOD", DEFAULT_CONTEXT).type).toBe(
      "hero_wod",
    );
    expect(
      getDefaultFormatParams("Buy-in / Cash-out", DEFAULT_CONTEXT).type,
    ).toBe("buy_in_cash_out");
    expect(getDefaultFormatParams("I Go, You Go", DEFAULT_CONTEXT).type).toBe(
      "i_go_you_go",
    );
    expect(getDefaultFormatParams("Acropolis", DEFAULT_CONTEXT).type).toBe(
      "acropolis",
    );
  });

  it("returns correct types for hybrid formats", () => {
    expect(getDefaultFormatParams("Wave Loading", DEFAULT_CONTEXT).type).toBe(
      "wave_loading",
    );
    expect(getDefaultFormatParams("Drop Set", DEFAULT_CONTEXT).type).toBe(
      "drop_set",
    );
    expect(getDefaultFormatParams("Rest-Pause", DEFAULT_CONTEXT).type).toBe(
      "rest_pause",
    );
    expect(getDefaultFormatParams("Open Style", DEFAULT_CONTEXT).type).toBe(
      "open_style",
    );
    expect(
      getDefaultFormatParams("EMOM + For Time", DEFAULT_CONTEXT).type,
    ).toBe("emom_for_time");
    expect(getDefaultFormatParams("Broken Ladder", DEFAULT_CONTEXT).type).toBe(
      "broken_ladder",
    );
    expect(getDefaultFormatParams("Task Priority", DEFAULT_CONTEXT).type).toBe(
      "task_priority",
    );
  });

  it("uses intensity for ladder direction", () => {
    const highIntensity = getDefaultFormatParams("Ladder", {
      intensity: 80,
      exerciseCount: 3,
    });
    const lowIntensity = getDefaultFormatParams("Ladder", {
      intensity: 60,
      exerciseCount: 3,
    });
    expect((highIntensity as { direction: string }).direction).toBe(
      "descending",
    );
    expect((lowIntensity as { direction: string }).direction).toBe("ascending");
  });

  it("uses exerciseCount for EMOM totalMinutes", () => {
    const params = getDefaultFormatParams("EMOM", {
      intensity: 70,
      exerciseCount: 8,
    });
    expect((params as { totalMinutes: number }).totalMinutes).toBe(8);
  });

  it("uses intensity for interval work/rest defaults", () => {
    const high = getDefaultFormatParams("Interval Training", {
      intensity: 85,
      exerciseCount: 3,
    });
    const low = getDefaultFormatParams("Interval Training", {
      intensity: 60,
      exerciseCount: 3,
    });
    expect((high as { workSeconds: number }).workSeconds).toBe(30);
    expect((low as { workSeconds: number }).workSeconds).toBe(45);
  });

  it("falls back to standard for unknown format names", () => {
    expect(
      getDefaultFormatParams("Something Unknown", DEFAULT_CONTEXT).type,
    ).toBe("standard");
  });

  it("provides default values for configurable params", () => {
    const amrap = getDefaultFormatParams("AMRAP", DEFAULT_CONTEXT) as {
      minutes: number;
    };
    expect(amrap.minutes).toBeGreaterThan(0);

    const cluster = getDefaultFormatParams("Cluster", DEFAULT_CONTEXT) as {
      clusterSize: number;
      restBetweenClusters: number;
    };
    expect(cluster.clusterSize).toBeGreaterThan(0);
    expect(cluster.restBetweenClusters).toBeGreaterThan(0);

    const tempo = getDefaultFormatParams("Tempo Sets", DEFAULT_CONTEXT) as {
      tempo: string;
    };
    expect(tempo.tempo).toMatch(/\d+-\d+-\d+-\d+/);

    const accumulate = getDefaultFormatParams(
      "Accumulate X",
      DEFAULT_CONTEXT,
    ) as {
      target: number;
      unit: string;
    };
    expect(accumulate.target).toBeGreaterThan(0);
    expect(["reps", "seconds"]).toContain(accumulate.unit);

    const iGoYouGo = getDefaultFormatParams(
      "I Go, You Go",
      DEFAULT_CONTEXT,
    ) as {
      totalRounds: number;
    };
    expect(iGoYouGo.totalRounds).toBeGreaterThan(0);
  });
});

describe("formatParamsLabel", () => {
  it("returns a non-empty string for every format type", () => {
    // Generate one of each type via the factory
    const allParams: FormatParams[] = DB_FORMAT_NAMES.map((name) =>
      getDefaultFormatParams(name, DEFAULT_CONTEXT),
    );
    // Add standard fallback
    allParams.push({ type: "standard" });

    for (const params of allParams) {
      const label = formatParamsLabel(params);
      expect(label).toBeTruthy();
      expect(typeof label).toBe("string");
      expect(label.length).toBeGreaterThan(0);
    }
  });

  it("includes param values in labels for configurable types", () => {
    expect(formatParamsLabel({ type: "amrap", minutes: 12 })).toContain("12");
    expect(
      formatParamsLabel({
        type: "tabata",
        workSeconds: 20,
        restSeconds: 10,
        rounds: 8,
      }),
    ).toContain("20");
    expect(
      formatParamsLabel({ type: "tempo_sets", tempo: "4-2-1-0" }),
    ).toContain("4-2-1-0");
    expect(
      formatParamsLabel({ type: "accumulate", target: 100, unit: "reps" }),
    ).toContain("100");
    expect(formatParamsLabel({ type: "wave_loading", waves: 3 })).toContain(
      "3",
    );
    expect(
      formatParamsLabel({
        type: "cluster",
        clusterSize: 5,
        restBetweenClusters: 15,
      }),
    ).toContain("5");
  });
});
