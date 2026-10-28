// Fase 201 DA-24: contenido de la guía "¿Cómo funciona?" (hallazgo 1 del UAT, sketch 022). Util
// pura: no pinta nada y no llama al API; la pantalla y la ruta son de 201-29. Donde el anexo §9 tiene
// el texto se usa `CQ_TEXTOS` de `format.ts` (nunca se copia el string acá).
import type { Level } from '../types'
import { CQ_TEXTOS, LEVEL_INFO, holdHelp } from './format'

export type GuideKey = 'serie' | 'numero' | 'apretar' | 'apertura' | 'subir' | 'molestia'

/** Un tramo de texto de la guía. `strong` marca el énfasis sin usar `v-html`. */
export interface GuideRun {
  text: string
  strong?: boolean
}

export interface GuideScreen {
  key: GuideKey
  title: string
  lead: GuideRun[]
  foot: GuideRun[]
  /** Descripción de la ilustración (accesibilidad): qué muestra el dibujo de la pantalla. */
  artLabel: string
}

// Anexo §7: piso y techo de la progresión. Piso 3 reps o 4 s; techo 8 reps o 12 s. El techo se
// tiene que alcanzar dos sesiones seguidas para que el escalón pida subir.
export const GUIDE_FLOOR = { reps: 3, s: 4 } as const
export const GUIDE_CEILING = { reps: 8, s: 12 } as const

// Igual a `PAIN_ALERT_MIN` de `el-templo-api/src/modules/conquer/rules.ts` (el app no importa del
// API): desde esta molestia (0 a 10) el coach ve la alerta.
export const GUIDE_PAIN_MIN = 4

// Anexo §1: ejemplos de fallo por tipo de ejercicio (brazos rectos = técnico, flexionados = muscular).
export const GUIDE_FAILURE_EXAMPLES = {
  rectos: 'Planche hold, planche press, front lever.',
  flexionados: 'HSPU, dominadas, muscle-up.',
} as const

const LEVELS: readonly Level[] = ['ternero', 'novillo', 'toro']

function plain(text: string): GuideRun {
  return { text }
}

function strong(text: string): GuideRun {
  return { text, strong: true }
}

/** Texto corrido de los tramos (para lectores de pantalla y para los tests). */
export function plainRuns(runs: GuideRun[]): string {
  return runs.map((run) => run.text).join('')
}

/** "Sos Toro" + lo que significa el nivel (anexo §9); sin nivel no hay línea. */
export function guideLevelLine(level: Level | null): { title: string; text: string } | null {
  if (level === null) return null
  return { title: `Sos ${LEVEL_INFO[level].name}`, text: LEVEL_INFO[level].text }
}

/** Pantalla 3: lo que piden los OTROS dos niveles (el propio ya se lee debajo de cada contador). */
function otherLevelsRuns(level: Level | null): GuideRun[] {
  if (level === null) return []
  const runs: GuideRun[] = []
  for (const other of LEVELS) {
    if (other === level) continue
    if (runs.length > 0) runs.push(plain(' '))
    runs.push(plain(`${LEVEL_INFO[other].name}: ${LEVEL_INFO[other].text}`))
  }
  return runs
}

function screenSerie(): GuideScreen {
  return {
    key: 'serie',
    title: 'La serie Conquer',
    lead: [
      plain('Tres escalones '),
      strong('seguidos, sin descanso'),
      plain(', y un hold final. Cada escalón es un poco más fácil que el anterior.'),
    ],
    foot: [
      plain('Eso es '),
      strong('una serie'),
      plain('. Hacés 3 series de cada ejercicio y descansás entre una serie y otra.'),
    ],
    artLabel: 'Escalón 1, escalón 2 y escalón 3 seguidos, y el hold final',
  }
}

function screenNumero(level: Level | null): GuideScreen {
  return {
    key: 'numero',
    title: 'Anotás un número por escalón',
    lead: [
      strong(CQ_TEXTOS.ayuda_carga),
      plain(' Viene cargado con tu objetivo: si lo cumpliste, guardás sin tocar nada.'),
    ],
    foot: [
      plain(level === null ? CQ_TEXTOS.ayuda_hold : holdHelp(level)),
      plain(' '),
      plain(CQ_TEXTOS.ayuda_unilateral),
    ],
    artLabel: 'Series de 7, 6 y 5 repeticiones: se anota 5',
  }
}

function screenApretar(level: Level | null): GuideScreen {
  return {
    key: 'apretar',
    title: 'Hasta dónde apretar',
    lead: [plain('Depende de tu nivel y del ejercicio. Debajo de cada contador te lo recordamos.')],
    foot: otherLevelsRuns(level),
    artLabel: 'Brazos rectos: fallo técnico. Brazos flexionados: fallo muscular',
  }
}

function screenApertura(): GuideScreen {
  return {
    key: 'apertura',
    title: 'Apertura y sábado',
    lead: [
      plain('Como Espartano, cada día '),
      strong('arranca con un combo'),
      plain(', en fresco y al fallo.'),
    ],
    foot: [plain(CQ_TEXTOS.combo)],
    artLabel: 'Press, después push, después hold. El sábado, combo push y combo pull',
  }
}

// Corrección contra el sketch: Subir de un escalón se toca en Progreso (Hoy solo tiene el Subir
// del combo).
function screenSubir(): GuideScreen {
  return {
    key: 'subir',
    title: 'Cuándo aparece Subir',
    lead: [
      plain('Si llegás al '),
      strong('techo dos sesiones seguidas'),
      plain(` (${GUIDE_CEILING.reps} reps o ${GUIDE_CEILING.s} s), ese escalón te pide subir.`),
    ],
    foot: [
      plain('No hace falta esperar a tu coach: tocás '),
      strong('Subir'),
      plain(' en Progreso. Si suben dos escalones del mismo ejercicio, primero el escalón 1.'),
    ],
    artLabel: 'Techo una vez, techo dos veces seguidas, Subir',
  }
}

function screenMolestia(): GuideScreen {
  return {
    key: 'molestia',
    title: 'Si algo te molesta',
    lead: [
      plain('Antes de guardar, marcá de '),
      strong('0 a 10'),
      plain(' cuánto te molestó una articulación (codo, hombro). 0 es nada.'),
    ],
    foot: [
      plain(
        `Con ${GUIDE_PAIN_MIN} o más, tu coach lo ve y te ajusta la carga. Marcá lo que sentiste, aunque sea poco.`,
      ),
    ],
    artLabel: `Escala de 0 a 10: desde ${GUIDE_PAIN_MIN} lo ve tu coach`,
  }
}

/**
 * Pantallas de la guía según el nivel: 6 para Toro (con "Apertura y sábado") y 5 para Ternero,
 * Novillo y sin nivel. El orden es siempre el del sketch.
 */
export function guideScreens(level: Level | null): GuideScreen[] {
  const screens: GuideScreen[] = [screenSerie(), screenNumero(level), screenApretar(level)]
  if (level === 'toro') screens.push(screenApertura())
  screens.push(screenSubir(), screenMolestia())
  return screens
}
