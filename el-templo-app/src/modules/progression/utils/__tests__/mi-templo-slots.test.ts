import { describe, it, expect } from 'vitest'
import { resolveMiTemploSlots, type MiTemploSlotsInput } from '../mi-templo-slots'

// Todo resuelto y OK: el socio tiene plan, hay novedades, sponsors, 3 preguntas y evaluación.
function baseInput(over: Partial<MiTemploSlotsInput> = {}): MiTemploSlotsInput {
  return {
    deadlinePassed: false,
    todayKind: 'presencial-turno',
    novedades: { loaded: true, ok: true, count: 2 },
    sponsors: { loaded: true, ok: true, count: 3 },
    checkIn: { settled: true, ok: true, questions: 3 },
    week: { loaded: true },
    stats: { loaded: true, ok: true, evaluationVisible: true },
    paraVos: { tarjetasSettled: true, memberStateLoaded: true, hasProfile: true },
    hadContent: {},
    ...over,
  }
}

describe('resolveMiTemploSlots', () => {
  describe('Novedades', () => {
    it('no respondió + tuvo contenido la última vez + sin tope: esqueleto', () => {
      const s = resolveMiTemploSlots(
        baseInput({
          novedades: { loaded: false, ok: null, count: 0 },
          hadContent: { novedades: true },
        }),
      )
      expect(s.novedades).toBe('skeleton')
    })

    it('no respondió + no tuvo contenido la última vez: oculta', () => {
      const s = resolveMiTemploSlots(
        baseInput({
          novedades: { loaded: false, ok: null, count: 0 },
          hadContent: { novedades: false },
        }),
      )
      expect(s.novedades).toBe('hidden')
    })

    it('no respondió + sin flag guardado: oculta', () => {
      const s = resolveMiTemploSlots(
        baseInput({ novedades: { loaded: false, ok: null, count: 0 }, hadContent: {} }),
      )
      expect(s.novedades).toBe('hidden')
    })

    it('respondió con ítems: contenido', () => {
      const s = resolveMiTemploSlots(baseInput())
      expect(s.novedades).toBe('content')
    })

    it('respondió vacía: oculta', () => {
      const s = resolveMiTemploSlots(
        baseInput({
          novedades: { loaded: true, ok: true, count: 0 },
          hadContent: { novedades: true },
        }),
      )
      expect(s.novedades).toBe('hidden')
    })

    it('con tope vencido y sin respuesta: oculta aunque la última vez tuvo contenido', () => {
      const s = resolveMiTemploSlots(
        baseInput({
          deadlinePassed: true,
          novedades: { loaded: false, ok: null, count: 0 },
          hadContent: { novedades: true },
        }),
      )
      expect(s.novedades).toBe('hidden')
    })

    it('registra true tras una respuesta buena con ítems y false tras una buena vacía', () => {
      expect(resolveMiTemploSlots(baseInput()).records.novedades).toBe(true)
      const empty = resolveMiTemploSlots(
        baseInput({ novedades: { loaded: true, ok: true, count: 0 } }),
      )
      expect(empty.records.novedades).toBe(false)
    })

    it('error de novedades (ok false) no registra el flag (Pitfall 6)', () => {
      const s = resolveMiTemploSlots(
        baseInput({
          novedades: { loaded: true, ok: false, count: 0 },
          hadContent: { novedades: true },
        }),
      )
      expect(s.records.novedades).toBeUndefined()
      expect('novedades' in s.records).toBe(false)
      expect(s.novedades).toBe('hidden')
    })

    it('refresco fallido con ítems previos muestra el contenido pero no registra', () => {
      const s = resolveMiTemploSlots(
        baseInput({ novedades: { loaded: true, ok: false, count: 2 } }),
      )
      expect(s.novedades).toBe('content')
      expect(s.records.novedades).toBeUndefined()
    })

    it('sin respuesta todavía (loaded false) no registra', () => {
      const s = resolveMiTemploSlots(
        baseInput({ novedades: { loaded: false, ok: null, count: 0 } }),
      )
      expect(s.records.novedades).toBeUndefined()
    })
  })

  describe('Patrocinadores', () => {
    it('sin respuesta y con flag: esqueleto; sin flag: oculta', () => {
      const pending = { loaded: false, ok: null, count: 0 }
      expect(
        resolveMiTemploSlots(baseInput({ sponsors: pending, hadContent: { sponsors: true } }))
          .sponsors,
      ).toBe('skeleton')
      expect(resolveMiTemploSlots(baseInput({ sponsors: pending })).sponsors).toBe('hidden')
    })

    it('respondió con marcas: contenido y registra true', () => {
      const s = resolveMiTemploSlots(baseInput())
      expect(s.sponsors).toBe('content')
      expect(s.records.sponsors).toBe(true)
    })

    it('error de sponsors no registra el flag', () => {
      const s = resolveMiTemploSlots(
        baseInput({
          sponsors: { loaded: true, ok: false, count: 0 },
          hadContent: { sponsors: true },
        }),
      )
      expect(s.sponsors).toBe('hidden')
      expect(s.records.sponsors).toBeUndefined()
    })
  })

  describe('Registro del día (checkIn)', () => {
    it('con la card de hoy cargando no está resuelto: esqueleto si tuvo contenido', () => {
      const s = resolveMiTemploSlots(
        baseInput({ todayKind: 'cargando', hadContent: { checkIn: true } }),
      )
      expect(s.checkIn).toBe('skeleton')
    })

    it('con la card de hoy cargando y sin flag: oculto y no registra', () => {
      const s = resolveMiTemploSlots(baseInput({ todayKind: 'cargando' }))
      expect(s.checkIn).toBe('hidden')
      expect(s.records.checkIn).toBeUndefined()
    })

    it('check-ins sin responder: esqueleto si tuvo contenido', () => {
      const s = resolveMiTemploSlots(
        baseInput({
          checkIn: { settled: false, ok: null, questions: 0 },
          hadContent: { checkIn: true },
        }),
      )
      expect(s.checkIn).toBe('skeleton')
    })

    it('con preguntas y plan: contenido y registra true', () => {
      const s = resolveMiTemploSlots(baseInput())
      expect(s.checkIn).toBe('content')
      expect(s.records.checkIn).toBe(true)
    })

    it('sin-plan-nunca: oculto aunque haya preguntas, y registra false', () => {
      const s = resolveMiTemploSlots(
        baseInput({ todayKind: 'sin-plan-nunca', hadContent: { checkIn: true } }),
      )
      expect(s.checkIn).toBe('hidden')
      expect(s.records.checkIn).toBe(false)
    })

    it('sin preguntas (estado del día vacío): oculto', () => {
      const s = resolveMiTemploSlots(
        baseInput({ checkIn: { settled: true, ok: true, questions: 0 } }),
      )
      expect(s.checkIn).toBe('hidden')
    })

    it('error al pedir los check-ins no registra el flag', () => {
      const s = resolveMiTemploSlots(
        baseInput({
          checkIn: { settled: true, ok: false, questions: 0 },
          hadContent: { checkIn: true },
        }),
      )
      expect(s.checkIn).toBe('hidden')
      expect(s.records.checkIn).toBeUndefined()
    })

    it('card de hoy neutral (falla o tope) no registra el flag aunque los check-ins estén bien', () => {
      const s = resolveMiTemploSlots(baseInput({ todayKind: 'neutral' }))
      expect(s.records.checkIn).toBeUndefined()
      expect(s.records.weekStrip).toBeUndefined()
    })
  })

  describe('Tus sesiones (weekStrip)', () => {
    it('semana sin responder: esqueleto si tuvo contenido, oculta si no', () => {
      expect(
        resolveMiTemploSlots(
          baseInput({ week: { loaded: false }, hadContent: { weekStrip: true } }),
        ).weekStrip,
      ).toBe('skeleton')
      expect(resolveMiTemploSlots(baseInput({ week: { loaded: false } })).weekStrip).toBe('hidden')
    })

    it('con plan y semana respondida: contenido y registra true', () => {
      const s = resolveMiTemploSlots(baseInput())
      expect(s.weekStrip).toBe('content')
      expect(s.records.weekStrip).toBe(true)
    })

    it('card de hoy cargando: esqueleto si tuvo contenido y no registra', () => {
      const s = resolveMiTemploSlots(
        baseInput({ todayKind: 'cargando', hadContent: { weekStrip: true } }),
      )
      expect(s.weekStrip).toBe('skeleton')
      expect(s.records.weekStrip).toBeUndefined()
    })

    it('sin-plan-nunca: oculta y registra false', () => {
      const s = resolveMiTemploSlots(
        baseInput({ todayKind: 'sin-plan-nunca', hadContent: { weekStrip: true } }),
      )
      expect(s.weekStrip).toBe('hidden')
      expect(s.records.weekStrip).toBe(false)
    })
  })

  describe('Evaluación', () => {
    it('stats sin responder: esqueleto si tuvo contenido, oculta si no', () => {
      const pending = { loaded: false, ok: null, evaluationVisible: false }
      expect(
        resolveMiTemploSlots(baseInput({ stats: pending, hadContent: { evaluation: true } }))
          .evaluation,
      ).toBe('skeleton')
      expect(resolveMiTemploSlots(baseInput({ stats: pending })).evaluation).toBe('hidden')
    })

    it('elegible o pendiente: contenido y registra true', () => {
      const s = resolveMiTemploSlots(baseInput())
      expect(s.evaluation).toBe('content')
      expect(s.records.evaluation).toBe(true)
    })

    it('stats OK sin evaluación visible: oculta y registra false', () => {
      const s = resolveMiTemploSlots(
        baseInput({
          stats: { loaded: true, ok: true, evaluationVisible: false },
          hadContent: { evaluation: true },
        }),
      )
      expect(s.evaluation).toBe('hidden')
      expect(s.records.evaluation).toBe(false)
    })

    it('stats fallidas (D-16): no registra y no deja esqueleto colgado', () => {
      const s = resolveMiTemploSlots(
        baseInput({
          stats: { loaded: true, ok: false, evaluationVisible: false },
          hadContent: { evaluation: true },
        }),
      )
      expect(s.evaluation).toBe('hidden')
      expect(s.records.evaluation).toBeUndefined()
    })
  })

  describe('Para vos', () => {
    it('Para vos sin tope y sin settled: esqueleto', () => {
      const s = resolveMiTemploSlots(
        baseInput({
          paraVos: { tarjetasSettled: false, memberStateLoaded: true, hasProfile: true },
        }),
      )
      expect(s.paraVos).toBe('skeleton')
    })

    it('Para vos espera cada una de sus tres fuentes (tarjetas, estado del socio, perfil)', () => {
      const base = { tarjetasSettled: true, memberStateLoaded: true, hasProfile: true }
      expect(
        resolveMiTemploSlots(baseInput({ paraVos: { ...base, memberStateLoaded: false } })).paraVos,
      ).toBe('skeleton')
      expect(
        resolveMiTemploSlots(baseInput({ paraVos: { ...base, hasProfile: false } })).paraVos,
      ).toBe('skeleton')
    })

    it('Para vos settled: contenido (con y sin tope)', () => {
      expect(resolveMiTemploSlots(baseInput()).paraVos).toBe('content')
      expect(resolveMiTemploSlots(baseInput({ deadlinePassed: true })).paraVos).toBe('content')
    })

    it('Para vos con tope sin settled: contenido con lo que haya, nunca oculto', () => {
      const s = resolveMiTemploSlots(
        baseInput({
          deadlinePassed: true,
          paraVos: { tarjetasSettled: false, memberStateLoaded: false, hasProfile: false },
        }),
      )
      expect(s.paraVos).toBe('content')
    })
  })

  describe('Flags (D-03)', () => {
    it('records solo contiene booleanos y claves conocidas', () => {
      const s = resolveMiTemploSlots(baseInput())
      const known = ['novedades', 'sponsors', 'checkIn', 'weekStrip', 'evaluation']
      for (const [key, value] of Object.entries(s.records)) {
        expect(known).toContain(key)
        expect(typeof value).toBe('boolean')
      }
    })

    it('todo resuelto y OK registra las cinco cards', () => {
      const s = resolveMiTemploSlots(baseInput())
      expect(s.records).toEqual({
        novedades: true,
        sponsors: true,
        checkIn: true,
        weekStrip: true,
        evaluation: true,
      })
    })
  })
})
