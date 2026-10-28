/**
 * Semana de ejemplo FIJA de la vidriera sin plan (fase 197 D-06).
 *
 * Sin plan no hay nivel y la API puede dar 403, así que la vidriera NO llama al API: dibuja esta
 * semana de ejemplo (copiada del sketch 015: `S_FRI`, `S_PULL`, `S_MU`) desenfocada y no
 * interactiva. Contenido fijo; solo cambian las fechas, que son las de la semana pedida.
 */
import { groupsOfZones } from 'src/components/anatomy/zones'
import type { ZoneSlug } from 'src/components/anatomy/zones'
import type { Block, BlockRole, DayState, Prescription, Session, WeekDay } from '../types/session'
import { addDays } from '../utils/weekLabels'

/** Ejercicio de ejemplo: `[nombre, cantidad, unidad]` (reps o segundos) */
type SampleExercise = readonly [string, number, 'reps' | 's']

interface SampleBlock {
  role: BlockRole
  route: string
  format: string
  formatParams: Record<string, unknown> | null
  zones: ZoneSlug[]
  exercises: SampleExercise[]
}

interface SampleSession {
  levelGroup: string
  blocks: SampleBlock[]
}

const DAY_NAMES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

function prescription(ex: SampleExercise, index: number): Prescription {
  const [name, amount, unit] = ex
  return {
    exerciseId: 0,
    exerciseName: name,
    contraction: 'CON',
    reps: unit === 'reps' ? amount : null,
    repsMax: null,
    seconds: unit === 's' ? amount : null,
    secondsMax: null,
    increment: null,
    rest: 0,
    notes: null,
    sortOrder: index,
    videoUrl: null,
  }
}

function buildBlock(sample: SampleBlock, sessionKey: string, index: number): Block {
  return {
    blockId: `vidriera-${sessionKey}-${index}`,
    role: sample.role,
    route: sample.route,
    pattern: '',
    intensity: 5,
    repsBudget: 0,
    format: sample.format,
    formatParams: sample.formatParams,
    formatDescription: null,
    sortOrder: index,
    zones: sample.zones,
    groups: groupsOfZones(sample.zones),
    exercises: sample.exercises.map(prescription),
    mobilityExercise: null,
  }
}

function buildSession(key: string, sample: SampleSession): Session {
  return {
    dayId: `vidriera-${key}`,
    week: 1,
    day: '',
    levelGroup: sample.levelGroup,
    blockCount: sample.blocks.length,
    blocks: sample.blocks.map((b, i) => buildBlock(b, key, i)),
    sessionMode: sample.blocks.some((b) => b.role.startsWith('ROM_')) ? 'rom' : 'regular',
  }
}

const WARM_UP: SampleBlock = {
  role: 'INITIUM',
  route: 'AF',
  format: 'Buy-in / Cash-out',
  formatParams: null,
  zones: [],
  exercises: [
    ['BEAST WALK', 30, 'reps'],
    ['WAVE UNLOAD', 30, 'reps'],
    ['BEAST', 30, 's'],
    ['PRIMATE SIDEWAYS', 30, 'reps'],
  ],
}

// "Piernas y empuje" (S_FRI del sketch)
const LEGS_AND_PUSH: SampleSession = {
  levelGroup: 'sigma',
  blocks: [
    WARM_UP,
    {
      role: 'NUCLEUS',
      route: 'SS',
      format: 'EMOM',
      formatParams: { type: 'emom', totalMinutes: 3 },
      zones: ['quadriceps', 'gluteal', 'hamstring'],
      exercises: [
        ['SISSY SQ', 30, 's'],
        ['NC BENT W', 15, 'reps'],
        ['NC', 15, 'reps'],
        ['STR PIKE STANDING', 10, 'reps'],
      ],
    },
    {
      role: 'DEUTEROS_1',
      route: 'PL',
      format: 'AMRAP Series',
      formatParams: { type: 'amrap_series', rounds: 3, minutes: 10 },
      zones: ['deltoids', 'triceps', 'abs', 'trapezius'],
      exercises: [
        ['STRADDLE PHS FREE', 10, 'reps'],
        ['PHS WALL', 10, 'reps'],
        ['PLANCHE PRESS TO HOLD WALL', 20, 's'],
        ['OL FRONT PIKE W', 10, 'reps'],
      ],
    },
    {
      role: 'DEUTEROS_2',
      route: 'OAPU',
      format: 'AMRAP Series',
      formatParams: { type: 'amrap_series', rounds: 3, minutes: 10 },
      zones: ['chest', 'triceps', 'deltoids'],
      exercises: [
        ['PELICAN P.U MID RANGE HOR', 10, 'reps'],
        ['OAPURINGS STRADDLE', 10, 'reps'],
        ['OAPURINGS 90 STRADDLE', 20, 's'],
        ['FULL BRIDGE WALL WALK', 10, 'reps'],
      ],
    },
    {
      role: 'EPIKOS',
      route: 'SU',
      format: 'I go, you go',
      formatParams: null,
      zones: ['quadriceps', 'gluteal', 'calves'],
      exercises: [
        ['PSU FULL ROM W', 50, 'reps'],
        ['LUNGE STEP UP W', 50, 'reps'],
        ['STEP UP SIDE W', 30, 's'],
        ['RH HALF STR', 20, 's'],
      ],
    },
  ],
}

// "Tirón y core" (S_PULL del sketch)
const PULL_AND_CORE: SampleSession = {
  levelGroup: 'sigma',
  blocks: [
    {
      ...WARM_UP,
      format: 'Flow',
      exercises: [
        ['BEAR CRAWL', 30, 's'],
        ['SCAP PULL UP', 10, 'reps'],
        ['CAT COW', 10, 'reps'],
      ],
    },
    {
      role: 'NUCLEUS',
      route: 'OAP',
      format: 'EMOM',
      formatParams: { type: 'emom', totalMinutes: 10 },
      zones: ['upper-back', 'biceps', 'forearm'],
      exercises: [
        ['PULL UP', 6, 'reps'],
        ['CHIN UP', 6, 'reps'],
        ['DEAD HANG', 20, 's'],
      ],
    },
    {
      role: 'DEUTEROS_1',
      route: 'FL',
      format: 'AMRAP Series',
      formatParams: { type: 'amrap_series', rounds: 3, minutes: 8 },
      zones: ['upper-back', 'abs', 'lower-back'],
      exercises: [
        ['TUCK FL HOLD', 15, 's'],
        ['FL RAISE TUCK', 6, 'reps'],
        ['HOLLOW BODY', 30, 's'],
        ['ARCH HOLD', 20, 's'],
      ],
    },
    {
      role: 'EPIKOS',
      route: 'TTB',
      format: 'Tabata',
      formatParams: null,
      zones: ['abs', 'obliques'],
      exercises: [
        ['HOLLOW ROCK', 20, 's'],
        ['V UP', 20, 's'],
        ['SIDE PLANK', 20, 's'],
      ],
    },
  ],
}

// "Muscle up" (S_MU del sketch)
const MUSCLE_UP: SampleSession = {
  levelGroup: 'sigma',
  blocks: [
    {
      ...WARM_UP,
      format: 'Flow',
      exercises: [
        ['BEAST WALK', 30, 'reps'],
        ['FALSE GRIP HANG', 20, 's'],
        ['SCAP DIP', 10, 'reps'],
      ],
    },
    {
      role: 'NUCLEUS',
      route: 'MU',
      format: 'EMOM',
      formatParams: { type: 'emom', totalMinutes: 12 },
      zones: ['upper-back', 'chest', 'triceps', 'biceps'],
      exercises: [
        ['MU NEGATIVE', 3, 'reps'],
        ['HIGH PULL UP', 5, 'reps'],
        ['STRAIGHT BAR DIP', 8, 'reps'],
      ],
    },
    {
      role: 'EPIKOS',
      route: 'L',
      format: 'For time',
      formatParams: null,
      zones: ['quadriceps', 'gluteal'],
      exercises: [
        ['AIR SQUAT', 50, 'reps'],
        ['JUMP LUNGE', 30, 'reps'],
        ['WALL SIT', 45, 's'],
      ],
    },
  ],
}

// Sábado de movilidad (ROM)
const MOBILITY: SampleSession = {
  levelGroup: 'sigma',
  blocks: [
    {
      role: 'ROM_LOWER',
      route: 'SPAGAT',
      format: 'Flow',
      formatParams: null,
      zones: ['quadriceps', 'hamstring', 'gluteal', 'adductors'],
      exercises: [
        ['PIGEON', 45, 's'],
        ['SPLIT STRETCH', 45, 's'],
        ['DEEP SQUAT HOLD', 45, 's'],
      ],
    },
    {
      role: 'ROM_CORE',
      route: 'BRIDGE',
      format: 'Flow',
      formatParams: null,
      zones: ['abs', 'obliques', 'lower-back'],
      exercises: [
        ['COBRA', 30, 's'],
        ['SIDE BEND', 30, 's'],
        ['CHILD POSE', 45, 's'],
      ],
    },
    {
      role: 'ROM_UPPER',
      route: 'HS',
      format: 'Flow',
      formatParams: null,
      zones: ['deltoids', 'upper-back', 'chest'],
      exercises: [
        ['SHOULDER DISLOCATES', 10, 'reps'],
        ['WALL CHEST OPENER', 30, 's'],
        ['THREAD THE NEEDLE', 30, 's'],
      ],
    },
  ],
}

// Lunes a domingo: el domingo queda sin plani
const WEEK_PLAN: readonly (readonly [string, SampleSession] | null)[] = [
  ['pull', PULL_AND_CORE],
  ['mu1', MUSCLE_UP],
  ['legs1', LEGS_AND_PUSH],
  ['mu2', MUSCLE_UP],
  ['legs2', LEGS_AND_PUSH],
  ['rom', MOBILITY],
  null,
]

function stateOf(date: string, index: number, today: string): DayState {
  if (index === 6) return 'rest'
  if (date === today) return 'today'
  return date < today ? 'completed' : 'future'
}

/**
 * Los 7 días de la semana que arranca en `monday` ("YYYY-MM-DD"), con la plani de ejemplo.
 * `today` (por defecto el lunes) decide qué días figuran como hechos (los anteriores) y cuál es
 * "hoy".
 * Contenido FIJO y sin llamadas al API (D-06).
 */
export function buildVidrieraWeek(monday: string, today: string = monday): WeekDay[] {
  return WEEK_PLAN.map((entry, index) => {
    const date = addDays(monday, index)
    return {
      date,
      dayName: DAY_NAMES[index],
      // 1 = lunes ... 6 = sábado, 0 = domingo (convención de Date.getDay)
      dayOfWeek: (index + 1) % 7,
      state: stateOf(date, index, today),
      session: entry ? buildSession(entry[0], entry[1]) : null,
    }
  })
}
