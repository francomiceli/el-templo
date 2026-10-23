import { describe, it, expect } from 'vitest'
import type { GrupoAlumnoInfo, MusculoAlumno, RutaAlumno } from '../../types'
import {
  PREFIJO_ADENTRO,
  encabezadoZona,
  gruposDelMusculo,
  musculoElegido,
  musculoPorDefecto,
  posicionFlecha,
  textoQueHace,
} from '../zonaSheet'

function musculo(fields: Partial<MusculoAlumno> & { id: string }): MusculoAlumno {
  return {
    nombre: fields.id.toUpperCase(),
    zona: { slug: 'upper-back', vista: 'back' },
    debajoDe: null,
    adentro: false,
    queHace: `Qué hace ${fields.id}`,
    grupos: { fuerte: [], sostiene: [], estira: [] },
    ...fields,
  }
}

function ruta(slug: string, nombre: string): RutaAlumno {
  return { slug, nombre, patron: 'PULL', zonas: [], fuerte: [], sostiene: [], fichaCorta: null }
}

const RUTAS: Record<string, RutaAlumno> = {
  dominadas: ruta('dominadas', 'Dominadas'),
  remos: ruta('remos', 'Remos'),
  'front-lever': ruta('front-lever', 'Front Lever'),
}
const resolver = (slug: string): RutaAlumno | null => RUTAS[slug] ?? null

const INFOS: GrupoAlumnoInfo[] = [
  { id: 'fuerte', frase: 'Hace el movimiento en', definicion: 'Def fuerte' },
  { id: 'sostiene', frase: 'Sostiene el movimiento en', definicion: 'Def sostiene' },
  { id: 'estira', frase: 'Se estira en', definicion: 'Def estira' },
]

describe('musculoPorDefecto', () => {
  it('es el primero de la zona (los propios van antes que los de adentro)', () => {
    const ms = [
      musculo({ id: 'dorsal' }),
      musculo({ id: 'romboides' }),
      musculo({ id: 'manguito', adentro: true, debajoDe: 'deltoids', zona: null }),
    ]
    expect(musculoPorDefecto(ms)).toBe('dorsal')
  })

  it('sin músculos devuelve null', () => {
    expect(musculoPorDefecto([])).toBeNull()
  })
})

describe('musculoElegido', () => {
  const ms = [musculo({ id: 'dorsal' }), musculo({ id: 'redondo' })]

  it('devuelve el pedido si está en la zona', () => {
    expect(musculoElegido(ms, 'redondo')?.id).toBe('redondo')
  })

  it('sin pedido cae en el principal', () => {
    expect(musculoElegido(ms, null)?.id).toBe('dorsal')
  })

  it('un id que no es de la zona (quedó de la zona anterior) cae en el principal', () => {
    expect(musculoElegido(ms, 'biceps')?.id).toBe('dorsal')
  })

  it('zona sin músculos devuelve null', () => {
    expect(musculoElegido([], 'dorsal')).toBeNull()
  })
})

describe('encabezadoZona', () => {
  it('varios músculos: kicker con el conteo, título con la zona y pills', () => {
    const ms = [musculo({ id: 'a' }), musculo({ id: 'b' }), musculo({ id: 'c' })]
    expect(encabezadoZona('Espalda alta', ms)).toEqual({
      kicker: '3 músculos',
      titulo: 'Espalda alta',
      conPills: true,
    })
  })

  it('cuenta los de adentro: Hombros con manguito son 2 músculos', () => {
    const ms = [
      musculo({ id: 'deltoides' }),
      musculo({ id: 'manguito', adentro: true, debajoDe: 'deltoids', zona: null }),
    ]
    expect(encabezadoZona('Hombros', ms)).toEqual({
      kicker: '2 músculos',
      titulo: 'Hombros',
      conPills: true,
    })
  })

  it('un solo músculo: sin pills y el título es el músculo; el kicker, la zona', () => {
    expect(
      encabezadoZona('Bíceps', [musculo({ id: 'biceps', nombre: 'Bíceps braquial' })]),
    ).toEqual({
      kicker: 'Bíceps',
      titulo: 'Bíceps braquial',
      conPills: false,
    })
  })

  it('un solo músculo y es de adentro: el kicker dice "Más adentro"', () => {
    const m = musculo({ id: 'psoas', nombre: 'Iliopsoas', adentro: true, zona: null })
    expect(encabezadoZona('Abdomen', [m])).toEqual({
      kicker: 'Más adentro',
      titulo: 'Iliopsoas',
      conPills: false,
    })
  })
})

describe('textoQueHace', () => {
  it('un músculo que se ve va tal cual', () => {
    expect(textoQueHace({ queHace: 'Tira del brazo hacia abajo.', adentro: false })).toBe(
      'Tira del brazo hacia abajo.',
    )
  })

  it('un músculo de adentro arranca con "Más adentro ·"', () => {
    expect(textoQueHace({ queHace: 'Mantiene el hombro centrado.', adentro: true })).toBe(
      `${PREFIJO_ADENTRO}Mantiene el hombro centrado.`,
    )
    expect(PREFIJO_ADENTRO).toBe('Más adentro · ')
  })
})

describe('gruposDelMusculo', () => {
  it('agrupa en hace / sostiene / se estira, en ese orden, con la frase y la definición del API', () => {
    const m = musculo({
      id: 'dorsal',
      grupos: { fuerte: ['dominadas', 'remos'], sostiene: ['front-lever'], estira: ['dominadas'] },
    })
    expect(gruposDelMusculo(m, INFOS, resolver)).toEqual([
      {
        id: 'fuerte',
        frase: 'Hace el movimiento en',
        definicion: 'Def fuerte',
        rutas: [
          { slug: 'dominadas', nombre: 'Dominadas' },
          { slug: 'remos', nombre: 'Remos' },
        ],
      },
      {
        id: 'sostiene',
        frase: 'Sostiene el movimiento en',
        definicion: 'Def sostiene',
        rutas: [{ slug: 'front-lever', nombre: 'Front Lever' }],
      },
      {
        id: 'estira',
        frase: 'Se estira en',
        definicion: 'Def estira',
        rutas: [{ slug: 'dominadas', nombre: 'Dominadas' }],
      },
    ])
  })

  it('omite los grupos vacíos y respeta el orden aunque falten los de arriba', () => {
    const m = musculo({
      id: 'manguito',
      grupos: { fuerte: [], sostiene: ['dominadas'], estira: ['remos'] },
    })
    expect(gruposDelMusculo(m, INFOS, resolver).map((g) => g.id)).toEqual(['sostiene', 'estira'])
  })

  it('omite las rutas que el store no conoce, y el grupo si se queda sin ninguna', () => {
    const m = musculo({
      id: 'x',
      grupos: { fuerte: ['no-existe'], sostiene: ['no-existe', 'remos'], estira: [] },
    })
    expect(gruposDelMusculo(m, INFOS, resolver)).toEqual([
      {
        id: 'sostiene',
        frase: 'Sostiene el movimiento en',
        definicion: 'Def sostiene',
        rutas: [{ slug: 'remos', nombre: 'Remos' }],
      },
    ])
  })

  it('una ruta repetida dentro del mismo grupo sale una sola vez', () => {
    const m = musculo({
      id: 'x',
      grupos: { fuerte: ['remos', 'remos', 'dominadas'], sostiene: [], estira: [] },
    })
    expect(gruposDelMusculo(m, INFOS, resolver)[0]?.rutas.map((r) => r.slug)).toEqual([
      'remos',
      'dominadas',
    ])
  })

  it('un grupo sin texto en infos (vista incompleta) no sale', () => {
    const m = musculo({ id: 'x', grupos: { fuerte: ['remos'], sostiene: ['remos'], estira: [] } })
    expect(
      gruposDelMusculo(
        m,
        INFOS.filter((g) => g.id === 'sostiene'),
        resolver,
      ).map((g) => g.id),
    ).toEqual(['sostiene'])
  })

  it('músculo sin ejercicios: lista vacía', () => {
    expect(gruposDelMusculo(musculo({ id: 'x' }), INFOS, resolver)).toEqual([])
  })
})

describe('posicionFlecha', () => {
  const globo = { left: 100, width: 300 }

  it('apunta al centro de la pill, relativo al borde izquierdo del globo', () => {
    expect(posicionFlecha({ left: 150, width: 80 }, globo)).toBe(90)
  })

  it('no se pega al borde izquierdo: mínimo 18px', () => {
    expect(posicionFlecha({ left: 90, width: 20 }, globo)).toBe(18)
  })

  it('no se pega al borde derecho: máximo ancho - 18px', () => {
    expect(posicionFlecha({ left: 380, width: 100 }, globo)).toBe(282)
  })

  it('con un globo más angosto que 2 márgenes no devuelve un valor menor al margen', () => {
    expect(posicionFlecha({ left: 0, width: 10 }, { left: 0, width: 20 })).toBe(18)
  })
})
