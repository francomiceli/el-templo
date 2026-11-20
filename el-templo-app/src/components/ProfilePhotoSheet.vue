<template>
  <!-- Fase 214 (plan 21): hoja clara "Foto de perfil" (Pantalla 4c del UI-SPEC). Tres vistas: la
       principal (estado y acciones), la vista previa ("Así se va a ver") y la confirmación de
       quitar. Toda subida pasa antes por `PhotoRulesDialog` (D-50). -->
  <q-dialog
    :model-value="modelValue"
    position="bottom"
    :persistent="busy"
    :transition-duration="dialogDuration"
    aria-labelledby="photo-sheet-title"
    @update:model-value="onUpdateModelValue"
    @hide="onHide"
  >
    <q-card class="psheet" :style="swipe.cardStyle.value">
      <div class="psheet__grab" aria-hidden="true" v-on="swipe.handlers" />

      <!-- Vista previa de la foto preparada -->
      <template v-if="view === 'preview'">
        <p class="psheet__kicker">TU FOTO</p>
        <h2 id="photo-sheet-title" class="psheet__title">Así se va a ver</h2>

        <div class="psheet__center">
          <MemberAvatar
            :size="160"
            :url="photoCtl.previewUrl.value"
            :first-name="firstName"
            :last-initial="lastInitial"
          />
          <p class="psheet__caption">Se recorta al centro.</p>
        </div>

        <div class="psheet__acts" :aria-busy="photoCtl.uploading.value">
          <q-btn
            unelevated
            no-caps
            class="psheet__cta"
            label="Subir foto"
            :loading="photoCtl.uploading.value"
            @click="onUpload"
          >
            <template #loading>
              <q-spinner size="18px" class="q-mr-sm" />
              Subiendo…
            </template>
          </q-btn>
          <q-btn
            flat
            no-caps
            dense
            class="psheet__skip"
            label="Elegir otra"
            :disable="photoCtl.uploading.value"
            @click="onChooseAnother"
          />
        </div>
      </template>

      <!-- Vista principal -->
      <template v-else>
        <p class="psheet__kicker">TU FOTO</p>
        <h2 id="photo-sheet-title" class="psheet__title">Foto de perfil</h2>

        <div class="psheet__center">
          <MemberAvatar
            :size="120"
            :url="shownUrl"
            :first-name="firstName"
            :last-initial="lastInitial"
            :badge="photo?.pendingUrl ? 'review' : null"
          />
          <p class="psheet__status">{{ statusLine }}</p>
          <p v-if="rejectionLine" class="psheet__status psheet__status--reason">
            {{ rejectionLine }}
          </p>
        </div>

        <div class="psheet__card">
          <template v-if="photoCtl.isNative">
            <button type="button" class="psheet__row" @click="startPick('camera')">
              <q-icon name="photo_camera" size="22px" class="psheet__row-icon" aria-hidden="true" />
              <span>Sacar una foto</span>
            </button>
            <button type="button" class="psheet__row" @click="startPick('gallery')">
              <q-icon
                name="photo_library"
                size="22px"
                class="psheet__row-icon"
                aria-hidden="true"
              />
              <span>Elegir de la galería</span>
            </button>
          </template>
          <button v-else type="button" class="psheet__row" @click="startPick('file')">
            <q-icon name="upload" size="22px" class="psheet__row-icon" aria-hidden="true" />
            <span>Elegir una foto</span>
          </button>
          <button
            v-if="hasAnyPhoto"
            type="button"
            class="psheet__row psheet__row--neg"
            @click="removeOpen = true"
          >
            <q-icon name="delete_outline" size="22px" aria-hidden="true" />
            <span>Quitar mi foto</span>
          </button>
        </div>

        <p class="psheet__foot">
          La primera foto aprobada suma {{ AURA_AMOUNTS_UI.profilePhoto }} de Aura.
        </p>

        <q-btn flat no-caps dense class="psheet__skip" label="Cerrar" @click="close" />
      </template>

      <input
        ref="fileInput"
        class="psheet__file"
        type="file"
        accept="image/*"
        tabindex="-1"
        aria-hidden="true"
        @change="onFileChosen"
      />
    </q-card>
  </q-dialog>

  <PhotoRulesDialog v-model="rulesOpen" @accept="onRulesAccepted" @cancel="pendingSource = null" />

  <!-- Confirmación de quitar (D-30, D-63) -->
  <q-dialog
    v-model="removeOpen"
    :persistent="removing"
    :transition-duration="dialogDuration"
    aria-labelledby="photo-remove-title"
  >
    <PremiumDialogCard tone="light">
      <h3 id="photo-remove-title" class="pd-title pd-title--neg">¿Quitar tu foto?</h3>
      <p class="pd-text">
        Se quita de tu perfil, de tu ficha y de las listas de la clase. Si sumaste Aura por tu foto,
        no se pierde.
      </p>
      <div class="pd-acts">
        <q-btn
          unelevated
          no-caps
          class="pd-cta pd-cta--neg"
          label="Quitar foto"
          :loading="removing"
          @click="onConfirmRemove"
        />
        <q-btn
          flat
          no-caps
          dense
          class="pd-skip"
          label="Cancelar"
          :disable="removing"
          @click="removeOpen = false"
        />
      </div>
    </PremiumDialogCard>
  </q-dialog>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { useQuasar } from 'quasar'
import MemberAvatar from 'src/components/MemberAvatar.vue'
import PhotoRulesDialog from 'src/components/PhotoRulesDialog.vue'
import PremiumDialogCard from 'src/components/PremiumDialogCard.vue'
import { useProfilePhoto } from 'src/composables/useProfilePhoto'
import { useSheetSwipeDismiss } from 'src/composables/useSheetSwipeDismiss'
import { useUserStore } from 'src/stores/useUserStore'
import { AURA_AMOUNTS_UI } from 'src/constants/aura-amounts'
import { rejectionReasonLabel } from 'src/utils/photo-messages'
import {
  readPhotoRules,
  recordAcceptance,
  recordAfterPhotoChange,
  shouldShowPhotoRules,
  writePhotoRules,
} from 'src/utils/photo-rules-memory'
import { prefersReducedMotion } from 'src/utils/reduced-motion'
import type { PhotoStatus } from 'src/types/community'

type PhotoSource = 'camera' | 'gallery' | 'file'

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const $q = useQuasar()
const userStore = useUserStore()
const photoCtl = useProfilePhoto()

const STATUS_LINES: Record<PhotoStatus, string> = {
  none: 'Todavía no subiste tu foto.',
  pendiente: 'Tu foto está en revisión. La ven tus compañeros cuando la aprobemos.',
  aprobada: 'Tu foto está aprobada y aparece en las listas de la clase.',
  rechazada: 'Tu última foto no fue aprobada. Podés subir otra.',
}

// Movimiento reducido: la hoja y los diálogos aparecen sin transición.
const dialogDuration = prefersReducedMotion() ? 0 : 280

const view = ref<'main' | 'preview'>('main')
const rulesOpen = ref(false)
const removeOpen = ref(false)
const removing = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
/** Fuente elegida, pendiente de que se acepten las normas. */
const pendingSource = ref<PhotoSource | null>(null)
/** Última fuente usada: "Elegir otra" la repite (con las normas solo si hacen falta, #6). */
let lastSource: PhotoSource | null = null

const photo = computed(() => userStore.profile?.photo ?? null)
const firstName = computed(() => userStore.profile?.firstName ?? null)
const lastInitial = computed(() => userStore.profile?.lastName?.trim().charAt(0) ?? null)
const shownUrl = computed(() => photo.value?.url ?? photo.value?.pendingUrl ?? null)
const hasAnyPhoto = computed(() => !!photo.value?.url || !!photo.value?.pendingUrl)
const statusLine = computed(() => STATUS_LINES[photo.value?.status ?? 'none'])

// Solo con "rechazada" y un motivo distinto de `otro` (supuesto del plan, ver SUMMARY).
const rejectionLine = computed(() => {
  if (photo.value?.status !== 'rechazada') return null
  const label = rejectionReasonLabel(photo.value.rejectionReason)
  return label ? `Motivo: ${label}.` : null
})

// Mientras se sube o se quita, la hoja no se cierra por accidente (doble envío, T-214-21-03).
const busy = computed(() => photoCtl.uploading.value || removing.value)
// Arrastrar la hoja hacia abajo la cierra (la rayita y la cabecera son la zona de arrastre).
const swipe = useSheetSwipeDismiss({
  isOpen: () => props.modelValue,
  canDismiss: () => !busy.value,
  onDismiss: close,
})

function close(): void {
  emit('update:modelValue', false)
}

function onUpdateModelValue(value: boolean): void {
  emit('update:modelValue', value)
}

function onHide(): void {
  photoCtl.discard()
  view.value = 'main'
  pendingSource.value = null
}

function notifyError(): void {
  if (photoCtl.error.value) {
    $q.notify({ type: 'negative', message: photoCtl.error.value, timeout: 5000 })
  }
}

// ── Elegir la foto: las normas van la primera vez y después de un rechazo (D-50, #6) ──
function startPick(source: PhotoSource): void {
  const userId = userStore.profile?.id
  const status = photo.value?.status ?? null
  if (shouldShowPhotoRules(readPhotoRules(userId), status)) {
    pendingSource.value = source
    rulesOpen.value = true
    return
  }
  // Ya las aceptó y no le rechazaron nada después: sigue directo, en el mismo gesto del toque.
  proceedWithSource(source)
}

function onRulesAccepted(): void {
  const source = pendingSource.value
  pendingSource.value = null
  if (!source) return
  writePhotoRules(userStore.profile?.id, recordAcceptance(photo.value?.status ?? null))
  proceedWithSource(source)
}

function proceedWithSource(source: PhotoSource): void {
  lastSource = source
  if (source === 'file') {
    // Debe ejecutarse en el mismo gesto del clic (en "Acepto" o en la fila): sin `await` antes.
    fileInput.value?.click()
    return
  }
  void pickNative(source)
}

async function pickNative(source: 'camera' | 'gallery'): Promise<void> {
  const ready =
    source === 'camera' ? await photoCtl.pickFromCamera() : await photoCtl.pickFromGallery()
  if (ready) {
    view.value = 'preview'
    return
  }
  // Cancelar la cámara o la galería vuelve a la vista principal sin mensaje.
  notifyError()
}

async function onFileChosen(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0] ?? null
  // Permite volver a elegir el mismo archivo.
  input.value = ''
  if (!file) return
  const ready = await photoCtl.pickFromFile(file)
  if (ready) {
    view.value = 'preview'
    return
  }
  notifyError()
}

function onChooseAnother(): void {
  photoCtl.discard()
  view.value = 'main'
  if (lastSource) startPick(lastSource)
}

// ── Subir ──
async function onUpload(): Promise<void> {
  const ok = await photoCtl.upload()
  if (ok) {
    // Una foto nueva reinicia la marca: si la rechazan otra vez, las normas vuelven (#6).
    const userId = userStore.profile?.id
    writePhotoRules(userId, recordAfterPhotoChange(readPhotoRules(userId)))
    view.value = 'main'
    $q.notify({ type: 'positive', message: 'Listo. Tu foto quedó en revisión.', timeout: 3500 })
    return
  }
  notifyError()
}

// ── Quitar ──
async function onConfirmRemove(): Promise<void> {
  if (removing.value) return
  removing.value = true
  try {
    const ok = await photoCtl.removePhoto()
    removeOpen.value = false
    if (ok) {
      const userId = userStore.profile?.id
      writePhotoRules(userId, recordAfterPhotoChange(readPhotoRules(userId)))
      $q.notify({ type: 'positive', message: 'Listo, quitamos tu foto.', timeout: 3000 })
    } else {
      $q.notify({
        type: 'negative',
        message: 'No pudimos quitar la foto. Probá de nuevo.',
        timeout: 5000,
      })
    }
  } finally {
    removing.value = false
  }
}

onBeforeUnmount(() => {
  swipe.cleanup()
  photoCtl.cleanup()
})
</script>

<style scoped lang="scss">
@import 'src/css/premium-card';

.psheet {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 480px;
  max-height: 90vh;
  margin: 0 auto;
  overflow-y: auto;
  // 20 de borde lateral como SponsorSheet; abajo 16 + 16 sobre la zona segura.
  padding: 4px 20px calc(32px + env(safe-area-inset-bottom, 0px));
  background: $pd-light-surface;
  border-radius: 20px 20px 0 0;
  box-shadow: none;
  font-family: 'Geologica', sans-serif;
  color: $pd-ink;

  &__grab {
    @include pd-sheet-drag-handle;
    flex: none;
    align-self: center;
    width: 40px;
    height: 4px;
    margin: 8px auto 4px;
    border-radius: 2px;
    background: #d9cfc1;
  }

  &__kicker {
    @include pd-kicker-light;
    margin-top: 12px;
  }

  &__title {
    margin: 4px 0 0;
    font-family: 'Montserrat', sans-serif;
    font-weight: 700;
    font-size: 18px;
    line-height: 1.2;
    color: $pd-ink;
  }

  &__center {
    display: flex;
    flex-direction: column;
    align-items: center;
    margin: 16px 0;
  }

  &__status {
    margin: 16px 0 0;
    font-size: 15px;
    line-height: 1.5;
    text-align: center;
    color: $pd-ink;

    &--reason {
      margin-top: 4px;
    }
  }

  &__caption {
    margin: 16px 0 0;
    font-size: 13px;
    line-height: 1.35;
    color: $pd-ink-2;
  }

  &__card {
    @include pd-surface-light;
    overflow: hidden;
  }

  &__row {
    display: flex;
    align-items: center;
    gap: 16px;
    width: 100%;
    min-height: 48px;
    padding: 0 16px;
    border: 0;
    background: none;
    font: inherit;
    font-size: 15px;
    line-height: 1.5;
    text-align: left;
    color: $pd-ink;
    cursor: pointer;

    & + & {
      border-top: 1px solid $pd-light-line;
    }

    &:active {
      background-color: #f8f3ec;
    }

    &:focus-visible {
      outline: 2px solid $pd-terra-ink;
      outline-offset: -2px;
    }

    &--neg {
      color: $pd-neg-title;
    }
  }

  &__row-icon {
    color: $pd-terra-ink;
  }

  &__foot {
    margin: 16px 0 0;
    font-size: 13px;
    line-height: 1.35;
    text-align: center;
    color: $pd-ink-2;
  }

  &__acts {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    margin-top: 8px;
  }

  &__cta {
    @include pd-cta(48px);

    &.disabled {
      @include pd-cta-disabled;
    }
  }

  &__skip {
    align-self: center;
    min-height: 44px;
    margin-top: 4px;
    padding: 0 16px;
    color: $pd-ink-2;
    font-family: 'Geologica', sans-serif;
    font-weight: 500;
    font-size: 14px;

    :deep(.q-btn__content) {
      text-decoration: underline;
      text-underline-offset: 3px;
    }
  }

  &__file {
    display: none;
  }
}

// Sin movimiento: nada se anima en la hoja (el destello del botón ya se apaga en el mixin).
@media (prefers-reduced-motion: reduce) {
  .psheet__row {
    transition: none;
  }
}
</style>
