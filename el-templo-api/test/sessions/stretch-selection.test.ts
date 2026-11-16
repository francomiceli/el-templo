/**
 * Unit puro de la regla de seleccion de estiramientos (fase 213, SPEC 4.1,
 * D-01/D-03/D-04/D-05/D-06). Sin DB: la regla no lee base ni reloj.
 *
 * La verdad fija es la tabla de referencia del SPEC 4.1, generada con
 * `.planning/phases/213-estiramiento-post-clase/consultas/regla_simulacion.py`
 * sobre `consultas/13_sesiones_de_referencia.tsv`. Si la lista curada cambia,
 * se regenera la tabla con ese script y este archivo se actualiza en el mismo
 * cambio (T-213-04).
 *
 *   pnpm exec vitest run test/sessions/stretch-selection.test.ts
 */
import { describe, it, expect } from "vitest";
import {
  seleccionarEstiramientos,
  modoOfreceEstiramiento,
  duracionRutina,
  RUTAS_TREN_SUPERIOR,
  STRETCH_SECONDS_PER_SIDE,
  STRETCH_TRANSITION_SECONDS,
  type DiaSemana,
  type EntradaCatalogo,
  type EntradaSeleccion,
  type PrescritoMovilidad,
} from "../../src/modules/sessions/stretch-selection";

type FilaCatalogo = readonly [
  exerciseId: number,
  nombre: string,
  familia: EntradaCatalogo["familia"],
  orden: number,
  lados: 1 | 2,
  ordenBase: number | null,
];

/** Las 20 filas curadas del SPEC 4.1 (ids, orden y lados = semilla del plan 01). */
const FILAS_SPEC: readonly FilaCatalogo[] = [
  [4180, "QUAD STANDING STRETCH", "LS", 1, 2, 3],
  [4182, "SITTED GLUTE STRETCH", "LS", 2, 2, null],
  [4188, "WARRIOR STRETCH", "LS", 3, 2, null],
  [4184, "LAYED DOWN GLUTE STRETCH", "LS", 4, 2, null],
  [4185, "COUCH STRETCH", "LS", 5, 2, null],
  [3892, "PIKE STANDING", "MN", 1, 1, 2],
  [3893, "STR PIKE STANDING", "MN", 2, 1, null],
  [4181, "LAYED DOWN HAM BENT", "MN", 3, 2, null],
  [3897, "STANDING WINDMILL", "MN", 4, 2, null],
  [3105, "CAT COW", "FL", 1, 1, 1],
  [3106, "TABLE", "FL", 2, 1, null],
  [3108, "SHOULDER BRIDGE", "FL", 3, 1, null],
  [3111, "SEAL REPS", "FL", 4, 1, null],
  [3109, "TABLE TWIST", "FL", 5, 2, null],
  [3284, "STANDING LATERAL STRETCH", "TTB", 1, 2, 5],
  [5090, "WALL CHEST STRETCH", "TS", 1, 2, 4],
  [4474, "BUTCHER FLOOR STRETCH", "TS", 2, 1, null],
  [4610, "LAY DOWN ARMS UP", "TS", 3, 1, null],
  [4872, "COBRA STRETCH", "TS", 4, 1, null],
  [4818, "ANGELS AND DEMONS", "TS", 5, 1, null],
];

function armarCatalogo(filas: readonly FilaCatalogo[]): EntradaCatalogo[] {
  return filas.map(
    ([exerciseId, nombre, familia, orden, lados, ordenBase]) => ({
      exerciseId,
      nombre,
      familia,
      orden,
      lados,
      ordenBase,
    }),
  );
}

const CATALOGO_SPEC: readonly EntradaCatalogo[] = armarCatalogo(FILAS_SPEC);

interface SesionDeReferencia {
  dayId: string;
  modo: string;
  prescritos: readonly PrescritoMovilidad[];
  rutas: readonly string[];
}

interface Esperado {
  familias: readonly string[];
  duracionSegundos: number;
  /** [nombre, lados] en orden. */
  estiramientos: ReadonlyArray<readonly [string, 1 | 2]>;
}

/** Fixtures transcriptas de `consultas/13_sesiones_de_referencia.tsv`. */
const SESIONES: readonly SesionDeReferencia[] = [
  {
    dayId: "W37-lunes-kairos",
    modo: "regular",
    prescritos: [
      { nombre: "DIAGONAL STRETCH", familiaBase: "LS ( LUNGES )" },
      { nombre: "COUCH STRETCH", familiaBase: "LS ( LUNGES )" },
      { nombre: "HEAD TO TOE OL PIKE", familiaBase: "MN" },
      { nombre: "BUTCHER FLOOR STRETCH", familiaBase: null },
    ],
    rutas: ["OAP", "L", "NC", "PL"],
  },
  {
    dayId: "W37-miercoles-alfa",
    modo: "combos",
    prescritos: [
      { nombre: "JEFFERSON CURL", familiaBase: "MN" },
      { nombre: "RH STR. DONKEY KICK", familiaBase: "PL" },
      { nombre: "QUAD STANDING STRETCH", familiaBase: "LS ( LUNGES )" },
      { nombre: "LOW BRIDGE TWIST", familiaBase: "FL" },
    ],
    rutas: ["HSPU", "DS", "SU", "FB"],
  },
  {
    dayId: "W37-jueves-delta",
    modo: "tecnica",
    prescritos: [
      { nombre: "HEAD TO TOE CROSSED ELBOW", familiaBase: "MN" },
      { nombre: "WALL BRIDGE", familiaBase: "FL" },
      { nombre: "SEAL PUSH UP", familiaBase: "FL" },
      { nombre: "SUPERMAN HYPEREXTENSION", familiaBase: null },
      { nombre: "KNEE PIGEON STRETCH", familiaBase: "LS ( LUNGES )" },
      {
        nombre: "ARCHER COUCH STRETCH KNEE SPAGAT",
        familiaBase: "LS ( LUNGES )",
      },
      { nombre: "LOW BRIDGE ONE LEG", familiaBase: "FL" },
    ],
    rutas: ["MU", "MU", "L", "STRETCHING"],
  },
  {
    dayId: "W37-jueves-kairos",
    modo: "tecnica",
    prescritos: [
      { nombre: "WALL CHEST STRETCH", familiaBase: null },
      { nombre: "DIAGONAL STRETCH", familiaBase: "LS ( LUNGES )" },
      { nombre: "QUAD STANDING STRETCH", familiaBase: "LS ( LUNGES )" },
      { nombre: "CAT COW", familiaBase: "FL" },
      { nombre: "WALL CHEST STRETCH", familiaBase: null },
      { nombre: "DIAGONAL STRETCH", familiaBase: "LS ( LUNGES )" },
      { nombre: "BOX PIKE SQUAT", familiaBase: "MN" },
    ],
    rutas: ["MU", "MU", "L", "STRETCHING"],
  },
  {
    dayId: "W37-viernes-alfa",
    modo: "regular",
    prescritos: [
      { nombre: "BOX PIKE HANG", familiaBase: "MN" },
      { nombre: "SHOULDER BRIDGE", familiaBase: "FL" },
      { nombre: "PSU", familiaBase: null },
      { nombre: "COUCH STRETCH", familiaBase: "LS ( LUNGES )" },
      { nombre: "HEAD TO TOE OL PIKE", familiaBase: "MN" },
    ],
    rutas: ["HSPU", "DS", "PS", "FL"],
  },
  {
    dayId: "W37-viernes-sigma",
    modo: "regular",
    prescritos: [
      { nombre: "RH TUCK TO STR", familiaBase: "PL" },
      { nombre: "TABLE", familiaBase: "FL" },
      { nombre: "SITTED PIKE W", familiaBase: "MN" },
      { nombre: "DEFICIT SITTED PIKE WEIGHTED", familiaBase: "MN" },
    ],
    rutas: ["OAP", "DS", "HT", "FL"],
  },
  {
    dayId: "W37-sabado-alfa",
    modo: "rom",
    prescritos: [
      { nombre: "GENTLEMAN ANK MOB", familiaBase: "LS ( LUNGES )" },
      { nombre: "STANDING PIGEON STRETCH", familiaBase: "LS ( LUNGES )" },
      { nombre: "SHOULDER BRIDGE", familiaBase: "FL" },
      { nombre: "STR PIKE STANDING", familiaBase: "MN" },
      { nombre: "JEFFERSON CURL", familiaBase: "MN" },
      { nombre: "TABLE", familiaBase: "FL" },
      { nombre: "LAY DOWN ARMS UP", familiaBase: null },
      { nombre: "RING ESC CIRCLE", familiaBase: null },
    ],
    rutas: ["ROM_LOWER", "ROM_CORE", "ROM_UPPER"],
  },
  {
    dayId: "W38-lunes-alfa",
    modo: "regular",
    prescritos: [
      { nombre: "SPAGAT FULL SPLIT", familiaBase: "LS ( LUNGES )" },
      { nombre: "STANDING WINDMILL", familiaBase: "MN" },
      { nombre: "GENTLEMAN TO PCK", familiaBase: "LS ( LUNGES )" },
      { nombre: "STRAIGHT SIDE PCK STANDING W.", familiaBase: "TTB / HF" },
    ],
    rutas: ["SS", "OAPU", "SU", "TTB"],
  },
  {
    dayId: "W38-lunes-delta",
    modo: "regular",
    prescritos: [
      { nombre: "SPAGAT PIGEON STRETCH", familiaBase: "LS ( LUNGES )" },
      { nombre: "STR JEFFERSON CURL", familiaBase: "MN" },
      { nombre: "WARRIOR HEIGHT PIGEON", familiaBase: "LS ( LUNGES )" },
      { nombre: "HEAD TO TOE CROSSED ELBOW", familiaBase: "MN" },
    ],
    rutas: ["SS", "OAPU", "SU", "TTB"],
  },
  {
    dayId: "W38-martes-alfa",
    modo: "regular",
    prescritos: [
      { nombre: "STRAIGHT SIDE PCK STANDING W.", familiaBase: "TTB / HF" },
      { nombre: "STR JEFFERSON CURL", familiaBase: "MN" },
      { nombre: "SHOULDER BRIDGE", familiaBase: "FL" },
      { nombre: "SHOULDER BRIDGE", familiaBase: "FL" },
    ],
    rutas: ["L", "NC", "PL", "OAP"],
  },
  {
    dayId: "W38-martes-kairos",
    modo: "regular",
    prescritos: [
      { nombre: "COUCH STRETCH", familiaBase: "LS ( LUNGES )" },
      { nombre: "PIKE STANDING", familiaBase: "MN" },
      { nombre: "BUTCHER FLOOR STRETCH", familiaBase: null },
      { nombre: "WALL CHEST STRETCH", familiaBase: null },
    ],
    rutas: ["L", "NC", "PL", "OAP"],
  },
  {
    dayId: "W38-miercoles-alfa",
    modo: "tecnica",
    prescritos: [
      { nombre: "FULL BRIDGE ONE ARM", familiaBase: "FL" },
      { nombre: "PIKE STANDING", familiaBase: "MN" },
      { nombre: "LAYED DOWN GLUTE STRETCH", familiaBase: "LS ( LUNGES )" },
      { nombre: "TABLE LEAN", familiaBase: null },
      { nombre: "BUTCHER BOX", familiaBase: null },
      { nombre: "SEAL REPS", familiaBase: "FL" },
      { nombre: "STANDING LATERAL STRETCH", familiaBase: "TTB / HF" },
    ],
    rutas: ["PHS", "PHS", "QC", "STRETCHING"],
  },
];

const ESPERADO: Readonly<Record<string, Esperado>> = {
  "W37-lunes-kairos": {
    familias: ["LS", "MN", "TS"],
    duracionSegundos: 410,
    estiramientos: [
      ["COUCH STRETCH", 2],
      ["STR PIKE STANDING", 1],
      ["BUTCHER FLOOR STRETCH", 1],
      ["SITTED GLUTE STRETCH", 2],
      ["LAYED DOWN HAM BENT", 2],
    ],
  },
  "W37-miercoles-alfa": {
    familias: ["FL", "MN", "LS", "TS"],
    duracionSegundos: 410,
    estiramientos: [
      ["TABLE TWIST", 2],
      ["STANDING WINDMILL", 2],
      ["QUAD STANDING STRETCH", 2],
      ["ANGELS AND DEMONS", 1],
      ["CAT COW", 1],
    ],
  },
  "W37-jueves-delta": {
    familias: ["FL", "LS", "MN", "TS"],
    duracionSegundos: 365,
    estiramientos: [
      ["CAT COW", 1],
      ["QUAD STANDING STRETCH", 2],
      ["PIKE STANDING", 1],
      ["WALL CHEST STRETCH", 2],
      ["TABLE", 1],
    ],
  },
  "W37-jueves-kairos": {
    familias: ["LS", "TS", "FL", "MN"],
    duracionSegundos: 410,
    estiramientos: [
      ["QUAD STANDING STRETCH", 2],
      ["WALL CHEST STRETCH", 2],
      ["CAT COW", 1],
      ["PIKE STANDING", 1],
      ["SITTED GLUTE STRETCH", 2],
    ],
  },
  "W37-viernes-alfa": {
    familias: ["MN", "FL", "LS", "TS"],
    duracionSegundos: 365,
    estiramientos: [
      ["STR PIKE STANDING", 1],
      ["SHOULDER BRIDGE", 1],
      ["COUCH STRETCH", 2],
      ["BUTCHER FLOOR STRETCH", 1],
      ["LAYED DOWN HAM BENT", 2],
    ],
  },
  "W37-viernes-sigma": {
    familias: ["FL", "MN", "TS"],
    duracionSegundos: 320,
    estiramientos: [
      ["TABLE", 1],
      ["STR PIKE STANDING", 1],
      ["BUTCHER FLOOR STRETCH", 1],
      ["SHOULDER BRIDGE", 1],
      ["LAYED DOWN HAM BENT", 2],
    ],
  },
  "W38-lunes-alfa": {
    familias: ["LS", "MN", "TTB", "TS"],
    duracionSegundos: 455,
    estiramientos: [
      ["LAYED DOWN GLUTE STRETCH", 2],
      ["STANDING WINDMILL", 2],
      ["STANDING LATERAL STRETCH", 2],
      ["COBRA STRETCH", 1],
      ["COUCH STRETCH", 2],
    ],
  },
  "W38-lunes-delta": {
    familias: ["LS", "MN", "TS"],
    duracionSegundos: 455,
    estiramientos: [
      ["LAYED DOWN GLUTE STRETCH", 2],
      ["LAYED DOWN HAM BENT", 2],
      ["COBRA STRETCH", 1],
      ["COUCH STRETCH", 2],
      ["STANDING WINDMILL", 2],
    ],
  },
  "W38-martes-alfa": {
    familias: ["FL", "TTB", "MN", "TS"],
    duracionSegundos: 410,
    estiramientos: [
      ["SHOULDER BRIDGE", 1],
      ["STANDING LATERAL STRETCH", 2],
      ["STANDING WINDMILL", 2],
      ["ANGELS AND DEMONS", 1],
      ["TABLE TWIST", 2],
    ],
  },
  "W38-martes-kairos": {
    familias: ["TS", "LS", "MN"],
    duracionSegundos: 410,
    estiramientos: [
      ["BUTCHER FLOOR STRETCH", 1],
      ["COUCH STRETCH", 2],
      ["PIKE STANDING", 1],
      ["WALL CHEST STRETCH", 2],
      ["LAYED DOWN GLUTE STRETCH", 2],
    ],
  },
  "W38-miercoles-alfa": {
    familias: ["FL", "MN", "LS", "TTB", "TS"],
    duracionSegundos: 410,
    estiramientos: [
      ["SEAL REPS", 1],
      ["PIKE STANDING", 1],
      ["LAYED DOWN GLUTE STRETCH", 2],
      ["STANDING LATERAL STRETCH", 2],
      ["WALL CHEST STRETCH", 2],
    ],
  },
};

const DIAS: readonly DiaSemana[] = [
  "lunes",
  "martes",
  "miercoles",
  "jueves",
  "viernes",
  "sabado",
];

/** `W38-martes-kairos` -> { semana: 38, dia: "martes" }. */
function partirDayId(dayId: string): { semana: number; dia: DiaSemana } {
  const [semanaTxt, diaTxt] = dayId.split("-");
  const dia = DIAS.find((d) => d === diaTxt);
  if (!dia) throw new Error(`dia desconocido en ${dayId}`);
  return { semana: Number(semanaTxt.slice(1)), dia };
}

function entradaDe(
  sesion: SesionDeReferencia,
  catalogo: readonly EntradaCatalogo[] = CATALOGO_SPEC,
): EntradaSeleccion {
  const { semana, dia } = partirDayId(sesion.dayId);
  return {
    prescritos: sesion.prescritos,
    rutas: sesion.rutas,
    catalogo,
    semana,
    dia,
  };
}

function entrada(
  over: Partial<EntradaSeleccion> & Pick<EntradaSeleccion, "prescritos">,
): EntradaSeleccion {
  return {
    rutas: [],
    catalogo: CATALOGO_SPEC,
    semana: 1,
    dia: "lunes",
    ...over,
  };
}

function nombres(e: EntradaSeleccion): string[] {
  return seleccionarEstiramientos(e).estiramientos.map((x) => x.nombre);
}

const sesionesConOferta = SESIONES.filter((s) =>
  modoOfreceEstiramiento(s.modo),
);

describe("tabla de referencia del SPEC 4.1", () => {
  it("transcribe las 12 sesiones del TSV: 11 con oferta + el sabado ROM", () => {
    expect(SESIONES).toHaveLength(12);
    expect(sesionesConOferta).toHaveLength(11);
    expect(Object.keys(ESPERADO)).toHaveLength(11);
  });

  it.each(sesionesConOferta.map((s) => [s.dayId, s] as const))(
    "%s devuelve exactamente los estiramientos, el orden y la duracion esperados",
    (dayId, sesion) => {
      const esperado = ESPERADO[dayId];
      const r = seleccionarEstiramientos(entradaDe(sesion));
      expect(r.estiramientos.map((x) => [x.nombre, x.lados])).toEqual(
        esperado.estiramientos.map(([n, l]) => [n, l]),
      );
      expect(r.duracionSegundos).toBe(esperado.duracionSegundos);
      expect(r.familias).toEqual([...esperado.familias]);
    },
  );

  it("las duraciones de la tabla son 6:50, 6:05, 5:20 y 7:35", () => {
    const duraciones = new Set(
      Object.values(ESPERADO).map((e) => e.duracionSegundos),
    );
    expect([...duraciones].sort((a, b) => a - b)).toEqual([320, 365, 410, 455]);
  });

  it("la familia del dia de W37-lunes-kairos es LS > MN > TS", () => {
    const sesion = SESIONES.find((s) => s.dayId === "W37-lunes-kairos");
    if (!sesion) throw new Error("falta la fixture");
    expect(seleccionarEstiramientos(entradaDe(sesion)).familias).toEqual([
      "LS",
      "MN",
      "TS",
    ]);
  });

  it("todo exerciseId devuelto pertenece al catalogo recibido, sin repetidos", () => {
    const ids = new Set(CATALOGO_SPEC.map((c) => c.exerciseId));
    for (const sesion of sesionesConOferta) {
      const r = seleccionarEstiramientos(entradaDe(sesion));
      const devueltos = r.estiramientos.map((x) => x.exerciseId);
      for (const id of devueltos) expect(ids.has(id)).toBe(true);
      expect(new Set(devueltos).size).toBe(devueltos.length);
    }
  });

  it("devuelve id, familia y lados del catalogo", () => {
    const sesion = SESIONES.find((s) => s.dayId === "W38-martes-kairos");
    if (!sesion) throw new Error("falta la fixture");
    const r = seleccionarEstiramientos(entradaDe(sesion));
    expect(r.estiramientos[0]).toEqual({
      exerciseId: 4474,
      nombre: "BUTCHER FLOOR STRETCH",
      familia: "TS",
      lados: 1,
    });
  });
});

describe("modoOfreceEstiramiento (D-06)", () => {
  it.each(["regular", "combos", "tecnica"])(
    "%s ofrece estiramiento",
    (modo) => {
      expect(modoOfreceEstiramiento(modo)).toBe(true);
    },
  );

  it("rom no ofrece estiramiento (W37-sabado-alfa)", () => {
    const sabado = SESIONES.find((s) => s.dayId === "W37-sabado-alfa");
    expect(sabado?.modo).toBe("rom");
    expect(modoOfreceEstiramiento("rom")).toBe(false);
  });

  it("un modo desconocido tampoco ofrece", () => {
    expect(modoOfreceEstiramiento("")).toBe(false);
    expect(modoOfreceEstiramiento("otro")).toBe(false);
  });
});

describe("constantes de la regla (D-03, D-05)", () => {
  it("RUTAS_TREN_SUPERIOR tiene exactamente las 9 rutas sin ambiguedad", () => {
    expect([...RUTAS_TREN_SUPERIOR].sort()).toEqual(
      ["BL", "HS", "HSPU", "MU", "OAP", "OAPU", "OAR", "PHS", "PLPU"].sort(),
    );
  });

  it("45 s por lado y 10 s de transicion", () => {
    expect(STRETCH_SECONDS_PER_SIDE).toBe(45);
    expect(STRETCH_TRANSITION_SECONDS).toBe(10);
  });

  it("duracionRutina = lados x 45 + 10 por estiramiento", () => {
    expect(duracionRutina([])).toBe(0);
    expect(duracionRutina([{ lados: 1 }])).toBe(55);
    expect(duracionRutina([{ lados: 2 }, { lados: 1 }])).toBe(155);
  });
});

describe("familias del dia (pasos 1 y 2)", () => {
  it("sin familias (sin prescritos con familia ni rutas de tren superior) devuelve la lista de base completa", () => {
    const r = seleccionarEstiramientos(
      entrada({ prescritos: [], rutas: ["DS", "FL"] }),
    );
    expect(r.familias).toEqual([]);
    expect(r.estiramientos.map((x) => [x.nombre, x.lados])).toEqual([
      ["CAT COW", 1],
      ["PIKE STANDING", 1],
      ["QUAD STANDING STRETCH", 2],
      ["WALL CHEST STRETCH", 2],
      ["STANDING LATERAL STRETCH", 2],
    ]);
    expect(r.duracionSegundos).toBe(410);
  });

  it("un prescrito sin familia no aporta", () => {
    const r = seleccionarEstiramientos(
      entrada({
        prescritos: [{ nombre: "PSU", familiaBase: null }],
        rutas: [],
      }),
    );
    expect(r.familias).toEqual([]);
  });

  it("PL cuenta como FL (D-04)", () => {
    const r = seleccionarEstiramientos(
      entrada({
        prescritos: [{ nombre: "RH TUCK TO STR", familiaBase: "PL" }],
      }),
    );
    expect(r.familias).toEqual(["FL"]);
  });

  it("las familias se ordenan por cantidad de apariciones y, en empate, por la primera aparicion", () => {
    const r = seleccionarEstiramientos(
      entrada({
        prescritos: [
          { nombre: "HEAD TO TOE OL PIKE", familiaBase: "MN" },
          { nombre: "DIAGONAL STRETCH", familiaBase: "LS ( LUNGES )" },
          { nombre: "COUCH STRETCH", familiaBase: "LS ( LUNGES )" },
          { nombre: "TABLE", familiaBase: "FL" },
        ],
      }),
    );
    expect(r.familias).toEqual(["LS", "MN", "FL"]);
  });

  it("la familia del catalogo manda sobre la de la base (LAYED DOWN HAM BENT es MN)", () => {
    const r = seleccionarEstiramientos(
      entrada({
        prescritos: [
          { nombre: "LAYED DOWN HAM BENT", familiaBase: "LS ( LUNGES )" },
        ],
      }),
    );
    expect(r.familias).toEqual(["MN"]);
    expect(r.estiramientos[0].nombre).toBe("LAYED DOWN HAM BENT");
  });

  it("la comparacion prescrito-catalogo ignora mayusculas y espacios sobrantes", () => {
    const r = seleccionarEstiramientos(
      entrada({
        prescritos: [{ nombre: "  couch stretch ", familiaBase: null }],
      }),
    );
    expect(r.familias).toEqual(["LS"]);
    expect(r.estiramientos[0].nombre).toBe("COUCH STRETCH");
  });

  it("TS entra al final si hay ruta de empuje/traccion y nadie aporto TS", () => {
    const prescritos = [{ nombre: "PIKE STANDING", familiaBase: "MN" }];
    expect(
      seleccionarEstiramientos(entrada({ prescritos, rutas: ["HS"] })).familias,
    ).toEqual(["MN", "TS"]);
  });

  it("no suma TS con rutas dudosas (DS, FL, PL, FLR) (D-03)", () => {
    const prescritos = [{ nombre: "PIKE STANDING", familiaBase: "MN" }];
    expect(
      seleccionarEstiramientos(
        entrada({ prescritos, rutas: ["DS", "FL", "PL", "FLR"] }),
      ).familias,
    ).toEqual(["MN"]);
  });

  it("no duplica TS si un prescrito ya la aporta y no la desplaza del orden por apariciones", () => {
    const r = seleccionarEstiramientos(
      entrada({
        prescritos: [
          { nombre: "WALL CHEST STRETCH", familiaBase: null },
          { nombre: "PIKE STANDING", familiaBase: "MN" },
        ],
        rutas: ["HS"],
      }),
    );
    expect(r.familias).toEqual(["TS", "MN"]);
    expect(r.estiramientos[0].nombre).toBe("WALL CHEST STRETCH");
  });
});

describe("completado y nunca repetir (pasos 3, 4 y 5)", () => {
  it("TTB tiene un solo ejercicio: una vez usado el lugar pasa a la siguiente familia", () => {
    const r = seleccionarEstiramientos(
      entrada({
        prescritos: [
          { nombre: "STRAIGHT SIDE PCK STANDING W.", familiaBase: "TTB / HF" },
          { nombre: "TABLE", familiaBase: "FL" },
        ],
      }),
    );
    expect(r.familias).toEqual(["TTB", "FL"]);
    expect(r.estiramientos.map((x) => x.nombre)).toEqual([
      "STANDING LATERAL STRETCH",
      "TABLE",
      "SHOULDER BRIDGE",
      "SEAL REPS",
      "TABLE TWIST",
    ]);
    expect(r.duracionSegundos).toBe(365);
  });

  it("si ninguna familia tiene candidatos, completa con la lista de base sin repetir", () => {
    const r = seleccionarEstiramientos(
      entrada({
        prescritos: [
          { nombre: "STRAIGHT SIDE PCK STANDING W.", familiaBase: "TTB / HF" },
        ],
      }),
    );
    expect(r.familias).toEqual(["TTB"]);
    expect(r.estiramientos.map((x) => x.nombre)).toEqual([
      "STANDING LATERAL STRETCH",
      "CAT COW",
      "PIKE STANDING",
      "QUAD STANDING STRETCH",
      "WALL CHEST STRETCH",
    ]);
    expect(r.duracionSegundos).toBe(410);
  });

  it("un prescrito que esta en la lista va primero dentro de su familia, con cualquier semana", () => {
    const sesion = SESIONES.find((s) => s.dayId === "W38-martes-kairos");
    if (!sesion) throw new Error("falta la fixture");
    for (let semana = 30; semana <= 45; semana++) {
      const r = seleccionarEstiramientos({ ...entradaDe(sesion), semana });
      expect(r.estiramientos[0].nombre).toBe("BUTCHER FLOOR STRETCH");
      expect(r.estiramientos[1].nombre).toBe("COUCH STRETCH");
      expect(r.estiramientos[2].nombre).toBe("PIKE STANDING");
      expect(r.estiramientos[3].nombre).toBe("WALL CHEST STRETCH");
    }
  });
});

describe("duracion (paso 6)", () => {
  /** Catalogo de prueba con `cantidad` ejercicios de la misma familia LS. */
  function catalogoLS(cantidad: number, lados: 1 | 2): EntradaCatalogo[] {
    return Array.from({ length: cantidad }, (_, i) => ({
      exerciseId: 9000 + i,
      nombre: `PRUEBA ${i + 1}`,
      familia: "LS" as const,
      orden: i + 1,
      lados,
      ordenBase: null,
    }));
  }
  const PRESCRITO_LS: readonly PrescritoMovilidad[] = [
    { nombre: "PRUEBA 1", familiaBase: "LS ( LUNGES )" },
  ];

  it("una rutina que supera 8 min se recorta quitando el ultimo: 5 de dos lados (500 s) pasan a 4 (400 s)", () => {
    const r = seleccionarEstiramientos(
      entrada({ prescritos: PRESCRITO_LS, catalogo: catalogoLS(6, 2) }),
    );
    expect(r.estiramientos).toHaveLength(4);
    expect(r.duracionSegundos).toBe(400);
    expect(r.estiramientos[0].nombre).toBe("PRUEBA 1");
  });

  it("una rutina por debajo de 5 min se completa: 5 de un lado (275 s) pasan a 6 (330 s)", () => {
    const r = seleccionarEstiramientos(
      entrada({ prescritos: PRESCRITO_LS, catalogo: catalogoLS(7, 1) }),
    );
    expect(r.estiramientos).toHaveLength(6);
    expect(r.duracionSegundos).toBe(330);
  });

  it("si el catalogo se agota antes de llegar a 5 min, termina sin repetir (T-213-05)", () => {
    const r = seleccionarEstiramientos(
      entrada({ prescritos: PRESCRITO_LS, catalogo: catalogoLS(3, 1) }),
    );
    expect(r.estiramientos).toHaveLength(3);
    expect(r.duracionSegundos).toBe(165);
  });

  it("con catalogo vacio devuelve una rutina vacia (T-213-05)", () => {
    const r = seleccionarEstiramientos(
      entrada({ prescritos: PRESCRITO_LS, catalogo: [] }),
    );
    expect(r.estiramientos).toEqual([]);
    expect(r.duracionSegundos).toBe(0);
  });
});

describe("determinismo y rotacion", () => {
  function congelar<T extends object>(obj: T): T {
    for (const valor of Object.values(obj)) {
      if (typeof valor === "object" && valor !== null) congelar(valor);
    }
    return Object.freeze(obj);
  }

  it("misma entrada produce la misma salida y no muta las entradas congeladas", () => {
    for (const sesion of sesionesConOferta) {
      const e = congelar({
        ...entradaDe(sesion),
        prescritos: sesion.prescritos.map((p) => ({ ...p })),
        rutas: [...sesion.rutas],
        catalogo: CATALOGO_SPEC.map((c) => ({ ...c })),
      });
      const a = seleccionarEstiramientos(e);
      const b = seleccionarEstiramientos(e);
      expect(a).toEqual(b);
    }
  });

  it("la rotacion cambia con (semana + indice del dia): otra semana da otro resto, mismos prescritos", () => {
    const sesion = SESIONES.find((s) => s.dayId === "W38-martes-kairos");
    if (!sesion) throw new Error("falta la fixture");
    const base = entradaDe(sesion);
    const s38 = nombres(base);
    const s39 = nombres({ ...base, semana: 39 });
    expect(s38.slice(0, 4)).toEqual(s39.slice(0, 4));
    expect(s38[4]).toBe("LAYED DOWN GLUTE STRETCH");
    expect(s39[4]).toBe("QUAD STANDING STRETCH");
  });

  it("el indice del dia tambien rota: mismo numero de semana, otro dia", () => {
    const sesion = SESIONES.find((s) => s.dayId === "W38-martes-kairos");
    if (!sesion) throw new Error("falta la fixture");
    const base = entradaDe(sesion);
    expect(nombres({ ...base, dia: "miercoles" })[4]).toBe(
      "QUAD STANDING STRETCH",
    );
  });
});
