import { describe, expect, it } from 'vitest'
import {
  SWIPE_DISMISS_DISTANCE_PX,
  SWIPE_FLICK_MIN_PX,
  SWIPE_SLOP_PX,
  isSwipeStart,
  sheetDragOffset,
  shouldDismissSheet,
} from '../sheet-swipe'

describe('sheetDragOffset', () => {
  it('sigue al dedo hacia abajo', () => {
    expect(sheetDragOffset(42)).toBe(42)
  })

  it('no sube la hoja por encima de su lugar', () => {
    expect(sheetDragOffset(-30)).toBe(0)
    expect(sheetDragOffset(0)).toBe(0)
  })
})

describe('isSwipeStart', () => {
  it('un toque (movimiento mínimo) no es arrastre: los botones de la cabecera siguen andando', () => {
    expect(isSwipeStart(SWIPE_SLOP_PX, 0)).toBe(false)
    expect(isSwipeStart(3, 1)).toBe(false)
  })

  it('pasado el margen y hacia abajo, es arrastre', () => {
    expect(isSwipeStart(SWIPE_SLOP_PX + 1, 0)).toBe(true)
  })

  it('hacia arriba nunca es arrastre', () => {
    expect(isSwipeStart(-40, 0)).toBe(false)
  })

  it('un movimiento más horizontal que vertical no es arrastre', () => {
    expect(isSwipeStart(20, 25)).toBe(false)
    expect(isSwipeStart(20, -25)).toBe(false)
  })
})

describe('shouldDismissSheet', () => {
  it('arrastrar lejos cierra aunque se suelte despacio', () => {
    expect(shouldDismissSheet(SWIPE_DISMISS_DISTANCE_PX, 2000)).toBe(true)
    expect(shouldDismissSheet(300, 5000)).toBe(true)
  })

  it('un arrastre corto y lento vuelve a su lugar', () => {
    expect(shouldDismissSheet(SWIPE_DISMISS_DISTANCE_PX - 1, 1000)).toBe(false)
  })

  it('un tirón corto y rápido cierra', () => {
    expect(shouldDismissSheet(50, 60)).toBe(true)
  })

  it('un tirón rápido pero mínimo no cierra (evita cierres por un roce)', () => {
    expect(shouldDismissSheet(SWIPE_FLICK_MIN_PX - 1, 10)).toBe(false)
  })

  it('soltar arriba de donde empezó no cierra', () => {
    expect(shouldDismissSheet(0, 10)).toBe(false)
    expect(shouldDismissSheet(-200, 10)).toBe(false)
  })

  it('duración 0 no divide por cero', () => {
    expect(shouldDismissSheet(40, 0)).toBe(true)
  })
})
