<!-- Pantalla "Proponé una mejora" — acceso fijo del canal de propuestas
     (brief 2026-07-15). Texto libre, sin categorías; la sucursal se resuelve
     server-side. El popup (ImprovementPromptDialog) es el otro punto de
     entrada al mismo endpoint. -->
<template>
  <q-page class="mejoras-page" padding>
    <p class="page-title">Envianos tu sugerencia</p>

    <!-- Enviado: confirmación con opción de mandar otra -->
    <div v-if="sent" class="sent-card">
      <q-icon name="check_circle" size="48px" color="positive" />
      <p class="sent-card__title">¡Gracias! Tu sugerencia fue enviada al equipo.</p>
      <p class="sent-card__subtitle">Es anónima y el equipo lee cada sugerencia.</p>
      <q-btn color="primary" outline no-caps label="Enviar otra sugerencia" @click="resetForm" />
    </div>

    <!-- Formulario -->
    <template v-else>
      <div class="info-card q-mb-md">
        <q-icon name="emoji_objects" size="24px" color="primary" class="info-card__icon" />
        <div class="info-card__content">
          <span class="info-card__question"> ¿Qué mejorarías de El Templo? </span>
          <span class="info-card__hint">
            El equipo está escuchando y tu sugerencia es anónima: contanos qué mejorarías para darte la mejor experiencia.
          </span>
        </div>
      </div>

      <q-input
        v-model="proposal"
        type="textarea"
        outlined
        autogrow
        counter
        maxlength="1000"
        label="Tu sugerencia"
        :input-style="{ minHeight: '120px' }"
      />

      <q-btn
        class="q-mt-md full-width"
        color="primary"
        unelevated
        no-caps
        label="Enviar sugerencia"
        :disable="proposal.trim().length === 0"
        :loading="submitting"
        @click="onSubmit"
      />
    </template>
  </q-page>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useQuasar } from 'quasar'
import { useImprovementProposalsApi } from 'src/composables/useImprovementProposalsApi'
import { extractError, isExpectedClientError } from 'src/utils/extract-error'
import { createLogger } from 'src/utils/logger'

const log = createLogger('ProponerMejoraPage')
const $q = useQuasar()
const { submitProposal } = useImprovementProposalsApi()

const proposal = ref('')
const submitting = ref(false)
const sent = ref(false)

function resetForm(): void {
  proposal.value = ''
  sent.value = false
}

async function onSubmit(): Promise<void> {
  const trimmed = proposal.value.trim()
  if (!trimmed) return
  submitting.value = true
  try {
    await submitProposal(trimmed)
    sent.value = true
  } catch (err: unknown) {
    const message = extractError(err, 'No pudimos enviar tu sugerencia. Probá de nuevo en un rato.')
    if (isExpectedClientError(err)) {
      log.warn('Proposal submit rejected', { message })
    } else {
      log.error('Failed to submit proposal', {
        error: err instanceof Error ? err.message : String(err),
      })
    }
    $q.notify({ type: 'negative', message })
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped lang="scss">
@import 'src/css/quasar.variables.scss';

.mejoras-page {
  max-width: 600px;
  margin: 0 auto;
}

.page-title {
  font-family: 'Montserrat', sans-serif;
  font-size: 20px;
  font-weight: 700;
  color: $primary;
  margin: 8px 0 16px;
}

.info-card {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px;
  background: white;
  border: 1px solid rgba($primary, 0.15);
  border-radius: 12px;
  border-left: 4px solid $primary;

  &__icon {
    flex-shrink: 0;
    margin-top: 2px;
  }

  &__content {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  &__question {
    font-size: 15px;
    font-weight: 600;
    color: $primary;
    line-height: 1.4;
  }

  &__hint {
    font-size: 13px;
    color: $grey-7;
    line-height: 1.5;
  }
}

.sent-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 48px 16px;
  text-align: center;

  &__title {
    font-family: 'Montserrat', sans-serif;
    font-size: 17px;
    font-weight: 700;
    color: $primary;
    margin: 0;
  }

  &__subtitle {
    font-size: 14px;
    color: $grey-7;
    margin: 0 0 8px;
  }
}
</style>
