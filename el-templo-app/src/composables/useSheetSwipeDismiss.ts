import { computed, ref, watch, type CSSProperties } from 'vue'
import { isSwipeStart, sheetDragOffset, shouldDismissSheet } from 'src/utils/sheet-swipe'

/**
 * "Arrastrar hacia abajo para cerrar" en las hojas `q-dialog position="bottom"`.
 *
 * QDialog no trae el gesto: hasta 2026-11-20 la rayita de arriba de cada hoja era solo un dibujo y
 * para cerrar había que tocar afuera o el botón atrás. El gesto vive en la zona de arrastre (la
 * rayita y la cabecera, nunca el cuerpo que scrollea, para no pelear con el scroll):
 *
 *   <q-card :style="swipe.cardStyle.value">
 *     <div v-on="swipe.handlers" class="...__drag">  (rayita + cabecera, `touch-action: none`)
 *
 * - Un toque no es arrastre (margen `SWIPE_SLOP_PX`): los botones de la cabecera siguen andando.
 *   El puntero se captura recién cuando arranca el arrastre.
 * - `canDismiss()` en `false` (hoja `persistent` mientras envía) no deja arrastrar.
 * - Al cerrar, la hoja queda corrida y el QDialog la anima desde ahí; al volver a abrir
 *   (`isOpen()` pasa a `true`) se pone en su lugar.
 * - Sin `onUnmounted` adentro: el componente llama `cleanup()` al desmontar.
 */
export function useSheetSwipeDismiss(options: {
  isOpen: () => boolean
  canDismiss: () => boolean
  onDismiss: () => void
}) {
  const offset = ref(0)
  const dragging = ref(false)
  /** Hubo arrastre desde la última apertura: el estilo queda puesto para animar la vuelta. */
  const touched = ref(false)

  let startX = 0
  let startY = 0
  let startTime = 0
  let pointerId: number | null = null

  function reset(): void {
    pointerId = null
    dragging.value = false
    touched.value = false
    offset.value = 0
  }

  const stopOpenWatch = watch(
    () => options.isOpen(),
    (open) => {
      if (open) reset()
    },
  )

  function onPointerDown(e: PointerEvent): void {
    if (!options.canDismiss()) return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    pointerId = e.pointerId
    startX = e.clientX
    startY = e.clientY
    startTime = e.timeStamp
    dragging.value = false
  }

  function onPointerMove(e: PointerEvent): void {
    if (pointerId !== e.pointerId) return
    const dy = e.clientY - startY
    if (!dragging.value) {
      if (!isSwipeStart(dy, e.clientX - startX)) return
      dragging.value = true
      touched.value = true
      // Captura recién ahora: antes, un toque tiene que llegar a los botones de la cabecera.
      const el = e.currentTarget
      if (el && typeof (el as Element).setPointerCapture === 'function') {
        ;(el as Element).setPointerCapture(e.pointerId)
      }
    }
    offset.value = sheetDragOffset(dy)
  }

  function onPointerUp(e: PointerEvent): void {
    if (pointerId !== e.pointerId) return
    const wasDragging = dragging.value
    const dy = e.clientY - startY
    const duration = e.timeStamp - startTime
    pointerId = null
    dragging.value = false
    if (wasDragging && options.canDismiss() && shouldDismissSheet(dy, duration)) {
      options.onDismiss()
      return
    }
    offset.value = 0
  }

  function onPointerCancel(e: PointerEvent): void {
    if (pointerId !== e.pointerId) return
    reset()
  }

  /** Handlers para `v-on` en la zona de arrastre. */
  const handlers = {
    pointerdown: onPointerDown,
    pointermove: onPointerMove,
    pointerup: onPointerUp,
    pointercancel: onPointerCancel,
  }

  /** Estilo de la `q-card`: sigue al dedo sin transición; al soltar vuelve con una corta. */
  const cardStyle = computed<CSSProperties | undefined>(() => {
    if (!touched.value) return undefined
    return {
      transform: `translateY(${offset.value}px)`,
      transition: dragging.value ? 'none' : 'transform 0.2s ease-out',
    }
  })

  function cleanup(): void {
    stopOpenWatch()
    reset()
  }

  return { handlers, cardStyle, dragging, cleanup }
}
