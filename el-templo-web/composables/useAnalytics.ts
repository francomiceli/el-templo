/**
 * useAnalytics -- Type-safe analytics event tracking.
 *
 * Wraps GA4 gtag() and Meta Pixel fbq() with null-safe checks.
 * Analytics scripts may not be loaded (no env var or blocked),
 * so every call must be guarded.
 *
 * En /es (Barcelona, RGPD) no se manda ningun evento sin consentimiento
 * (fase 195, D-22): `allowed()` lo decide con la ruta actual y `getConsent()`.
 *
 * Following CLAUDE.md: exposes cleanup(), no onUnmounted inside.
 */
import { analyticsMode } from "~/utils/analytics-loader";

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
  // Se evalua al disparar el evento (no al crear el composable): la persona
  // puede navegar o cambiar su eleccion entre medio.
  function allowed(): boolean {
    return (
      !import.meta.server &&
      analyticsMode(window.location.pathname, getConsent()) !== "deny"
    );
  }

  function trackEvent(eventName: GA4EventName): void {
    if (!allowed()) return;
    window.gtag?.("event", eventName);
  }

  function trackLead(): void {
    if (!allowed()) return;
    window.fbq?.("track", "Lead");
  }

  function trackPixelPageView(): void {
    if (!allowed()) return;
    window.fbq?.("track", "PageView");
  }

  function cleanup(): void {
    // No-op -- analytics scripts are global, no per-instance cleanup needed
  }

  return { trackEvent, trackLead, trackPixelPageView, cleanup };
}
