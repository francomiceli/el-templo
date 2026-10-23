/**
 * Fase 197: pantalla entre bloques (recorrido + descanso activo) y 3-2-1 sobre la foto.
 * Funciones puras, sin Vue ni stores: DayPlayer y GoalPlanSession arman los datos con esto y
 * `TransitionScreen` / `CountdownOverlay` solo los dibujan, así la lógica se testea sin montar nada.
 */
import { ROLE_LABELS } from 'src/constants/roleLabels'
import type { Block, BlockRole } from '../types/session'
import { blockDisplayName, estimatedMinutes, formatLabel } from './blockMeta'
import { formatQuickDose, isPyramidBlock } from './formatDose'

/** Cuántos ejercicios del bloque siguiente se listan en "Lo que viene" (el resto va como "y N más"). */
export const MAX_PREVIEW_ITEMS = 5

/** Etiqueta visible del bloque en el recorrido y en los botones (rol, igual que el resto del player). */
export function blockLabel(role: BlockRole): string {
  return ROLE_LABELS[role] ?? role
}

// ── Recorrido ───────────────────────────────────────────────────────────────────────────────────

export type JourneyStatus = 'done' | 'next' | 'pending'

/**
 * Un paso del recorrido. `block: null` = el Deuteros que el socio todavía no eligió (el recorrido
 * muestra un solo lugar "Deuteros" en vez de los dos).
 */
export interface JourneyEntry {
  key: string
  name: string
  block: Block | null
}

export interface JourneyItem {
  key: string
  name: string
  meta: string
  status: JourneyStatus
}

function entryOf(block: Block): JourneyEntry {
  return { key: block.blockId, name: blockLabel(block.role), block }
}

/**
 * Pasos de la sesión en orden. Con `awaitingDeuteros` (sesión con Deuteros, todavía sin elegir) los
 * bloques jugables son INITIUM y NUCLEUS: se agrega un paso "Deuteros" y el cierre (ATHLOS/EPIKOS),
 * para que el recorrido muestre los 4 bloques desde el principio.
 */
export function sessionJourney(opts: {
  allBlocks: Block[]
  playable: Block[]
  awaitingDeuteros: boolean
}): JourneyEntry[] {
  const entries = opts.playable.map(entryOf)
  if (!opts.awaitingDeuteros) return entries
  entries.push({ key: 'DEUTEROS', name: 'Deuteros', block: null })
  const closing = opts.allBlocks.find((b) => b.role === 'ATHLOS' || b.role === 'EPIKOS')
  if (closing) entries.push(entryOf(closing))
  return entries
}

/** Meta del paso: el formato corto ("EMOM · 12'"); sin formato, la estimación ("≈6'"). */
function entryMeta(entry: JourneyEntry): string {
  if (!entry.block) return 'A elección'
  return formatLabel(entry.block) || `≈${estimatedMinutes(entry.block)}'`
}

/**
 * Estado de cada paso respecto del bloque que se acaba de terminar (`completedIndex`):
 * hasta él inclusive = hechos, el que sigue = `next`, el resto = pendientes.
 */
export function journeyItems(entries: JourneyEntry[], completedIndex: number): JourneyItem[] {
  return entries.map((entry, i) => ({
    key: entry.key,
    name: entry.name,
    meta: entryMeta(entry),
    status: i <= completedIndex ? 'done' : i === completedIndex + 1 ? 'next' : 'pending',
  }))
}

// ── Mitad inferior ──────────────────────────────────────────────────────────────────────────────

export interface PreviewItem {
  name: string
  dose: string
}

/**
 * Qué muestra la mitad de abajo según la movilidad del bloque que se terminó:
 * - `timed`: movilidad con segundos → aro con cuenta regresiva.
 * - `free`: movilidad con repeticiones (o sin dosis) → sin reloj.
 * - `preview`: sin movilidad → los ejercicios del bloque que viene.
 * - `none`: sin movilidad y sin ejercicios que mostrar (p. ej. el Deuteros todavía sin elegir).
 */
export type TransitionRest =
  | { kind: 'timed'; name: string; seconds: number; videoUrl: string | null; detail: string }
  | { kind: 'free'; name: string; videoUrl: string | null; detail: string }
  | { kind: 'preview'; items: PreviewItem[]; extra: number }
  | { kind: 'none' }

function positive(v: number | null | undefined): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null
}

function repsText(reps: number): string {
  return `${reps} ${reps === 1 ? 'repetición' : 'repeticiones'}`
}

/** Elige el caso a / b / c de la mitad inferior. */
export function chooseTransitionRest(completed: Block | null, next: Block | null): TransitionRest {
  // INITIUM nunca tiene descanso activo (la vista del player tampoco lo muestra)
  const mobility = completed && completed.role !== 'INITIUM' ? completed.mobilityExercise : null
  if (mobility) {
    const notes = mobility.notes?.trim() ?? ''
    const seconds = positive(mobility.seconds)
    if (seconds !== null) {
      return {
        kind: 'timed',
        name: mobility.exerciseName,
        seconds,
        videoUrl: mobility.videoUrl,
        detail: [`${seconds}"`, notes].filter(Boolean).join(' · '),
      }
    }
    const reps = positive(mobility.reps)
    return {
      kind: 'free',
      name: mobility.exerciseName,
      videoUrl: mobility.videoUrl,
      detail: [reps !== null ? repsText(reps) : '', notes].filter(Boolean).join(' · '),
    }
  }
  if (next && next.exercises.length > 0) {
    const pyramid = isPyramidBlock(next)
    return {
      kind: 'preview',
      items: next.exercises.slice(0, MAX_PREVIEW_ITEMS).map((ex) => ({
        name: ex.exerciseName,
        dose: formatQuickDose(ex, pyramid),
      })),
      extra: Math.max(0, next.exercises.length - MAX_PREVIEW_ITEMS),
    }
  }
  return { kind: 'none' }
}

// ── Pantalla completa ───────────────────────────────────────────────────────────────────────────

/**
 * Qué hace el botón principal:
 * - `block`: "Empezar {bloque}" → 3-2-1 → ese bloque.
 * - `deuteros`: el siguiente es el Deuteros por elegir → "Elegir Deuteros" (el selector tiene su 3-2-1).
 * - `end`: no hay siguiente → "Ver resumen".
 */
export type TransitionNext = 'block' | 'deuteros' | 'end'

export interface BlockTransitionData {
  /** "{ruta/plani} · Bloque 2 de 4" */
  kicker: string
  items: JourneyItem[]
  rest: TransitionRest
  next: TransitionNext
  /** Texto del botón principal */
  actionLabel: string
}

function joinKicker(title: string, tail: string): string {
  return title ? `${title} · ${tail}` : tail
}

/**
 * Datos de la pantalla entre bloques. `completedIndex` = índice (en `entries`) del bloque que se
 * acaba de terminar; el siguiente es `completedIndex + 1`.
 */
export function buildBlockTransition(input: {
  title: string
  entries: JourneyEntry[]
  completedIndex: number
}): BlockTransitionData {
  const { title, entries, completedIndex } = input
  const completed = entries[completedIndex]?.block ?? null
  const nextEntry = entries[completedIndex + 1] ?? null

  let next: TransitionNext = 'end'
  let actionLabel = 'Ver resumen'
  if (nextEntry) {
    if (nextEntry.block) {
      next = 'block'
      actionLabel = `Empezar ${nextEntry.name}`
    } else {
      next = 'deuteros'
      actionLabel = `Elegir ${nextEntry.name}`
    }
  }

  return {
    kicker: joinKicker(
      title,
      nextEntry ? `Bloque ${completedIndex + 2} de ${entries.length}` : 'Sesión completa',
    ),
    items: journeyItems(entries, completedIndex),
    rest: chooseTransitionRest(completed, nextEntry?.block ?? null),
    next,
    actionLabel,
  }
}

// ── Estado del bloque ───────────────────────────────────────────────────────────────────────────

/** Todos los ejercicios del bloque están tildados (mismo criterio que la vista del player). */
export function isBlockExercisesDone(
  block: Pick<Block, 'role' | 'exercises'>,
  completedExercises: Record<string, number[]>,
): boolean {
  if (block.exercises.length === 0) return false
  const done = completedExercises[block.role] ?? []
  return block.exercises.every((ex) => done.includes(ex.exerciseId))
}

/**
 * El bloque activo es el último de la sesión: no hay transición, va "Sesión completa" → celebración.
 * Con el Deuteros por elegir, NUCLEUS es el último bloque jugable pero no el último de la sesión.
 */
export function isFinalBlock(opts: {
  index: number
  playableCount: number
  awaitingDeuteros: boolean
}): boolean {
  if (opts.awaitingDeuteros) return false
  return opts.index >= opts.playableCount - 1
}

// ── 3-2-1 ───────────────────────────────────────────────────────────────────────────────────────

// Solo el kicker: el 3-2-1 ya no nombra el primer ejercicio (Franco, 2026-10-23).
export interface CountdownCopy {
  kicker: string
}

/** Texto del 3-2-1 de un bloque de sesión: "Bloque 2 de 4 · Combos I". */
export function blockCountdownCopy(
  block: Pick<Block, 'role'>,
  index: number,
  total: number,
): CountdownCopy {
  return { kicker: `Bloque ${index + 1} de ${total} · ${blockLabel(block.role)}` }
}

/** Texto del 3-2-1 del modo bloque libre: "Bloque libre · {nombre}". */
export function freeCountdownCopy(block: Pick<Block, 'role' | 'route'>): CountdownCopy {
  return { kicker: `Bloque libre · ${blockDisplayName(block)}` }
}

// ── Aro del descanso ────────────────────────────────────────────────────────────────────────────

/** "m:ss" del aro: 38 → "0:38", 60 → "1:00". Negativos y NaN se leen como 0:00. */
export function formatCountdown(totalSeconds: number): string {
  const safe = Number.isFinite(totalSeconds) ? Math.max(0, Math.floor(totalSeconds)) : 0
  const m = Math.floor(safe / 60)
  const s = safe % 60
  return `${m}:${String(s).padStart(2, '0')}`
}
