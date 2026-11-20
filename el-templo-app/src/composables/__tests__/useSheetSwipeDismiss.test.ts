import { nextTick, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { useSheetSwipeDismiss } from '../useSheetSwipeDismiss'

interface FakePointer {
  pointerId: number
  pointerType: string
  button: number
  clientX: number
  clientY: number
  timeStamp: number
  currentTarget: { setPointerCapture: (id: number) => void } | null
}

function ev(partial: Partial<FakePointer>): PointerEvent {
  const base: FakePointer = {
    pointerId: 1,
    pointerType: 'touch',
    button: 0,
    clientX: 100,
    clientY: 100,
    timeStamp: 0,
    currentTarget: null,
  }
  return { ...base, ...partial } as unknown as PointerEvent
}

function setup(opts: { canDismiss?: () => boolean } = {}) {
  const open = ref(true)
  const onDismiss = vi.fn()
  const swipe = useSheetSwipeDismiss({
    isOpen: () => open.value,
    canDismiss: opts.canDismiss ?? (() => true),
    onDismiss,
  })
  return { open, onDismiss, swipe }
}

describe('useSheetSwipeDismiss', () => {
  it('arrastrar lejos hacia abajo cierra la hoja', () => {
    const { swipe, onDismiss } = setup()
    const capture = vi.fn()
    swipe.handlers.pointerdown(ev({ clientY: 100, timeStamp: 0 }))
    swipe.handlers.pointermove(
      ev({ clientY: 160, timeStamp: 300, currentTarget: { setPointerCapture: capture } }),
    )
    swipe.handlers.pointermove(ev({ clientY: 260, timeStamp: 600 }))
    swipe.handlers.pointerup(ev({ clientY: 260, timeStamp: 700 }))

    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(capture).toHaveBeenCalledWith(1)
    // Queda corrida: el QDialog anima el cierre desde ahí.
    expect(swipe.cardStyle.value?.transform).toBe('translateY(160px)')
  })

  it('mientras arrastra, la hoja sigue al dedo sin transición', () => {
    const { swipe } = setup()
    swipe.handlers.pointerdown(ev({ clientY: 100 }))
    swipe.handlers.pointermove(ev({ clientY: 140 }))

    expect(swipe.dragging.value).toBe(true)
    expect(swipe.cardStyle.value).toEqual({ transform: 'translateY(40px)', transition: 'none' })
  })

  it('un arrastre corto y lento vuelve a su lugar, animado, sin cerrar', () => {
    const { swipe, onDismiss } = setup()
    swipe.handlers.pointerdown(ev({ clientY: 100, timeStamp: 0 }))
    swipe.handlers.pointermove(ev({ clientY: 150, timeStamp: 800 }))
    swipe.handlers.pointerup(ev({ clientY: 150, timeStamp: 1000 }))

    expect(onDismiss).not.toHaveBeenCalled()
    expect(swipe.cardStyle.value).toEqual({
      transform: 'translateY(0px)',
      transition: 'transform 0.2s ease-out',
    })
  })

  it('un toque no es arrastre: no captura el puntero ni corre la hoja (los botones andan)', () => {
    const { swipe, onDismiss } = setup()
    const capture = vi.fn()
    swipe.handlers.pointerdown(ev({ clientY: 100 }))
    swipe.handlers.pointermove(
      ev({ clientY: 103, currentTarget: { setPointerCapture: capture } }),
    )
    swipe.handlers.pointerup(ev({ clientY: 103, timeStamp: 50 }))

    expect(capture).not.toHaveBeenCalled()
    expect(onDismiss).not.toHaveBeenCalled()
    expect(swipe.cardStyle.value).toBeUndefined()
  })

  it('con la hoja bloqueada (persistent mientras envía) no arrastra ni cierra', () => {
    const { swipe, onDismiss } = setup({ canDismiss: () => false })
    swipe.handlers.pointerdown(ev({ clientY: 100 }))
    swipe.handlers.pointermove(ev({ clientY: 300 }))
    swipe.handlers.pointerup(ev({ clientY: 300, timeStamp: 100 }))

    expect(onDismiss).not.toHaveBeenCalled()
    expect(swipe.cardStyle.value).toBeUndefined()
  })

  it('si se bloquea a mitad del arrastre, al soltar no cierra', () => {
    let allowed = true
    const { swipe, onDismiss } = setup({ canDismiss: () => allowed })
    swipe.handlers.pointerdown(ev({ clientY: 100 }))
    swipe.handlers.pointermove(ev({ clientY: 300 }))
    allowed = false
    swipe.handlers.pointerup(ev({ clientY: 300, timeStamp: 100 }))

    expect(onDismiss).not.toHaveBeenCalled()
  })

  it('arrastrar hacia arriba no mueve la hoja', () => {
    const { swipe } = setup()
    swipe.handlers.pointerdown(ev({ clientY: 300 }))
    swipe.handlers.pointermove(ev({ clientY: 100 }))

    expect(swipe.dragging.value).toBe(false)
    expect(swipe.cardStyle.value).toBeUndefined()
  })

  it('un segundo dedo no interfiere con el primero', () => {
    const { swipe, onDismiss } = setup()
    swipe.handlers.pointerdown(ev({ pointerId: 1, clientY: 100 }))
    swipe.handlers.pointermove(ev({ pointerId: 2, clientY: 400 }))
    swipe.handlers.pointerup(ev({ pointerId: 2, clientY: 400, timeStamp: 50 }))

    expect(onDismiss).not.toHaveBeenCalled()
    expect(swipe.cardStyle.value).toBeUndefined()
  })

  it('pointercancel (el sistema se quedó con el gesto) devuelve la hoja a su lugar', () => {
    const { swipe, onDismiss } = setup()
    swipe.handlers.pointerdown(ev({ clientY: 100 }))
    swipe.handlers.pointermove(ev({ clientY: 200 }))
    swipe.handlers.pointercancel(ev({}))

    expect(onDismiss).not.toHaveBeenCalled()
    expect(swipe.cardStyle.value).toBeUndefined()
  })

  it('al volver a abrir después de cerrar arrastrando, la hoja está en su lugar', async () => {
    const { swipe, open } = setup()
    swipe.handlers.pointerdown(ev({ clientY: 100 }))
    swipe.handlers.pointermove(ev({ clientY: 300 }))
    swipe.handlers.pointerup(ev({ clientY: 300, timeStamp: 100 }))
    open.value = false
    await nextTick()
    open.value = true
    await nextTick()

    expect(swipe.cardStyle.value).toBeUndefined()
  })

  it('el botón derecho del mouse no arrastra', () => {
    const { swipe } = setup()
    swipe.handlers.pointerdown(ev({ pointerType: 'mouse', button: 2, clientY: 100 }))
    swipe.handlers.pointermove(ev({ pointerType: 'mouse', clientY: 300 }))

    expect(swipe.dragging.value).toBe(false)
  })
})
