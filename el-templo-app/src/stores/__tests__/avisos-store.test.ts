import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('src/utils/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

vi.mock('src/boot/axios', () => ({
  api: { get: vi.fn(), post: vi.fn() },
}))

import { api } from 'src/boot/axios'
import { useAvisosStore } from '../useAvisosStore'

const RATING_PROMPT = {
  prompt: {
    kind: 'rating',
    aviso: {
      id: 42,
      title: 'Puntuá tu clase',
      body: 'Contanos cómo estuvo',
      buttonText: 'Puntuar',
      destination: {
        type: 'app_section',
        section: 'mi_templo',
        route: '/mi-templo',
        whatsappText: null,
      },
    },
    pending: {
      sessionDate: '2026-09-01',
      branchId: 1,
      scheduleId: 10,
      activityName: 'Funcional',
      dayOfWeek: 2,
    },
  },
}

describe('useAvisosStore (D-06/D-07/D-11 — un pop-up por apertura + eventos server-side)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(api.get).mockReset()
    vi.mocked(api.post).mockReset()
  })

  it('evaluate() llama al endpoint UNA sola vez aunque se invoque tres veces', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { prompt: null } })
    const store = useAvisosStore()

    await Promise.all([store.evaluate(), store.evaluate(), store.evaluate()])

    expect(api.get).toHaveBeenCalledTimes(1)
    expect(api.get).toHaveBeenCalledWith('/communications/me/prompt')
  })

  it('con kind "rating", isRating queda true y los otros tres en false', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: RATING_PROMPT })
    vi.mocked(api.post).mockResolvedValue({ data: { success: true } })
    const store = useAvisosStore()

    await store.evaluate()

    expect(store.isRating).toBe(true)
    expect(store.isPlanExpiry).toBe(false)
    expect(store.isAviso).toBe(false)
    expect(store.isImprovement).toBe(false)
  })

  it('evaluate() reporta el evento "shown" una sola vez cuando vino un aviso', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: RATING_PROMPT })
    vi.mocked(api.post).mockResolvedValue({ data: { success: true } })
    const store = useAvisosStore()

    await store.evaluate()

    expect(api.post).toHaveBeenCalledTimes(1)
    expect(api.post).toHaveBeenCalledWith('/communications/me/avisos/42/event', {
      type: 'shown',
    })
  })

  it('un 500 del endpoint deja prompt en null sin lanzar', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('500'))
    const store = useAvisosStore()

    await expect(store.evaluate()).resolves.toBeUndefined()
    expect(store.prompt).toBeNull()
    expect(api.post).not.toHaveBeenCalled()
  })

  it('reportDismissed y reportClicked postean el tipo correspondiente', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { success: true } })
    const store = useAvisosStore()

    await store.reportDismissed(7)
    await store.reportClicked(8)

    expect(api.post).toHaveBeenNthCalledWith(1, '/communications/me/avisos/7/event', {
      type: 'dismissed',
    })
    expect(api.post).toHaveBeenNthCalledWith(2, '/communications/me/avisos/8/event', {
      type: 'clicked',
    })
  })

  it('reset() limpia prompt/evaluated y permite volver a evaluar', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { prompt: null } })
    const store = useAvisosStore()

    await store.evaluate()
    expect(api.get).toHaveBeenCalledTimes(1)

    store.reset()
    expect(store.prompt).toBeNull()
    expect(store.evaluated).toBe(false)

    await store.evaluate()
    expect(api.get).toHaveBeenCalledTimes(2)
  })
})

const TARJETAS_RESPONSE = {
  tarjetas: [
    {
      id: 1,
      code: 'card_improvement',
      title: '¿Qué mejorarías de El Templo?',
      body: 'Contanos qué te gustaría',
      buttonText: 'Enviar sugerencia',
      destination: {
        type: 'app_section',
        section: 'proponer_mejora',
        route: '/proponer-mejora',
        whatsappText: null,
      },
    },
    {
      id: 5,
      code: null,
      title: 'Tarjeta libre',
      body: 'Cuerpo libre',
      buttonText: 'Ver',
      destination: {
        type: 'app_section',
        section: 'mi_templo',
        route: '/mi-templo',
        whatsappText: null,
      },
    },
  ],
}

describe('useAvisosStore — tarjetas del carrusel (D-15b, plan 193-15)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(api.get).mockReset()
    vi.mocked(api.post).mockReset()
  })

  it('loadTarjetas() llama al endpoint UNA sola vez aunque se invoque tres veces', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: TARJETAS_RESPONSE })
    const store = useAvisosStore()

    await Promise.all([store.loadTarjetas(), store.loadTarjetas(), store.loadTarjetas()])

    expect(api.get).toHaveBeenCalledTimes(1)
    expect(api.get).toHaveBeenCalledWith('/communications/me/tarjetas')
    // D-19: las tarjetas NO reportan "shown", a diferencia de evaluate().
    expect(api.post).not.toHaveBeenCalled()
  })

  it('tarjetaByCode() encuentra la fija por su code y devuelve null si no está', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: TARJETAS_RESPONSE })
    const store = useAvisosStore()

    await store.loadTarjetas()

    expect(store.tarjetaByCode('card_improvement')?.id).toBe(1)
    expect(store.tarjetaByCode('card_referral')).toBeNull()
  })

  it('tarjetasLibres devuelve solo las de code null, en el orden del server', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: TARJETAS_RESPONSE })
    const store = useAvisosStore()

    await store.loadTarjetas()

    expect(store.tarjetasLibres).toHaveLength(1)
    expect(store.tarjetasLibres[0]?.id).toBe(5)
  })

  it('un error de red deja tarjetas vacío sin lanzar (fail-open)', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('500'))
    const store = useAvisosStore()

    await expect(store.loadTarjetas()).resolves.toBeUndefined()
    expect(store.tarjetas).toEqual([])
    expect(store.tarjetasLibres).toEqual([])
  })

  it('reset() limpia tarjetas y permite volver a cargarlas', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: TARJETAS_RESPONSE })
    const store = useAvisosStore()

    await store.loadTarjetas()
    expect(store.tarjetas).toHaveLength(2)

    store.reset()
    expect(store.tarjetas).toEqual([])
    expect(store.tarjetasLoaded).toBe(false)

    await store.loadTarjetas()
    expect(api.get).toHaveBeenCalledTimes(2)
  })
})

describe('useAvisosStore — tarjetasSettled / tarjetasOk (fase 203, D-02/D-07)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(api.get).mockReset()
    vi.mocked(api.post).mockReset()
  })

  /** Respuesta controlable a mano para observar el estado "en vuelo". */
  function deferred<T>() {
    let resolve!: (value: T) => void
    let reject!: (reason: unknown) => void
    const promise = new Promise<T>((res, rej) => {
      resolve = res
      reject = rej
    })
    return { promise, resolve, reject }
  }

  it('al inicio: tarjetasSettled false y tarjetasOk null', () => {
    const store = useAvisosStore()

    expect(store.tarjetasSettled).toBe(false)
    expect(store.tarjetasOk).toBeNull()
  })

  it('durante el pedido: tarjetasLoaded true ("pedido") pero tarjetasSettled false', async () => {
    const gate = deferred<unknown>()
    vi.mocked(api.get).mockReturnValue(gate.promise as never)
    const store = useAvisosStore()

    const pending = store.loadTarjetas()

    expect(store.tarjetasLoaded).toBe(true)
    expect(store.tarjetasSettled).toBe(false)
    expect(store.tarjetasOk).toBeNull()
    gate.resolve({ data: TARJETAS_RESPONSE })
    await pending
    expect(store.tarjetasSettled).toBe(true)
  })

  it('2xx: tarjetasSettled true y tarjetasOk true', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: TARJETAS_RESPONSE })
    const store = useAvisosStore()

    await store.loadTarjetas()

    expect(store.tarjetasSettled).toBe(true)
    expect(store.tarjetasOk).toBe(true)
  })

  it('2xx con lista vacía: tarjetasOk true (vacío no es error)', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { tarjetas: [] } })
    const store = useAvisosStore()

    await store.loadTarjetas()

    expect(store.tarjetas).toEqual([])
    expect(store.tarjetasSettled).toBe(true)
    expect(store.tarjetasOk).toBe(true)
  })

  it('error: tarjetasSettled true (fail-open) pero tarjetasOk false', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('Network Error'))
    const store = useAvisosStore()

    await store.loadTarjetas()

    expect(store.tarjetasSettled).toBe(true)
    expect(store.tarjetasOk).toBe(false)
  })

  it('no cambia el criterio de tarjetasLoaded: sigue una sola llamada por apertura', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: TARJETAS_RESPONSE })
    const store = useAvisosStore()

    await Promise.all([store.loadTarjetas(), store.loadTarjetas()])

    expect(api.get).toHaveBeenCalledTimes(1)
    expect(store.tarjetasLoaded).toBe(true)
  })

  it('reset() baja tarjetasSettled y tarjetasOk', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: TARJETAS_RESPONSE })
    const store = useAvisosStore()
    await store.loadTarjetas()

    store.reset()

    expect(store.tarjetasSettled).toBe(false)
    expect(store.tarjetasOk).toBeNull()
  })

  it('una respuesta de antes del reset() (logout a mitad) no marca settled ni ok', async () => {
    const gate = deferred<unknown>()
    vi.mocked(api.get).mockReturnValue(gate.promise as never)
    const store = useAvisosStore()
    const pending = store.loadTarjetas()

    store.reset()
    gate.resolve({ data: TARJETAS_RESPONSE })
    await pending

    expect(store.tarjetasSettled).toBe(false)
    expect(store.tarjetasOk).toBeNull()
  })

  it('una respuesta OK del socio anterior (reset() a mitad) no pisa las tarjetas del nuevo', async () => {
    const gateOld = deferred<unknown>()
    const gateNew = deferred<unknown>()
    vi.mocked(api.get)
      .mockReturnValueOnce(gateOld.promise as never)
      .mockReturnValueOnce(gateNew.promise as never)
    const store = useAvisosStore()
    const pendingOld = store.loadTarjetas()

    store.reset()
    const pendingNew = store.loadTarjetas()
    gateNew.resolve({ data: { tarjetas: [{ ...TARJETAS_RESPONSE.tarjetas[0], id: 2 }] } })
    await pendingNew
    expect(store.tarjetas.map((t) => t.id)).toEqual([2])

    gateOld.resolve({ data: TARJETAS_RESPONSE })
    await pendingOld

    expect(store.tarjetas.map((t) => t.id)).toEqual([2])
    expect(store.tarjetasOk).toBe(true)
  })

  it('un error del socio anterior (reset() a mitad) no vacía las tarjetas del nuevo ni baja tarjetasOk', async () => {
    const gateOld = deferred<unknown>()
    const gateNew = deferred<unknown>()
    vi.mocked(api.get)
      .mockReturnValueOnce(gateOld.promise as never)
      .mockReturnValueOnce(gateNew.promise as never)
    const store = useAvisosStore()
    const pendingOld = store.loadTarjetas()

    store.reset()
    const pendingNew = store.loadTarjetas()
    gateNew.resolve({ data: TARJETAS_RESPONSE })
    await pendingNew
    const delSocioNuevo = store.tarjetas.length
    expect(delSocioNuevo).toBeGreaterThan(0)

    gateOld.reject(new Error('Network Error'))
    await pendingOld

    expect(store.tarjetas).toHaveLength(delSocioNuevo)
    expect(store.tarjetasOk).toBe(true)
  })
})
