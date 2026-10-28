import { describe, it, expect } from 'vitest'
import { resolvePlanesView, type PlanesViewInput } from '../planes-view'

// Todo resuelto, 3 planes, catálogo con 2, my-progress OK sin inscripción, perfil cargado.
function baseInput(over: Partial<PlanesViewInput> = {}): PlanesViewInput {
  return {
    summarySettled: true,
    summaryFailed: false,
    summaryRetrying: false,
    profileReady: true,
    plansSettled: true,
    plansFailed: false,
    plansRetrying: false,
    plansCount: 3,
    catalogSettled: true,
    catalogCount: 2,
    myProgressSettled: true,
    myProgressFailed: false,
    hasEnrollment: false,
    deadlinePassed: false,
    ...over,
  }
}

const NOTHING: Partial<PlanesViewInput> = {
  summarySettled: false,
  profileReady: false,
  plansSettled: false,
  plansCount: 0,
  catalogSettled: false,
  catalogCount: 0,
  myProgressSettled: false,
}

describe('resolvePlanesView', () => {
  it('nada resuelto y sin tope: página en esqueleto, las tres secciones en su orden', () => {
    expect(resolvePlanesView(baseInput(NOTHING))).toEqual({
      page: 'skeleton',
      tuPlan: 'skeleton',
      objetivos: 'skeleton',
      regulares: 'skeleton',
      enrollment: 'unknown',
    })
  })

  it('todo resuelto: secciones completas', () => {
    expect(resolvePlanesView(baseInput())).toEqual({
      page: 'sections',
      tuPlan: 'show',
      objetivos: 'show',
      regulares: 'content',
      enrollment: 'known',
    })
  })

  it('todo resuelto con planes vacíos (2xx): regulares vacío', () => {
    const v = resolvePlanesView(baseInput({ plansCount: 0 }))
    expect(v.page).toBe('sections')
    expect(v.regulares).toBe('empty')
  })

  it('planes caídos: un error no se muestra como vacío y sale al instante sin esperar el tope', () => {
    const v = resolvePlanesView(baseInput({ plansFailed: true, plansCount: 0 }))
    expect(v.page).toBe('sections')
    expect(v.regulares).toBe('error')
    expect(v.regulares).not.toBe('empty')
  })

  it('planes caídos con el tope vencido: sigue siendo error, nunca vacío', () => {
    const v = resolvePlanesView(
      baseInput({ plansFailed: true, plansCount: 0, deadlinePassed: true }),
    )
    expect(v.regulares).toBe('error')
  })

  it('planes caídos con el resumen pendiente: regulares en esqueleto hasta que llegue el resumen', () => {
    const v = resolvePlanesView(
      baseInput({
        plansFailed: true,
        plansCount: 0,
        summarySettled: false,
        deadlinePassed: true,
      }),
    )
    expect(v.regulares).toBe('skeleton')
  })

  it('reintento de planes: los regulares vuelven al esqueleto pero la página no', () => {
    const v = resolvePlanesView(baseInput({ plansRetrying: true, plansCount: 0 }))
    expect(v.page).toBe('sections')
    expect(v.regulares).toBe('skeleton')
    expect(v.tuPlan).toBe('show')
    expect(v.objetivos).toBe('show')
  })

  it('catálogo resuelto vacío: Por objetivos oculto (nunca reordena)', () => {
    const v = resolvePlanesView(baseInput({ catalogCount: 0 }))
    expect(v.objetivos).toBe('hide')
    expect(v.regulares).toBe('content')
  })

  it('catálogo fallido (cuenta como resuelto, 0 objetivos): Por objetivos oculto al instante', () => {
    const v = resolvePlanesView(baseInput({ catalogSettled: true, catalogCount: 0 }))
    expect(v.page).toBe('sections')
    expect(v.objetivos).toBe('hide')
  })

  it('resumen fallido sin dato: tuPlan error al instante y el resto sale sin esperar el tope', () => {
    const v = resolvePlanesView(baseInput({ summaryFailed: true }))
    expect(v.page).toBe('sections')
    expect(v.tuPlan).toBe('error')
    expect(v.regulares).toBe('content')
    expect(v.objetivos).toBe('show')
  })

  it('resumen fallido con el tope vencido: tuPlan sigue en error', () => {
    const v = resolvePlanesView(baseInput({ summaryFailed: true, deadlinePassed: true }))
    expect(v.tuPlan).toBe('error')
  })

  it('resumen en reintento con el resto resuelto: tuPlan esqueleto, los regulares no vuelven al esqueleto', () => {
    const v = resolvePlanesView(baseInput({ summaryRetrying: true, summaryFailed: false }))
    expect(v.page).toBe('sections')
    expect(v.tuPlan).toBe('skeleton')
    expect(v.regulares).toBe('content')
    expect(v.objetivos).toBe('show')
  })

  it('sin perfil y con el tope vencido: tuPlan esqueleto (D-08), las otras secciones salen', () => {
    const v = resolvePlanesView(baseInput({ profileReady: false, deadlinePassed: true }))
    expect(v.page).toBe('sections')
    expect(v.tuPlan).toBe('skeleton')
    expect(v.objetivos).toBe('show')
    expect(v.regulares).toBe('content')
  })

  it('sin perfil y antes del tope, con todo lo demás resuelto: página en esqueleto', () => {
    const v = resolvePlanesView(baseInput({ profileReady: false }))
    expect(v.page).toBe('skeleton')
    expect(v.tuPlan).toBe('skeleton')
  })

  it('tope vencido con planes resueltos y catálogo pendiente: objetivos reserva su lugar', () => {
    const v = resolvePlanesView(
      baseInput({ catalogSettled: false, catalogCount: 0, deadlinePassed: true }),
    )
    expect(v.page).toBe('sections')
    expect(v.objetivos).toBe('skeleton')
    expect(v.regulares).toBe('content')
  })

  it('tope vencido con planes resueltos y resumen pendiente: regulares en esqueleto (la pill Tu plan cruza resumen y planes)', () => {
    const v = resolvePlanesView(baseInput({ summarySettled: false, deadlinePassed: true }))
    expect(v.page).toBe('sections')
    expect(v.regulares).toBe('skeleton')
    expect(v.tuPlan).toBe('skeleton')
  })

  it('tope vencido con planes pendientes: regulares en esqueleto', () => {
    const v = resolvePlanesView(
      baseInput({ plansSettled: false, plansCount: 0, deadlinePassed: true }),
    )
    expect(v.page).toBe('sections')
    expect(v.regulares).toBe('skeleton')
  })

  it('antes del tope, con planes, catálogo y resumen resueltos pero my-progress pendiente: no se dibuja a medias', () => {
    const v = resolvePlanesView(baseInput({ myProgressSettled: false }))
    expect(v.page).toBe('skeleton')
    expect(v.regulares).toBe('skeleton')
    expect(v.objetivos).toBe('skeleton')
  })

  it('my-progress OK con inscripción: enrollment known', () => {
    const v = resolvePlanesView(baseInput({ hasEnrollment: true }))
    expect(v.enrollment).toBe('known')
  })

  it('my-progress OK sin inscripción: enrollment known (sí se afirma "no inscripto")', () => {
    const v = resolvePlanesView(baseInput({ hasEnrollment: false }))
    expect(v.enrollment).toBe('known')
  })

  it('my-progress pendiente con el tope vencido: la página sale con enrollment unknown', () => {
    const v = resolvePlanesView(baseInput({ myProgressSettled: false, deadlinePassed: true }))
    expect(v.page).toBe('sections')
    expect(v.enrollment).toBe('unknown')
  })

  it('falla de my-progress sin inscripción conocida: enrollment unknown y la página sale al instante', () => {
    const v = resolvePlanesView(baseInput({ myProgressFailed: true, hasEnrollment: false }))
    expect(v.page).toBe('sections')
    expect(v.enrollment).toBe('unknown')
  })

  it('falla de my-progress con inscripción conocida (dato previo conservado): enrollment known', () => {
    const v = resolvePlanesView(baseInput({ myProgressFailed: true, hasEnrollment: true }))
    expect(v.page).toBe('sections')
    expect(v.enrollment).toBe('known')
  })

  it('el resumen pendiente no deja a Tu plan en show aunque haya perfil', () => {
    const v = resolvePlanesView(baseInput({ summarySettled: false, deadlinePassed: true }))
    expect(v.tuPlan).not.toBe('show')
  })
})
