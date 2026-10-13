/**
 * `buildRecorridoDeInicio` — el recorrido de la pantalla de inicio de la TV
 * usa el par del nivel de referencia ALFA (alfa + delta, filtrado por los
 * niveles del dia), no todos los niveles (decision de Franco, 2026-10-13).
 *
 * Test unitario PURO (sin MySQL ni app): arma `ClassDay` a mano.
 */
import { describe, it, expect } from "vitest";
import {
  NIVEL_REFERENCIA_INICIO,
  buildRecorrido,
  buildRecorridoDeInicio,
} from "../../src/modules/tv/recorrido";
import type {
  ClassDay,
  ClassDayBlock,
  ClassDayPrescription,
  ClassDaySession,
} from "../../src/modules/tv/class-day";

let nextId = 1;

function prescription(category: string, route: string): ClassDayPrescription {
  return {
    id: nextId++,
    exerciseName: "ej",
    contraction: "CON",
    reps: 8,
    repsMax: null,
    seconds: 0,
    secondsMax: null,
    increment: null,
    notes: null,
    exerciseType: "main",
    weighted: false,
    sortOrder: 0,
    videoKey: null,
    exerciseCategory: category,
    exerciseCategorySecondary: null,
    exerciseRoute: route,
  };
}

function block(
  role: string,
  route: string,
  category: string,
  intensity: number,
  formatName = "AMRAP",
): ClassDayBlock {
  return {
    id: nextId++,
    role,
    route,
    intensity,
    formatName,
    formatParams: null,
    customTitle: null,
    sortOrder: 0,
    prescriptions: [prescription(category, route)],
  };
}

/** Sesion de un nivel: INITIUM + NUCLEUS con la ruta/intensidad pedidas. */
function session(
  memberLevel: string,
  nucleus: {
    route: string;
    category: string;
    intensity: number;
    format?: string;
  },
): ClassDaySession {
  return {
    id: nextId++,
    dayId: `W1-martes-${memberLevel}`,
    memberLevel,
    blocks: [
      block("INITIUM", "OAP", "HIP DOMINANT", 50),
      block(
        "NUCLEUS",
        nucleus.route,
        nucleus.category,
        nucleus.intensity,
        nucleus.format,
      ),
    ],
  };
}

function day(sessions: ClassDaySession[]): ClassDay {
  return {
    date: "2026-02-24",
    week: 1,
    dayName: "martes",
    mode: "regular",
    approved: true,
    status: "approved",
    // Orden canonico del dia (REGULAR_LEVEL_ORDER).
    levels: ["kairos", "alfa", "delta", "sigma"].filter((l) =>
      sessions.some((s) => s.memberLevel === l),
    ),
    sessions,
  };
}

const ALFA = { route: "HSPU", category: "PUSH HORIZONTAL", intensity: 60 };
const DELTA = {
  route: "SS",
  category: "KNEE DOMINANT",
  intensity: 80,
  format: "EMOM",
};
const SIGMA = {
  route: "OAR",
  category: "PULL VERTICAL",
  intensity: 95,
  format: "TABATA",
};

describe("buildRecorridoDeInicio", () => {
  it("el nivel de referencia es alfa", () => {
    expect(NIVEL_REFERENCIA_INICIO).toBe("alfa");
  });

  it("con alfa y delta presentes usa SOLO ese par: un tercer nivel no aparece en subtitulo, zonas, formato ni intensidad", () => {
    const classDay = day([
      session("alfa", ALFA),
      session("delta", DELTA),
      session("sigma", SIGMA),
    ]);

    const [nucleus] = buildRecorridoDeInicio(classDay).bloques;
    expect(nucleus.role).toBe("NUCLEUS");
    expect(nucleus.subtitle).toBe("Handstand Push Up · Sissy Squat");
    expect(nucleus.subtitle).not.toContain("Remos");
    expect(nucleus.zonas).not.toContain("upper-back");
    expect(nucleus.zonas).toContain("chest");
    expect(nucleus.zonas).toContain("quadriceps");
    // Rango del par alfa/delta (60-80), sin el 95 de sigma.
    expect(nucleus.intensity).toEqual({ min: 60, max: 80 });
    expect(nucleus.format).toBe("AMRAP / EMOM");
    expect(nucleus.format).not.toContain("TABATA");
  });

  it("difiere de buildRecorrido sin niveles (que une todos): el de inicio acota al par", () => {
    const classDay = day([
      session("alfa", ALFA),
      session("delta", DELTA),
      session("sigma", SIGMA),
    ]);

    const todos = buildRecorrido(classDay).bloques[0];
    expect(todos.intensity).toEqual({ min: 60, max: 95 });
    expect(todos.subtitle).toContain("Remos");

    const inicio = buildRecorridoDeInicio(classDay).bloques[0];
    expect(inicio.intensity).toEqual({ min: 60, max: 80 });
    expect(inicio.subtitle).not.toContain("Remos");
  });

  it("solo alfa (sin delta): usa alfa, filtrado por los niveles del dia", () => {
    const classDay = day([session("alfa", ALFA), session("sigma", SIGMA)]);
    const [nucleus] = buildRecorridoDeInicio(classDay).bloques;
    expect(nucleus.subtitle).toBe("Handstand Push Up");
    expect(nucleus.intensity).toEqual({ min: 60, max: 60 });
    expect(nucleus.format).toBe("AMRAP");
    expect(nucleus.zonas).toEqual(["chest", "deltoids", "triceps"]);
  });

  it("solo delta (sin alfa): el par igual alcanza", () => {
    const classDay = day([session("delta", DELTA), session("sigma", SIGMA)]);
    const [nucleus] = buildRecorridoDeInicio(classDay).bloques;
    expect(nucleus.subtitle).toBe("Sissy Squat");
    expect(nucleus.intensity).toEqual({ min: 80, max: 80 });
    expect(nucleus.format).toBe("EMOM");
  });

  it("sin alfa ni delta cae a TODOS los niveles del dia (nunca un recorrido vacio)", () => {
    const classDay = day([session("kairos", ALFA), session("sigma", SIGMA)]);
    const bloques = buildRecorridoDeInicio(classDay).bloques;
    expect(bloques.map((b) => b.role)).toEqual(["NUCLEUS"]);
    expect(bloques[0].intensity).toEqual({ min: 60, max: 95 });
    expect(bloques[0].format).toBe("AMRAP / TABATA");
    expect(bloques[0].subtitle).toBe("Handstand Push Up · Remos");
    // Idem al comportamiento de buildRecorrido sin niveles.
    expect(bloques).toEqual(buildRecorrido(classDay).bloques);
  });

  it("nunca incluye INITIUM", () => {
    const classDay = day([session("alfa", ALFA), session("delta", DELTA)]);
    expect(
      buildRecorridoDeInicio(classDay).bloques.some(
        (b) => b.role === "INITIUM",
      ),
    ).toBe(false);
  });
});
