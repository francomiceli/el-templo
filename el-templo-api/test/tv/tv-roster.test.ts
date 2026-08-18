/**
 * Roster canonico del TV de sucursal (fase 164, plan 05).
 *
 * Test unitario PURO: no toca MySQL ni levanta la app. Lo que fija es el
 * contrato que el kiosco ES2015 no puede testear por si mismo — que orden de
 * bloques ve el socio en la pared y de que nivel sale el INITIUM compartido.
 *
 * Es tambien la red del espejo con
 * `el-templo-admin/src/utils/pdf/session-data-transformer.ts`: si alguien
 * cambia el orden canonico de un lado y no del otro, el PDF y el TV muestran
 * bloques distintos para la misma clase.
 */
import { describe, it, expect } from "vitest";
import {
  REGULAR_ROLES,
  ROM_ROLES,
  TECNICA_ROLES,
  INITIUM_SOURCE_ORDER,
  buildRoster,
  findBlock,
  findInitiumBlock,
  visualGroupOf,
  type RosterBlock,
  type RosterClassDay,
} from "../../src/modules/tv/roster";
import type { FormatParams } from "../../src/modules/admin/format-params";
import type { TvClassMode } from "../../src/modules/tv/types";

const TABATA: FormatParams = {
  type: "tabata",
  workSeconds: 20,
  restSeconds: 10,
  rounds: 8,
};
const AMRAP: FormatParams = { type: "amrap", minutes: 10 };
const ROM: FormatParams = { type: "rom", rounds: 3, restSeconds: 30 };

function block(
  role: string,
  overrides: Partial<RosterBlock> = {},
): RosterBlock {
  return {
    role,
    formatName: "Standard",
    formatParams: AMRAP,
    customTitle: null,
    ...overrides,
  };
}

function regularDay(
  sessions: { memberLevel: string; blocks: RosterBlock[] }[],
): RosterClassDay {
  return { mode: "regular", sessions };
}

function romDay(
  sessions: { memberLevel: string; blocks: RosterBlock[] }[],
): RosterClassDay {
  return { mode: "rom", sessions };
}

function dayWithMode(
  mode: TvClassMode,
  sessions: { memberLevel: string; blocks: RosterBlock[] }[],
): RosterClassDay {
  return { mode, sessions };
}

describe("TV roster — orden canonico de bloques", () => {
  it("arma el roster de un dia habil en orden canonico por ROL, no por sortOrder de la DB", () => {
    // Los bloques llegan desordenados a proposito: el orden del roster lo fija
    // REGULAR_ROLES, nunca el orden en que la DB devolvio las filas.
    const day = regularDay([
      {
        memberLevel: "alfa",
        blocks: [
          block("EPIKOS"),
          block("INITIUM", { formatParams: TABATA }),
          block("DEUTEROS_2"),
          block("NUCLEUS"),
          block("DEUTEROS_1"),
        ],
      },
    ]);

    expect(buildRoster(day).map((b) => b.role)).toEqual([...REGULAR_ROLES]);
  });

  it("arma el roster de un sabado ROM con los roles de zona (D-23)", () => {
    const day = romDay([
      {
        memberLevel: "alfa",
        blocks: [
          block("ROM_UPPER", { formatParams: ROM }),
          block("INITIUM", { formatParams: TABATA }),
          block("ROM_CORE", { formatParams: ROM }),
          block("ROM_LOWER", { formatParams: ROM }),
        ],
      },
      { memberLevel: "delta", blocks: [block("ROM_LOWER")] },
    ]);

    const roster = buildRoster(day);
    expect(roster.map((b) => b.role)).toEqual([...ROM_ROLES]);
    // Etiquetas de zona, iguales a las que imprime el PDF.
    expect(roster.map((b) => b.title.split(" · ")[0])).toEqual([
      "PYROS",
      "TREN INFERIOR",
      "ZONA MEDIA",
      "TREN SUPERIOR",
    ]);
    // Un dia ROM nunca puede exponer los roles de un dia habil.
    expect(roster.some((b) => b.role === "NUCLEUS")).toBe(false);
  });

  it("omite los roles que no existen en ninguna sesion (el roster no tiene huecos)", () => {
    const day = regularDay([
      {
        memberLevel: "alfa",
        blocks: [block("INITIUM"), block("NUCLEUS"), block("EPIKOS")],
      },
    ]);

    const roster = buildRoster(day);
    expect(roster.map((b) => b.role)).toEqual(["INITIUM", "NUCLEUS", "EPIKOS"]);
    // Los dots "BLOQUE n / M" cuentan sobre el largo REAL.
    expect(roster).toHaveLength(3);
  });

  it("resuelve EPIKOS desde un bloque cuyo rol fisico es ATHLOS", () => {
    const day = regularDay([
      {
        memberLevel: "alfa",
        blocks: [block("NUCLEUS"), block("ATHLOS", { formatParams: TABATA })],
      },
    ]);

    const roster = buildRoster(day);
    // El rol del roster es el CANONICO (lo que se persiste en tv_class_state)...
    expect(roster.map((b) => b.role)).toEqual(["NUCLEUS", "EPIKOS"]);
    // ...pero la etiqueta visible conserva el nombre real del bloque.
    expect(roster[1].title.startsWith("ATHLOS · ")).toBe(true);

    // Y el lookup directo tambien lo encuentra (sin esto el ultimo bloque del
    // dia desaparece de la pantalla).
    const blocks = day.sessions[0].blocks;
    expect(findBlock(blocks, "EPIKOS")?.role).toBe("ATHLOS");
    expect(findBlock(blocks, "DEUTEROS_1")).toBeUndefined();
  });

  it("toma el INITIUM de alfa cuando varios niveles lo tienen (fuente determinista)", () => {
    const day = regularDay([
      // sigma primero a proposito: el orden de llegada no debe decidir nada.
      {
        memberLevel: "sigma",
        blocks: [block("INITIUM", { formatName: "Sigma" })],
      },
      {
        memberLevel: "delta",
        blocks: [block("INITIUM", { formatName: "Delta" })],
      },
      {
        memberLevel: "alfa",
        blocks: [block("INITIUM", { formatName: "Alfa" })],
      },
    ]);

    expect(INITIUM_SOURCE_ORDER[0]).toBe("alfa");
    const initium = findInitiumBlock(day.sessions);
    // Se prueba por identidad de objeto: es exactamente el bloque de alfa.
    expect(initium).toBe(day.sessions[2].blocks[0]);
    expect(initium?.formatName).toBe("Alfa");
  });

  it("cae a delta cuando alfa no tiene INITIUM", () => {
    const day = regularDay([
      { memberLevel: "sigma", blocks: [block("INITIUM")] },
      { memberLevel: "delta", blocks: [block("INITIUM")] },
      { memberLevel: "alfa", blocks: [block("NUCLEUS")] },
    ]);

    expect(findInitiumBlock(day.sessions)).toBe(day.sessions[1].blocks[0]);
  });

  it("marca shared en INITIUM (dia regular: es la unica lista sin niveles)", () => {
    const day = regularDay([
      {
        memberLevel: "alfa",
        blocks: [
          block("INITIUM"),
          block("NUCLEUS"),
          block("DEUTEROS_1"),
          block("DEUTEROS_2"),
          block("EPIKOS"),
        ],
      },
    ]);

    const roster = buildRoster(day);
    expect(roster.filter((b) => b.shared).map((b) => b.role)).toEqual([
      "INITIUM",
    ]);
  });

  it("titula INITIUM como PYROS · FORMATO y respeta el customTitle de la fase 100", () => {
    const plain = regularDay([
      {
        memberLevel: "alfa",
        blocks: [block("INITIUM", { formatParams: TABATA })],
      },
    ]);
    // La etiqueta = formatName + params compactos (espejo del PDF de planis). El
    // `block()` de este fixture no fija formatName, así que sale el default "Standard".
    expect(buildRoster(plain)[0].title).toBe('PYROS · Standard 20"/10"');

    const games = regularDay([
      {
        memberLevel: "alfa",
        blocks: [block("INITIUM", { customTitle: "LA MANCHA CONGELADA" })],
      },
    ]);
    expect(buildRoster(games)[0].title).toBe("LA MANCHA CONGELADA");
  });

  it("rotula DEUTEROS_1 / DEUTEROS_2 con numeracion romana y cae a formatName sin params", () => {
    const day = regularDay([
      {
        memberLevel: "alfa",
        blocks: [
          block("DEUTEROS_1", { formatParams: null, formatName: "Complex" }),
          block("DEUTEROS_2", { formatParams: AMRAP }),
        ],
      },
    ]);

    // DEUTEROS_1: sin params → solo formatName ("Complex"). DEUTEROS_2: formatName default
    // "Standard" + params AMRAP compactos ("10'"), igual notación que el PDF de planis.
    expect(buildRoster(day).map((b) => b.title)).toEqual([
      "DEUTEROS I · Complex",
      "DEUTEROS II · Standard 10'",
    ]);
  });
});

describe("TV roster — dias combos/tecnica (fase 160, SEM-15)", () => {
  it("arma el roster de un dia combos legacy (cierre STRETCHING) en orden canonico", () => {
    const day = dayWithMode("combos", [
      {
        memberLevel: "alfa",
        blocks: [
          block("STRETCHING"),
          block("INITIUM", { formatParams: TABATA }),
          block("COMBOS_II"),
          block("COMBOS_I"),
        ],
      },
    ]);

    expect(buildRoster(day).map((b) => b.role)).toEqual([
      "INITIUM",
      "COMBOS_I",
      "COMBOS_II",
      "STRETCHING",
    ]);
  });

  it("arma el roster de un dia combos con cierre full-body (ATHLOS/EPIKOS) y lo deja NO shared", () => {
    const day = dayWithMode("combos", [
      {
        memberLevel: "alfa",
        blocks: [
          block("EPIKOS"),
          block("INITIUM", { formatParams: TABATA }),
          block("COMBOS_II"),
          block("COMBOS_I"),
        ],
      },
    ]);

    const roster = buildRoster(day);
    expect(roster.map((b) => b.role)).toEqual([
      "INITIUM",
      "COMBOS_I",
      "COMBOS_II",
      "EPIKOS",
    ]);
    // El circuito FB es por nivel (dificultad distinta) — columna por nivel.
    expect(roster.filter((b) => b.shared).map((b) => b.role)).toEqual([
      "INITIUM",
    ]);
  });

  it("marca shared en STRETCHING ademas de INITIUM (dia tecnica: lista unica de cierre)", () => {
    const day = dayWithMode("tecnica", [
      {
        memberLevel: "alfa",
        blocks: [
          block("INITIUM"),
          block("TECNICA_I"),
          block("TECNICA_II"),
          block("STRETCHING"),
        ],
      },
    ]);

    expect(
      buildRoster(day)
        .filter((b) => b.shared)
        .map((b) => b.role),
    ).toEqual(["INITIUM", "STRETCHING"]);
  });

  it("rotula un dia combos con la convencion D160-02 (numerales romanos)", () => {
    const day = dayWithMode("combos", [
      {
        memberLevel: "alfa",
        blocks: [
          block("INITIUM"),
          block("COMBOS_I"),
          block("COMBOS_II"),
          block("STRETCHING"),
        ],
      },
    ]);

    const titles = buildRoster(day).map((b) => b.title);
    expect(titles[1].startsWith("COMBOS I ")).toBe(true);
    expect(titles[2].startsWith("COMBOS II ")).toBe(true);
    expect(titles[3].startsWith("KINESIS ")).toBe(true);
  });

  it("arma el roster de un dia tecnica con los 4 bloques y labels acentuadas", () => {
    const day = dayWithMode("tecnica", [
      {
        memberLevel: "alfa",
        blocks: [
          block("INITIUM"),
          block("TECNICA_I"),
          block("TECNICA_II"),
          block("STRETCHING"),
        ],
      },
    ]);

    const roster = buildRoster(day);
    expect(roster.map((b) => b.role)).toEqual([...TECNICA_ROLES]);
    expect(roster[1].title.startsWith("TÉCNICA I ")).toBe(true);
    expect(roster[2].title.startsWith("TÉCNICA II ")).toBe(true);
  });

  it("NO colapsa COMBOS_I/COMBOS_II ni TECNICA_I/TECNICA_II (a diferencia de DEUTEROS)", () => {
    expect(visualGroupOf("COMBOS_I")).toBe("COMBOS_I");
    expect(visualGroupOf("COMBOS_II")).toBe("COMBOS_II");
    expect(visualGroupOf("TECNICA_I")).toBe("TECNICA_I");
    expect(visualGroupOf("TECNICA_II")).toBe("TECNICA_II");
  });

  it("regresion: un dia regular y un dia rom siguen usando su roster propio sin cambios", () => {
    const regular = regularDay([
      {
        memberLevel: "alfa",
        blocks: [
          block("INITIUM"),
          block("NUCLEUS"),
          block("DEUTEROS_1"),
          block("DEUTEROS_2"),
          block("EPIKOS"),
        ],
      },
    ]);
    expect(buildRoster(regular).map((b) => b.role)).toEqual([...REGULAR_ROLES]);

    const rom = romDay([
      {
        memberLevel: "alfa",
        blocks: [
          block("INITIUM"),
          block("ROM_LOWER"),
          block("ROM_CORE"),
          block("ROM_UPPER"),
        ],
      },
    ]);
    expect(buildRoster(rom).map((b) => b.role)).toEqual([...ROM_ROLES]);
  });
});
