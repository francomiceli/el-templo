<template>
  <!-- Fase 214 (plan 26): vista de la foto de un compañero y "Reportar foto" (UI-SPEC Pantalla 3d,
       D-34, D-45). Dos pasos en el mismo diálogo: ver y confirmar. El reporte NO oculta la foto en
       la app: la decisión es del equipo (plan 14). La respuesta del servidor es 204 sin datos, así
       que la app nunca sabe quién más reportó (T-214-26-02). -->
  <q-dialog
    :model-value="modelValue"
    :transition-duration="dialogDuration"
    aria-labelledby="attendee-photo-title"
    :persistent="reporting"
    @update:model-value="onUpdateModelValue"
  >
    <PremiumDialogCard v-if="attendee" tone="light">
      <!-- Paso 1: la foto en grande -->
      <template v-if="step === 'view'">
        <div class="apd__view">
          <MemberAvatar
            :size="160"
            :url="attendee.photoUrl"
            :first-name="attendee.firstName"
            :last-initial="attendee.lastInitial"
          />
          <h3 id="attendee-photo-title" class="apd__name">{{ name }}</h3>
          <span v-if="attendee.aura !== null" class="apd__aura">
            <span class="apd__spark" aria-hidden="true">✦</span>{{ formatAura(attendee.aura) }}
          </span>
        </div>
        <div class="pd-acts">
          <q-btn
            flat
            no-caps
            dense
            class="pd-skip"
            icon="flag"
            label="Reportar foto"
            :disable="attendee.photoId === null"
            @click="step = 'confirm'"
          />
          <q-btn flat no-caps dense class="pd-skip" label="Cerrar" @click="close" />
        </div>
      </template>

      <!-- Paso 2: confirmar el reporte -->
      <template v-else>
        <h3 id="attendee-photo-title" class="pd-title">¿Reportar la foto de {{ name }}?</h3>
        <p class="pd-text">
          La revisa el equipo de El Templo. {{ attendee.firstName }} no se entera de quién la
          reportó.
        </p>
        <div class="pd-acts">
          <q-btn
            unelevated
            no-caps
            class="pd-cta"
            label="Reportar"
            :loading="reporting"
            @click="onReport"
          />
          <q-btn
            flat
            no-caps
            dense
            class="pd-skip"
            label="Cancelar"
            :disable="reporting"
            @click="step = 'view'"
          />
        </div>
      </template>
    </PremiumDialogCard>
  </q-dialog>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import axios from 'axios'
import { useQuasar } from 'quasar'
import MemberAvatar from 'src/components/MemberAvatar.vue'
import PremiumDialogCard from 'src/components/PremiumDialogCard.vue'
import { useCommunityApi } from 'src/composables/useCommunityApi'
import { attendeeName } from 'src/utils/attendees-view'
import { formatAura } from 'src/utils/aura-format'
import { createLogger } from 'src/utils/logger'
import { prefersReducedMotion } from 'src/utils/reduced-motion'
import type { Attendee } from 'src/types/community'

const props = defineProps<{
  modelValue: boolean
  attendee: Attendee | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const log = createLogger('AttendeePhotoDialog')
const $q = useQuasar()
const community = useCommunityApi()

// Movimiento reducido: el diálogo aparece sin transición.
const dialogDuration = prefersReducedMotion() ? 0 : 300

const step = ref<'view' | 'confirm'>('view')
const reporting = ref(false)

const name = computed(() => (props.attendee ? attendeeName(props.attendee) : ''))

function close(): void {
  emit('update:modelValue', false)
}

function onUpdateModelValue(value: boolean): void {
  emit('update:modelValue', value)
}

/** Textos exactos del UI-SPEC 3d según la respuesta del servidor. */
function reportErrorMessage(err: unknown): string {
  const status = axios.isAxiosError(err) ? err.response?.status : undefined
  if (status === 404) return 'Esa foto ya no está disponible.'
  if (status === 429) return 'Ya enviaste varios reportes. Probá de nuevo en un rato.'
  return 'No pudimos enviar el reporte. Probá de nuevo.'
}

async function onReport(): Promise<void> {
  const photoId = props.attendee?.photoId ?? null
  if (photoId === null || reporting.value) return
  reporting.value = true
  try {
    await community.reportPhoto(photoId)
    $q.notify({ type: 'positive', message: 'Gracias. La vamos a revisar.', timeout: 3500 })
    close()
  } catch (err: unknown) {
    const status = axios.isAxiosError(err) ? err.response?.status : undefined
    if (status !== 404 && status !== 429) {
      log.error('No se pudo reportar la foto', {
        error: err instanceof Error ? err.message : String(err),
      })
    }
    $q.notify({ type: 'negative', message: reportErrorMessage(err), timeout: 5000 })
    // La foto ya no existe: no hay nada que reintentar. En el resto se puede volver a probar.
    if (status === 404) close()
  } finally {
    reporting.value = false
  }
}

// Cada apertura arranca en el paso 1.
watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      step.value = 'view'
      reporting.value = false
    }
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  community.cleanup()
})
</script>

<style scoped lang="scss">
@import 'src/css/premium-card';

.apd {
  &__view {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding-top: 4px;
    text-align: center;
  }

  &__name {
    margin: 8px 0 0;
    font-family: 'Montserrat', sans-serif;
    font-weight: 700;
    font-size: 18px;
    line-height: 1.3;
    color: $pd-ink;
  }

  &__aura {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    min-height: 20px;
    padding: 0 8px;
    border-radius: 999px;
    background: $pd-gold-tint;
    font-family: 'Montserrat', sans-serif;
    font-weight: 700;
    font-size: 13px;
    font-variant-numeric: tabular-nums;
    color: $pd-gold-ink;
  }

  &__spark {
    color: $pd-gold;
  }
}
</style>
