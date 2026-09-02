<template>
  <!-- D-07: salteable → el q-dialog NO usa el modo bloqueante. -->
  <q-dialog v-model="show" @hide="onHide">
    <q-card class="aviso-dialog">
      <q-card-section class="aviso-dialog__body">
        <h3 class="aviso-dialog__title">{{ aviso?.title }}</h3>

        <p class="aviso-dialog__text">{{ aviso?.body }}</p>
      </q-card-section>

      <q-card-actions class="aviso-dialog__actions">
        <q-btn
          unelevated
          no-caps
          class="aviso-dialog__primary full-width"
          :label="aviso?.buttonText"
          @click="onAccept"
        />
        <q-btn
          flat
          no-caps
          dense
          class="aviso-dialog__secondary"
          label="Ahora no"
          @click="onSkip"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAvisosStore } from 'src/stores/useAvisosStore'
import { CONTACT_SALES_ROUTE } from 'src/config/destinations'
import { createLogger } from 'src/utils/logger'

const log = createLogger('AvisoPromptDialog')
const router = useRouter()
const avisosStore = useAvisosStore()

const show = ref(false)

// Evita reportar 'dismissed' dos veces: onAccept ya reportó 'clicked' y
// marca este flag antes de cerrar, así el @hide del q-dialog (que dispara
// SIEMPRE que se cierra, sea por backdrop, Esc o el botón secundario) no
// suma un 'dismissed' espurio sobre un aviso que el socio sí tocó.
let reported = false

const aviso = computed(() => (avisosStore.isAviso ? (avisosStore.prompt?.aviso ?? null) : null))

watch(
  () => avisosStore.isAviso,
  (isAviso) => {
    if (isAviso) {
      reported = false
      show.value = true
    }
  },
  { immediate: true },
)

function onSkip(): void {
  log.info('Aviso dismissed by user')
  show.value = false
}

// Cubre backdrop / Esc / el botón secundario en un solo lugar (D-11: "cerró"
// se reporta siempre que el aviso se cierra sin que se haya tocado el botón).
function onHide(): void {
  if (reported) return
  reported = true
  const id = aviso.value?.id
  if (id) void avisosStore.reportDismissed(id)
}

function onAccept(): void {
  const current = aviso.value
  if (!current) return

  reported = true
  void avisosStore.reportClicked(current.id)
  show.value = false

  const destination = current.destination
  if (destination.type === 'whatsapp_sales') {
    const text = destination.whatsappText ?? ''
    void router.push(`${CONTACT_SALES_ROUTE}?text=${encodeURIComponent(text)}`)
  } else {
    void router.push(destination.route)
  }
}
</script>

<style lang="scss" scoped>
@import 'src/css/brand';

$terracotta: $brand-terracotta;
$cream: #f2ede5;
$charcoal: #2e2a26;

// Estilos copiados de RatingPromptDialog.vue (mandato de reuse): card
// charcoal, gradiente terracotta, secundario flat cream-55, max-width 340px,
// border-radius 16px. NO re-estilizar.
.aviso-dialog {
  width: 100%;
  max-width: 340px;
  background: $charcoal;
  color: $cream;
  border-radius: 16px;
  border-top: 2px solid rgba($terracotta, 0.6);
  padding: 8px 4px 16px;
}

.aviso-dialog__body {
  text-align: center;
  padding-top: 16px;
}

.aviso-dialog__title {
  font-family: 'Montserrat', sans-serif;
  font-weight: 700;
  font-size: 1.125rem;
  letter-spacing: 0.04em;
  margin: 0 0 16px 0;
  color: $cream;
}

.aviso-dialog__text {
  font-family: 'Geologica', sans-serif;
  font-weight: 400;
  font-size: 0.9375rem;
  line-height: 1.5;
  color: rgba($cream, 0.85);
  margin: 0;
}

.aviso-dialog__actions {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 16px 20px 4px;
}

.aviso-dialog__primary {
  background: linear-gradient(135deg, $terracotta 0%, #ad6540 100%) !important;
  color: $cream !important;
  font-family: 'Montserrat', sans-serif;
  font-weight: 700;
  font-size: 0.9375rem;
  letter-spacing: 0.12em;
  padding: 12px 0;
  border-radius: 8px;
}

.aviso-dialog__secondary {
  color: rgba($cream, 0.55) !important;
  font-family: 'Geologica', sans-serif;
  font-weight: 400;
  font-size: 0.8125rem;
  margin-top: 4px;
}
</style>
