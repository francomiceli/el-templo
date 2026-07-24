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
  INITIUM_SOURCE_ORDER,
  buildRoster,
  findBlock,
  findInitiumBlock,
  type RosterBlock,
  type RosterClassDay,
} from "../../src/modules/tv/roster";
import type { FormatParams } from "../../src/modules/admin/format-params";

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

  it("marca shared SOLO en INITIUM (es la unica lista sin niveles)", () => {
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
    expect(buildRoster(plain)[0].title).toBe(
      "PYROS · Tabata - 20s/10s x 8 rondas",
    );

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

    expect(buildRoster(day).map((b) => b.title)).toEqual([
      "DEUTEROS I · Complex",
      "DEUTEROS II · AMRAP - 10 min",
    ]);
  });
});
