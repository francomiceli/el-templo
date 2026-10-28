import { describe, it, expect } from 'vitest'
import type { GrupoAlumnoInfo, MusculoAlumno, RutaAlumno } from '../../types'
import {
  PREFIJO_ADENTRO,
  gruposDelMusculo,
  musculoElegido,
  musculoPorDefecto,
  posicionFlecha,
  scrollParaPill,
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

describe('scrollParaPill', () => {
  it('lleva la pill al principio de la fila respetando el padding', () => {
    // Fila en x=0 con padding 18; pill a 230 px y la fila sin desplazar -> 212
    expect(scrollParaPill(0, 230, 0, 18)).toBe(212)
  })

  it('suma lo que la fila ya estaba desplazada', () => {
    // Ya desplazada 100: la pill se ve en 130 -> 100 + 130 - 18
    expect(scrollParaPill(100, 130, 0, 18)).toBe(212)
  })

  it('la primera pill no desplaza nada (nunca negativo)', () => {
    expect(scrollParaPill(0, 18, 0, 18)).toBe(0)
    expect(scrollParaPill(0, 10, 0, 18)).toBe(0)
  })

  it('tiene en cuenta dónde arranca la fila en la pantalla y redondea', () => {
    expect(scrollParaPill(0, 250.6, 20, 18)).toBe(213)
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
