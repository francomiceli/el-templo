/**
 * useCountUp — Reusable count-up animation composable.
 *
 * Extracted from SectionCommunity pattern: easeOutCubic rAF loop,
 * es-AR locale formatting, prefers-reduced-motion guard.
 *
 * Following CLAUDE.md pattern: exposes cleanup(), no onUnmounted inside.
 */

interface CountUpItem {
  value: number;
  prefix: string;
}

interface UseCountUpOptions {
  duration?: number;
  formatLocale?: string;
}

interface UseCountUpReturn {
  displayValues: Ref<string[]>;
  trigger: () => void;
  cleanup: () => void;
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export function useCountUp(
  items: CountUpItem[],
  options?: UseCountUpOptions,
): UseCountUpReturn {
  const { duration = 1500, formatLocale = "es-AR" } = options ?? {};

  const displayValues = ref<string[]>(items.map(() => "0"));

  let hasRun = false;
  let rafId: number | null = null;

  function formatNumber(value: number): string {
    return value.toLocaleString(formatLocale);
  }

  function trigger(): void {
    // Idempotent — only runs once
    if (hasRun) return;
    hasRun = true;

    // SSR guard
    if (!import.meta.client) {
      displayValues.value = items.map(
        (item) => item.prefix + formatNumber(item.value),
      );
      return;
    }

    // Reduced motion: display final values immediately
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      displayValues.value = items.map(
        (item) => item.prefix + formatNumber(item.value),
      );
      return;
    }

    const startTime = performance.now();

    function update(currentTime: number): void {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = easeOutCubic(progress);

      displayValues.value = items.map((item) => {
        if (progress >= 1) {
          return item.prefix + formatNumber(item.value);
        }
        const current = Math.floor(item.value * eased);
        return item.prefix + formatNumber(current);
      });

      if (progress < 1) {
        rafId = requestAnimationFrame(update);
      } else {
        rafId = null;
      }
    }

    rafId = requestAnimationFrame(update);
  }

  function cleanup(): void {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  return {
    displayValues,
    trigger,
    cleanup,
  };
}
