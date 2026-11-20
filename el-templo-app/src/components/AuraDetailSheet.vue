<template>
  <!-- Fase 214 (plan 22): detalle privado de Aura (Pantalla 5 del UI-SPEC, D-13, D-57, D-66). Hoja
       clara con el total, los últimos pasos (solo texto y monto, sin íconos) y "Ver más".
       Solo lee lo del propio socio: la ruta no recibe ningún id (T-214-22-01). -->
  <q-dialog
    :model-value="modelValue"
    position="bottom"
    :transition-duration="dialogDuration"
    aria-labelledby="aura-sheet-title"
    @update:model-value="onUpdateModelValue"
  >
    <q-card class="asheet" :style="swipe.cardStyle.value">
      <div class="asheet__grab" aria-hidden="true" v-on="swipe.handlers" />

      <!-- Error de la primera página: sin total que mostrar -->
      <template v-if="status === 'error'">
        <p id="aura-sheet-title" class="asheet__kicker asheet__kicker--solo">TU AURA</p>
        <div class="asheet__error" role="alert">
          <p class="asheet__error-text">No pudimos cargar tu Aura.</p>
          <q-btn unelevated no-caps class="asheet__btn" label="Reintentar" @click="loadFirstPage" />
        </div>
      </template>

      <template v-else>
        <!-- Total: marco dorado con el mismo filete que la ficha del encabezado -->
        <div class="asheet__frame">
          <div class="asheet__total">
            <p id="aura-sheet-title" class="asheet__kicker">TU AURA</p>
            <div v-if="status === 'loading'" class="asheet__total-skel" aria-hidden="true">
              <q-skeleton :animation="skeletonAnimation" type="rect" width="120px" height="44px" />
            </div>
            <p v-else class="asheet__num">
              <span class="asheet__spark" aria-hidden="true">✦</span>{{ formatAura(earned) }}
            </p>
          </div>
        </div>

        <!-- Cargando: seis filas de esqueleto -->
        <div v-if="status === 'loading'" class="asheet__list" role="status" aria-busy="true">
          <span class="asheet__sr">Cargando tus últimos pasos</span>
          <div v-for="n in 6" :key="n" class="asheet__row asheet__row--skel" aria-hidden="true">
            <div class="asheet__skel-left">
              <q-skeleton :animation="skeletonAnimation" type="text" width="160px" height="15px" />
              <q-skeleton :animation="skeletonAnimation" type="text" width="80px" height="13px" />
            </div>
            <q-skeleton :animation="skeletonAnimation" type="text" width="32px" height="15px" />
          </div>
        </div>

        <!-- Vacío -->
        <div v-else-if="rows.length === 0" class="asheet__empty">
          <h3 class="asheet__empty-title">Todavía no sumaste Aura</h3>
          <p class="asheet__empty-text">Cuando sumes Aura, la vas a ver acá.</p>
        </div>

        <!-- Movimientos -->
        <template v-else>
          <!-- "Últimos pasos" y no "movimientos" (2026-11-20, Franco): sonaba a resumen de banco. -->
          <h3 class="asheet__block-title">Últimos pasos</h3>
          <div class="asheet__list" role="list">
            <div
              v-for="row in rows"
              :key="row.id"
              :ref="(el) => setRowRef(row.id, el)"
              class="asheet__row"
              role="listitem"
              tabindex="-1"
              :aria-label="row.aria"
            >
              <div class="asheet__row-left">
                <span class="asheet__label">{{ row.label }}</span>
                <span class="asheet__date">{{ row.date }}</span>
              </div>
              <span
                class="asheet__amount"
                :class="row.negative ? 'asheet__amount--neg' : 'asheet__amount--pos'"
                >{{ row.amountText }}</span
              >
            </div>
          </div>

          <q-btn
            v-if="nextBefore !== null"
            unelevated
            no-caps
            class="asheet__btn asheet__btn--more"
            label="Ver más"
            :loading="loadingMore"
            @click="loadMore"
          />
        </template>
      </template>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import axios from 'axios'
import { useQuasar } from 'quasar'
import { useAuraApi } from 'src/composables/useAuraApi'
import { useBackButtonClose } from 'src/composables/useBackButtonClose'
import { useSheetSwipeDismiss } from 'src/composables/useSheetSwipeDismiss'
import { useUserStore } from 'src/stores/useUserStore'
import {
  formatAura,
  formatMovementDate,
  formatMovementDateLong,
  movementAriaLabel,
} from 'src/utils/aura-format'
import { prefersReducedMotion } from 'src/utils/reduced-motion'
import { createLogger } from 'src/utils/logger'
import { DEFAULT_BRANCH_TZ } from 'src/utils/tz'
import type { AuraMovement } from 'src/types/community'

const PAGE_SIZE = 20
const MINUS = '−'

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const log = createLogger('AuraDetailSheet')
const $q = useQuasar()
const userStore = useUserStore()
const auraApi = useAuraApi()
const backClose = useBackButtonClose(close)
// Arrastrar la hoja hacia abajo la cierra (la rayita y la cabecera son la zona de arrastre).
const swipe = useSheetSwipeDismiss({
  isOpen: () => props.modelValue,
  canDismiss: () => true,
  onDismiss: close,
})

// Movimiento reducido: la hoja aparece sin transición y los esqueletos no pulsan.
const dialogDuration = prefersReducedMotion() ? 0 : 280
const skeletonAnimation = prefersReducedMotion() ? 'none' : 'pulse'

const status = ref<'loading' | 'ready' | 'error'>('loading')
const earned = ref(0)
const movements = ref<AuraMovement[]>([])
const nextBefore = ref<number | null>(null)
const loadingMore = ref(false)

/** Cada apertura o reintento invalida las respuestas en vuelo de la anterior. */
let requestSeq = 0
const rowEls = new Map<number, HTMLElement>()

const tz = computed(() => userStore.profile?.branchTimezone ?? DEFAULT_BRANCH_TZ)

interface Row {
  id: number
  label: string
  date: string
  aria: string
  amountText: string
  negative: boolean
}

const rows = computed<Row[]>(() => {
  const now = new Date()
  return movements.value.map((m) => {
    const negative = m.amount < 0
    const date = formatMovementDate(m.createdAt, tz.value, now)
    const dateLong = formatMovementDateLong(m.createdAt, tz.value, now)
    return {
      id: m.id,
      label: m.label,
      date,
      aria: movementAriaLabel(m, dateLong),
      amountText: `${negative ? MINUS : '+'}${formatAura(Math.abs(m.amount))}`,
      negative,
    }
  })
})

function setRowRef(id: number, el: unknown): void {
  if (el instanceof HTMLElement) rowEls.set(id, el)
  else rowEls.delete(id)
}

function close(): void {
  emit('update:modelValue', false)
}

function onUpdateModelValue(value: boolean): void {
  emit('update:modelValue', value)
}

/** 404 del guard del módulo: sin ficha ni fila no hay forma de llegar, la hoja se cierra callada. */
function isModuleOff(err: unknown): boolean {
  return axios.isAxiosError(err) && err.response?.status === 404
}

async function loadFirstPage(): Promise<void> {
  const mine = ++requestSeq
  status.value = 'loading'
  movements.value = []
  nextBefore.value = null
  loadingMore.value = false
  try {
    const page = await auraApi.getMovements({ limit: PAGE_SIZE })
    if (mine !== requestSeq) return
    earned.value = page.earned
    movements.value = page.movements
    nextBefore.value = page.nextBefore
    status.value = 'ready'
  } catch (err: unknown) {
    if (mine !== requestSeq) return
    if (isModuleOff(err)) {
      close()
      return
    }
    log.error('No se pudo cargar el detalle de Aura', {
      error: err instanceof Error ? err.message : String(err),
    })
    status.value = 'error'
  }
}

async function loadMore(): Promise<void> {
  if (loadingMore.value || nextBefore.value === null) return
  const mine = requestSeq
  loadingMore.value = true
  try {
    const page = await auraApi.getMovements({ before: nextBefore.value, limit: PAGE_SIZE })
    if (mine !== requestSeq) return
    const firstNewId = page.movements[0]?.id
    movements.value = [...movements.value, ...page.movements]
    nextBefore.value = page.nextBefore
    if (firstNewId !== undefined) {
      await nextTick()
      rowEls.get(firstNewId)?.focus()
    }
  } catch (err: unknown) {
    if (mine !== requestSeq) return
    if (isModuleOff(err)) {
      close()
      return
    }
    log.error('No se pudieron cargar más movimientos de Aura', {
      error: err instanceof Error ? err.message : String(err),
    })
    // Las filas ya cargadas quedan y el botón vuelve.
    $q.notify({ type: 'negative', message: 'No pudimos cargar más movimientos.', timeout: 4000 })
  } finally {
    if (mine === requestSeq) loadingMore.value = false
  }
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      void backClose.attach()
      void loadFirstPage()
    } else {
      // Invalida lo que esté en vuelo y suelta el botón atrás.
      requestSeq++
      backClose.cleanup()
    }
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  swipe.cleanup()
  requestSeq++
  backClose.cleanup()
  auraApi.cleanup()
})
</script>

<style scoped lang="scss">
@import 'src/css/premium-card';
@import 'src/css/brand';

.asheet {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 480px;
  max-height: 88vh;
  margin: 0 auto;
  overflow-y: auto;
  padding-bottom: env(safe-area-inset-bottom, 0px);
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

  // Marco: el filete dorado es el borde (padding 2), el texto va sobre el interior marfil.
  &__frame {
    @include pd-aura-frame;
    flex: none;
    margin: 16px 16px 4px;
    padding: 2px;
    border-radius: 20px;
  }

  &__total {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 16px;
    border-radius: 18px;
    background: linear-gradient(180deg, $pd-aura-ivory-a, $pd-gold-tint);
    text-align: center;
  }

  &__kicker {
    @include pd-kicker-light;
    color: $pd-gold-ink;
    letter-spacing: 0.2em;

    &--solo {
      margin: 16px 20px 0;
    }
  }

  &__total-skel {
    margin: 8px 0;
  }

  &__num {
    margin: 8px 0;
    font-family: 'Montserrat', sans-serif;
    font-weight: 800;
    font-size: 44px;
    line-height: 1;
    color: $pd-aura-deep;
    font-variant-numeric: tabular-nums;
  }

  &__spark {
    margin-right: 6px;
    color: $pd-aura-spark;
  }

  &__block-title {
    @include mt-block-title;
    margin: 16px 20px 4px;
  }

  &__row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    min-height: 52px;
    padding: 8px 20px;
    border-top: 1px solid #f1eadf;

    &:focus-visible {
      outline: 2px solid $pd-gold-ink;
      outline-offset: -2px;
    }
  }

  &__row-left,
  &__skel-left {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  &__label {
    font-size: 15px;
    font-weight: 400;
    line-height: 1.35;
    color: $pd-ink;
  }

  &__date {
    font-size: 13px;
    font-weight: 400;
    line-height: 1.3;
    color: $pd-ink-2;
  }

  &__amount {
    flex: none;
    font-family: 'Montserrat', sans-serif;
    font-weight: 700;
    font-size: 15px;
    font-variant-numeric: tabular-nums;

    &--pos {
      color: $pd-gold-ink;
    }

    &--neg {
      color: $pd-neg-title;
    }
  }

  &__empty {
    padding: 24px 20px 32px;
    text-align: center;
  }

  &__empty-title {
    margin: 0;
    font-family: 'Montserrat', sans-serif;
    font-weight: 700;
    font-size: 18px;
    line-height: 1.3;
    color: $pd-ink;
  }

  &__empty-text {
    margin: 8px 0 0;
    font-size: 15px;
    line-height: 1.5;
    color: $pd-ink;
  }

  &__error {
    padding: 8px 20px 24px;
  }

  &__error-text {
    margin: 12px 0 16px;
    font-size: 15px;
    line-height: 1.5;
    color: $pd-ink;
  }

  &__btn {
    @include pd-cta(48px);
    @include pd-cta-secondary-light;
    width: calc(100% - 40px);
    margin: 0 20px;

    &--more {
      margin: 16px 20px 24px;
    }
  }

  // Texto solo para lectores de pantalla.
  &__sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }
}

.asheet__error .asheet__btn {
  width: 100%;
  margin: 0;
}
</style>
