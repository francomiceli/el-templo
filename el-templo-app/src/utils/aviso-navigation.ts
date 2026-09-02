// Navegación al destino de un aviso (D-01/D-03): mismo criterio que
// `AvisoPromptDialog.vue`/`PlanExpiryDialog.vue` (plan 193-12) — WhatsApp de
// ventas salta a la pantalla interna `/contacto-ventas?text=` (que arma el
// link con el número resuelto server-side, D-20/D-21); una sección de la app
// navega directo a su ruta. Extraído acá (plan 193-15) porque el carrusel de
// Mi Templo suma 5 puntos de llamada nuevos (`AvisoCard.vue` + las 4
// tarjetas fijas) que repetirían el mismo switch de 2 ramas — CLAUDE.md pide
// marcar la repetición de forma agresiva.
import type { Router } from 'vue-router'
import { CONTACT_SALES_ROUTE } from 'src/config/destinations'
import type { PromptDestination } from 'src/stores/useAvisosStore'

export function navigateToAvisoDestination(router: Router, destination: PromptDestination): void {
  if (destination.type === 'whatsapp_sales') {
    const text = destination.whatsappText ?? ''
    void router.push(`${CONTACT_SALES_ROUTE}?text=${encodeURIComponent(text)}`)
  } else {
    void router.push(destination.route)
  }
}
