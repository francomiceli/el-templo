import type { ComboKey, CountedStep, Unit } from '../types'

// Fase 201 §7.1 Progreso (ref `conquer-app.html` `drawSparks`): funciones puras de la pantalla. El app
// NO recalcula el motor: estas funciones solo dibujan y dan formato a lo que manda `GET /progress`.

/** Techo de la curva del E1: 8 reps o 12 s (prototipo `TECHO`). Sobre el techo la curva se aplana. */
export const SPARK_CEILING: Record<Unit, number> = { reps: 8, s: 12 }

/** Margen del dibujo: la línea punteada del techo queda a esta altura desde arriba. */
export const SPARK_PAD = 8

export interface SparkPoint {
  x: number
  y: number
}

/**
 * Puntos de la curva del E1. Con un solo valor, un punto centrado. Con varios, repartidos entre los
 * márgenes. Cada valor se acota al techo de su unidad: y = (alto − margen) − ratio × (alto − 2 × margen)
 * con ratio = min(v, techo) / techo, que con 300 × 56 es la fórmula del prototipo (48 − ratio × 40).
 */
export function sparklinePoints(
  values: readonly number[],
  unit: Unit,
  width: number,
  height: number,
): SparkPoint[] {
  const ceiling = SPARK_CEILING[unit]
  const span = width - 2 * SPARK_PAD
  const bottom = height - SPARK_PAD
  const rise = height - 2 * SPARK_PAD
  return values.map((value, i) => {
    const ratio = Math.min(Math.max(value, 0), ceiling) / ceiling
    return {
      x: values.length > 1 ? SPARK_PAD + i * (span / (values.length - 1)) : width / 2,
      y: bottom - ratio * rise,
    }
  })
}

/** "67 %" o "—" si todavía no hay marcas con objetivo. */
export function accuracyText(pct: number | null): string {
  return pct === null ? '—' : `${pct} %`
}

/** Δ del acierto: "+0,5", "−0,7" (signo menos tipográfico, coma decimal) o "0,0". "—" si no hay. */
export function deltaText(delta: number | null): string {
  if (delta === null) return '—'
  const rounded = Math.round(delta * 10) / 10
  const body = Math.abs(rounded).toFixed(1).replace('.', ',')
  if (rounded > 0) return `+${body}`
  if (rounded < 0) return `−${body}`
  return body
}

/** "1 sesión" / "4 sesiones". */
export function sessionsText(count: number): string {
  return count === 1 ? '1 sesión' : `${count} sesiones`
}

// Claves de las acciones en curso: la pantalla marca `:loading` solo en el botón que se tocó.

export function subirStepKey(exerciseId: number, step: CountedStep): string {
  return `subir:${exerciseId}:${step}`
}

export function subirComboKey(comboKey: ComboKey): string {
  return `combo:${comboKey}`
}

export function calibrationKey(exerciseId: number): string {
  return `calibration:${exerciseId}`
}
