/**
 * useAnalytics -- Type-safe analytics event tracking.
 *
 * Wraps GA4 gtag() and Meta Pixel fbq() with null-safe checks.
 * Analytics scripts may not be loaded (no env var or blocked),
 * so every call must be guarded.
 *
 * Following CLAUDE.md: exposes cleanup(), no onUnmounted inside.
 */

// Extend Window for GA4 and Meta Pixel globals
declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    fbq?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

type GA4EventName =
  | "form_submit_franchise"
  | "form_submit_gladius"
  | "click_whatsapp_franchise"
  | "click_whatsapp_gladius"
  | "click_whatsapp_sede"
  | "click_cta_trial"
  | "click_cta_franchise"
  | "click_cta_app"
  | "click_cta_gladius_consult"
  | string; // Allow section tracking events like viewed_method

export function useAnalytics() {
  function trackEvent(eventName: GA4EventName): void {
    if (import.meta.server) return;
    window.gtag?.("event", eventName);
  }

  function trackLead(): void {
    if (import.meta.server) return;
    window.fbq?.("track", "Lead");
  }

  function trackPixelPageView(): void {
    if (import.meta.server) return;
    window.fbq?.("track", "PageView");
  }

  function cleanup(): void {
    // No-op -- analytics scripts are global, no per-instance cleanup needed
  }

  return { trackEvent, trackLead, trackPixelPageView, cleanup };
}
