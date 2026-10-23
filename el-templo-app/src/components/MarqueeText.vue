<template>
  <component :is="tag" ref="rootEl" class="marquee" :class="{ 'marquee--run': running }">
    <span ref="innerEl" class="marquee__inner"><slot /></span>
  </component>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, onUpdated, ref } from 'vue'
import {
  fitsInLines,
  horizontalOverflowPx,
  marqueeKeyframes,
  marqueeCycleMs,
} from 'src/utils/marquee'

// Texto en UNA línea. Si no entra en su ancho se desplaza para leerse completo (pausa, recorre,
// pausa, vuelve) y se repite; si entra, queda quieto. Con `prefers-reduced-motion` no se anima:
// el texto se corta con elipsis. El estilo de la tipografía lo pone quien lo usa (clase en la raíz).
//
// Con `lines` > 1 primero prueba partir el texto en palabras hasta esas líneas (quieto); solo si
// no entra (más líneas o una palabra más ancha que la caja) vuelve a una línea que se desplaza.
const props = withDefaults(
  defineProps<{
    /** Etiqueta de la raíz (h1, span, p…) */
    tag?: string
    /** Líneas que puede ocupar partiendo en palabras antes de desplazarse */
    lines?: number
  }>(),
  { tag: 'span', lines: 1 },
)

const rootEl = ref<HTMLElement | null>(null)
const innerEl = ref<HTMLElement | null>(null)
const running = ref(false)

let animation: Animation | null = null
let resizeObserver: ResizeObserver | null = null
let motionQuery: MediaQueryList | null = null
let fontsCancelled = false

function stopAnimation(): void {
  animation?.cancel()
  animation = null
}

function measure(): void {
  const root = rootEl.value
  const inner = innerEl.value
  if (!root || !inner) return
  if (props.lines > 1 && fitsWrapped(root)) {
    running.value = false
    stopAnimation()
    return
  }
  root.dataset.mode = 'line'
  const reduced = motionQuery?.matches ?? false
  const overflow = horizontalOverflowPx(inner.offsetWidth, root.clientWidth)
  const shouldRun = overflow > 0 && !reduced && typeof inner.animate === 'function'
  running.value = shouldRun
  stopAnimation()
  if (!shouldRun) return
  animation = inner.animate(marqueeKeyframes(overflow), {
    duration: marqueeCycleMs(overflow),
    iterations: Infinity,
  })
}

// El modo (`data-mode`) se pone directo en el DOM, no por Vue: hay que medir el texto partido en
// el mismo tick, antes de decidir. Vue no lo pisa porque no está en el template.
function fitsWrapped(root: HTMLElement): boolean {
  root.dataset.mode = 'wrap'
  const style = getComputedStyle(root)
  const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2
  return fitsInLines(
    { scrollWidth: root.scrollWidth, clientWidth: root.clientWidth, scrollHeight: root.scrollHeight },
    lineHeight,
    props.lines,
  )
}

function onMotionChange(): void {
  measure()
}

function cleanup(): void {
  fontsCancelled = true
  stopAnimation()
  resizeObserver?.disconnect()
  resizeObserver = null
  motionQuery?.removeEventListener('change', onMotionChange)
  motionQuery = null
}

onMounted(() => {
  if (typeof window.matchMedia === 'function') {
    motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    motionQuery.addEventListener('change', onMotionChange)
  }
  if (typeof ResizeObserver !== 'undefined' && rootEl.value) {
    resizeObserver = new ResizeObserver(() => measure())
    resizeObserver.observe(rootEl.value)
  }
  measure()
  // La tipografía puede cargar después del montaje y cambiar el ancho del texto
  void document.fonts?.ready.then(() => {
    if (!fontsCancelled) measure()
  })
})

// El texto del slot cambió (otro día, otro bloque): se vuelve a medir con el DOM ya actualizado
onUpdated(() => {
  void nextTick(measure)
})

onBeforeUnmount(cleanup)
</script>

<style scoped lang="scss">
.marquee {
  display: block;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;

  // Partido en palabras (`lines` > 1 y entra): sin cortar palabras ni elipsis
  &[data-mode='wrap'] {
    white-space: normal;
    overflow-wrap: normal;
    word-break: normal;
    text-overflow: clip;
  }

  // Solo se anima si el usuario no pidió menos movimiento (si no, queda la elipsis)
  @media (prefers-reduced-motion: no-preference) {
    &--run {
      text-overflow: clip;
    }

    &--run &__inner {
      display: inline-block;
      will-change: transform;
    }
  }
}
</style>
