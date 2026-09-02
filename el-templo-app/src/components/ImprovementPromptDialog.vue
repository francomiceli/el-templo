<template>
  <!-- Salteable → SIN persistent (mismo criterio que RatingPromptDialog) -->
  <q-dialog v-model="show">
    <q-card class="proposal-dialog">
      <q-card-section class="proposal-dialog__body">
        <h3 class="proposal-dialog__title">{{ title }}</h3>
        <p class="proposal-dialog__question">{{ bodyText }}</p>

        <q-input
          v-model="proposal"
          class="proposal-dialog__input"
          type="textarea"
          autogrow
          dark
          outlined
          counter
          maxlength="1000"
          label="Tu sugerencia"
        />

        <p class="proposal-dialog__helper">
          Tu sugerencia es anónima. Leemos cada una.
        </p>
      </q-card-section>

      <q-card-actions class="proposal-dialog__actions">
        <q-btn
          unelevated
          no-caps
          class="proposal-dialog__primary full-width"
          :disable="proposal.trim().length === 0"
          :loading="submitting"
          :label="buttonText"
          @click="onSubmit"
        />
        <q-btn
          flat
          no-caps
          dense
          class="proposal-dialog__secondary"
          :disable="submitting"
          label="Ahora no"
          @click="onSkip"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useQuasar } from 'quasar'
import { useAvisosStore } from 'src/stores/useAvisosStore'
import { useImprovementProposalsApi } from 'src/composables/useImprovementProposalsApi'
import { extractError, isExpectedClientError } from 'src/utils/extract-error'
import { createLogger } from 'src/utils/logger'

const log = createLogger('ImprovementPromptDialog')
const $q = useQuasar()
const avisosStore = useAvisosStore()
const { submitProposal } = useImprovementProposalsApi()

const show = ref(false)
const submitting = ref(false)
const proposal = ref('')

// Copy del aviso de sistema `improvement_prompt` (D-09), con fallback al
// hardcode viejo por si el servidor no lo trae (defensivo, L4).
const title = computed(() => {
  const p = avisosStore.prompt
  return p && p.kind === 'improvement' ? p.aviso.title : '¿Qué mejorarías de El Templo?'
})

const bodyText = computed(() => {
  const p = avisosStore.prompt
  return p && p.kind === 'improvement'
    ? p.aviso.body
    : 'El equipo está escuchando: contanos qué te gustaría para darte la mejor experiencia.'
})

const buttonText = computed(() => {
  const p = avisosStore.prompt
  return p && p.kind === 'improvement' ? p.aviso.buttonText : 'Enviar sugerencia'
})

function currentAvisoId(): number | null {
  const p = avisosStore.prompt
  return p ? p.aviso.id : null
}

function onSkip(): void {
  log.info('Proposal prompt skipped')
  const avisoId = currentAvisoId()
  if (avisoId) void avisosStore.reportDismissed(avisoId)
  show.value = false
}

async function onSubmit(): Promise<void> {
  const trimmed = proposal.value.trim()
  if (!trimmed) return
  submitting.value = true
  try {
    await submitProposal(trimmed)
    const avisoId = currentAvisoId()
    if (avisoId) void avisosStore.reportClicked(avisoId)
    show.value = false
    $q.notify({ type: 'positive', message: '¡Gracias! Tu sugerencia fue enviada al equipo.' })
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

// El servidor ya decidió que hoy toca la propuesta de mejora (D-06/D-07/D-09):
// esta vista solo reacciona al getter del store, sin evaluar nada por su cuenta.
watch(
  () => avisosStore.isImprovement,
  (isImprovement) => {
    if (isImprovement) {
      proposal.value = ''
      show.value = true
    }
  },
  { immediate: true },
)
</script>

<style lang="scss" scoped>
@import 'src/css/brand';

$terracotta: $brand-terracotta;
$cream: #f2ede5;
$charcoal: #2e2a26;

.proposal-dialog {
  width: 100%;
  max-width: 340px;
  background: $charcoal;
  color: $cream;
  border-radius: 16px;
  border-top: 2px solid rgba($terracotta, 0.6);
  padding: 8px 4px 16px;
}

.proposal-dialog__body {
  text-align: center;
  padding-top: 16px;
}

.proposal-dialog__title {
  font-family: 'Montserrat', sans-serif;
  font-weight: 700;
  font-size: 1.125rem;
  letter-spacing: 0.04em;
  margin: 0 0 8px 0;
  color: $cream;
}

.proposal-dialog__question {
  font-family: 'Geologica', sans-serif;
  font-weight: 500;
  font-size: 0.9375rem;
  line-height: 1.5;
  color: rgba($cream, 0.85);
  margin: 0 4px 16px;
}

.proposal-dialog__input {
  margin-bottom: 12px;
  text-align: left;
}

.proposal-dialog__helper {
  font-family: 'Geologica', sans-serif;
  font-weight: 400;
  font-size: 0.8125rem;
  line-height: 1.5;
  color: rgba($cream, 0.65);
  margin: 0;
}

.proposal-dialog__actions {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 16px 20px 4px;
}

.proposal-dialog__primary {
  background: linear-gradient(135deg, $terracotta 0%, #ad6540 100%) !important;
  color: $cream !important;
  font-family: 'Montserrat', sans-serif;
  font-weight: 700;
  font-size: 0.9375rem;
  letter-spacing: 0.12em;
  padding: 12px 0;
  border-radius: 8px;
}

.proposal-dialog__secondary {
  color: rgba($cream, 0.55) !important;
  font-family: 'Geologica', sans-serif;
  font-weight: 400;
  font-size: 0.8125rem;
  margin-top: 4px;
}
</style>
