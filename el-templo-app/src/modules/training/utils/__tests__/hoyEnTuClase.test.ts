import { describe, it, expect } from 'vitest'
import type { ZoneSlug } from 'src/components/anatomy/zones'
import type { HitsZona, RutaHit } from 'src/modules/anatomy/types'
import type { Block, BlockRole } from '../../types/session'
import { frasesDeGrupos, resumenHoyEnTuClase, textoLinea, type FrasesGrupo } from '../hoyEnTuClase'

const FRASES: FrasesGrupo = {
  fuerte: 'Hace el movimiento en',
  sostiene: 'Sostiene el movimiento en',
  estira: 'Se estira en',
}

function hit(rutas: RutaHit[], extra: Partial<HitsZona> = {}): HitsZona {
  return { fuerte: [], sostiene: [], estira: [], rutas, ...extra }
}

function bloque(
  role: BlockRole,
  route: string,
  zoneHits: Partial<Record<ZoneSlug, HitsZona>> | undefined,
  blockId = `${role}-${route}`,
): Block {
  return {
    blockId,
    role,
    route,
    pattern: 'General',
    intensity: 5,
    repsBudget: 0,
    format: 'Cluster',
    formatParams: null,
    formatDescription: null,
    sortOrder: 0,
    zoneHits,
    exercises: [],
    mobilityExercise: null,
  }
}

const f = (ruta: string, grupo: RutaHit['grupo']): RutaHit => ({ ruta, grupo })

describe('resumenHoyEnTuClase', () => {
  it('sin bloques o sin bloques que toquen la zona: vacío', () => {
    expect(resumenHoyEnTuClase([], 'upper-back', FRASES)).toEqual([])
    const b = bloque('NUCLEUS', 'OAP', { chest: hit([f('OAP', 'fuerte')]) })
    expect(resumenHoyEnTuClase([b], 'upper-back', FRASES)).toEqual([])
  })

  it('payload viejo sin zoneHits: vacío', () => {
    expect(
      resumenHoyEnTuClase([bloque('NUCLEUS', 'OAP', undefined)], 'upper-back', FRASES),
    ).toEqual([])
  })

  it('nombres de RUTA (no códigos), una línea por grupo con su frase del API', () => {
    const b = bloque('NUCLEUS', 'OAP', {
      'upper-back': hit([f('OAP', 'fuerte'), f('FL', 'sostiene'), f('PL', 'estira')]),
    })
    const lineas = resumenHoyEnTuClase([b], 'upper-back', FRASES)
    expect(lineas).toEqual([
      { id: 'fuerte', rotulo: 'Hace el movimiento en', nombres: ['Dominadas'] },
      { id: 'sostiene', rotulo: 'Sostiene el movimiento en', nombres: ['Front Lever'] },
      { id: 'estira', rotulo: 'Se estira en', nombres: ['Planche'] },
    ])
    expect(lineas.map(textoLinea)).toEqual([
      'Hace el movimiento en: Dominadas',
      'Sostiene el movimiento en: Front Lever',
      'Se estira en: Planche',
    ])
  })

  it('agrega ACROSS bloques: varias rutas en un grupo en orden de aparición', () => {
    const bs = [
      bloque('DEUTEROS_1', 'FL', { 'upper-back': hit([f('FL', 'fuerte')]) }),
      bloque('EPIKOS', 'MU', { 'upper-back': hit([f('MU', 'fuerte')]) }),
    ]
    const lineas = resumenHoyEnTuClase(bs, 'upper-back', FRASES)
    expect(lineas.map(textoLinea)).toEqual(['Hace el movimiento en: Front Lever · Muscle Up'])
  })

  it('la misma ruta en varios bloques sale una sola vez', () => {
    const bs = [
      bloque('NUCLEUS', 'OAP', { 'upper-back': hit([f('OAP', 'fuerte')]) }, 'a'),
      bloque('DEUTEROS_1', 'OAP', { 'upper-back': hit([f('OAP', 'fuerte')]) }, 'b'),
    ]
    expect(resumenHoyEnTuClase(bs, 'upper-back', FRASES)).toEqual([
      { id: 'fuerte', rotulo: 'Hace el movimiento en', nombres: ['Dominadas'] },
    ])
  })

  it('la misma ruta con grupos distintos en bloques distintos se queda con el más fuerte', () => {
    const bs = [
      bloque('NUCLEUS', 'FL', { 'upper-back': hit([f('FL', 'estira')]) }, 'a'),
      bloque('DEUTEROS_1', 'FL', { 'upper-back': hit([f('FL', 'fuerte')]) }, 'b'),
      bloque('EPIKOS', 'FL', { 'upper-back': hit([f('FL', 'sostiene')]) }, 'c'),
    ]
    expect(resumenHoyEnTuClase(bs, 'upper-back', FRASES)).toEqual([
      { id: 'fuerte', rotulo: 'Hace el movimiento en', nombres: ['Front Lever'] },
    ])
  })

  it('sostiene gana a estira aunque estira aparezca primero, y no deja la ruta en los dos', () => {
    const bs = [
      bloque('NUCLEUS', 'OAP', { 'upper-back': hit([f('OAP', 'estira'), f('FL', 'estira')]) }, 'a'),
      bloque('DEUTEROS_1', 'OAP', { 'upper-back': hit([f('OAP', 'sostiene')]) }, 'b'),
    ]
    expect(resumenHoyEnTuClase(bs, 'upper-back', FRASES)).toEqual([
      { id: 'sostiene', rotulo: 'Sostiene el movimiento en', nombres: ['Dominadas'] },
      { id: 'estira', rotulo: 'Se estira en', nombres: ['Front Lever'] },
    ])
  })

  it('los grupos salen siempre en orden fuerte, sostiene, estira sin importar el de los bloques', () => {
    const bs = [
      bloque('NUCLEUS', 'PL', { 'upper-back': hit([f('PL', 'estira')]) }, 'a'),
      bloque('DEUTEROS_1', 'FL', { 'upper-back': hit([f('FL', 'sostiene')]) }, 'b'),
      bloque('EPIKOS', 'MU', { 'upper-back': hit([f('MU', 'fuerte')]) }, 'c'),
    ]
    expect(resumenHoyEnTuClase(bs, 'upper-back', FRASES).map((l) => l.id)).toEqual([
      'fuerte',
      'sostiene',
      'estira',
    ])
  })

  it('un bloque ROM (movilidad, sin rutas) suma "Movilidad en: <nombre del bloque>" al final', () => {
    const bs = [
      bloque('NUCLEUS', 'OAP', { 'upper-back': hit([f('OAP', 'fuerte')]) }, 'a'),
      bloque('ROM_UPPER', '', { 'upper-back': hit([], { movilidad: true }) }, 'b'),
    ]
    const lineas = resumenHoyEnTuClase(bs, 'upper-back', FRASES)
    expect(lineas.map(textoLinea)).toEqual([
      'Hace el movimiento en: Dominadas',
      'Movilidad en: Movilidad · ROM',
    ])
    expect(lineas[1]?.id).toBe('movilidad')
  })

  it('un bloque sin detalle suma "También la trabaja: <nombre del bloque>" después de movilidad', () => {
    const bs = [
      bloque('TECNICA_I', '', { 'upper-back': hit([], { sinDetalle: true }) }, 'a'),
      bloque('ROM_UPPER', '', { 'upper-back': hit([], { movilidad: true }) }, 'b'),
    ]
    expect(resumenHoyEnTuClase(bs, 'upper-back', FRASES).map(textoLinea)).toEqual([
      'Movilidad en: Movilidad · ROM',
      'También la trabaja: Técnica I',
    ])
  })

  it('movilidad y sin detalle de varios bloques se juntan sin repetir nombres', () => {
    const bs = [
      bloque('ROM_UPPER', '', { chest: hit([], { movilidad: true }) }, 'a'),
      bloque('ROM_CORE', '', { chest: hit([], { movilidad: true }) }, 'b'),
      bloque('INITIUM', '', { chest: hit([], { movilidad: true }) }, 'c'),
    ]
    expect(resumenHoyEnTuClase(bs, 'chest', FRASES).map(textoLinea)).toEqual([
      'Movilidad en: Movilidad · ROM · Entrada en calor',
    ])
  })

  it('solo mira la zona pedida', () => {
    const b = bloque('NUCLEUS', 'OAP', {
      'upper-back': hit([f('OAP', 'fuerte')]),
      chest: hit([f('OAPU', 'fuerte')]),
    })
    expect(resumenHoyEnTuClase([b], 'chest', FRASES).map(textoLinea)).toEqual([
      'Hace el movimiento en: Push Ups',
    ])
  })

  it('un hit sin rutas ni banderas (payload incompleto) no genera líneas ni rompe', () => {
    const b = bloque('NUCLEUS', 'OAP', { 'upper-back': hit([]) })
    expect(resumenHoyEnTuClase([b], 'upper-back', FRASES)).toEqual([])
    const sinRutas = bloque('NUCLEUS', 'OAP', {
      'upper-back': { fuerte: [], sostiene: [], estira: [] } as unknown as HitsZona,
    })
    expect(resumenHoyEnTuClase([sinRutas], 'upper-back', FRASES)).toEqual([])
  })

  it('un código de ruta que el diccionario no conoce sale tal cual (como en el resto de la app)', () => {
    const b = bloque('NUCLEUS', 'XYZ', { 'upper-back': hit([f('XYZ', 'fuerte')]) })
    expect(resumenHoyEnTuClase([b], 'upper-back', FRASES).map(textoLinea)).toEqual([
      'Hace el movimiento en: XYZ',
    ])
  })

  it('usa las frases que recibe (siguen al API)', () => {
    const b = bloque('NUCLEUS', 'OAP', { 'upper-back': hit([f('OAP', 'fuerte')]) })
    const otras: FrasesGrupo = { fuerte: 'A', sostiene: 'B', estira: 'C' }
    expect(resumenHoyEnTuClase([b], 'upper-back', otras).map(textoLinea)).toEqual(['A: Dominadas'])
  })
})

describe('frasesDeGrupos', () => {
  it('arma las frases desde vista.grupos', () => {
    expect(
      frasesDeGrupos([
        { id: 'estira', frase: 'Se estira en' },
        { id: 'fuerte', frase: 'Hace el movimiento en' },
        { id: 'sostiene', frase: 'Sostiene el movimiento en' },
      ]),
    ).toEqual(FRASES)
  })

  it('devuelve null si no hay grupos o falta alguno', () => {
    expect(frasesDeGrupos(undefined)).toBeNull()
    expect(frasesDeGrupos([])).toBeNull()
    expect(frasesDeGrupos([{ id: 'fuerte', frase: 'x' }])).toBeNull()
    expect(
      frasesDeGrupos([
        { id: 'fuerte', frase: 'x' },
        { id: 'sostiene', frase: '' },
        { id: 'estira', frase: 'z' },
      ]),
    ).toBeNull()
  })
})
