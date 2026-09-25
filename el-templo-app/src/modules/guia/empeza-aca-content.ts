/**
 * "Empezá acá" — contenido de las historias de bienvenida (SPEC B).
 *
 * ARCHIVO DE DATOS ÚNICO: todo el texto que ve el socio en `/empeza-aca` vive
 * acá. Reemplazar el contenido final (marcado `// TODO-CONTENIDO`) es editar
 * SOLO este archivo — el componente (`EmpezaAcaPage.vue`) no cambia.
 *
 * Los textos de hoy son PROVISORIOS: se basan en lo que ya dice la Guía
 * (`GuiaPage.vue`) y en el inventario de la SPEC, para que la funcionalidad
 * sea probable de punta a punta antes de que Franco pase el contenido final.
 *
 * `durationMs` es OPCIONAL y hoy ningún slide lo usa (SPEC: "por defecto SIN
 * autoavance, el socio avanza a su ritmo porque son textos"). El componente
 * SÍ soporta autoavance + mantener-apretado-para-pausar si en el futuro un
 * slide define `durationMs` — no hace falta tocar `EmpezaAcaPage.vue`.
 */

export interface EmpezaAcaSlide {
  id: string
  kicker?: string
  title: string
  body: string[]
  bullets?: string[]
  /** Nombre de ícono de Quasar/Material (`<q-icon name="...">`). */
  icon?: string
  cta?: {
    label: string
    /** Nombre de ruta (`router.push({ name })`). */
    routeName: string
  }
  /** Autoavance opcional en ms. `undefined` = sin autoavance (default). */
  durationMs?: number
}

export const EMPEZA_ACA_SLIDES: EmpezaAcaSlide[] = [
  {
    id: 'bienvenida',
    // TODO-CONTENIDO
    kicker: 'Bienvenido/a',
    title: 'Empezá acá',
    body: [
      'En El Templo entrenamos distinto: cada clase tiene una estructura clara y un plan pensado para vos.',
      'Estas pantallas te cuentan lo básico en un minuto — después las volvés a ver cuando quieras desde la Guía.',
    ],
    icon: 'auto_stories',
  },
  {
    id: 'semana',
    // TODO-CONTENIDO
    kicker: 'Tu semana',
    title: 'Cómo es una semana',
    body: [
      'Tu semana de entrenamiento tiene un plan armado día por día, con una ruta distinta según tu nivel y tus objetivos.',
      'No hace falta que la memorices: cada día que entrás a Entrenar te mostramos exactamente qué toca hoy.',
    ],
    icon: 'calendar_month',
  },
  {
    id: 'clase',
    // TODO-CONTENIDO
    kicker: 'La clase',
    title: 'Qué pasa en una clase',
    body: [
      'Cada sesión se arma en bloques: Initium (entrada en calor), Nucleus (el trabajo principal), Deuteros (elegís entre dos opciones) y Athlos o Epikos (el desafío final).',
    ],
    bullets: [
      'Initium: activación y movilidad',
      'Nucleus: el bloque principal de la sesión',
      'Deuteros: elegís una de dos opciones',
      'Athlos / Epikos: el desafío final',
    ],
    icon: 'view_module',
    cta: { label: 'Ver la Guía completa', routeName: 'guia' },
  },
  {
    id: 'niveles',
    // TODO-CONTENIDO
    kicker: 'Tu progreso',
    title: 'Los niveles y cómo se avanza',
    body: [
      'Arrancás en un nivel y vas subiendo a medida que entrenás: Kairos, Alfa, Delta, Sigma, Omega y Spartan.',
      'Podés MIRAR un nivel distinto al tuyo para ver cómo sigue el camino, pero el que cuenta para tu progreso es siempre el que te asignamos — lo vas a ver aclarado arriba, en el selector de nivel.',
    ],
    icon: 'military_tech',
  },
  {
    id: 'app',
    // TODO-CONTENIDO
    kicker: 'La app',
    title: 'Cómo usar la app',
    body: [
      'Desde Reservas anotate a tus clases con anticipación.',
      'Cuando llegás a la sede, escaneá el QR de la recepción para dar presente — el botón redondo con la cámara te lleva directo ahí.',
      'Y en Entrenar siempre vas a ver la sesión del día lista para arrancar.',
    ],
    icon: 'smartphone',
  },
  {
    id: 'online',
    // TODO-CONTENIDO
    kicker: 'Además',
    title: 'Curso online',
    body: [
      'También tenés disponible contenido online para entrenar por tu cuenta o complementar lo que hacés en sede.',
      'Lo encontrás en Planes, dentro de la sección de programas.',
    ],
    icon: 'ondemand_video',
  },
  {
    id: 'cierre',
    // TODO-CONTENIDO
    kicker: 'Listo',
    title: 'Ahora sí, ¡a entrenar!',
    body: ['Reservá tu primera clase y te vemos en la sede.'],
    icon: 'celebration',
    cta: { label: 'Reservá tu primera clase', routeName: 'reservas' },
  },
]
