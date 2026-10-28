import { ref } from 'vue'
import type { Ref } from 'vue'

export interface UseInViewportOptions {
  /** Fracción visible del elemento para considerarlo en pantalla (default 0.4) */
  threshold?: number
  /** Si es true (default) se desconecta tras la primera intersección: no se reanima al re-entrar */
  once?: boolean
}

export interface UseInViewportReturn {
  isVisible: Ref<boolean>
  observe: (el: Element | null) => void
  cleanup: () => void
}

/**
 * Observa si un elemento entra en el viewport (IntersectionObserver).
 * Sin `IntersectionObserver` en el entorno, `isVisible` pasa a true al instante.
 * El componente que lo usa llama a `cleanup()` al desmontarse.
 */
export function useInViewport(options: UseInViewportOptions = {}): UseInViewportReturn {
  const { threshold = 0.4, once = true } = options
  const isVisible = ref(false)
  let observer: IntersectionObserver | null = null

  function cleanup() {
    if (observer) {
      observer.disconnect()
      observer = null
    }
  }

  function observe(el: Element | null) {
    cleanup()
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') {
      isVisible.value = true
      return
    }
    observer = new IntersectionObserver(
      (entries) => {
        const intersecting = entries.some((e) => e.isIntersecting)
        if (intersecting) {
          isVisible.value = true
          if (once) cleanup()
        } else if (!once) {
          isVisible.value = false
        }
      },
      { threshold },
    )
    observer.observe(el)
  }

  return { isVisible, observe, cleanup }
}
