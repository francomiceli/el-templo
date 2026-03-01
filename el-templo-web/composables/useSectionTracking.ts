/**
 * useSectionTracking -- Fires GA4 events when page sections enter viewport.
 *
 * Observes section elements by their DOM IDs. Fires each event ONCE per page load.
 * SSR-safe, respects reduced-motion (still tracks, animation isn't involved).
 *
 * Following CLAUDE.md: exposes cleanup(), no onUnmounted inside.
 */

interface SectionTrackingConfig {
  /** Map of section DOM id -> GA4 event name */
  sections: Record<string, string>;
}

export function useSectionTracking(config: SectionTrackingConfig) {
  const fired = new Set<string>();
  let observer: IntersectionObserver | null = null;

  function setup(): void {
    const { trackEvent } = useAnalytics();

    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const id = entry.target.id;
            const eventName = config.sections[id];
            if (eventName && !fired.has(id)) {
              fired.add(id);
              trackEvent(eventName);
              observer?.unobserve(entry.target);
            }
          }
        }
      },
      { threshold: 0.2 },
    );

    // Observe each section after DOM is ready
    for (const sectionId of Object.keys(config.sections)) {
      const el = document.getElementById(sectionId);
      if (el) observer.observe(el);
    }
  }

  function cleanup(): void {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    fired.clear();
  }

  if (import.meta.client) {
    onMounted(() => {
      // Delay setup slightly to ensure sections are rendered
      requestAnimationFrame(() => setup());
    });
  }

  return { cleanup };
}
