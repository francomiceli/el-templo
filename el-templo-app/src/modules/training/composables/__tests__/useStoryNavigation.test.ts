import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'

vi.mock('src/utils/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

import { useStoryNavigation } from '../useStoryNavigation'

// SPEC "Empezá acá" B — UI-SPEC-historias.md §2/§9: EmpezaAcaPage.vue reusa
// esta composable (ya usada por BlockProgressionView.vue) en vez de
// reimplementar la navegación de historias. No tenía test propio todavía.
describe('useStoryNavigation (reusada por EmpezaAcaPage — historias "Empezá acá")', () => {
  it('arranca en el índice 0, isFirst true', () => {
    const nav = useStoryNavigation(ref(7))
    expect(nav.currentIndex.value).toBe(0)
    expect(nav.isFirst.value).toBe(true)
    expect(nav.isLast.value).toBe(false)
  })

  it('next avanza de a uno, prev retrocede de a uno', () => {
    const nav = useStoryNavigation(ref(3))
    nav.next()
    expect(nav.currentIndex.value).toBe(1)
    nav.next()
    expect(nav.currentIndex.value).toBe(2)
    nav.prev()
    expect(nav.currentIndex.value).toBe(1)
  })

  it('next se clampea en el último — no hay wrap-around', () => {
    const nav = useStoryNavigation(ref(3))
    nav.next()
    nav.next()
    expect(nav.isLast.value).toBe(true)
    nav.next()
    expect(nav.currentIndex.value).toBe(2)
    expect(nav.isLast.value).toBe(true)
  })

  it('prev se clampea en 0 — no hay wrap-around', () => {
    const nav = useStoryNavigation(ref(3))
    nav.prev()
    expect(nav.currentIndex.value).toBe(0)
    expect(nav.isFirst.value).toBe(true)
  })

  it('goTo salta a un índice y clampea fuera de rango', () => {
    const nav = useStoryNavigation(ref(5))
    nav.goTo(3)
    expect(nav.currentIndex.value).toBe(3)
    nav.goTo(99)
    expect(nav.currentIndex.value).toBe(4)
    nav.goTo(-5)
    expect(nav.currentIndex.value).toBe(0)
  })

  it('reset vuelve al slide 0', () => {
    const nav = useStoryNavigation(ref(5))
    nav.goTo(3)
    nav.reset()
    expect(nav.currentIndex.value).toBe(0)
  })

  it('un total de 1 slide: isFirst e isLast son true a la vez', () => {
    const nav = useStoryNavigation(ref(1))
    expect(nav.isFirst.value).toBe(true)
    expect(nav.isLast.value).toBe(true)
  })

  it('cleanup detiene el watch de totalSlides (no lanza si se llama dos veces)', () => {
    const nav = useStoryNavigation(ref(3))
    expect(() => {
      nav.cleanup()
      nav.cleanup()
    }).not.toThrow()
  })
})
