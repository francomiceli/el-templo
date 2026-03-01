/**
 * useScrollReveal — IntersectionObserver composable for scroll-triggered
 * entrance animations.
 *
 * Used by SectionIdentity (Plan 02) and SectionMethod (Plan 03) for
 * fade-in + slide-up entrance effects when elements scroll into view.
 *
 * Following CLAUDE.md pattern: exposes cleanup(), no onUnmounted inside.
 */

interface UseScrollRevealOptions {
  threshold?: number;
  rootMargin?: string;
  once?: boolean;
}

interface UseScrollRevealReturn {
  revealed: Ref<boolean>;
  elementRef: Ref<HTMLElement | null>;
  cleanup: () => void;
}

export function useScrollReveal(
  options?: UseScrollRevealOptions,
): UseScrollRevealReturn {
  const {
    threshold = 0.15,
    rootMargin = "0px 0px -60px 0px",
    once = true,
  } = options ?? {};

  const revealed = ref(false);
  const elementRef = ref<HTMLElement | null>(null);

  let observer: IntersectionObserver | null = null;

  function setup(): void {
    // Respect prefers-reduced-motion: reveal immediately, skip animation wait
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    if (prefersReducedMotion) {
      revealed.value = true;
      return;
    }

    if (!elementRef.value) return;

    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            revealed.value = true;

            if (once && observer) {
              observer.unobserve(entry.target);
              observer.disconnect();
              observer = null;
            }
          }
        }
      },
      {
        threshold,
        rootMargin,
      },
    );

    observer.observe(elementRef.value);
  }

  function cleanup(): void {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
  }

  // Only set up on client side (SSR safe)
  if (import.meta.client) {
    onMounted(() => {
      setup();
    });
  }

  return {
    revealed,
    elementRef,
    cleanup,
  };
}
