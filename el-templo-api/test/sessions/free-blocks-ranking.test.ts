/**
 * Unit puro del ranking de la canasta de bloques libres (fase 197, D-04/D-08/D-09).
 * Sin DB: son funciones puras. Los casos de `weekDayToDate` usan fechas fijas a
 * proposito (funcion de fecha pura, excepcion permitida en las reglas de la fase).
 *
 *   pnpm exec vitest run test/sessions/free-blocks-ranking.test.ts
 */
import { describe, it, expect } from "vitest";
import {
  esRolDeCanasta,
  rangoDeRol,
  limpiarNombre,
  claveDeDuplicado,
  deduplicarMasReciente,
  trabajadoHoy,
  ordenarCanasta,
  paginar,
  subtituloDeBloque,
  type CandidatoCanasta,
} from "../../src/modules/sessions/free-blocks-ranking";
import {
  weekDayToDate,
  dateToWeekNumber,
  dateToDayName,
} from "../../src/modules/shared/week-dates";
import type { GrupoZona } from "../../src/modules/tv/muscle-zones";

const HITS_EN_CERO: Record<GrupoZona, number> = {
  hombros: 0,
  pecho: 0,
  espalda: 0,
  core: 0,
  piernas: 0,
  brazos: 0,
};

/** Candidato con valores neutros; cada test pisa lo que le importa. */
function cand(over: Partial<CandidatoCanasta> = {}): CandidatoCanasta {
  return {
    blockId: "b-1",
    dedupeKey: "k-1",
    date: "2026-10-14",
    role: "NUCLEUS",
    zones: [],
    groups: [],
    groupHits: { ...HITS_EN_CERO },
    ...over,
  };
}

describe("esRolDeCanasta (D-08)", () => {
  it.each([
    "NUCLEUS",
    "DEUTEROS_1",
    "DEUTEROS_2",
    "ATHLOS",
    "EPIKOS",
    "ROM_LOWER",
    "ROM_CORE",
    "ROM_UPPER",
  ])("%s entra en la canasta", (role) => {
    expect(esRolDeCanasta(role)).toBe(true);
  });

  it.each([
    "INITIUM",
    "TECNICA_I",
    "TECNICA_II",
    "TECNICA_II_ALT",
    "STRETCHING",
    "COMBOS_I",
    "COMBOS_II",
    "COMBOS_II_ALT",
  ])("%s queda afuera", (role) => {
    expect(esRolDeCanasta(role)).toBe(false);
  });

  it("ninguna variante *_ALT entra, aunque el prefijo sea de canasta", () => {
    expect(esRolDeCanasta("NUCLEUS_ALT")).toBe(false);
    expect(esRolDeCanasta("ROM_LOWER_ALT")).toBe(false);
  });
});

describe("rangoDeRol", () => {
  it("ordena NUCLEUS < DEUTEROS_1 < DEUTEROS_2 < ATHLOS < EPIKOS < ROM_*", () => {
    const roles = [
      "NUCLEUS",
      "DEUTEROS_1",
      "DEUTEROS_2",
      "ATHLOS",
      "EPIKOS",
      "ROM_CORE",
    ];
    const rangos = roles.map(rangoDeRol);
    expect(rangos).toEqual([0, 1, 2, 3, 4, 5]);
    expect(rangoDeRol("ROM_UPPER")).toBe(5);
  });
});

describe("limpiarNombre", () => {
  it("recorta y colapsa los espacios internos", () => {
    expect(limpiarNombre("  Sentadilla   goblet \t ")).toBe("Sentadilla goblet");
  });
});

describe("claveDeDuplicado (D-09)", () => {
  const base = {
    route: "AF",
    pattern: "KNEE DOMINANT",
    formatName: "EMOM",
    exerciseIds: [1, 2, 3],
  };

  it("los mismos ids en otro orden dan claves distintas", () => {
    const otra = claveDeDuplicado({ ...base, exerciseIds: [3, 2, 1] });
    expect(otra).not.toBe(claveDeDuplicado(base));
  });

  it("un patron con dobles espacios da la misma clave que el limpio", () => {
    const sucio = claveDeDuplicado({ ...base, pattern: "KNEE  DOMINANT " });
    expect(sucio).toBe(claveDeDuplicado(base));
  });

  it("recorta ruta y formato", () => {
    const sucio = claveDeDuplicado({
      ...base,
      route: " AF ",
      formatName: "EMOM ",
    });
    expect(sucio).toBe(claveDeDuplicado(base));
  });

  it("tiene la forma ruta|patron|formato|ids", () => {
    expect(claveDeDuplicado(base)).toBe("AF|KNEE DOMINANT|EMOM|1,2,3");
  });

  it("cambia si cambia la ruta, el formato o los ejercicios", () => {
    const k = claveDeDuplicado(base);
    expect(claveDeDuplicado({ ...base, route: "AM" })).not.toBe(k);
    expect(claveDeDuplicado({ ...base, formatName: "AMRAP" })).not.toBe(k);
    expect(claveDeDuplicado({ ...base, exerciseIds: [1, 2] })).not.toBe(k);
  });
});

describe("deduplicarMasReciente (D-09)", () => {
  it("tres apariciones de la misma clave: queda la mas reciente", () => {
    const items = [
      cand({ blockId: "w25", date: "2026-08-10" }),
      cand({ blockId: "w34", date: "2026-10-16" }),
      cand({ blockId: "w33", date: "2026-10-09" }),
    ];
    const out = deduplicarMasReciente(items);
    expect(out.map((i) => i.blockId)).toEqual(["w34"]);
  });

  it("misma fecha: gana NUCLEUS sobre ATHLOS", () => {
    const items = [
      cand({ blockId: "a", role: "ATHLOS", date: "2026-10-14" }),
      cand({ blockId: "n", role: "NUCLEUS", date: "2026-10-14" }),
    ];
    expect(deduplicarMasReciente(items).map((i) => i.blockId)).toEqual(["n"]);
  });

  it("misma fecha y mismo rol: gana el blockId menor", () => {
    const items = [
      cand({ blockId: "z-9", date: "2026-10-14" }),
      cand({ blockId: "a-1", date: "2026-10-14" }),
    ];
    expect(deduplicarMasReciente(items).map((i) => i.blockId)).toEqual(["a-1"]);
  });

  it("claves distintas se conservan todas, en el orden de entrada", () => {
    const items = [
      cand({ blockId: "x", dedupeKey: "k-x", date: "2026-10-01" }),
      cand({ blockId: "y", dedupeKey: "k-y", date: "2026-10-20" }),
      cand({ blockId: "z", dedupeKey: "k-z", date: "2026-10-10" }),
    ];
    expect(deduplicarMasReciente(items).map((i) => i.blockId)).toEqual([
      "x",
      "y",
      "z",
    ]);
  });

  it("los ganadores mantienen el orden de entrada de su clave", () => {
    const items = [
      cand({ blockId: "a-viejo", dedupeKey: "k-a", date: "2026-09-01" }),
      cand({ blockId: "b", dedupeKey: "k-b", date: "2026-10-01" }),
      cand({ blockId: "a-nuevo", dedupeKey: "k-a", date: "2026-10-15" }),
    ];
    const ids = deduplicarMasReciente(items).map((i) => i.blockId);
    expect(ids).toHaveLength(2);
    expect(ids).toContain("a-nuevo");
    expect(ids).toContain("b");
    expect(ids).not.toContain("a-viejo");
  });

  it("lista vacia devuelve lista vacia", () => {
    expect(deduplicarMasReciente([])).toEqual([]);
  });
});

describe("trabajadoHoy (D-04)", () => {
  it("2 zonas en comun: true", () => {
    expect(trabajadoHoy(["chest", "triceps", "abs"], ["chest", "abs"])).toBe(
      true,
    );
  });

  it("1 zona en comun: false", () => {
    expect(trabajadoHoy(["chest", "triceps"], ["chest", "abs"])).toBe(false);
  });

  it("sin sesion de hoy (null): false", () => {
    expect(trabajadoHoy(["chest", "triceps"], null)).toBe(false);
  });

  it("sesion de hoy sin zonas: false", () => {
    expect(trabajadoHoy(["chest", "triceps"], [])).toBe(false);
  });

  it("no cuenta dos veces una zona repetida", () => {
    expect(trabajadoHoy(["chest", "chest"], ["chest", "abs"])).toBe(false);
  });
});

describe("ordenarCanasta (D-04)", () => {
  const SIN_HOY = { grupo: null, todayZones: null } as const;

  it("sin grupo: mas reciente primero, desempate por rol", () => {
    const items = [
      cand({ blockId: "epikos", role: "EPIKOS", date: "2026-10-10" }),
      cand({ blockId: "athlos", role: "ATHLOS", date: "2026-10-14" }),
      cand({ blockId: "nucleus", role: "NUCLEUS", date: "2026-10-14" }),
    ];
    const out = ordenarCanasta(items, SIN_HOY);
    expect(out.map((i) => i.blockId)).toEqual(["nucleus", "athlos", "epikos"]);
  });

  it("sin grupo: a igual fecha y rol desempata por blockId", () => {
    const items = [
      cand({ blockId: "b-2" }),
      cand({ blockId: "b-1" }),
      cand({ blockId: "b-3" }),
    ];
    const out = ordenarCanasta(items, SIN_HOY);
    expect(out.map((i) => i.blockId)).toEqual(["b-1", "b-2", "b-3"]);
  });

  it("sin grupo: ROM_* cae por detras de EPIKOS en la misma fecha", () => {
    const items = [
      cand({ blockId: "rom", role: "ROM_LOWER" }),
      cand({ blockId: "epikos", role: "EPIKOS" }),
    ];
    const out = ordenarCanasta(items, SIN_HOY);
    expect(out.map((i) => i.blockId)).toEqual(["epikos", "rom"]);
  });

  it("con grupo: excluye los bloques que no lo tienen en groups", () => {
    const items = [
      cand({
        blockId: "con-pecho",
        groups: ["pecho"],
        groupHits: { ...HITS_EN_CERO, pecho: 1 },
      }),
      cand({
        blockId: "sin-pecho",
        groups: ["piernas"],
        groupHits: { ...HITS_EN_CERO, piernas: 2 },
      }),
    ];
    const out = ordenarCanasta(items, { grupo: "pecho", todayZones: null });
    expect(out.map((i) => i.blockId)).toEqual(["con-pecho"]);
  });

  it("con grupo: mas ejercicios del grupo primero, aunque sean mas viejos", () => {
    const items = [
      cand({
        blockId: "uno",
        date: "2026-10-16",
        groups: ["pecho"],
        groupHits: { ...HITS_EN_CERO, pecho: 1 },
      }),
      cand({
        blockId: "tres",
        date: "2026-09-01",
        groups: ["pecho"],
        groupHits: { ...HITS_EN_CERO, pecho: 3 },
      }),
    ];
    const out = ordenarCanasta(items, { grupo: "pecho", todayZones: null });
    expect(out.map((i) => i.blockId)).toEqual(["tres", "uno"]);
  });

  it("con grupo: empate de hits resuelve por recencia", () => {
    const items = [
      cand({
        blockId: "viejo",
        date: "2026-09-01",
        groups: ["pecho"],
        groupHits: { ...HITS_EN_CERO, pecho: 2 },
      }),
      cand({
        blockId: "nuevo",
        date: "2026-10-10",
        groups: ["pecho"],
        groupHits: { ...HITS_EN_CERO, pecho: 2 },
      }),
    ];
    const out = ordenarCanasta(items, { grupo: "pecho", todayZones: null });
    expect(out.map((i) => i.blockId)).toEqual(["nuevo", "viejo"]);
  });

  it("2 zonas en comun con hoy: va al final y queda workedToday", () => {
    const items = [
      cand({ blockId: "hoy", date: "2026-10-16", zones: ["chest", "abs"] }),
      cand({ blockId: "otro", date: "2026-10-01", zones: ["gluteal"] }),
    ];
    const out = ordenarCanasta(items, {
      grupo: null,
      todayZones: ["chest", "abs", "triceps"],
    });
    expect(out.map((i) => i.blockId)).toEqual(["otro", "hoy"]);
    expect(out.map((i) => i.workedToday)).toEqual([false, true]);
  });

  it("1 zona en comun con hoy: no se marca", () => {
    const items = [
      cand({ blockId: "a", date: "2026-10-16", zones: ["chest", "gluteal"] }),
      cand({ blockId: "b", date: "2026-10-01", zones: ["calves"] }),
    ];
    const out = ordenarCanasta(items, {
      grupo: null,
      todayZones: ["chest", "abs"],
    });
    expect(out.map((i) => i.blockId)).toEqual(["a", "b"]);
    expect(out.every((i) => !i.workedToday)).toBe(true);
  });

  it("todayZones null: nadie marcado y el orden queda intacto", () => {
    const items = [
      cand({ blockId: "a", date: "2026-10-16", zones: ["chest", "abs"] }),
      cand({ blockId: "b", date: "2026-10-01", zones: ["chest", "abs"] }),
    ];
    const out = ordenarCanasta(items, SIN_HOY);
    expect(out.map((i) => i.blockId)).toEqual(["a", "b"]);
    expect(out.every((i) => i.workedToday === false)).toBe(true);
  });

  it("la particion es estable: los trabajados hoy conservan su orden relativo", () => {
    const hoy = ["chest", "abs"];
    const items = [
      cand({ blockId: "h1", date: "2026-10-16", zones: ["chest", "abs"] }),
      cand({ blockId: "n1", date: "2026-10-15", zones: ["calves"] }),
      cand({ blockId: "h2", date: "2026-10-14", zones: ["chest", "abs"] }),
      cand({ blockId: "n2", date: "2026-10-13", zones: ["gluteal"] }),
    ];
    const out = ordenarCanasta(items, { grupo: null, todayZones: hoy });
    expect(out.map((i) => i.blockId)).toEqual(["n1", "n2", "h1", "h2"]);
  });

  it("con grupo y hoy a la vez: filtra, ordena y manda al final los trabajados", () => {
    const items = [
      cand({
        blockId: "mejor-pero-hoy",
        zones: ["chest", "triceps"],
        groups: ["pecho"],
        groupHits: { ...HITS_EN_CERO, pecho: 4 },
      }),
      cand({
        blockId: "peor",
        zones: ["chest"],
        groups: ["pecho"],
        groupHits: { ...HITS_EN_CERO, pecho: 1 },
      }),
      cand({
        blockId: "ajeno",
        zones: ["calves"],
        groups: ["piernas"],
        groupHits: { ...HITS_EN_CERO, piernas: 2 },
      }),
    ];
    const out = ordenarCanasta(items, {
      grupo: "pecho",
      todayZones: ["chest", "triceps"],
    });
    expect(out.map((i) => i.blockId)).toEqual(["peor", "mejor-pero-hoy"]);
    expect(out.map((i) => i.workedToday)).toEqual([false, true]);
  });

  it("no muta la lista de entrada", () => {
    const items = [
      cand({ blockId: "b", date: "2026-10-01" }),
      cand({ blockId: "a", date: "2026-10-16" }),
    ];
    ordenarCanasta(items, SIN_HOY);
    expect(items.map((i) => i.blockId)).toEqual(["b", "a"]);
  });
});

describe("paginar", () => {
  const veintitres = Array.from({ length: 23 }, (_, i) => i + 1);

  it("pagina 1 de 23 con limit 20: 20 items", () => {
    const out = paginar(veintitres, 1, 20);
    expect(out.items).toHaveLength(20);
    expect(out.items[0]).toBe(1);
    expect(out.total).toBe(23);
    expect(out.page).toBe(1);
    expect(out.limit).toBe(20);
  });

  it("pagina 2: los 3 restantes", () => {
    const out = paginar(veintitres, 2, 20);
    expect(out.items).toEqual([21, 22, 23]);
    expect(out.total).toBe(23);
  });

  it("pagina fuera de rango: vacia con el total real", () => {
    const out = paginar(veintitres, 3, 20);
    expect(out.items).toEqual([]);
    expect(out.total).toBe(23);
    expect(out.page).toBe(3);
  });

  it("lista vacia: pagina 1 vacia con total 0", () => {
    const out = paginar([], 1, 20);
    expect(out.items).toEqual([]);
    expect(out.total).toBe(0);
  });
});

describe("subtituloDeBloque", () => {
  it("une los primeros 3 nombres limpios con coma", () => {
    expect(
      subtituloDeBloque([" Remo  con barra", "Dominadas", "Face pull", "Curl"]),
    ).toBe("Remo con barra, Dominadas, Face pull");
  });

  it("respeta un max distinto", () => {
    expect(subtituloDeBloque(["A", "B", "C"], 2)).toBe("A, B");
  });

  it("sin nombres devuelve cadena vacia", () => {
    expect(subtituloDeBloque([])).toBe("");
  });
});

describe("weekDayToDate", () => {
  it("lunes de la semana 1 es el ancla", () => {
    expect(weekDayToDate(1, "lunes")).toBe("2026-02-23");
  });

  it("semana 34, viernes", () => {
    expect(weekDayToDate(34, "viernes")).toBe("2026-10-16");
  });

  it("domingo no es dia de entrenamiento: null", () => {
    expect(weekDayToDate(5, "domingo")).toBeNull();
  });

  it("acepta miercoles y sabado con tilde", () => {
    expect(weekDayToDate(1, "miércoles")).toBe("2026-02-25");
    expect(weekDayToDate(1, "sábado")).toBe("2026-02-28");
    expect(weekDayToDate(1, "miercoles")).toBe("2026-02-25");
    expect(weekDayToDate(1, "sabado")).toBe("2026-02-28");
  });

  it("dia desconocido: null", () => {
    expect(weekDayToDate(1, "funday")).toBeNull();
  });

  it.each([1, 20, 52])(
    "ida y vuelta con dateToWeekNumber/dateToDayName en la semana %i",
    (week) => {
      for (const dia of [
        "lunes",
        "martes",
        "miercoles",
        "jueves",
        "viernes",
        "sabado",
      ]) {
        const fecha = weekDayToDate(week, dia);
        expect(fecha).not.toBeNull();
        expect(dateToWeekNumber(fecha as string)).toBe(week);
        expect(dateToDayName(fecha as string)).toBe(dia);
      }
    },
  );
});
