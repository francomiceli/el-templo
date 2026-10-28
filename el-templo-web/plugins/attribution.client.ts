/**
 * Attribution client plugin -- guarda el first-touch al entrar al sitio y
 * mantiene al dia los links "Reservá online" (fase 195, D-18).
 *
 * En /es solo guarda despues de que la persona acepta el consentimiento: al
 * pasar a `granted` vuelve a llamar a `capture()`.
 */
export default defineNuxtPlugin(() => {
  const { consentState, load } = useConsent();
  load();
  const { capture, refresh } = useAttribution();
  const router = useRouter();

  capture();

  // Los links recalculan al cambiar el consentimiento o la ruta (cada
  // componente espera a montarse antes de usar el origen: ver useAttribution).
  watch(consentState, (value) => {
    if (value === "granted") capture();
    refresh();
  });

  router.afterEach(() => refresh());
});
