import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

// D160-05 (fase 160, plan 05): red de seguridad — en dias sin bloques
// DEUTEROS (combos, tecnica) useSessionPlayer NUNCA debe pedir elegir un
// bloque DEUTEROS. Verificado por lectura en useSessionPlayer.ts:
//   - hasDeuterosBlocks (~L65) es false sin DEUTEROS_1/DEUTEROS_2 en session.blocks.
//   - playableBlocks (~L79-84) cae a "reproducir todos los bloques en
//     sortOrder, sin choice" cuando hasDeuterosBlocks es false.
//   - needsDeuterosChoice (~L150-153) retorna false inmediatamente cuando
//     hasDeuterosBlocks es false (antes de mirar deuterosChoice/currentBlockIndex).
// DayPlayer.vue:204-207 es el UNICO lugar del app que renderiza
// <DeuterosSelector>, gateado exclusivamente por
// player.needsDeuterosChoice.value — sin ningun otro camino que fuerce el
// choice (confirmado por grep de needsDeuterosChoice/deuterosChoice/
// selectDeuteros/DeuterosSelector/showDeuterosChoice en todo src/).
// GoalPlanSession.vue no usa useSessionPlayer (usa useGoalPlanSession, que no
// tiene el concepto de choice) y por lo tanto tampoco puede disparar el prompt.

// Mock Capacitor (web path) — igual patron que test/user-store-level-selection.test.ts.
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => false },
}))
vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: vi.fn().mockResolvedValue({ value: null }),
    set: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
  },
}))

// Mock axios boot so importing useSessionPlayerStore -> useAuthStore does not explode.
vi.mock('src/boot/axios', () => ({
  api: { get: vi.fn(), post: vi.fn() },
}))
vi.mock('boot/axios', () => ({
  api: { get: vi.fn(), post: vi.fn() },
}))

// Fake localStorage for node env (useTokenStorage falls back to it when !isNative).
const memStore: Record<string, string> = {}
function installLocalStorage() {
  for (const k of Object.keys(memStore)) delete memStore[k]
  // @ts-expect-error — minimal shim
  globalThis.localStorage = {
    getItem: (k: string) => (k in memStore ? memStore[k]! : null),
    setItem: (k: string, v: string) => {
      memStore[k] = v
    },
    removeItem: (k: string) => {
      delete memStore[k]
    },
    clear: () => {
      for (const k of Object.keys(memStore)) delete memStore[k]
    },
    key: () => null,
    length: 0,
  }
}

beforeEach(() => {
  installLocalStorage()
  setActivePinia(createPinia())
})

import type { Session, Block, BlockRole, Prescription } from 'src/modules/training/types/session'

function buildExercise(id: number, sortOrder: number): Prescription {
  return {
    exerciseId: id,
    exerciseName: `Ejercicio ${id}`,
    contraction: 'CON',
    reps: 10,
    repsMax: null,
    seconds: null,
    secondsMax: null,
    increment: null,
    rest: 30,
    notes: null,
    sortOrder,
    videoUrl: null,
  }
}

function buildBlock(role: BlockRole, sortOrder: number): Block {
  return {
    blockId: `block-${role}`,
    role,
    route: 'push',
    pattern: 'horizontal',
    intensity: 5,
    repsBudget: 30,
    format: 'straight-3x8',
    formatParams: null,
    formatDescription: null,
    sortOrder,
    exercises: [buildExercise(1, 0), buildExercise(2, 1)],
    mobilityExercise: null,
  }
}

function buildSession(
  roles: BlockRole[],
  sessionMode: Session['sessionMode'] = 'regular',
): Session {
  return {
    dayId: 'W1-lunes-alfa_delta',
    week: 1,
    day: 'lunes',
    levelGroup: 'alfa_delta',
    blockCount: roles.length,
    blocks: roles.map((role, idx) => buildBlock(role, idx)),
    sessionMode,
  }
}

describe('useSessionPlayer — D160-05: sin prompt DEUTEROS en combos/tecnica', () => {
  it('combos: hasDeuterosBlocks es false (Test 1)', async () => {
    const { useSessionPlayer } = await import(
      'src/modules/training/composables/useSessionPlayer'
    )
    const session = buildSession(['INITIUM', 'COMBOS_I', 'COMBOS_II', 'STRETCHING'], 'combos')
    const player = useSessionPlayer(session)
    expect(player.hasDeuterosBlocks.value).toBe(false)
  })

  it('combos: needsDeuterosChoice es false y sigue false tras avanzar bloques (Test 2)', async () => {
    const { useSessionPlayer } = await import(
      'src/modules/training/composables/useSessionPlayer'
    )
    const session = buildSession(['INITIUM', 'COMBOS_I', 'COMBOS_II', 'STRETCHING'], 'combos')
    const player = useSessionPlayer(session)
    expect(player.needsDeuterosChoice.value).toBe(false)
    player.currentBlockIndex.value = 2
    expect(player.needsDeuterosChoice.value).toBe(false)
    player.currentBlockIndex.value = 3
    expect(player.needsDeuterosChoice.value).toBe(false)
  })

  it('combos: playableBlocks devuelve los 4 bloques en orden de sortOrder, sin exigir choice (Test 3)', async () => {
    const { useSessionPlayer } = await import(
      'src/modules/training/composables/useSessionPlayer'
    )
    const session = buildSession(['INITIUM', 'COMBOS_I', 'COMBOS_II', 'STRETCHING'], 'combos')
    const player = useSessionPlayer(session)
    expect(player.playableBlocks.value.map((b) => b.role)).toEqual([
      'INITIUM',
      'COMBOS_I',
      'COMBOS_II',
      'STRETCHING',
    ])
  })

  it('tecnica: mismo comportamiento — sin DEUTEROS, sin choice, 4 bloques en orden (Test 4)', async () => {
    const { useSessionPlayer } = await import(
      'src/modules/training/composables/useSessionPlayer'
    )
    const session = buildSession(['INITIUM', 'TECNICA_I', 'TECNICA_II', 'STRETCHING'], 'tecnica')
    const player = useSessionPlayer(session)
    expect(player.hasDeuterosBlocks.value).toBe(false)
    expect(player.needsDeuterosChoice.value).toBe(false)
    expect(player.playableBlocks.value.map((b) => b.role)).toEqual([
      'INITIUM',
      'TECNICA_I',
      'TECNICA_II',
      'STRETCHING',
    ])
  })

  it('regresion: sesion regular con DEUTEROS SI mantiene hasDeuterosBlocks y el prompt de choice (Test 5)', async () => {
    const { useSessionPlayer } = await import(
      'src/modules/training/composables/useSessionPlayer'
    )
    const session = buildSession(
      ['INITIUM', 'NUCLEUS', 'DEUTEROS_1', 'DEUTEROS_2', 'ATHLOS'],
      'regular',
    )
    const player = useSessionPlayer(session)
    expect(player.hasDeuterosBlocks.value).toBe(true)
    // Before reaching block index 2 (post-NUCLEUS), no choice needed yet.
    expect(player.needsDeuterosChoice.value).toBe(false)
    player.currentBlockIndex.value = 2
    expect(player.needsDeuterosChoice.value).toBe(true)
    // Making the choice clears the prompt.
    await player.selectDeuteros('DEUTEROS_1')
    expect(player.needsDeuterosChoice.value).toBe(false)
  })
})
