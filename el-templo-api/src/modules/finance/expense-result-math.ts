// Módulo: finance — fase 211 (Resultado por sede y consolidado)
//
// Cuentas PURAS del Resultado (sin DB ni Fastify, test en
// `test/unit/expense-result-math.test.ts`).
//
//   - DI-05 (base mixta): los cobros van por fecha de pago dentro del mes y el
//     costo por mes de imputación (estimados incluidos). `monthDateRange` da el
//     rango de fechas de los cobros.
//   - DI-06 (columnas): las sedes de `computeMonth`, más toda sede del país con
//     cobros que no estaba en esa lista, Casa Matriz (solo AR) y el Consolidado
//     al final.
//   - DI-07 (cuentas): todo en enteros (D-23): result = income − cost. El ÚNICO
//     número no entero es `marginPct` (un decimal, solo presentación).
//     Consolidado = Σ sedes − Casa Matriz una sola vez.
import type {
  ExpenseResultColumn,
  ExpenseResultCostCenter,
  ExpenseResultForeignIncome,
} from "./expense-types";
import { addDays, shiftMonth } from "../shared/date-utils";

export const RESULT_CONSOLIDATED_KEY = "consolidado";
export const RESULT_CONSOLIDATED_LABEL = "Consolidado";

const CASA_MATRIZ_KEY = "casa_matriz";
const CASA_MATRIZ_LABEL = "Casa Matriz";

/** Rango inclusivo de fechas de un mes `AAAA-MM` (el service valida el mes). */
export function monthDateRange(month: string): { dateFrom: string; dateTo: string } {
  return {
    dateFrom: `${month}-01`,
    dateTo: addDays(`${shiftMonth(month, 1)}-01`, -1),
  };
}

/**
 * Margen en % con un decimal, o null si no hay cobros (sin base de cálculo).
 * `Math.round` redondea las mitades hacia arriba (−0,05 % queda 0). Se divide
 * una sola vez y se normaliza el −0.
 */
export function marginPctOf(result: number, income: number): number | null {
  if (income === 0) return null;
  const pct = Math.round((result * 1000) / income) / 10;
  return pct === 0 ? 0 : pct;
}

type IncomeCell = { amount: number; count: number };

/**
 * Separa los cobros por sede en la moneda del país (suman) y en otra moneda
 * (aviso, DI-04). Las sedes que no están en `countryBranches` son de otro país
 * y se descartan (DI-03).
 */
export function partitionIncome(
  raw: ReadonlyMap<number, ReadonlyMap<string, IncomeCell>>,
  countryBranches: ReadonlyMap<number, { name: string }>,
  currency: string,
): { incomeByBranch: Map<number, number>; foreignIncome: ExpenseResultForeignIncome[] } {
  const incomeByBranch = new Map<number, number>();
  const foreignIncome: ExpenseResultForeignIncome[] = [];
  for (const [branchId, byCurrency] of raw) {
    const branch = countryBranches.get(branchId);
    if (!branch) continue;
    for (const [cur, cell] of byCurrency) {
      if (cur === currency) {
        incomeByBranch.set(branchId, (incomeByBranch.get(branchId) ?? 0) + cell.amount);
      } else if (cell.amount !== 0) {
        foreignIncome.push({
          branchId,
          branchName: branch.name,
          currency: cur,
          count: cell.count,
          amount: cell.amount,
        });
      }
    }
  }
  foreignIncome.sort(
    (a, b) =>
      a.branchName.localeCompare(b.branchName, "es") ||
      a.branchId - b.branchId ||
      a.currency.localeCompare(b.currency),
  );
  return { incomeByBranch, foreignIncome };
}

export interface ResultMatrixInput {
  destinations: ReadonlyArray<{
    key: string;
    branchId: number | null;
    name: string;
    isActive: boolean;
  }>;
  records: ReadonlyArray<{
    costCenterId: number;
    costCenterName: string;
    shares: ReadonlyMap<string, { cost: number; costEstimated: number }>;
  }>;
  incomeByBranch: ReadonlyMap<number, number>;
  countryBranches: ReadonlyMap<number, { name: string; isActive: boolean; isVirtual: boolean }>;
}

/** Arma las columnas del Resultado y los rubros con costo (DI-06, DI-07). */
export function buildResultMatrix(input: ResultMatrixInput): {
  columns: ExpenseResultColumn[];
  costCenters: ExpenseResultCostCenter[];
} {
  const { destinations, records, incomeByBranch, countryBranches } = input;

  // Rubros con costo distinto de 0 en alguna clave, por nombre y luego id.
  const centerMap = new Map<number, string>();
  for (const rec of records) {
    for (const share of rec.shares.values()) {
      if (share.cost !== 0) {
        centerMap.set(rec.costCenterId, rec.costCenterName);
        break;
      }
    }
  }
  const costCenters: ExpenseResultCostCenter[] = [...centerMap.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, "es") || a.id - b.id);

  // Definición de las columnas previas al Consolidado.
  interface Def {
    key: string;
    kind: "branch" | "casa_matriz";
    branchId: number | null;
    name: string;
    isActive: boolean;
    isVirtual: boolean;
    income: number;
  }
  const defs: Def[] = [];
  let casaMatriz: Def | null = null;
  const knownBranchIds = new Set<number>();
  for (const dest of destinations) {
    if (dest.key === CASA_MATRIZ_KEY) {
      casaMatriz = {
        key: CASA_MATRIZ_KEY,
        kind: "casa_matriz",
        branchId: null,
        name: dest.name || CASA_MATRIZ_LABEL,
        isActive: dest.isActive,
        isVirtual: false,
        income: 0,
      };
      continue;
    }
    if (dest.branchId !== null) knownBranchIds.add(dest.branchId);
    defs.push({
      key: dest.key,
      kind: "branch",
      branchId: dest.branchId,
      name: dest.name,
      isActive: dest.isActive,
      isVirtual: dest.branchId !== null ? (countryBranches.get(dest.branchId)?.isVirtual ?? false) : false,
      income: dest.branchId !== null ? (incomeByBranch.get(dest.branchId) ?? 0) : 0,
    });
  }
  // Sedes del país con cobros que no estaban entre los destinos.
  const extras: Def[] = [];
  for (const [branchId, income] of incomeByBranch) {
    if (income === 0 || knownBranchIds.has(branchId)) continue;
    const info = countryBranches.get(branchId);
    if (!info) continue;
    extras.push({
      key: String(branchId),
      kind: "branch",
      branchId,
      name: info.name,
      isActive: info.isActive,
      isVirtual: info.isVirtual,
      income,
    });
  }
  extras.sort((a, b) => a.name.localeCompare(b.name, "es") || (a.branchId ?? 0) - (b.branchId ?? 0));
  const orderedDefs: Def[] = [...defs, ...extras, ...(casaMatriz ? [casaMatriz] : [])];

  // Un costo en una clave sin columna es un dato inconsistente: se ve, no se oculta.
  const columnKeys = new Set(orderedDefs.map((d) => d.key));
  for (const rec of records) {
    for (const [key, share] of rec.shares) {
      if (share.cost !== 0 && !columnKeys.has(key)) {
        throw new Error(`El reparto del rubro ${rec.costCenterName} tiene costo en un destino sin columna: ${key}`);
      }
    }
  }

  const emptyCosts = (): Record<string, number> => {
    const out: Record<string, number> = {};
    for (const cc of costCenters) out[String(cc.id)] = 0;
    return out;
  };

  const columns: ExpenseResultColumn[] = orderedDefs.map((def) => {
    const costsByCostCenter = emptyCosts();
    let cost = 0;
    let costEstimated = 0;
    for (const rec of records) {
      const share = rec.shares.get(def.key);
      if (!share) continue;
      cost += share.cost;
      costEstimated += share.costEstimated;
      if (share.cost !== 0) costsByCostCenter[String(rec.costCenterId)] += share.cost;
    }
    const result = def.income - cost;
    return {
      key: def.key,
      kind: def.kind,
      branchId: def.branchId,
      name: def.name,
      isActive: def.isActive,
      isVirtual: def.isVirtual,
      income: def.income,
      costsByCostCenter,
      cost,
      costEstimated,
      result,
      marginPct: def.kind === "casa_matriz" ? null : marginPctOf(result, def.income),
    };
  });

  // Consolidado: Σ sedes (cobros) y Σ sedes + Casa Matriz (costos), una sola vez.
  const consolidatedCosts = emptyCosts();
  let income = 0;
  let cost = 0;
  let costEstimated = 0;
  for (const col of columns) {
    income += col.income;
    cost += col.cost;
    costEstimated += col.costEstimated;
    for (const [id, value] of Object.entries(col.costsByCostCenter)) consolidatedCosts[id] += value;
  }
  const result = income - cost;
  columns.push({
    key: RESULT_CONSOLIDATED_KEY,
    kind: "consolidado",
    branchId: null,
    name: RESULT_CONSOLIDATED_LABEL,
    isActive: true,
    isVirtual: false,
    income,
    costsByCostCenter: consolidatedCosts,
    cost,
    costEstimated,
    result,
    marginPct: marginPctOf(result, income),
  });

  return { columns, costCenters };
}
