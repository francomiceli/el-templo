/**
 * "Empezá acá" — contenido de las historias de bienvenida (SPEC B).
 *
 * ARCHIVO DE DATOS ÚNICO: todo el texto que ve el socio en `/empeza-aca` vive
 * acá. Reemplazar contenido es editar SOLO este archivo — el componente
 * (`EmpezaAcaPage.vue`) no cambia.
 *
 * CONTENIDO FINAL aprobado texto por texto por Franco 2026-09-24 (usado
 * LITERAL — ver CONTENIDO-empeza-aca.md). Niveles visibles: Kairos, Alfa,
 * Delta, Sigma, Omega (NO Spartan, NO Olympic) — mismo orden que
 * `TRAINING_LEVELS` en `../training/level-display.ts`, que es también la
 * fuente de los glifos (☉ α Δ Σ Ω), no hardcodeados acá.
 *
 * `theme` por slide sigue el criterio de SPEC "La Guía pasa a ser las
 * historias" (2026-09-24) punto 3: misma semántica que la pantalla de TV de
 * sede (`TvScreenPage.vue`) — `'noche'` (reposo/cierre, velo oscuro) para
 * Bienvenida y Cierre, `'dia'` (pre-clase/contenido, velo claro) para el
 * resto. `semana` y `avanzar` pasan de oscuro a `'dia'` respecto a la versión
 * anterior de este archivo (eran las únicas 2 de las 5 slides "de contenido"
 * que estaban en oscuro) — el criterio ahora es 100% "reposo/cierre vs.
 * contenido", no alternancia visual.
 */
import type { BlockRole } from '../training/types/session'
import type { Level } from '../training/level-display'

export type StorySlideTheme = 'dia' | 'noche'

/** Bullet con un lead en negrita (p. ej. "Reservas") + el resto del texto. */
export interface StoryBullet {
  bold: string
  rest: string
}

export interface StoryBlockRow {
  role: BlockRole
  label: string
  description: string
}

export interface StoryLevelRow {
  level: Level
  phrase: string
}

interface SlideBase {
  id: string
  theme: StorySlideTheme
  kicker: string
  title: string
  footnote?: string
}

export interface TextSlide extends SlideBase {
  type: 'text'
  body?: string[]
  bullets?: StoryBullet[]
}

export interface BlocksSlide extends SlideBase {
  type: 'blocks'
  blocks: StoryBlockRow[]
}

export interface LevelsSlide extends SlideBase {
  type: 'levels'
  levels: StoryLevelRow[]
}

export interface CtaSlide extends SlideBase {
  type: 'cta'
  body?: string[]
  cta: { label: string; routeName: string }
  secondaryCta?: { label: string; routeName: string }
}

export type EmpezaAcaSlide = TextSlide | BlocksSlide | LevelsSlide | CtaSlide

export const EMPEZA_ACA_SLIDES: EmpezaAcaSlide[] = [
  {
    id: 'bienvenida',
    type: 'text',
    theme: 'noche',
    kicker: 'TE DAMOS LA BIENVENIDA',
    title: 'Una escuela de calistenia. No un gimnasio.',
    body: [
      'Acá entrenás con tu propio cuerpo, con un método progresivo diseñado por Ignacio Bordón. Cada clase tiene estructura y cada nivel, un propósito.',
      'En un minuto te contamos cómo funciona.',
    ],
  },
  {
    id: 'semana',
    type: 'text',
    theme: 'dia',
    kicker: 'TU SEMANA',
    title: 'Cada día tiene su foco',
    bullets: [
      {
        bold: 'Calistenia general',
        rest: ' · 3 días — la base del método: fuerza, control y resistencia.',
      },
      {
        bold: 'Técnica',
        rest: ' · 1 día — un skill por día (handstand, muscle up, front lever, planche…): dos bloques del skill y uno de stretching.',
      },
      {
        bold: 'Combos',
        rest: ' · 1 día — ejercicios encadenados, sin pausa.',
      },
      {
        bold: 'ROM',
        rest: ' · sábados a la mañana — movilidad y rango de movimiento.',
      },
      {
        bold: 'Open gym',
        rest: ' · algunos sábados a la tarde — encuentros libres en alguna sede. Estate atento a los avisos de la app.',
      },
    ],
  },
  {
    id: 'clase',
    type: 'blocks',
    theme: 'dia',
    kicker: 'CADA CLASE',
    title: '1 hora, 4 bloques',
    footnote: 'En Entrenar, tocá ⓘ en cada bloque para ver para qué sirve.',
    blocks: [
      {
        role: 'INITIUM',
        label: 'Initium',
        description: 'movilidad, activación y entrada en calor. Se empieza con intención, no con apuro.',
      },
      {
        role: 'NUCLEUS',
        label: 'Nucleus',
        description: 'el corazón de la sesión: el movimiento principal del día.',
      },
      {
        role: 'DEUTEROS_1',
        label: 'Deuteros',
        description: 'técnica y control. Elegís entre dos opciones.',
      },
      {
        role: 'ATHLOS',
        label: 'Athlos / Epikos',
        description: 'el desafío final. Se termina con energía, no con agotamiento.',
      },
    ],
  },
  {
    id: 'niveles',
    type: 'levels',
    theme: 'dia',
    kicker: 'TU CAMINO',
    title: 'Cinco niveles, un solo método',
    levels: [
      { level: 'kairos', phrase: 'La puerta de entrada. Ejercicios de Alfa en formatos simples, para arrancar sin miedo.' },
      { level: 'alfa', phrase: 'Donde todo empieza. Patrones básicos de fuerza, movilidad y control.' },
      { level: 'delta', phrase: 'El cambio se siente.' },
      { level: 'sigma', phrase: 'La fuerza se vuelve lenguaje.' },
      { level: 'omega', phrase: 'Donde los límites se reescriben.' },
    ],
  },
  {
    id: 'avanzar',
    type: 'text',
    theme: 'dia',
    kicker: 'SUBIR DE NIVEL',
    title: 'Tus profes te evalúan',
    body: [
      'No se sube por antigüedad: se sube cuando tu cuerpo está listo, y eso lo deciden tus profes en una evaluación.',
      'Cuando tus sesiones te resultan cómodas (esfuerzo promedio de 6 o menos durante dos semanas), vas a poder pedir tu evaluación desde Mi Templo.',
    ],
  },
  {
    id: 'app',
    type: 'text',
    theme: 'dia',
    kicker: 'LA APP',
    title: 'Todo en tu bolsillo',
    bullets: [
      {
        bold: 'Reservas',
        rest: ' — reservá tu lugar. Si reservás con anticipación, te avisamos antes de que empiece la clase.',
      },
      {
        bold: 'Dar presente',
        rest: ' — al llegar, escaneá el QR de la entrada de tu sede con el botón ▣ de Mi Templo.',
      },
      {
        bold: 'Entrenar',
        rest: ' — la sesión del día, bloque por bloque, con los mismos ejercicios de la clase presencial. Para repasar o no cortar la racha cuando no podés venir.',
      },
      {
        bold: 'Guía',
        rest: ' — formatos, rutas e intensidad.',
      },
    ],
  },
  {
    id: 'cierre',
    type: 'cta',
    theme: 'noche',
    kicker: 'EMPEZÁ',
    title: 'El método funciona si vos venís.',
    body: ['Nos vemos en la próxima clase.'],
    cta: { label: 'Reservá tu próxima clase', routeName: 'reservas' },
    secondaryCta: { label: 'Ver la Guía', routeName: 'guia' },
  },
]
