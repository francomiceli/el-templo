/**
 * Fase 211 Plan 01: cuentas puras del Resultado por sede (sin DB).
 *
 * Los resultados esperados están escritos a mano, nunca recalculados con la
 * función bajo prueba.
 */
import { describe, it, expect } from "vitest";
import {
  buildResultMatrix,
  marginPctOf,
  monthDateRange,
  partitionIncome,
  RESULT_CONSOLIDATED_KEY,
} from "../../src/modules/finance/expense-result-math";

type Share = { cost: number; costEstimated: number };
const share = (cost: number, costEstimated = 0): Share => ({ cost, costEstimated });

const countryBranches = new Map([
  [1, { name: "Sede A", isActive: true, isVirtual: false }],
  [2, { name: "Sede B", isActive: true, isVirtual: false }],
  [3, { name: "Online", isActive: true, isVirtual: true }],
  [4, { name: "Cerrada", isActive: false, isVirtual: false }],
]);

const destinations = [
  { key: "1", branchId: 1, name: "Sede A", isActive: true },
  { key: "2", branchId: 2, name: "Sede B", isActive: true },
  { key: "casa_matriz", branchId: null, name: "Casa Matriz", isActive: true },
];

const records = [
  {
    costCenterId: 10,
    costCenterName: "Alquiler",
    shares: new Map([["1", share(40000)]]),
  },
  {
    costCenterId: 20,
    costCenterName: "Sueldos",
    shares: new Map([
      ["casa_matriz", share(25000, 25000)],
      ["2", share(10000)],
    ]),
  },
  {
    costCenterId: 30,
    costCenterName: "Software",
    shares: new Map([
      ["1", share(4500)],
      ["2", share(4500)],
    ]),
  },
  { costCenterId: 40, costCenterName: "Viejo", shares: new Map([["1", share(0)]]) },
];

const incomeByBranch = new Map([
  [1, 75000],
  [2, 30000],
  [3, 3000],
]);

function build() {
  return buildResultMatrix({ destinations, records, incomeByBranch, countryBranches });
}
const col = (cols: ReturnType<typeof build>["columns"], key: string) => {
  const c = cols.find((x) => x.key === key);
  if (!c) throw new Error(`columna ${key} no encontrada`);
  return c;
};

describe("monthDateRange", () => {
  it.each<[string, string, string]>([
    ["2024-02", "2024-02-01", "2024-02-29"], // bisiesto
    ["2023-12", "2023-12-01", "2023-12-31"], // cruce de año
    ["2023-04", "2023-04-01", "2023-04-30"],
  ])("%s", (month, from, to) => {
    expect(monthDateRange(month)).toEqual({ dateFrom: from, dateTo: to });
  });
});

describe("marginPctOf", () => {
  it.each<[number, number, number | null]>([
    [12345, 100000, 12.3], // 12345·1000/100000 = 123,45 → 123
    [1, 3, 33.3],
    [2, 3, 66.7], // 666,67 → 667
    [-50000, 100000, -50],
    [5, 10000, 0.1], // 0,5 redondea para arriba
    [0, 0, null],
    [-6000, 0, null],
  ])("marginPctOf(%i, %i) = %s", (result, income, esperado) => {
    expect(marginPctOf(result, income)).toBe(esperado);
  });

  it("nunca devuelve -0", () => {
    const x = marginPctOf(-4, 10000); // -0,4 → -0
    expect(x).toBe(0);
    expect(Object.is(x, -0)).toBe(false);
  });
});

describe("partitionIncome", () => {
  it("suma la moneda del país, avisa de las otras y descarta sedes de otro país", () => {
    const raw = new Map([
      [
        1,
        new Map([
          ["ARS", { amount: 75000, count: 3 }],
          ["EUR", { amount: 100, count: 1 }],
        ]),
      ],
      [2, new Map([["ARS", { amount: 30000, count: 1 }]])],
      [3, new Map([["ARS", { amount: 3000, count: 1 }]])],
      [9, new Map([["EUR", { amount: 400, count: 1 }]])],
    ]);
    const cb = new Map([
      [1, { name: "Sede A" }],
      [2, { name: "Sede B" }],
      [3, { name: "Online" }],
    ]);
    const out = partitionIncome(raw, cb, "ARS");
    expect([...out.incomeByBranch.entries()]).toEqual([
      [1, 75000],
      [2, 30000],
      [3, 3000],
    ]);
    expect(out.foreignIncome).toEqual([
      { branchId: 1, branchName: "Sede A", currency: "EUR", count: 1, amount: 100 },
    ]);
  });
});

describe("buildResultMatrix (Argentina)", () => {
  it("ordena las columnas: sedes, Online, Casa Matriz y Consolidado al final", () => {
    expect(build().columns.map((c) => c.name)).toEqual([
      "Sede A",
      "Sede B",
      "Online",
      "Casa Matriz",
      "Consolidado",
    ]);
  });

  it("Sede A: cobros, costo por rubro, resultado y margen", () => {
    const a = col(build().columns, "1");
    expect(a.income).toBe(75000);
    expect(a.cost).toBe(44500); // 40000 + 4500
    expect(a.result).toBe(30500); // 75000 - 44500
    expect(a.marginPct).toBe(40.7); // 30500·1000/75000 = 406,67 → 407
    expect(a.costsByCostCenter).toEqual({ "10": 40000, "30": 4500, "20": 0 });
  });

  it("Sede B", () => {
    const b = col(build().columns, "2");
    expect(b.income).toBe(30000);
    expect(b.cost).toBe(14500); // 10000 + 4500
    expect(b.result).toBe(15500); // 30000 - 14500
    expect(b.marginPct).toBe(51.7); // 516,67 → 517
  });

  it("sede virtual con cobros y sin costo", () => {
    const o = col(build().columns, "3");
    expect(o.kind).toBe("branch");
    expect(o.isVirtual).toBe(true);
    expect(o.income).toBe(3000);
    expect(o.cost).toBe(0);
    expect(o.result).toBe(3000);
    expect(o.marginPct).toBe(100);
  });

  it("Casa Matriz: sin cobros, resultado negativo y margen null", () => {
    const cm = col(build().columns, "casa_matriz");
    expect(cm.kind).toBe("casa_matriz");
    expect(cm.income).toBe(0);
    expect(cm.cost).toBe(25000);
    expect(cm.costEstimated).toBe(25000);
    expect(cm.result).toBe(-25000);
    expect(cm.marginPct).toBeNull();
  });

  it("Consolidado = Σ sedes − Casa Matriz una sola vez", () => {
    const c = col(build().columns, RESULT_CONSOLIDATED_KEY);
    expect(c.kind).toBe("consolidado");
    expect(c.income).toBe(108000); // 75000 + 30000 + 3000
    expect(c.cost).toBe(84000); // 44500 + 14500 + 25000
    expect(c.costEstimated).toBe(25000);
    expect(c.result).toBe(24000); // 108000 - 84000
    expect(c.marginPct).toBe(22.2); // 24000·1000/108000 = 222,2 → 222
    expect(c.costsByCostCenter).toEqual({ "10": 40000, "30": 9000, "20": 35000 });
  });

  it("rubros: solo los de costo distinto de 0, por nombre; sin columna para sede sin cobros ni reparto", () => {
    const { columns, costCenters } = build();
    expect(costCenters.map((c) => c.name)).toEqual(["Alquiler", "Software", "Sueldos"]);
    expect(columns.some((c) => c.name === "Cerrada")).toBe(false);
  });

  it("identidades: Σ columnas = Consolidado, result = income − cost, rubro = Σ columnas", () => {
    const { columns, costCenters } = build();
    const cons = col(columns, RESULT_CONSOLIDATED_KEY);
    const rest = columns.filter((c) => c.kind !== "consolidado");
    expect(rest.reduce((s, c) => s + c.income, 0)).toBe(cons.income);
    expect(rest.reduce((s, c) => s + c.cost, 0)).toBe(cons.cost);
    for (const c of columns) expect(c.result).toBe(c.income - c.cost);
    for (const cc of costCenters) {
      const id = String(cc.id);
      expect(rest.reduce((s, c) => s + c.costsByCostCenter[id], 0)).toBe(cons.costsByCostCenter[id]);
    }
  });

  it("sede con reparto y sin cobros: resultado negativo y margen null", () => {
    const { columns } = buildResultMatrix({
      destinations: [{ key: "1", branchId: 1, name: "Sede A", isActive: true }],
      records: [{ costCenterId: 10, costCenterName: "Alquiler", shares: new Map([["1", share(6000)]]) }],
      incomeByBranch: new Map(),
      countryBranches,
    });
    const a = col(columns, "1");
    expect(a.income).toBe(0);
    expect(a.result).toBe(-6000);
    expect(a.marginPct).toBeNull();
  });

  it("sedes extra con cobros van después de las de computeMonth y antes de Casa Matriz, por nombre", () => {
    const cb = new Map([
      ...countryBranches,
      [7, { name: "Zeta", isActive: false, isVirtual: false }],
      [8, { name: "Alfa", isActive: true, isVirtual: true }],
    ]);
    const { columns } = buildResultMatrix({
      destinations,
      records: [],
      incomeByBranch: new Map([
        [7, 100],
        [8, 200],
      ]),
      countryBranches: cb,
    });
    expect(columns.map((c) => c.name)).toEqual([
      "Sede A",
      "Sede B",
      "Alfa",
      "Zeta",
      "Casa Matriz",
      "Consolidado",
    ]);
    expect(col(columns, "7").isActive).toBe(false);
    expect(col(columns, "8").isVirtual).toBe(true);
  });

  it("costo en una clave sin columna lanza error", () => {
    expect(() =>
      buildResultMatrix({
        destinations: [{ key: "1", branchId: 1, name: "Sede A", isActive: true }],
        records: [{ costCenterId: 10, costCenterName: "Alquiler", shares: new Map([["99", share(500)]]) }],
        incomeByBranch: new Map(),
        countryBranches,
      }),
    ).toThrow(/99/);
  });
});

describe("buildResultMatrix (España)", () => {
  it("sin Casa Matriz: solo la sede y el Consolidado", () => {
    const { columns } = buildResultMatrix({
      destinations: [{ key: "5", branchId: 5, name: "Sede E", isActive: true }],
      records: [{ costCenterId: 10, costCenterName: "Alquiler", shares: new Map([["5", share(300)]]) }],
      incomeByBranch: new Map([[5, 400]]),
      countryBranches: new Map([[5, { name: "Sede E", isActive: true, isVirtual: false }]]),
    });
    expect(columns.map((c) => c.key)).toEqual(["5", "consolidado"]);
    const e = col(columns, "5");
    expect(e.result).toBe(100); // 400 - 300
    expect(e.marginPct).toBe(25); // 100·1000/400 = 250
    expect(columns.some((c) => c.kind === "casa_matriz")).toBe(false);
  });
});
