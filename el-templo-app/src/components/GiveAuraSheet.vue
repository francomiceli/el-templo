<template>
  <!-- Fase 215 (plan 20): hoja "Dar Aura" (Pantalla 2 del UI-SPEC, sketch 034 A, D-02, D-05, D-07,
       D-16). Una sola hoja: las caras de la clase arriba, los cuatro motivos abajo y el botón del
       pie que confirma. Solo pinta lo que manda el servidor (T-215-20-01): quién se puede elegir,
       quién está apagada y qué dice cada error. Los candidatos viven solo en el estado de este
       componente y se descartan al cerrar (T-215-20-03). Ningún texto promete privacidad (D-22). -->
  <q-dialog
    :model-value="dialogOpen"
    position="bottom"
    :persistent="sending"
    :transition-duration="dialogDuration"
    aria-labelledby="give-aura-title"
    @update:model-value="onUpdateModelValue"
    @show="focusTitle"
    @hide="resetState"
  >
    <q-card class="gsheet" :style="swipe.cardStyle.value">
      <div class="gsheet__grab" aria-hidden="true" v-on="swipe.handlers" />

      <!-- Cabecera fija -->
      <div class="gsheet__head" v-on="swipe.handlers">
        <p class="gsheet__kicker">DAR AURA</p>
        <h3 id="give-aura-title" ref="titleEl" class="gsheet__title" tabindex="-1">
          ¿A quién de tu clase?
        </h3>
        <p v-if="subtitle" class="gsheet__sub">{{ subtitle }}</p>
      </div>

      <!-- Cuerpo con scroll -->
      <div class="gsheet__body">
        <!-- Error al pedir la clase -->
        <div v-if="status === 'error'" class="gsheet__state" role="alert">
          <q-icon name="cloud_off" size="32px" class="gsheet__state-icon" aria-hidden="true" />
          <p class="gsheet__text">No pudimos cargar tu clase.</p>
          <q-btn
            unelevated
            no-caps
            class="gsheet__btn gsheet__btn--inline"
            label="Reintentar"
            @click="loadCandidates(false)"
          />
        </div>

        <!-- Se venció el plazo o el regalo ya se dio -->
        <div v-else-if="status === 'expired'" class="gsheet__state">
          <p class="gsheet__text">{{ expiredText }}</p>
          <q-btn
            unelevated
            no-caps
            class="gsheet__btn gsheet__btn--inline"
            label="Cerrar"
            @click="close"
          />
        </div>

        <!-- Sin candidatos -->
        <div v-else-if="status === 'empty'" class="gsheet__state">
          <h4 class="gsheet__empty-title">No hay a quién darle Aura</h4>
          <p class="gsheet__text">En esta clase no quedan compañeros que puedan recibirla.</p>
          <q-btn
            unelevated
            no-caps
            class="gsheet__btn gsheet__btn--inline"
            label="Cerrar"
            @click="close"
          />
        </div>

        <template v-else>
          <!-- Cargando: 8 celdas de esqueleto -->
          <div
            v-if="status === 'loading'"
            class="gsheet__grid"
            role="status"
            aria-busy="true"
            aria-label="Cargando tu clase"
          >
            <div v-for="n in 8" :key="n" class="gsheet__skel" aria-hidden="true">
              <q-skeleton :animation="skeletonAnimation" type="circle" size="56px" />
              <q-skeleton :animation="skeletonAnimation" type="rect" width="48px" height="13px" />
            </div>
          </div>

          <!-- Caras de la clase -->
          <div v-else class="gsheet__grid" role="group" aria-labelledby="give-aura-title">
            <button
              v-for="c in candidates"
              :key="c.receiverAttendanceId"
              type="button"
              class="gsheet__cell"
              :class="{
                'gsheet__cell--on': c.receiverAttendanceId === selectedId,
                'gsheet__cell--blocked': c.blockedReason === 'tope_semanal',
              }"
              :aria-pressed="c.receiverAttendanceId === selectedId"
              :aria-disabled="c.blockedReason === 'tope_semanal' ? 'true' : undefined"
              :aria-label="
                c.blockedReason === 'tope_semanal' ? blockedAriaLabel(candidateName(c)) : undefined
              "
              :disabled="sending && c.blockedReason !== 'tope_semanal'"
              @click="toggleCandidate(c)"
            >
              <span class="gsheet__face">
                <MemberAvatar
                  :size="56"
                  :url="c.photoUrl"
                  :first-name="c.firstName"
                  :last-initial="c.lastInitial"
                />
                <span
                  v-if="c.receiverAttendanceId === selectedId"
                  class="gsheet__tick"
                  aria-hidden="true"
                >
                  <q-icon name="check" size="14px" />
                </span>
              </span>
              <span class="gsheet__name">{{ candidateName(c) }}</span>
            </button>
          </div>

          <!-- Nota única del tope semanal (D-05) -->
          <p v-if="capNote && status === 'ready'" class="gsheet__note" role="note">
            <q-icon name="info" size="16px" aria-hidden="true" />
            <span>{{ capNote }}</span>
          </p>

          <!-- Motivos -->
          <h4 ref="reasonsTitleEl" class="gsheet__block-title">¿Por qué?</h4>
          <div class="gsheet__reasons" role="group" aria-label="Motivo">
            <button
              v-for="r in GIFT_REASONS"
              :key="r.code"
              type="button"
              class="gsheet__chip"
              :class="{ 'gsheet__chip--on': r.code === selectedReason }"
              :aria-pressed="r.code === selectedReason"
              :disabled="status === 'loading' || sending"
              @click="toggleReason(r.code)"
            >
              <q-icon
                v-if="r.code === selectedReason"
                name="check"
                size="18px"
                aria-hidden="true"
              />
              <span>{{ r.label }}</span>
            </button>
          </div>

          <p class="gsheet__help">{{ help }}</p>
        </template>
      </div>

      <!-- Pie fijo: el botón es la confirmación -->
      <div v-if="showFooter" class="gsheet__foot">
        <q-btn
          unelevated
          no-caps
          class="gsheet__cta"
          :class="{ 'gsheet__cta--sending': sending }"
          :disable="!canSubmit && !sending"
          :aria-busy="sending ? 'true' : undefined"
          @click="submit"
        >
          <q-spinner v-if="sending" size="18px" class="gsheet__spinner" aria-hidden="true" />
          <span>{{ footerLabel }}</span>
        </q-btn>
      </div>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import axios from 'axios'
import { useQuasar } from 'quasar'
import MemberAvatar from 'src/components/MemberAvatar.vue'
import { useAuraGiftsApi } from 'src/composables/useAuraGiftsApi'
import { useBackButtonClose } from 'src/composables/useBackButtonClose'
import { useSheetSwipeDismiss } from 'src/composables/useSheetSwipeDismiss'
import { GIFT_REASONS, type GiftReasonCode } from 'src/constants/gift-reasons'
import { useUserStore } from 'src/stores/useUserStore'
import type { GiftCandidate, PendingGift } from 'src/types/aura-gifts'
import {
  blockedAriaLabel,
  candidateName,
  giveErrorOutcome,
  giveSuccessMessage,
  sheetFooterLabel,
  sheetHelp,
  sheetSubtitle,
  weeklyCapNote,
} from 'src/utils/gift-view'
import { createLogger } from 'src/utils/logger'
import { prefersReducedMotion } from 'src/utils/reduced-motion'
import { DEFAULT_BRANCH_TZ, todayInTz } from 'src/utils/tz'

type Status = 'loading' | 'ready' | 'error' | 'expired' | 'empty'

const props = defineProps<{
  modelValue: boolean
  /** La clase por la que se regala (la que vence antes). */
  gift: PendingGift | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  /** Se dio el regalo. */
  given: [payload: { receiverFirstName: string; reason: GiftReasonCode }]
  /** Los pendientes cambiaron: hay que volver a pedirlos. */
  stale: []
}>()

const log = createLogger('GiveAuraSheet')
const $q = useQuasar()
const userStore = useUserStore()
const giftsApi = useAuraGiftsApi()
const backClose = useBackButtonClose(close)

// Movimiento reducido: la hoja aparece sin transición y los esqueletos no pulsan.
const reducedMotion = prefersReducedMotion()
const dialogDuration = reducedMotion ? 0 : 280
const skeletonAnimation = reducedMotion ? 'none' : 'pulse'

const status = ref<Status>('loading')

// 2026-11-19: la hoja se muestra recién cuando llegó la clase, o a los 350 ms con el esqueleto si la
// red tarda. Antes subía con las 8 celdas de esqueleto y, al llegar la lista, cambiaba de alto en
// plena animación (con una sola cara perdía un renglón): parecía que se abría dos veces.
const REVEAL_FALLBACK_MS = 350
const revealed = ref(false)
let revealTimer: ReturnType<typeof setTimeout> | null = null

function clearRevealTimer(): void {
  if (revealTimer !== null) {
    clearTimeout(revealTimer)
    revealTimer = null
  }
}

const dialogOpen = computed(() => props.modelValue && revealed.value)

watch(status, (value) => {
  if (value !== 'loading') revealed.value = true
})
const candidates = ref<GiftCandidate[]>([])
/** Clase que devolvió el servidor; sirve para el subtítulo si no llegó `gift`. */
const loadedClass = ref<{ sessionDate: string; startTime: string } | null>(null)
const expiredText = ref('')
const selectedId = ref<number | null>(null)
const selectedReason = ref<GiftReasonCode | null>(null)
const sending = ref(false)
// Arrastrar la hoja hacia abajo la cierra (la rayita y la cabecera son la zona de arrastre).
const swipe = useSheetSwipeDismiss({
  isOpen: () => dialogOpen.value,
  canDismiss: () => !sending.value,
  onDismiss: close,
})

const titleEl = ref<HTMLElement | null>(null)
const reasonsTitleEl = ref<HTMLElement | null>(null)

/** Cada apertura o recarga invalida las respuestas en vuelo de la anterior. */
let requestSeq = 0

const tz = computed(() => userStore.profile?.branchTimezone ?? DEFAULT_BRANCH_TZ)

const subtitle = computed(() => {
  const cls = props.gift ?? loadedClass.value
  if (!cls) return ''
  return sheetSubtitle(cls, todayInTz(tz.value, new Date()))
})

const selectedCandidate = computed(
  () => candidates.value.find((c) => c.receiverAttendanceId === selectedId.value) ?? null,
)

const capNote = computed(() =>
  weeklyCapNote(
    candidates.value.filter((c) => c.blockedReason === 'tope_semanal').map(candidateName),
  ),
)

const help = computed(() => sheetHelp(selectedCandidate.value?.firstName ?? null))

const footerLabel = computed(() =>
  sheetFooterLabel({
    person: selectedCandidate.value?.firstName ?? null,
    reason: selectedReason.value !== null,
    sending: sending.value,
  }),
)

const canSubmit = computed(
  () =>
    status.value === 'ready' && selectedCandidate.value !== null && selectedReason.value !== null,
)

const showFooter = computed(() => status.value === 'loading' || status.value === 'ready')

/** También lo usa el botón atrás de Android: no cierra mientras se está dando el regalo. */
function close(): void {
  if (sending.value) return
  emit('update:modelValue', false)
}

function onUpdateModelValue(value: boolean): void {
  if (!value && sending.value) return
  emit('update:modelValue', value)
}

/** Cierra aunque esté enviando (lo usa el flujo de `submit` cuando ya terminó el pedido). */
function closeNow(): void {
  emit('update:modelValue', false)
}

function focusTitle(): void {
  titleEl.value?.focus({ preventScroll: true })
}

/** Al terminar de cerrarse: se descarta todo lo que se cargó. */
function resetState(): void {
  candidates.value = []
  loadedClass.value = null
  selectedId.value = null
  selectedReason.value = null
  expiredText.value = ''
  sending.value = false
  status.value = 'loading'
}

interface ReadError {
  status: number | null
  code: string | null
}

/** Estado HTTP y `code` del cuerpo de un error de axios; sin respuesta, ambos null. */
function readError(err: unknown): ReadError {
  if (!axios.isAxiosError(err)) return { status: null, code: null }
  const data: unknown = err.response?.data
  let code: string | null = null
  if (typeof data === 'object' && data !== null && 'code' in data) {
    const raw = (data as { code?: unknown }).code
    code = typeof raw === 'string' ? raw : null
  }
  return { status: err.response?.status ?? null, code }
}

/** Si la persona elegida ya no está o quedó apagada, se descarta la elección. */
function reconcileSelection(): void {
  if (selectedId.value === null) return
  const still = candidates.value.find((c) => c.receiverAttendanceId === selectedId.value)
  if (!still || still.blockedReason === 'tope_semanal') selectedId.value = null
}

/** `silent`: vuelve a pedir la lista sin esqueleto (tras un 409); si falla, queda la anterior. */
async function loadCandidates(silent: boolean): Promise<void> {
  const gift = props.gift
  if (!gift) {
    // Sin clase no hay nada que mostrar: se cierra y se vuelve a pedir lo pendiente.
    closeNow()
    emit('stale')
    return
  }
  const mine = ++requestSeq
  if (!silent) {
    status.value = 'loading'
    candidates.value = []
    selectedId.value = null
  }
  try {
    const data = await giftsApi.getCandidates(gift.attendanceId)
    if (mine !== requestSeq) return
    loadedClass.value = data.class
    candidates.value = data.candidates
    reconcileSelection()
    status.value = data.candidates.length === 0 ? 'empty' : 'ready'
  } catch (err: unknown) {
    if (mine !== requestSeq) return
    const { status: httpStatus, code } = readError(err)
    if (code === 'REGALO_VENCIDO' || code === 'REGALO_YA_DADO') {
      expiredText.value = giveErrorOutcome({ status: httpStatus, code }, null).message
      status.value = 'expired'
      emit('stale')
      return
    }
    if (httpStatus === 404 || code === 'REGALO_NO_ENCONTRADO') {
      status.value = 'empty'
      emit('stale')
      return
    }
    log.error('No se pudieron cargar los compañeros de la clase', {
      error: err instanceof Error ? err.message : String(err),
      status: httpStatus,
    })
    // Recarga silenciosa que falla: queda la lista anterior; la carga inicial muestra el error.
    if (!silent) status.value = 'error'
  }
}

function toggleCandidate(c: GiftCandidate): void {
  if (sending.value || c.blockedReason === 'tope_semanal') return
  if (selectedId.value === c.receiverAttendanceId) {
    selectedId.value = null
    return
  }
  selectedId.value = c.receiverAttendanceId
  // Con muchas caras, los motivos pueden quedar fuera de la vista.
  void nextTick(() => {
    reasonsTitleEl.value?.scrollIntoView({
      block: 'nearest',
      behavior: reducedMotion ? 'auto' : 'smooth',
    })
  })
}

function toggleReason(code: GiftReasonCode): void {
  if (sending.value) return
  selectedReason.value = selectedReason.value === code ? null : code
}

async function submit(): Promise<void> {
  const gift = props.gift
  const person = selectedCandidate.value
  const reason = selectedReason.value
  if (sending.value || !gift || !person || !reason || status.value !== 'ready') return
  sending.value = true
  try {
    const res = await giftsApi.give({
      attendanceId: gift.attendanceId,
      receiverAttendanceId: person.receiverAttendanceId,
      reason,
    })
    sending.value = false
    $q.notify({
      type: 'positive',
      message: giveSuccessMessage(res.receiverFirstName),
      timeout: 4000,
    })
    closeNow()
    emit('given', { receiverFirstName: res.receiverFirstName, reason })
    emit('stale')
  } catch (err: unknown) {
    sending.value = false
    const { status: httpStatus, code } = readError(err)
    const outcome = giveErrorOutcome({ status: httpStatus, code }, person.firstName)
    log.warn('No se pudo dar el regalo de Aura', { status: httpStatus, code })
    $q.notify({ type: outcome.type, message: outcome.message, timeout: 4000 })
    if (outcome.clearSelection) selectedId.value = null
    if (outcome.close) closeNow()
    if (outcome.reloadPending) emit('stale')
    if (outcome.reloadCandidates && !outcome.close) void loadCandidates(true)
  }
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      selectedId.value = null
      selectedReason.value = null
      revealed.value = false
      clearRevealTimer()
      revealTimer = setTimeout(() => {
        revealed.value = true
      }, REVEAL_FALLBACK_MS)
      void backClose.attach()
      void loadCandidates(false)
    } else {
      // Invalida lo que esté en vuelo y suelta el botón atrás.
      requestSeq++
      clearRevealTimer()
      backClose.cleanup()
    }
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  swipe.cleanup()
  requestSeq++
  clearRevealTimer()
  backClose.cleanup()
  giftsApi.cleanup()
})
</script>

<style scoped lang="scss">
@import 'src/css/premium-card';
@import 'src/css/brand';

.gsheet {
  @include pd-sheet-light;
  margin: 0 auto;
  font-family: 'Geologica', sans-serif;
  color: $pd-ink;

  &__grab {
    @include pd-sheet-drag-handle;
    @include pd-sheet-grabber;
  }

  &__head {
    @include pd-sheet-drag-head;
    flex: none;
    padding: 4px 20px 16px;
  }

  &__kicker {
    @include pd-kicker-light;
  }

  &__title {
    margin: 4px 0 0;
    font-family: 'Montserrat', sans-serif;
    font-weight: 700;
    font-size: 18px;
    line-height: 1.3;
    color: $pd-ink;

    &:focus {
      outline: none;
    }
  }

  &__sub {
    margin: 4px 0 0;
    font-size: 13px;
    font-weight: 400;
    line-height: 1.4;
    color: $pd-ink-2;
  }

  &__body {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    padding: 0 20px 8px;
  }

  &__grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 16px 8px;
    padding: 8px 0;
  }

  &__skel {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    min-width: 0;
    padding: 8px 0;
  }

  &__cell {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    min-width: 0;
    padding: 8px 0;
    border: 0;
    border-radius: 16px;
    background: transparent;
    font: inherit;
    color: inherit;
    cursor: pointer;

    @media (prefers-reduced-motion: no-preference) {
      transition: background-color 0.15s ease;
    }

    &:focus-visible {
      outline: 2px solid $pd-ink;
      outline-offset: 2px;
    }

    // Elegida: tinte, aro interior, aro de la cara y tilde (no depende solo del color).
    &--on {
      background: $pd-gold-tint;
      box-shadow: inset 0 0 0 2px $pd-gold;

      .gsheet__face {
        box-shadow:
          0 0 0 2px $pd-light-surface,
          0 0 0 4px $pd-aura-spark;
      }
    }

    // Apagada por el tope semanal: baja la opacidad SOLO la imagen, el nombre queda sólido.
    &--blocked {
      cursor: default;

      :deep(.member-avatar) {
        opacity: 0.45;
        filter: grayscale(1);
      }

      .gsheet__name {
        color: $pd-ink-2;
      }
    }
  }

  &__face {
    position: relative;
    display: inline-flex;
    width: 56px;
    height: 56px;
    border-radius: 50%;
  }

  &__tick {
    position: absolute;
    right: -4px;
    bottom: -4px;
    display: grid;
    place-items: center;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: $pd-gold-ink;
    color: #fff;
  }

  &__name {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
    font-weight: 400;
    line-height: 1.3;
    color: $pd-ink;
  }

  &__note {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    margin: 8px 0 0;
    font-size: 13px;
    font-weight: 400;
    line-height: 1.4;
    color: $pd-ink-2;

    .q-icon {
      flex: none;
      margin-top: 1px;
    }
  }

  &__block-title {
    @include mt-block-title;
    margin: 16px 0 8px;
  }

  &__reasons {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  &__chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    min-height: 44px;
    padding: 0 16px;
    border: 1px solid $pd-light-edge;
    border-radius: 999px;
    background: #fff;
    font-family: 'Geologica', sans-serif;
    font-size: 15px;
    font-weight: 400;
    color: $pd-ink;
    cursor: pointer;

    &:focus-visible {
      outline: 2px solid $pd-ink;
      outline-offset: 2px;
    }

    &:disabled {
      cursor: not-allowed;
    }

    // Elegido: el borde se ve de 2 px sin mover el layout.
    &--on {
      border-color: $pd-gold-ink;
      background: $pd-gold-tint;
      box-shadow: inset 0 0 0 1px $pd-gold-ink;
      color: $pd-gold-ink;
    }
  }

  &__help {
    margin: 16px 0 0;
    font-size: 13px;
    font-weight: 400;
    line-height: 1.4;
    color: $pd-ink-2;
  }

  &__foot {
    flex: none;
    padding: 16px 20px calc(16px + env(safe-area-inset-bottom, 0px));
    border-top: 1px solid $pd-light-line;
  }

  &__cta {
    @include pd-cta(48px);

    &.disabled {
      @include pd-cta-disabled;
    }
  }

  &__spinner {
    margin-right: 8px;
  }

  &__state {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 16px 0 24px;
    text-align: center;
  }

  &__state-icon {
    color: $pd-ink-2;
  }

  &__empty-title {
    margin: 0;
    font-family: 'Montserrat', sans-serif;
    font-weight: 700;
    font-size: 18px;
    line-height: 1.3;
    color: $pd-ink;
  }

  &__text {
    margin: 8px 0 16px;
    font-size: 15px;
    font-weight: 400;
    line-height: 1.5;
    color: $pd-ink;
  }

  &__btn {
    @include pd-cta(48px);
    @include pd-cta-secondary-light;

    &--inline {
      width: 100%;
    }
  }
}

@include pd-sheen-keyframes;
</style>
