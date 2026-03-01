/**
 * useActiveSection — IntersectionObserver composable for tracking
 * which section is currently visible in the viewport.
 *
 * Used by AppNav to highlight the active nav link.
 *
 * Following CLAUDE.md pattern: exposes cleanup(), no onUnmounted inside.
 */

interface UseActiveSectionReturn {
  activeSection: Ref<string>;
  cleanup: () => void;
}

export function useActiveSection(sectionIds: string[]): UseActiveSectionReturn {
  const activeSection = ref<string>("");

  let observer: IntersectionObserver | null = null;
  const visibleSections = new Map<string, IntersectionObserverEntry>();

  function setup(): void {
    if (sectionIds.length === 0) return;

    // rootMargin: -64px top (nav height), bottom -50% so section must be in upper half
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = entry.target.id;
          if (entry.isIntersecting) {
            visibleSections.set(id, entry);
          } else {
            visibleSections.delete(id);
          }
        }

        // Pick the visible section closest to the top of the viewport
        if (visibleSections.size === 0) {
          activeSection.value = "";
          return;
        }

        let closestId = "";
        let closestTop = Infinity;

        for (const [id, entry] of visibleSections) {
          const top = entry.boundingClientRect.top;
          if (top < closestTop) {
            closestTop = top;
            closestId = id;
          }
        }

        activeSection.value = closestId;
      },
      {
        rootMargin: "-64px 0px -50% 0px",
        threshold: 0,
      },
    );

    for (const id of sectionIds) {
      const el = document.getElementById(id);
      if (el) {
        observer.observe(el);
      }
    }
  }

  function cleanup(): void {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    visibleSections.clear();
    activeSection.value = "";
  }

  // Only set up on client side (SSR safe)
  if (import.meta.client) {
    onMounted(() => {
      setup();
    });
  }

  return {
    activeSection,
    cleanup,
  };
}
