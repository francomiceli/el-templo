/**
 * Armado puro de la matriz del Tablero semanal (fase 206-05). Sin DB, sin reloj.
 *
 * Recibe los valores crudos por sede (de la foto o en vivo, lo decide el
 * servicio) y devuelve las filas de la planilla: celdas por sede, Total por
 * país y columna informativa Online, cada una con el valor de la semana y el de
 * la anterior (D-22).
 *
 * Reglas que viven acá:
 * - Los porcentajes NUNCA se promedian: el Total y Online suman conteos crudos
 *   y recalculan con las fórmulas únicas de los servicios de origen
 *   (`kpisFromTally` de Sesiones de prueba, `renewalRateFrom` de Renovaciones),
 *   D-26.
 * - "—" (null) es "sin dato", jamás 0 (D-05, D-11).
 * - El Total suma SOLO las sedes físicas del grupo; Online (sedes virtuales) es
 *   informativa y no entra al Total (D-16, D-25).
 */
import { kpisFromTally } from "../reports/service";
import { roundMoney } from "../shared/money";
import { renewalRateFrom } from "../renewals/service";
import {
  BOARD_METRICS,
  type BoardCell,
  type BoardGroup,
  type BoardMetric,
  type BoardMetricKey,
  type BranchWeekValues,
  type LateBlockValues,
  type MainBlockValues,
} from "./types";

/** Qué bloques de una semana están leídos de la foto (presencia de la foto, no de la fecha). */
export interface FrozenBlocks {
  main: boolean;
  late: boolean;
}

export type DerivedValues = Record<BoardMetricKey, number | null>;

/** Sede sin ningún dato: todos los bloques en null. */
const EMPTY_VALUES: BranchWeekValues = { leads: null, main: null, late: null };

/**
 * Valores de las 21 filas de la planilla para una sede (o para un total ya
 * sumado). Los conteos salen directos del bloque; los porcentajes se calculan
 * desde los conteos.
 *
 * @param activosFotoAnterior activos de la foto de la semana anterior (D-21), o
 *   null si no hay foto.
 */
export function deriveMetricValues(
  v: BranchWeekValues,
  activosFotoAnterior: number | null,
): DerivedValues {
  const { main, late, leads } = v;

  const kpis = late
    ? kpisFromTally({
        pendingThisShift: 0,
        reservations: late.reservas,
        occurred: late.reservasOcurridas,
        attended: late.asistieron,
        purchased: late.compraron,
        purchasedOccurred: late.compraronOcurridas,
        purchasedAttended: late.compraronAsistieron,
      })
    : null;

  // D-05: sin leads cargados (o leads 0) no hay % Reserva.
  const pctReserva =
    late && leads !== null && leads > 0 ? (late.reservas / leads) * 100 : null;

  const pctRenovacion = late
    ? renewalRateFrom({
        renovo: late.renovaron,
        noRenovo: late.noRenueva,
        volvioTarde: late.volvioTarde,
      })
    : null;

  const activos = main ? main.activos : null;
  // D-21: variación = activos de la semana - activos de la foto anterior.
  const variacionActivos =
    activos !== null && activosFotoAnterior !== null
      ? activos - activosFotoAnterior
      : null;

  return {
    leads,
    reservas: late ? late.reservas : null,
    asistieron: late ? late.asistieron : null,
    compraron: late ? late.compraron : null,
    pctReserva,
    pctAsistencia: kpis ? kpis.attendanceRate : null,
    pctCierre: kpis ? kpis.closeRate : null,
    pctConversion: kpis ? kpis.totalConversionRate : null,
    vencimientos: late ? late.vencimientos : null,
    renovaron: late ? late.renovaron : null,
    noRenueva: late ? late.noRenueva : null,
    volvioTarde: late ? late.volvioTarde : null,
    sinContactar: late ? late.sinContactar : null,
    pctRenovacion,
    vencenSemanaSiguiente: main ? main.vencenSemanaSiguiente : null,
    cobrado: main ? main.cobrado : null,
    deudaCobrable: main ? main.deudaCobrable : null,
    deudaMas10: main ? main.deudaMas10 : null,
    deudaIncobrable: main ? main.deudaIncobrable : null,
    activos,
    variacionActivos,
  };
}

/**
 * Suma; `null` apenas un valor es null ("sin dato" contagia al total).
 * Se usa para importes (cobrado/deuda, con centavos) y para conteos: el
 * `roundMoney` final corrige el error de coma flotante de los importes y deja
 * igual a los enteros.
 */
function sumNullable<T>(
  items: T[],
  pick: (item: T) => number | null,
): number | null {
  let total = 0;
  for (const item of items) {
    const value = pick(item);
    if (value === null) return null;
    total += value;
  }
  return roundMoney(total);
}

function sumLate(items: LateBlockValues[]): LateBlockValues {
  const add = (pick: (b: LateBlockValues) => number): number =>
    items.reduce((acc, b) => acc + pick(b), 0);
  return {
    reservas: add((b) => b.reservas),
    reservasOcurridas: add((b) => b.reservasOcurridas),
    asistieron: add((b) => b.asistieron),
    compraron: add((b) => b.compraron),
    compraronOcurridas: add((b) => b.compraronOcurridas),
    compraronAsistieron: add((b) => b.compraronAsistieron),
    vencimientos: add((b) => b.vencimientos),
    renovaron: add((b) => b.renovaron),
    noRenueva: add((b) => b.noRenueva),
    volvioTarde: add((b) => b.volvioTarde),
    sinContactar: add((b) => b.sinContactar),
  };
}

function sumMain(items: MainBlockValues[]): MainBlockValues {
  return {
    cobrado: sumNullable(items, (b) => b.cobrado),
    deudaCobrable: sumNullable(items, (b) => b.deudaCobrable),
    deudaMas10: sumNullable(items, (b) => b.deudaMas10),
    deudaIncobrable: sumNullable(items, (b) => b.deudaIncobrable),
    activos: sumNullable(items, (b) => b.activos),
    vencenSemanaSiguiente: sumNullable(items, (b) => b.vencenSemanaSiguiente),
  };
}

/**
 * Suma bloque a bloque los valores de varias sedes.
 *
 * Un bloque `null` de una sede significa "esa sede no tiene dato":
 * - Bloque EN VIVO (`frozenBlocks[bloque] === false`): el total del bloque es
 *   null (falta un dato, no se puede afirmar la suma).
 * - Bloque CONGELADO (`true`): una sede sin fila en la foto (dada de alta o
 *   reactivada después del cierre) cuenta como "sin aporte" y NO anula el Total.
 *   Solo queda null si ninguna sede de la lista tiene foto.
 * Dentro de un bloque, un campo null de cualquier sede (p. ej. deuda de una
 * semana vieja sin foto) deja ese campo del total en null.
 *
 * Leads (D-05, D-24): `require-all` suma solo si TODAS las sedes tienen leads;
 * `none` (Online, D-25) siempre null. Lista vacía: todo null.
 */
export function sumBranchValues(
  list: BranchWeekValues[],
  opts: { leads: "require-all" | "none"; frozenBlocks: FrozenBlocks },
): BranchWeekValues {
  if (list.length === 0) return { leads: null, main: null, late: null };

  const mains = list.flatMap((v) => (v.main ? [v.main] : []));
  const lates = list.flatMap((v) => (v.late ? [v.late] : []));

  const mainComplete = mains.length === list.length;
  const lateComplete = lates.length === list.length;

  const main =
    mains.length > 0 && (mainComplete || opts.frozenBlocks.main)
      ? sumMain(mains)
      : null;
  const late =
    lates.length > 0 && (lateComplete || opts.frozenBlocks.late)
      ? sumLate(lates)
      : null;

  const leads =
    opts.leads === "require-all" ? sumNullable(list, (v) => v.leads) : null;

  return { leads, main, late };
}

/** Valores de una semana: el mapa por sede, qué bloques son foto y los activos de la foto previa. */
interface WeekSide {
  values: Map<number, BranchWeekValues>;
  frozen: FrozenBlocks;
  activosFoto: Map<number, number | null>;
}

function valuesOf(side: WeekSide, branchId: number): BranchWeekValues {
  return side.values.get(branchId) ?? EMPTY_VALUES;
}

function deriveForBranch(side: WeekSide, branchId: number): DerivedValues {
  const foto = side.activosFoto.get(branchId);
  return deriveMetricValues(valuesOf(side, branchId), foto ?? null);
}

/**
 * Activos de la foto anterior sumados para un grupo. Null si no hay foto
 * (mapa vacío) o si alguna fila de la foto tiene activos null. Una sede sin
 * fila en una foto que sí existe (alta posterior al cierre) no aporta.
 */
function sumActivosFoto(
  branchIds: number[],
  foto: Map<number, number | null>,
): number | null {
  if (foto.size === 0) return null;
  let total = 0;
  let found = 0;
  for (const id of branchIds) {
    if (!foto.has(id)) continue;
    const value = foto.get(id) ?? null;
    if (value === null) return null;
    total += value;
    found += 1;
  }
  // Ninguna sede del grupo está en la foto (p. ej. la foto es de otro país o
  // de sedes que ya no existen): sin base de comparación, variación null en
  // vez de inflarla con todos los activos actuales.
  return found === 0 ? null : total;
}

function deriveForAggregate(
  side: WeekSide,
  branchIds: number[],
  leads: "require-all" | "none",
): DerivedValues {
  const summed = sumBranchValues(
    branchIds.map((id) => valuesOf(side, id)),
    { leads, frozenBlocks: side.frozen },
  );
  return deriveMetricValues(
    summed,
    sumActivosFoto(branchIds, side.activosFoto),
  );
}

export interface BuildBoardMetricsInput {
  groups: BoardGroup[];
  /** Semana pedida: sede -> valores. Clave ausente = sin dato. */
  current: Map<number, BranchWeekValues>;
  /** Semana anterior: sede -> valores. */
  previous: Map<number, BranchWeekValues>;
  /** Qué bloques de cada semana vienen de la foto (por presencia de la foto). */
  frozen: { current: FrozenBlocks; previous: FrozenBlocks };
  /**
   * Activos de las fotos (sede -> activos): de la semana anterior (para la
   * variación de la semana pedida) y de dos semanas atrás (para la variación de
   * la semana anterior). Mapa vacío = no hay foto, variación null (D-21).
   */
  activosFoto: {
    previousWeek: Map<number, number | null>;
    weekBeforePrevious: Map<number, number | null>;
  };
}

/**
 * Arma las 21 filas de la planilla recorriendo `BOARD_METRICS` en orden. Los
 * valores se derivan una sola vez por columna y semana, no por métrica.
 */
export function buildBoardMetrics(
  input: BuildBoardMetricsInput,
): BoardMetric[] {
  const currentSide: WeekSide = {
    values: input.current,
    frozen: input.frozen.current,
    activosFoto: input.activosFoto.previousWeek,
  };
  const previousSide: WeekSide = {
    values: input.previous,
    frozen: input.frozen.previous,
    activosFoto: input.activosFoto.weekBeforePrevious,
  };

  interface ColumnValues {
    value: DerivedValues;
    previous: DerivedValues;
  }
  const branchColumns = new Map<number, ColumnValues>();
  const totalColumns = new Map<string, ColumnValues>();
  const onlineColumns = new Map<string, ColumnValues>();

  for (const group of input.groups) {
    const physicalIds = group.branches.map((b) => b.id);
    for (const id of physicalIds) {
      branchColumns.set(id, {
        value: deriveForBranch(currentSide, id),
        previous: deriveForBranch(previousSide, id),
      });
    }
    if (group.hasTotal) {
      totalColumns.set(group.country, {
        value: deriveForAggregate(currentSide, physicalIds, "require-all"),
        previous: deriveForAggregate(previousSide, physicalIds, "require-all"),
      });
    }
    if (group.online) {
      onlineColumns.set(group.country, {
        value: deriveForAggregate(currentSide, group.online.branchIds, "none"),
        previous: deriveForAggregate(
          previousSide,
          group.online.branchIds,
          "none",
        ),
      });
    }
  }

  const cellOf = (col: ColumnValues, key: BoardMetricKey): BoardCell => ({
    value: col.value[key],
    previous: col.previous[key],
  });

  return BOARD_METRICS.map((def) => {
    const byBranch: Record<string, BoardCell> = {};
    for (const [id, col] of branchColumns) {
      byBranch[String(id)] = cellOf(col, def.key);
    }
    const totalByCountry: Record<string, BoardCell> = {};
    for (const [country, col] of totalColumns) {
      totalByCountry[country] = cellOf(col, def.key);
    }
    const onlineByCountry: Record<string, BoardCell> = {};
    for (const [country, col] of onlineColumns) {
      onlineByCountry[country] = cellOf(col, def.key);
    }
    return {
      key: def.key,
      block: def.block,
      unit: def.unit,
      byBranch,
      totalByCountry,
      onlineByCountry,
    };
  });
}
