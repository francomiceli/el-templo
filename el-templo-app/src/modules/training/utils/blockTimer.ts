/**
 * Reloj del bloque en el player (2026-10-27): cuenta según el FORMATO del bloque, no la sesión. El API
 * manda `block.timerSpec` con la misma normalización que la TV (`toTimerSpec`, fase 164), así el app
 * no conoce los ~50 formatos: acá solo se calcula la fase para un tiempo transcurrido.
 *
 * `phaseAt` es un port de `el-templo-api/src/modules/tv/timer-phase.ts` (la TV lo porta igual en
 * `el-templo-admin/src/tv/timer.ts`). Si cambia allá, cambia acá. Funciones puras, sin Vue.
 */

/** Las cuatro formas de reloj que manda el API (`toTimerSpec`). */
export type TimerSpec =
  /** Trabajo/descanso alternados: tabata, interval, hiit */
  | { kind: 'work_rest'; workMs: number; restMs: number; rounds: number }
  /** Un tramo regresivo por ronda: emom, every_x_seconds, on_the_x */
  | { kind: 'interval'; intervalMs: number; rounds: number }
  /** Una sola cuenta regresiva: amrap, time cap */
  | { kind: 'countdown'; totalMs: number }
  /** Cronómetro libre: standard, chipper, for time sin cap, ROM */
  | { kind: 'countup' }

export interface TimerFrame {
  phase: 'work' | 'rest' | 'run' | 'done'
  /** Lo que se muestra: restante en las fases regresivas, transcurrido en el cronómetro libre */
  displayMs: number
  round: number
  totalRounds: number
  finished: boolean
}

/** Más que esto es un reloj roto, no un bloque real */
const MAX_ELAPSED_MS = 24 * 60 * 60 * 1000

function finishedFrame(totalRounds: number): TimerFrame {
  return { phase: 'done', displayMs: 0, round: totalRounds, totalRounds, finished: true }
}

function countupFrame(elapsedMs: number): TimerFrame {
  return { phase: 'run', displayMs: elapsedMs, round: 1, totalRounds: 1, finished: false }
}

/** Fase del reloj para un tiempo transcurrido del bloque (port de `phaseAt` de la TV). */
export function phaseAt(elapsedMs: number, spec: TimerSpec): TimerFrame {
  const elapsed =
    Number.isFinite(elapsedMs) && elapsedMs > 0 && elapsedMs <= MAX_ELAPSED_MS ? elapsedMs : 0

  switch (spec.kind) {
    case 'work_rest': {
      const cycleMs = spec.workMs + spec.restMs
      if (cycleMs <= 0) return countupFrame(elapsed)
      const totalMs = cycleMs * spec.rounds
      if (elapsed >= totalMs) return finishedFrame(spec.rounds)
      const roundIndex = Math.floor(elapsed / cycleMs)
      const offsetMs = elapsed - roundIndex * cycleMs
      const isRom = spec.workMs === 0
      const inWork = isRom || offsetMs < spec.workMs
      return {
        phase: inWork ? 'work' : 'rest',
        displayMs: isRom ? offsetMs : inWork ? spec.workMs - offsetMs : cycleMs - offsetMs,
        round: roundIndex + 1,
        totalRounds: spec.rounds,
        finished: false,
      }
    }
    case 'interval': {
      if (spec.intervalMs <= 0) return countupFrame(elapsed)
      const totalMs = spec.intervalMs * spec.rounds
      if (elapsed >= totalMs) return finishedFrame(spec.rounds)
      const roundIndex = Math.floor(elapsed / spec.intervalMs)
      return {
        phase: 'work',
        displayMs: spec.intervalMs - (elapsed - roundIndex * spec.intervalMs),
        round: roundIndex + 1,
        totalRounds: spec.rounds,
        finished: false,
      }
    }
    case 'countdown': {
      if (spec.totalMs <= 0 || elapsed >= spec.totalMs) return finishedFrame(1)
      return {
        phase: 'run',
        displayMs: spec.totalMs - elapsed,
        round: 1,
        totalRounds: 1,
        finished: false,
      }
    }
    case 'countup':
      return countupFrame(elapsed)
  }
}

export interface BlockTimerView {
  /** "mm:ss" */
  time: string
  /** Rótulo chico debajo ("Minuto 3 de 10", "Descanso · 2/8"…); vacío en la cuenta regresiva */
  label: string
}

function mmss(totalSeconds: number): string {
  const s = Math.max(0, totalSeconds)
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

/**
 * Lo que muestra el reloj de la hoja. Sin `spec` (API viejo) cae al cronómetro libre del bloque.
 * Las cuentas regresivas redondean para arriba: el 00:00 aparece recién cuando terminó.
 */
export function blockTimerView(spec: TimerSpec | null | undefined, elapsedMs: number): BlockTimerView {
  const s = spec ?? { kind: 'countup' }
  const frame = phaseAt(elapsedMs, s)
  if (frame.finished) return { time: '00:00', label: 'Terminado' }

  switch (s.kind) {
    case 'countup':
      return { time: mmss(Math.floor(frame.displayMs / 1000)), label: 'Bloque' }
    case 'countdown':
      return { time: mmss(Math.ceil(frame.displayMs / 1000)), label: '' }
    case 'interval': {
      const unidad = s.intervalMs === 60_000 ? 'Minuto' : 'Ronda'
      return {
        time: mmss(Math.ceil(frame.displayMs / 1000)),
        label: `${unidad} ${frame.round} de ${frame.totalRounds}`,
      }
    }
    case 'work_rest':
      return {
        time: mmss(Math.ceil(frame.displayMs / 1000)),
        label: `${frame.phase === 'rest' ? 'Descanso' : 'Trabajo'} · ${frame.round}/${frame.totalRounds}`,
      }
  }
}
