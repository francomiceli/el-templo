<template>
  <!--
    Destino de los segmentos "bajas" y "prueba no convertida" (D-13, Phase 180).
    D-13 es explícito: NO hay auto-gestión de re-alta en esta fase — el único
    camino es coordinar por WhatsApp. Sin membresías ni cobro acá (Deferred Ideas).
  -->
  <q-page class="volver-page" padding>
    <div class="volver-page__card">
      <q-icon name="favorite" class="volver-page__icon" size="40px" />

      <h1 class="volver-page__title">¡Qué bueno tenerte de vuelta!</h1>

      <p class="volver-page__text">
        Para retomar tus clases, coordinemos juntos por WhatsApp — te esperamos.
      </p>

      <q-btn
        unelevated
        no-caps
        class="volver-page__primary full-width"
        icon="chat"
        label="Escribinos por WhatsApp"
        @click="onWhatsAppClick"
      />

      <q-btn
        flat
        no-caps
        dense
        class="volver-page__secondary"
        label="Ir a Reservas"
        :to="{ name: 'reservas' }"
      />
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { useUserStore } from 'src/stores/useUserStore'
import { buildWhatsAppUrl } from 'src/utils/whatsapp'
import { createLogger } from 'src/utils/logger'

const log = createLogger('VolverPage')
const userStore = useUserStore()

const WHATSAPP_TEXT = 'Hola! Quiero volver a entrenar'

function onWhatsAppClick(): void {
  log.info('Volver → WhatsApp')
  window.open(buildWhatsAppUrl(userStore.profile?.branchCountry, WHATSAPP_TEXT), '_blank')
}
</script>

<style lang="scss" scoped>
@import 'src/css/brand';

$terracotta: $brand-terracotta;
$cream: #f2ede5;
$charcoal: #2e2a26;

.volver-page {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
}

// Mismo lenguaje visual que el diálogo de vencimiento de membresía (card
// charcoal, gradiente terracotta, secundario flat cream-55) — NO re-estilizar.
.volver-page__card {
  width: 100%;
  max-width: 380px;
  background: $charcoal;
  color: $cream;
  border-radius: 16px;
  border-top: 2px solid rgba($terracotta, 0.6);
  padding: 24px 20px 16px;
  text-align: center;
}

.volver-page__icon {
  color: $terracotta;
  margin-bottom: 8px;
}

.volver-page__title {
  font-family: 'Montserrat', sans-serif;
  font-weight: 700;
  font-size: 1.25rem;
  letter-spacing: 0.02em;
  margin: 0 0 16px 0;
  color: $cream;
}

.volver-page__text {
  font-family: 'Geologica', sans-serif;
  font-weight: 400;
  font-size: 0.9375rem;
  line-height: 1.5;
  color: rgba($cream, 0.85);
  margin: 0 0 20px 0;
}

.volver-page__primary {
  background: linear-gradient(135deg, $terracotta 0%, #ad6540 100%) !important;
  color: $cream !important;
  font-family: 'Montserrat', sans-serif;
  font-weight: 700;
  font-size: 0.9375rem;
  letter-spacing: 0.08em;
  padding: 12px 0;
  border-radius: 8px;
}

.volver-page__secondary {
  color: rgba($cream, 0.55) !important;
  font-family: 'Geologica', sans-serif;
  font-weight: 400;
  font-size: 0.8125rem;
  margin-top: 12px;
}
</style>
