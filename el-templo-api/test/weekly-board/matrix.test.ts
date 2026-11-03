/**
 * Unit tests (sin DB) del armado de la matriz del Tablero (206-05).
 *
 * Todo con datos armados a mano: ids de sede arbitrarios, sin fechas ni reloj.
 * Cubre derivación por sede, Total por país (solo sedes físicas), columna
 * Online informativa, porcentajes recalculados desde conteos y semana anterior.
 */
import { describe, it, expect } from "vitest";
import {
  buildBoardMetrics,
  deriveMetricValues,
  sumBranchValues,
  type FrozenBlocks,
} from "../../src/modules/weekly-board/matrix";
import {
  BOARD_METRICS,
  type BoardGroup,
  type BoardMetric,
  type BoardMetricKey,
  type BranchWeekValues,
  type LateBlockValues,
  type MainBlockValues,
} from "../../src/modules/weekly-board/types";

// Ids de sede arbitrarios (no son ids de users).
const SEDE_A = 101;
const SEDE_B = 102;
const SEDE_ES = 201;
const SEDE_ONLINE = 301;

const LIVE: FrozenBlocks = { main: false, late: false };
const FROZEN: FrozenBlocks = { main: true, late: true };

function late(over: Partial<LateBlockValues> = {}): LateBlockValues {
  return {
    reservas: 0,
    reservasOcurridas: 0,
    asistieron: 0,
    compraron: 0,
    compraronOcurridas: 0,
    compraronAsistieron: 0,
    vencimientos: 0,
    renovaron: 0,
    noRenueva: 0,
    volvioTarde: 0,
    sinContactar: 0,
    ...over,
  };
}

function main(over: Partial<MainBlockValues> = {}): MainBlockValues {
  return {
    cobrado: 0,
    deudaCobrable: 0,
    deudaMas10: 0,
    deudaIncobrable: 0,
    activos: 0,
    vencenSemanaSiguiente: 0,
    ...over,
  };
}

function vals(
  over: {
    leads?: number | null;
    main?: Partial<MainBlockValues> | null;
    late?: Partial<LateBlockValues> | null;
  } = {},
): BranchWeekValues {
  return {
    leads: over.leads === undefined ? null : over.leads,
    main: over.main === null ? null : main(over.main),
    late: over.late === null ? null : late(over.late),
  };
}

function groupAR(
  opts: { hasTotal?: boolean; online?: boolean } = {},
): BoardGroup {
  return {
    country: "AR",
    currency: "ARS",
    branches: [
      { id: SEDE_A, name: "Sede A" },
      { id: SEDE_B, name: "Sede B" },
    ],
    hasTotal: opts.hasTotal ?? true,
    online:
      opts.online === false
        ? null
        : { branchIds: [SEDE_ONLINE], label: "Online" },
  };
}

function groupES(): BoardGroup {
  return {
    country: "ES",
    currency: "EUR",
    branches: [{ id: SEDE_ES, name: "Sede ES" }],
    hasTotal: true,
    online: null,
  };
}

const NO_FOTO = new Map<number, number | null>();

function build(opts: {
  groups: BoardGroup[];
  current: Array<[number, BranchWeekValues]>;
  previous?: Array<[number, BranchWeekValues]>;
  frozen?: { current: FrozenBlocks; previous: FrozenBlocks };
  fotoPrev?: Array<[number, number | null]>;
  fotoPrevPrev?: Array<[number, number | null]>;
}): BoardMetric[] {
  return buildBoardMetrics({
    groups: opts.groups,
    current: new Map(opts.current),
    previous: new Map(opts.previous ?? []),
    frozen: opts.frozen ?? { current: LIVE, previous: LIVE },
    activosFoto: {
      previousWeek: opts.fotoPrev ? new Map(opts.fotoPrev) : NO_FOTO,
      weekBeforePrevious: opts.fotoPrevPrev
        ? new Map(opts.fotoPrevPrev)
        : NO_FOTO,
    },
  });
}

function metric(metrics: BoardMetric[], key: BoardMetricKey): BoardMetric {
  const found = metrics.find((m) => m.key === key);
  if (!found) throw new Error(`Falta la métrica ${key}`);
  return found;
}

describe("BOARD_METRICS", () => {
  it("tiene las 21 filas de la planilla en orden y con su congelamiento", () => {
    expect(BOARD_METRICS.map((m) => m.key)).toEqual([
      "leads",
      "reservas",
      "asistieron",
      "compraron",
      "pctReserva",
      "pctAsistencia",
      "pctCierre",
      "pctConversion",
      "vencimientos",
      "renovaron",
      "noRenueva",
      "volvioTarde",
      "sinContactar",
      "pctRenovacion",
      "vencenSemanaSiguiente",
      "cobrado",
      "deudaCobrable",
      "deudaMas10",
      "deudaIncobrable",
      "activos",
      "variacionActivos",
    ]);
    const freeze = (k: BoardMetricKey) =>
      BOARD_METRICS.find((m) => m.key === k)?.freeze;
    expect(freeze("leads")).toBe("leads");
    expect(freeze("pctCierre")).toBe("late");
    expect(freeze("sinContactar")).toBe("late");
    expect(freeze("vencenSemanaSiguiente")).toBe("main");
    expect(freeze("cobrado")).toBe("main");
    expect(freeze("variacionActivos")).toBe("main");
  });

  it("marca la unidad: % como pct, plata como money, el resto count", () => {
    const unit = (k: BoardMetricKey) =>
      BOARD_METRICS.find((m) => m.key === k)?.unit;
    expect(unit("pctReserva")).toBe("pct");
    expect(unit("pctRenovacion")).toBe("pct");
    expect(unit("cobrado")).toBe("money");
    expect(unit("deudaIncobrable")).toBe("money");
    expect(unit("activos")).toBe("count");
    expect(unit("leads")).toBe("count");
  });
});

describe("deriveMetricValues", () => {
  it("calcula los porcentajes del embudo con las fórmulas de Sesiones de prueba", () => {
    const v = vals({
      leads: 10,
      late: {
        reservas: 4,
        reservasOcurridas: 4,
        asistieron: 3,
        compraron: 2,
        compraronOcurridas: 2,
        compraronAsistieron: 1,
      },
    });
    const d = deriveMetricValues(v, null);
    expect(d.pctReserva).toBe(40);
    expect(d.pctAsistencia).toBe(75);
    expect(d.pctCierre).toBeCloseTo(33.3333, 3);
    expect(d.pctConversion).toBe(50);
    expect(d.reservas).toBe(4);
    expect(d.asistieron).toBe(3);
    expect(d.compraron).toBe(2);
  });

  it("pctReserva es null sin leads (D-05)", () => {
    const d = deriveMetricValues(
      vals({ leads: null, late: { reservas: 4 } }),
      null,
    );
    expect(d.pctReserva).toBeNull();
    expect(d.leads).toBeNull();
  });

  it("pctReserva es null con leads 0, no 0 % ni infinito", () => {
    const d = deriveMetricValues(
      vals({ leads: 0, late: { reservas: 4 } }),
      null,
    );
    expect(d.pctReserva).toBeNull();
    expect(d.leads).toBe(0);
  });

  it("los porcentajes con denominador 0 son null, no 0", () => {
    const d = deriveMetricValues(vals({ leads: 5, late: {} }), null);
    expect(d.pctAsistencia).toBeNull();
    expect(d.pctCierre).toBeNull();
    expect(d.pctConversion).toBeNull();
    expect(d.pctRenovacion).toBeNull();
    // 0 reservas sobre 5 leads si es un 0 % real.
    expect(d.pctReserva).toBe(0);
  });

  it("pctRenovacion = renovaron / (renovaron + noRenueva + volvioTarde)", () => {
    const d = deriveMetricValues(
      vals({ late: { renovaron: 3, noRenueva: 1, volvioTarde: 0 } }),
      null,
    );
    expect(d.pctRenovacion).toBe(75);
    const con = deriveMetricValues(
      vals({ late: { renovaron: 1, noRenueva: 1, volvioTarde: 2 } }),
      null,
    );
    expect(con.pctRenovacion).toBe(25);
  });

  it("variacionActivos = activos - activos de la foto anterior", () => {
    expect(
      deriveMetricValues(vals({ main: { activos: 120 } }), 100)
        .variacionActivos,
    ).toBe(20);
    expect(
      deriveMetricValues(vals({ main: { activos: 90 } }), 100).variacionActivos,
    ).toBe(-10);
    expect(
      deriveMetricValues(vals({ main: { activos: 100 } }), 100)
        .variacionActivos,
    ).toBe(0);
  });

  it("variacionActivos es null sin foto anterior o con activos null (D-21)", () => {
    expect(
      deriveMetricValues(vals({ main: { activos: 120 } }), null)
        .variacionActivos,
    ).toBeNull();
    expect(
      deriveMetricValues(vals({ main: { activos: null } }), 100)
        .variacionActivos,
    ).toBeNull();
  });

  it("main null deja en null todo el bloque principal, no en 0", () => {
    const d = deriveMetricValues(
      vals({ main: null, late: { reservas: 2 } }),
      50,
    );
    expect(d.cobrado).toBeNull();
    expect(d.deudaCobrable).toBeNull();
    expect(d.deudaMas10).toBeNull();
    expect(d.deudaIncobrable).toBeNull();
    expect(d.activos).toBeNull();
    expect(d.vencenSemanaSiguiente).toBeNull();
    expect(d.variacionActivos).toBeNull();
    expect(d.reservas).toBe(2);
  });

  it("late null deja en null embudo y renovaciones, no en 0", () => {
    const d = deriveMetricValues(
      vals({ leads: 10, late: null, main: { cobrado: 500 } }),
      null,
    );
    const lateKeys: BoardMetricKey[] = [
      "reservas",
      "asistieron",
      "compraron",
      "pctReserva",
      "pctAsistencia",
      "pctCierre",
      "pctConversion",
      "vencimientos",
      "renovaron",
      "noRenueva",
      "volvioTarde",
      "sinContactar",
      "pctRenovacion",
    ];
    for (const key of lateKeys) expect(d[key]).toBeNull();
    expect(d.leads).toBe(10);
    expect(d.cobrado).toBe(500);
  });

  it("deuda y activos null (semana vieja sin foto) no anulan cobrado", () => {
    const d = deriveMetricValues(
      vals({
        main: {
          cobrado: 700,
          deudaCobrable: null,
          deudaMas10: null,
          deudaIncobrable: null,
          activos: null,
        },
      }),
      null,
    );
    expect(d.cobrado).toBe(700);
    expect(d.deudaCobrable).toBeNull();
    expect(d.activos).toBeNull();
  });
});

describe("sumBranchValues", () => {
  const opts = { leads: "require-all" as const, frozenBlocks: LIVE };

  it("lista vacía: todo null", () => {
    expect(sumBranchValues([], opts)).toEqual({
      leads: null,
      main: null,
      late: null,
    });
  });

  it("suma campo a campo los conteos", () => {
    const total = sumBranchValues(
      [
        vals({
          leads: 3,
          main: { cobrado: 100, activos: 10 },
          late: { reservas: 2 },
        }),
        vals({
          leads: 4,
          main: { cobrado: 50, activos: 5 },
          late: { reservas: 3 },
        }),
      ],
      opts,
    );
    expect(total.leads).toBe(7);
    expect(total.main?.cobrado).toBe(150);
    expect(total.main?.activos).toBe(15);
    expect(total.late?.reservas).toBe(5);
  });

  it("leads: none devuelve siempre null", () => {
    const total = sumBranchValues([vals({ leads: 3 }), vals({ leads: 4 })], {
      leads: "none",
      frozenBlocks: LIVE,
    });
    expect(total.leads).toBeNull();
  });

  it("leads: require-all es null si a una sede le faltan", () => {
    const total = sumBranchValues(
      [vals({ leads: 3 }), vals({ leads: null })],
      opts,
    );
    expect(total.leads).toBeNull();
  });

  it("un campo null de una sede deja ese campo del total en null", () => {
    const total = sumBranchValues(
      [
        vals({ main: { cobrado: 100, deudaCobrable: 10 } }),
        vals({ main: { cobrado: 50, deudaCobrable: null } }),
      ],
      opts,
    );
    expect(total.main?.cobrado).toBe(150);
    expect(total.main?.deudaCobrable).toBeNull();
  });

  it("bloque en vivo: una sede sin dato anula el total del bloque", () => {
    const total = sumBranchValues(
      [vals({ main: { cobrado: 100 } }), vals({ main: null })],
      opts,
    );
    expect(total.main).toBeNull();
    expect(total.late).not.toBeNull();
  });

  it("bloque congelado: una sede sin fila no aporta ni anula (sede nueva)", () => {
    const frozen = { leads: "require-all" as const, frozenBlocks: FROZEN };
    const total = sumBranchValues(
      [
        vals({ main: { cobrado: 100 }, late: { reservas: 2 } }),
        vals({ main: null, late: null }),
      ],
      frozen,
    );
    expect(total.main?.cobrado).toBe(100);
    expect(total.late?.reservas).toBe(2);
  });

  it("bloque congelado: si ninguna sede tiene foto, el total es null", () => {
    const frozen = { leads: "require-all" as const, frozenBlocks: FROZEN };
    const total = sumBranchValues(
      [vals({ main: null, late: null }), vals({ main: null, late: null })],
      frozen,
    );
    expect(total.main).toBeNull();
    expect(total.late).toBeNull();
  });

  it("cada bloque decide por separado si está congelado", () => {
    const total = sumBranchValues(
      [
        vals({ main: { cobrado: 10 }, late: { reservas: 1 } }),
        vals({ main: null, late: null }),
      ],
      { leads: "require-all", frozenBlocks: { main: true, late: false } },
    );
    expect(total.main?.cobrado).toBe(10);
    expect(total.late).toBeNull();
  });
});

describe("buildBoardMetrics", () => {
  it("devuelve las 21 filas en el orden de BOARD_METRICS", () => {
    const metrics = build({ groups: [groupAR()], current: [] });
    expect(metrics.map((m) => m.key)).toEqual(BOARD_METRICS.map((m) => m.key));
    expect(metrics.map((m) => m.block)).toEqual(
      BOARD_METRICS.map((m) => m.block),
    );
    expect(metrics.map((m) => m.unit)).toEqual(
      BOARD_METRICS.map((m) => m.unit),
    );
  });

  it("el % del Total sale de los conteos sumados (25 y no 50), no del promedio", () => {
    const metrics = build({
      groups: [groupAR({ online: false })],
      current: [
        [SEDE_A, vals({ late: { reservasOcurridas: 1, asistieron: 1 } })],
        [SEDE_B, vals({ late: { reservasOcurridas: 3, asistieron: 0 } })],
      ],
    });
    const asistencia = metric(metrics, "pctAsistencia");
    expect(asistencia.byBranch[String(SEDE_A)].value).toBe(100);
    expect(asistencia.byBranch[String(SEDE_B)].value).toBe(0);
    // (1 + 0) / (1 + 3) = 25. Promediar 100 y 0 daría 50.
    expect(asistencia.totalByCountry.AR.value).toBe(25);
  });

  it("el pctRenovacion del Total sale de los conteos sumados", () => {
    const metrics = build({
      groups: [groupAR({ online: false })],
      current: [
        [SEDE_A, vals({ late: { renovaron: 1, noRenueva: 0 } })],
        [SEDE_B, vals({ late: { renovaron: 1, noRenueva: 3 } })],
      ],
    });
    const renov = metric(metrics, "pctRenovacion");
    expect(renov.byBranch[String(SEDE_A)].value).toBe(100);
    expect(renov.byBranch[String(SEDE_B)].value).toBe(25);
    // 2 / 5 = 40. Promediar 100 y 25 daría 62,5.
    expect(renov.totalByCountry.AR.value).toBe(40);
  });

  it("el Total suma solo las sedes físicas del grupo: ES y Online no entran al Total AR", () => {
    const metrics = build({
      groups: [groupAR(), groupES()],
      current: [
        [SEDE_A, vals({ main: { cobrado: 1000 } })],
        [SEDE_B, vals({ main: { cobrado: 500 } })],
        [SEDE_ES, vals({ main: { cobrado: 80 } })],
        [SEDE_ONLINE, vals({ main: { cobrado: 300 } })],
      ],
    });
    const cobrado = metric(metrics, "cobrado");
    expect(cobrado.totalByCountry.AR.value).toBe(1500);
    expect(cobrado.totalByCountry.ES.value).toBe(80);
    expect(cobrado.onlineByCountry.AR.value).toBe(300);
    expect(cobrado.onlineByCountry.ES).toBeUndefined();
  });

  it("las columnas por sede solo tienen las sedes físicas de los grupos", () => {
    const metrics = build({
      groups: [groupAR(), groupES()],
      current: [[SEDE_ONLINE, vals({ main: { cobrado: 300 } })]],
    });
    const keys = Object.keys(metric(metrics, "cobrado").byBranch).sort();
    expect(keys).toEqual([SEDE_A, SEDE_B, SEDE_ES].map(String).sort());
  });

  it("el Total de leads es la suma si están todas las sedes físicas, null si falta alguna", () => {
    const completo = build({
      groups: [groupAR({ online: false })],
      current: [
        [SEDE_A, vals({ leads: 10 })],
        [SEDE_B, vals({ leads: 5 })],
      ],
    });
    expect(metric(completo, "leads").totalByCountry.AR.value).toBe(15);

    const incompleto = build({
      groups: [groupAR({ online: false })],
      current: [
        [SEDE_A, vals({ leads: 10 })],
        [SEDE_B, vals({ leads: null })],
      ],
    });
    expect(metric(incompleto, "leads").totalByCountry.AR.value).toBeNull();
    // Y el % Reserva del Total queda en "—" también.
    expect(metric(incompleto, "pctReserva").totalByCountry.AR.value).toBeNull();
  });

  it("pctReserva del Total = reservas sumadas / leads sumados", () => {
    const metrics = build({
      groups: [groupAR({ online: false })],
      current: [
        [SEDE_A, vals({ leads: 10, late: { reservas: 2 } })],
        [SEDE_B, vals({ leads: 10, late: { reservas: 4 } })],
      ],
    });
    expect(metric(metrics, "pctReserva").totalByCountry.AR.value).toBe(30);
  });

  it("si una sede tiene main null (bloque en vivo), cobrado del Total es null", () => {
    const metrics = build({
      groups: [groupAR({ online: false })],
      current: [
        [SEDE_A, vals({ main: { cobrado: 1000 } })],
        [SEDE_B, vals({ main: null })],
      ],
    });
    const cobrado = metric(metrics, "cobrado");
    expect(cobrado.byBranch[String(SEDE_A)].value).toBe(1000);
    expect(cobrado.byBranch[String(SEDE_B)].value).toBeNull();
    expect(cobrado.totalByCountry.AR.value).toBeNull();
  });

  it("una sede sin entrada en el mapa cuenta como sin dato (null, no 0)", () => {
    const metrics = build({
      groups: [groupAR({ online: false })],
      current: [
        [SEDE_A, vals({ main: { cobrado: 10 }, late: { reservas: 1 } })],
      ],
    });
    expect(
      metric(metrics, "cobrado").byBranch[String(SEDE_B)].value,
    ).toBeNull();
    expect(
      metric(metrics, "reservas").byBranch[String(SEDE_B)].value,
    ).toBeNull();
  });

  it("semana congelada: una sede nueva sin fila en la foto no anula el Total", () => {
    const metrics = build({
      groups: [groupAR({ online: false })],
      current: [
        [SEDE_A, vals({ main: { cobrado: 1000 }, late: { reservas: 3 } })],
        // SEDE_B se dio de alta después del cierre: no hay fila en la foto.
      ],
      frozen: { current: FROZEN, previous: FROZEN },
    });
    const cobrado = metric(metrics, "cobrado");
    expect(cobrado.byBranch[String(SEDE_B)].value).toBeNull();
    expect(cobrado.totalByCountry.AR.value).toBe(1000);
    expect(metric(metrics, "reservas").totalByCountry.AR.value).toBe(3);
  });

  it("semana en vivo: la misma sede sin datos sí anula el Total", () => {
    const metrics = build({
      groups: [groupAR({ online: false })],
      current: [[SEDE_A, vals({ main: { cobrado: 1000 } })]],
      frozen: { current: LIVE, previous: LIVE },
    });
    expect(metric(metrics, "cobrado").totalByCountry.AR.value).toBeNull();
  });

  it("Online suma las sedes virtuales; leads y pctReserva de Online son siempre null", () => {
    const metrics = build({
      groups: [groupAR()],
      current: [
        [SEDE_A, vals({ leads: 10, late: { reservas: 5 } })],
        [SEDE_B, vals({ leads: 10, late: { reservas: 5 } })],
        [
          SEDE_ONLINE,
          vals({ leads: 99, late: { reservas: 7 }, main: { cobrado: 40 } }),
        ],
      ],
    });
    expect(metric(metrics, "leads").onlineByCountry.AR.value).toBeNull();
    expect(metric(metrics, "pctReserva").onlineByCountry.AR.value).toBeNull();
    expect(metric(metrics, "reservas").onlineByCountry.AR.value).toBe(7);
    expect(metric(metrics, "cobrado").onlineByCountry.AR.value).toBe(40);
    // El Total AR no incluye lo de Online.
    expect(metric(metrics, "reservas").totalByCountry.AR.value).toBe(10);
  });

  it("Online suma varias sedes virtuales y recalcula sus porcentajes desde conteos", () => {
    const group = groupAR();
    group.online = { branchIds: [SEDE_ONLINE, 302], label: "Online" };
    const metrics = build({
      groups: [group],
      current: [
        [SEDE_ONLINE, vals({ late: { reservasOcurridas: 1, asistieron: 1 } })],
        [302, vals({ late: { reservasOcurridas: 3, asistieron: 0 } })],
      ],
    });
    expect(metric(metrics, "pctAsistencia").onlineByCountry.AR.value).toBe(25);
  });

  it("cada celda trae la semana anterior de la misma sede y del mismo Total", () => {
    const metrics = build({
      groups: [groupAR({ online: false })],
      current: [
        [SEDE_A, vals({ main: { cobrado: 300 } })],
        [SEDE_B, vals({ main: { cobrado: 200 } })],
      ],
      previous: [
        [SEDE_A, vals({ main: { cobrado: 250 } })],
        [SEDE_B, vals({ main: { cobrado: 100 } })],
      ],
    });
    const cobrado = metric(metrics, "cobrado");
    expect(cobrado.byBranch[String(SEDE_A)]).toEqual({
      value: 300,
      previous: 250,
    });
    expect(cobrado.byBranch[String(SEDE_B)]).toEqual({
      value: 200,
      previous: 100,
    });
    expect(cobrado.totalByCountry.AR).toEqual({ value: 500, previous: 350 });
  });

  it("previous es null si la semana anterior no tiene dato", () => {
    const metrics = build({
      groups: [groupAR({ online: false })],
      current: [
        [SEDE_A, vals({ main: { cobrado: 300 } })],
        [SEDE_B, vals({ main: { cobrado: 200 } })],
      ],
    });
    expect(
      metric(metrics, "cobrado").byBranch[String(SEDE_A)].previous,
    ).toBeNull();
  });

  it("la variación de activos usa la foto de W-1 para la semana y la de W-2 para la anterior", () => {
    const metrics = build({
      groups: [groupAR({ online: false })],
      current: [
        [SEDE_A, vals({ main: { activos: 120 } })],
        [SEDE_B, vals({ main: { activos: 50 } })],
      ],
      previous: [
        [SEDE_A, vals({ main: { activos: 110 } })],
        [SEDE_B, vals({ main: { activos: 60 } })],
      ],
      frozen: { current: LIVE, previous: FROZEN },
      fotoPrev: [
        [SEDE_A, 110],
        [SEDE_B, 60],
      ],
      fotoPrevPrev: [
        [SEDE_A, 100],
        [SEDE_B, 70],
      ],
    });
    const variacion = metric(metrics, "variacionActivos");
    expect(variacion.byBranch[String(SEDE_A)]).toEqual({
      value: 10,
      previous: 10,
    });
    expect(variacion.byBranch[String(SEDE_B)]).toEqual({
      value: -10,
      previous: -10,
    });
    expect(variacion.totalByCountry.AR).toEqual({ value: 0, previous: 0 });
  });

  it("sin foto de la semana anterior la variación es null, en sedes y en Total", () => {
    const metrics = build({
      groups: [groupAR({ online: false })],
      current: [
        [SEDE_A, vals({ main: { activos: 120 } })],
        [SEDE_B, vals({ main: { activos: 50 } })],
      ],
    });
    const variacion = metric(metrics, "variacionActivos");
    expect(variacion.byBranch[String(SEDE_A)].value).toBeNull();
    expect(variacion.totalByCountry.AR.value).toBeNull();
    expect(metric(metrics, "activos").totalByCountry.AR.value).toBe(170);
  });

  it("variación del Total: una sede dada de alta después de la foto aporta sus activos completos", () => {
    const metrics = build({
      groups: [groupAR({ online: false })],
      current: [
        [SEDE_A, vals({ main: { activos: 120 } })],
        [SEDE_B, vals({ main: { activos: 5 } })],
      ],
      fotoPrev: [[SEDE_A, 100]],
    });
    const variacion = metric(metrics, "variacionActivos");
    // SEDE_B no está en la foto: su variación propia es "—" pero entra al Total como alta nueva.
    expect(variacion.byBranch[String(SEDE_B)].value).toBeNull();
    expect(variacion.totalByCountry.AR.value).toBe(25);
  });

  it("hasTotal false (admin_sede): sin Total; online null: sin Online", () => {
    const metrics = build({
      groups: [groupAR({ hasTotal: false, online: false })],
      current: [[SEDE_A, vals({ main: { cobrado: 10 } })]],
    });
    for (const m of metrics) {
      expect(m.totalByCountry).toEqual({});
      expect(m.onlineByCountry).toEqual({});
    }
    expect(metric(metrics, "cobrado").byBranch[String(SEDE_A)].value).toBe(10);
  });

  it("cada grupo tiene su Total en su moneda sin mezclarse con el otro", () => {
    const metrics = build({
      groups: [groupAR({ online: false }), groupES()],
      current: [
        [SEDE_A, vals({ main: { cobrado: 1000, deudaCobrable: 10 } })],
        [SEDE_B, vals({ main: { cobrado: 500, deudaCobrable: 20 } })],
        [SEDE_ES, vals({ main: { cobrado: 80, deudaCobrable: 5 } })],
      ],
    });
    expect(metric(metrics, "cobrado").totalByCountry).toEqual({
      AR: { value: 1500, previous: null },
      ES: { value: 80, previous: null },
    });
    expect(metric(metrics, "deudaCobrable").totalByCountry.ES.value).toBe(5);
  });
});
