import { describe, it, expect } from 'vitest'
import type { Block, Prescription } from '../../types/session'
import {
  MAX_PREVIEW_ITEMS,
  blockCountdownCopy,
  blockLabel,
  buildBlockTransition,
  chooseTransitionRest,
  formatCountdown,
  freeCountdownCopy,
  isBlockExercisesDone,
  isFinalBlock,
  journeyItems,
  sessionJourney,
} from '../blockTransition'

function rx(fields: Partial<Prescription>): Prescription {
  return {
    exerciseId: 1,
    exerciseName: 'EJ',
    contraction: 'CON',
    reps: 10,
    repsMax: null,
    seconds: null,
    secondsMax: null,
    increment: null,
    rest: 30,
    notes: null,
    sortOrder: 0,
    videoUrl: null,
    ...fields,
  }
}

function block(fields: Partial<Block>): Block {
  return {
    blockId: 'b1',
    role: 'NUCLEUS',
    route: 'PL',
    pattern: 'General',
    intensity: 5,
    repsBudget: 0,
    format: 'EMOM',
    formatParams: { type: 'emom', totalMinutes: 12 },
    formatDescription: null,
    sortOrder: 0,
    exercises: [
      rx({ exerciseId: 1, exerciseName: 'Sentadilla goblet', reps: 12 }),
      rx({ exerciseId: 2, exerciseName: 'Remo con banda', reps: 15 }),
      rx({ exerciseId: 3, exerciseName: 'Plancha', contraction: 'ISO', reps: null, seconds: 30 }),
    ],
    mobilityExercise: null,
    ...fields,
  }
}

function mobility(fields: Partial<NonNullable<Block['mobilityExercise']>> = {}) {
  return {
    exerciseId: 99,
    exerciseName: 'Movilidad de cadera 90/90',
    contraction: 'ISO',
    reps: null,
    seconds: 60,
    rest: 0,
    notes: null,
    videoUrl: null,
    ...fields,
  }
}

const INITIUM = block({ blockId: 'i', role: 'INITIUM', format: 'Straight', formatParams: null })
const NUCLEUS = block({ blockId: 'n', role: 'NUCLEUS', mobilityExercise: mobility() })
const D1 = block({ blockId: 'd1', role: 'DEUTEROS_1', mobilityExercise: mobility() })
const D2 = block({ blockId: 'd2', role: 'DEUTEROS_2', mobilityExercise: mobility() })
const ATHLOS = block({ blockId: 'a', role: 'ATHLOS', format: 'For time', formatParams: null })

describe('sessionJourney', () => {
  it('sin Deuteros pendiente: los bloques jugables, en orden', () => {
    const entries = sessionJourney({
      allBlocks: [INITIUM, NUCLEUS, D1, D2, ATHLOS],
      playable: [INITIUM, NUCLEUS, D1, ATHLOS],
      awaitingDeuteros: false,
    })
    expect(entries.map((e) => e.name)).toEqual(['Pyros', 'Nucleus', 'Deuteros 1', 'Athlos'])
    expect(entries.every((e) => e.block !== null)).toBe(true)
  })

  it('con Deuteros por elegir: agrega UN lugar "Deuteros" y el cierre (4 pasos)', () => {
    const entries = sessionJourney({
      allBlocks: [INITIUM, NUCLEUS, D1, D2, ATHLOS],
      playable: [INITIUM, NUCLEUS],
      awaitingDeuteros: true,
    })
    expect(entries.map((e) => e.name)).toEqual(['Pyros', 'Nucleus', 'Deuteros', 'Athlos'])
    expect(entries[2].block).toBeNull()
  })

  it('con Deuteros por elegir y EPIKOS como cierre', () => {
    const epikos = block({ blockId: 'e', role: 'EPIKOS' })
    const entries = sessionJourney({
      allBlocks: [INITIUM, NUCLEUS, D1, D2, epikos],
      playable: [INITIUM, NUCLEUS],
      awaitingDeuteros: true,
    })
    expect(entries.map((e) => e.name)).toEqual(['Pyros', 'Nucleus', 'Deuteros', 'Epikos'])
  })

  it('con Deuteros por elegir y sin ATHLOS/EPIKOS: termina en el lugar de Deuteros', () => {
    const entries = sessionJourney({
      allBlocks: [INITIUM, NUCLEUS, D1, D2],
      playable: [INITIUM, NUCLEUS],
      awaitingDeuteros: true,
    })
    expect(entries.map((e) => e.name)).toEqual(['Pyros', 'Nucleus', 'Deuteros'])
  })
})

describe('journeyItems (hecho / siguiente / pendiente)', () => {
  const entries = sessionJourney({
    allBlocks: [INITIUM, NUCLEUS, D1, ATHLOS],
    playable: [INITIUM, NUCLEUS, D1, ATHLOS],
    awaitingDeuteros: false,
  })

  it('terminar el bloque 0: él hecho, el 1 siguiente, el resto pendiente', () => {
    expect(journeyItems(entries, 0).map((i) => i.status)).toEqual([
      'done',
      'next',
      'pending',
      'pending',
    ])
  })

  it('terminar el bloque 2: los tres primeros hechos, el último siguiente', () => {
    expect(journeyItems(entries, 2).map((i) => i.status)).toEqual(['done', 'done', 'done', 'next'])
  })

  it('terminar el último: todo hecho y ninguno "siguiente"', () => {
    expect(journeyItems(entries, 3).map((i) => i.status)).toEqual(['done', 'done', 'done', 'done'])
  })

  it('la meta es el formato corto; sin formato cae a la estimación', () => {
    const items = journeyItems(entries, 0)
    expect(items[1].meta).toBe("EMOM · 12'")
    // INITIUM: formato "Straight" sin minutos declarados
    expect(items[0].meta).toBe('Straight')
    const noFormat = sessionJourney({
      allBlocks: [block({ role: 'INITIUM', format: '', formatParams: null })],
      playable: [block({ role: 'INITIUM', format: '', formatParams: null })],
      awaitingDeuteros: false,
    })
    // 3 ejercicios x (10 reps x 3 s + 30 s de descanso) = 3 min (los de la fixture traen reps/seg)
    expect(journeyItems(noFormat, 0)[0].meta).toMatch(/^≈\d+'$/)
  })

  it('el Deuteros sin elegir dice "A elección"', () => {
    const pending = sessionJourney({
      allBlocks: [INITIUM, NUCLEUS, D1, D2, ATHLOS],
      playable: [INITIUM, NUCLEUS],
      awaitingDeuteros: true,
    })
    const items = journeyItems(pending, 1)
    expect(items[2]).toMatchObject({ name: 'Deuteros', meta: 'A elección', status: 'next' })
    expect(items[3].status).toBe('pending')
  })
})

describe('chooseTransitionRest (casos a / b / c)', () => {
  it('a. movilidad con segundos: aro, con la dosis y las notas', () => {
    const done = block({ mobilityExercise: mobility({ seconds: 60, notes: '30" por lado' }) })
    const rest = chooseTransitionRest(done, block({}))
    expect(rest).toEqual({
      kind: 'timed',
      name: 'Movilidad de cadera 90/90',
      seconds: 60,
      videoUrl: null,
      detail: '60" · 30" por lado',
    })
  })

  it('a. sin notas la dosis es solo los segundos', () => {
    const done = block({ mobilityExercise: mobility({ seconds: 45, notes: '  ' }) })
    const rest = chooseTransitionRest(done, block({}))
    expect(rest).toMatchObject({ kind: 'timed', seconds: 45, detail: '45"' })
  })

  it('a. si trae segundos Y repeticiones manda el reloj', () => {
    const done = block({ mobilityExercise: mobility({ seconds: 30, reps: 10 }) })
    expect(chooseTransitionRest(done, null).kind).toBe('timed')
  })

  it('b. movilidad con repeticiones: sin reloj', () => {
    const done = block({
      mobilityExercise: mobility({ seconds: null, reps: 10, notes: 'lento', videoUrl: 'v.mp4' }),
    })
    expect(chooseTransitionRest(done, block({}))).toEqual({
      kind: 'free',
      name: 'Movilidad de cadera 90/90',
      videoUrl: 'v.mp4',
      detail: '10 repeticiones · lento',
    })
  })

  it('b. una sola repetición va en singular', () => {
    const done = block({ mobilityExercise: mobility({ seconds: null, reps: 1 }) })
    expect(chooseTransitionRest(done, null)).toMatchObject({ detail: '1 repetición' })
  })

  it('b. movilidad sin dosis (ni segundos ni reps): igual sin reloj, con las notas', () => {
    const soft = mobility({ seconds: null, reps: null, notes: 'suave' })
    const done = block({ mobilityExercise: soft })
    expect(chooseTransitionRest(done, null)).toMatchObject({ kind: 'free', detail: 'suave' })
    const bare = block({ mobilityExercise: mobility({ seconds: 0, reps: 0, notes: null }) })
    expect(chooseTransitionRest(bare, null)).toMatchObject({ kind: 'free', detail: '' })
  })

  it('c. sin movilidad: lista los ejercicios del bloque que viene con su dosis', () => {
    const rest = chooseTransitionRest(INITIUM, block({}))
    expect(rest).toEqual({
      kind: 'preview',
      items: [
        { name: 'Sentadilla goblet', dose: '12 REPS' },
        { name: 'Remo con banda', dose: '15 REPS' },
        { name: 'Plancha', dose: '30 SEG' },
      ],
      extra: 0,
    })
  })

  it('c. INITIUM no tiene descanso activo aunque el dato traiga movilidad', () => {
    const initiumWithMob = block({ role: 'INITIUM', mobilityExercise: mobility() })
    expect(chooseTransitionRest(initiumWithMob, block({})).kind).toBe('preview')
  })

  it('c. tope de ejercicios con "y N más"', () => {
    const many = block({
      exercises: Array.from({ length: MAX_PREVIEW_ITEMS + 2 }, (_, i) =>
        rx({ exerciseId: i + 1, exerciseName: `Ej ${i + 1}` }),
      ),
    })
    const rest = chooseTransitionRest(INITIUM, many)
    expect(rest.kind).toBe('preview')
    if (rest.kind === 'preview') {
      expect(rest.items).toHaveLength(MAX_PREVIEW_ITEMS)
      expect(rest.extra).toBe(2)
    }
  })

  it('sin movilidad y sin bloque siguiente con ejercicios: nada abajo', () => {
    expect(chooseTransitionRest(INITIUM, null)).toEqual({ kind: 'none' })
    expect(chooseTransitionRest(INITIUM, block({ exercises: [] }))).toEqual({ kind: 'none' })
    expect(chooseTransitionRest(null, null)).toEqual({ kind: 'none' })
  })

  it('la movilidad le gana a la lista del bloque que viene', () => {
    expect(chooseTransitionRest(NUCLEUS, block({})).kind).toBe('timed')
  })
})

describe('buildBlockTransition', () => {
  const playable = [INITIUM, NUCLEUS, D1, ATHLOS]
  const entries = sessionJourney({ allBlocks: playable, playable, awaitingDeuteros: false })

  it('después de INITIUM: kicker con la ruta, sigue NUCLEUS y abajo va "lo que viene"', () => {
    const data = buildBlockTransition({ title: 'Planche', entries, completedIndex: 0 })
    expect(data.kicker).toBe('Planche · Bloque 2 de 4')
    expect(data.next).toBe('block')
    expect(data.actionLabel).toBe('Empezar Nucleus')
    expect(data.rest.kind).toBe('preview')
    expect(data.items.map((i) => i.status)).toEqual(['done', 'next', 'pending', 'pending'])
  })

  it('después de NUCLEUS: el descanso activo es la movilidad de NUCLEUS', () => {
    const data = buildBlockTransition({ title: 'Planche', entries, completedIndex: 1 })
    expect(data.kicker).toBe('Planche · Bloque 3 de 4')
    expect(data.actionLabel).toBe('Empezar Deuteros 1')
    expect(data.rest).toMatchObject({ kind: 'timed', seconds: 60 })
  })

  it('sin título el kicker es solo "Bloque n de total"', () => {
    const data = buildBlockTransition({ title: '', entries, completedIndex: 0 })
    expect(data.kicker).toBe('Bloque 2 de 4')
  })

  it('NUCLEUS con el Deuteros por elegir: el botón es "Elegir Deuteros" y no hay 3-2-1', () => {
    const pending = sessionJourney({
      allBlocks: [INITIUM, NUCLEUS, D1, D2, ATHLOS],
      playable: [INITIUM, NUCLEUS],
      awaitingDeuteros: true,
    })
    const data = buildBlockTransition({ title: 'Planche', entries: pending, completedIndex: 1 })
    expect(data.next).toBe('deuteros')
    expect(data.actionLabel).toBe('Elegir Deuteros')
    expect(data.kicker).toBe('Planche · Bloque 3 de 4')
    // el descanso activo de NUCLEUS sigue ahí
    expect(data.rest.kind).toBe('timed')
  })

  it('hacia el final: "Ver resumen" y nada de "Bloque n"', () => {
    const data = buildBlockTransition({ title: 'Planche', entries, completedIndex: 3 })
    expect(data.next).toBe('end')
    expect(data.actionLabel).toBe('Ver resumen')
    expect(data.kicker).toBe('Planche · Sesión completa')
    expect(data.items.every((i) => i.status === 'done')).toBe(true)
  })
})

describe('isBlockExercisesDone', () => {
  const b = block({ role: 'NUCLEUS' })

  it('todos los ejercicios tildados', () => {
    expect(isBlockExercisesDone(b, { NUCLEUS: [1, 2, 3] })).toBe(true)
  })

  it('falta uno', () => {
    expect(isBlockExercisesDone(b, { NUCLEUS: [1, 3] })).toBe(false)
  })

  it('los tildados de otro rol no cuentan', () => {
    expect(isBlockExercisesDone(b, { INITIUM: [1, 2, 3] })).toBe(false)
    expect(isBlockExercisesDone(b, {})).toBe(false)
  })

  it('un bloque sin ejercicios nunca está "hecho"', () => {
    expect(isBlockExercisesDone(block({ exercises: [] }), { NUCLEUS: [] })).toBe(false)
  })
})

describe('isFinalBlock', () => {
  it('el último jugable es el final', () => {
    expect(isFinalBlock({ index: 3, playableCount: 4, awaitingDeuteros: false })).toBe(true)
    expect(isFinalBlock({ index: 1, playableCount: 4, awaitingDeuteros: false })).toBe(false)
  })

  it('con el Deuteros por elegir NUCLEUS es el último jugable pero no el final', () => {
    expect(isFinalBlock({ index: 1, playableCount: 2, awaitingDeuteros: true })).toBe(false)
  })

  it('sesiones sin Deuteros (ROM): el último bloque es el final', () => {
    expect(isFinalBlock({ index: 2, playableCount: 3, awaitingDeuteros: false })).toBe(true)
  })
})

describe('textos del 3-2-1', () => {
  it('bloque de sesión: solo "Bloque n de total · nombre", sin el primer ejercicio', () => {
    const copy = blockCountdownCopy(block({ role: 'COMBOS_I' }), 1, 4)
    expect(copy).toEqual({ kicker: 'Bloque 2 de 4 · Combos I' })
  })

  it('modo libre: "Bloque libre · nombre del bloque"', () => {
    const copy = freeCountdownCopy(block({ role: 'COMBOS_I', route: 'PL' }))
    expect(copy).toEqual({ kicker: 'Bloque libre · Combos I' })
  })

  it('modo libre con INITIUM usa el nombre de pantalla del bloque', () => {
    expect(freeCountdownCopy(block({ role: 'INITIUM' })).kicker).toBe(
      'Bloque libre · Entrada en calor',
    )
  })
})

describe('blockLabel', () => {
  it('rótulo del rol, igual que el resto del app (INITIUM = "Pyros")', () => {
    expect(blockLabel('INITIUM')).toBe('Pyros')
    expect(blockLabel('DEUTEROS_2')).toBe('Deuteros 2')
  })
})

describe('formatCountdown (m:ss del aro)', () => {
  it('segundos sueltos y minutos', () => {
    expect(formatCountdown(38)).toBe('0:38')
    expect(formatCountdown(60)).toBe('1:00')
    expect(formatCountdown(65)).toBe('1:05')
    expect(formatCountdown(9)).toBe('0:09')
    expect(formatCountdown(600)).toBe('10:00')
  })

  it('cero, negativos y valores raros se leen 0:00', () => {
    expect(formatCountdown(0)).toBe('0:00')
    expect(formatCountdown(-5)).toBe('0:00')
    expect(formatCountdown(Number.NaN)).toBe('0:00')
  })

  it('descarta los decimales', () => {
    expect(formatCountdown(59.9)).toBe('0:59')
  })
})
