<template>
  <!--
    Fase 193 (D-03): ruta interna a la que aterriza el tap de una push con
    destino WhatsApp de ventas. Salta directo a WhatsApp y deja la app en Mi
    Templo por detrás; si el salto se bloquea (algunos Android abriendo desde
    una push) muestra el botón de respaldo en vez de una pantalla muerta.
  -->
  <q-page class="contacto-ventas-page" padding>
    <div class="contacto-ventas-page__card">
      <q-icon name="chat" class="contacto-ventas-page__icon" size="40px" />

      <h1 class="contacto-ventas-page__title">Te llevamos a WhatsApp…</h1>

      <p class="contacto-ventas-page__text">
        Si no se abrió solo, tocá el botón para continuar la conversación con ventas.
      </p>

      <q-btn
        unelevated
        no-caps
        class="contacto-ventas-page__primary full-width"
        icon="chat"
        label="Abrir WhatsApp"
        @click="openWhatsApp"
      />

      <q-btn
        flat
        no-caps
        dense
        class="contacto-ventas-page__secondary"
        label="Ir a Mi Templo"
        :to="{ path: FALLBACK_ROUTE }"
      />
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useUserStore } from 'src/stores/useUserStore'
import { useCommunicationsStore } from 'src/stores/useCommunicationsStore'
import { buildWhatsAppUrl } from 'src/utils/whatsapp'
import { DEFAULT_WHATSAPP_TEXT, FALLBACK_ROUTE } from 'src/config/destinations'
import { createLogger } from 'src/utils/logger'

const log = createLogger('ContactoVentasPage')
const route = useRoute()
const router = useRouter()
const userStore = useUserStore()
const communicationsStore = useCommunicationsStore()

function resolveText(): string {
  const fromQuery = route.query.text
  if (typeof fromQuery === 'string' && fromQuery.trim() !== '') return fromQuery
  return communicationsStore.defaultWhatsappText || DEFAULT_WHATSAPP_TEXT
}

/**
 * Intenta el salto a WhatsApp. Devuelve `true` si el navegador abrió (o
 * probablemente abrió) la pestaña/app nueva, `false` si `window.open`
 * devolvió `null` (bloqueo de pop-up).
 */
function openWhatsApp(): boolean {
  const url = buildWhatsAppUrl(userStore.profile?.branchCountry, resolveText())
  const win = window.open(url, '_blank')
  return win !== null
}

onMounted(() => {
  log.info('Salto automático a WhatsApp de ventas')
  const opened = openWhatsApp()
  if (opened) {
    // D-03: deja la app en Mi Templo por detrás — "atrás" no vuelve acá.
    void router.replace(FALLBACK_ROUTE)
  } else {
    log.warn('window.open bloqueado — se queda el botón de respaldo')
  }
})
</script>

<style lang="scss" scoped>
@import 'src/css/brand';

$terracotta: $brand-terracotta;
$cream: #f2ede5;
$charcoal: #2e2a26;

// Mismo lenguaje visual que VolverPage.vue / PlanExpiryDialog.vue — NO
// re-estilizar.
.contacto-ventas-page {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
}

.contacto-ventas-page__card {
  width: 100%;
  max-width: 380px;
  background: $charcoal;
  color: $cream;
  border-radius: 16px;
  border-top: 2px solid rgba($terracotta, 0.6);
  padding: 24px 20px 16px;
  text-align: center;
}

.contacto-ventas-page__icon {
  color: $terracotta;
  margin-bottom: 8px;
}

.contacto-ventas-page__title {
  font-family: 'Montserrat', sans-serif;
  font-weight: 700;
  font-size: 1.25rem;
  letter-spacing: 0.02em;
  margin: 0 0 16px 0;
  color: $cream;
}

.contacto-ventas-page__text {
  font-family: 'Geologica', sans-serif;
  font-weight: 400;
  font-size: 0.9375rem;
  line-height: 1.5;
  color: rgba($cream, 0.85);
  margin: 0 0 20px 0;
}

.contacto-ventas-page__primary {
  background: linear-gradient(135deg, $terracotta 0%, #ad6540 100%) !important;
  color: $cream !important;
  font-family: 'Montserrat', sans-serif;
  font-weight: 700;
  font-size: 0.9375rem;
  letter-spacing: 0.08em;
  padding: 12px 0;
  border-radius: 8px;
}

.contacto-ventas-page__secondary {
  color: rgba($cream, 0.55) !important;
  font-family: 'Geologica', sans-serif;
  font-weight: 400;
  font-size: 0.8125rem;
  margin-top: 12px;
}
</style>
