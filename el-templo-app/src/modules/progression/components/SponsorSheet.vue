<template>
  <!-- Hoja de detalle del beneficio de una marca (fase 199, D-21/D-22). Debe verse igual que
       `SponsorSheetPreview.vue` del admin (L49). Textos con `{{ }}` (escapa); las condiciones
       respetan los saltos de línea con `white-space: pre-line`, sin HTML crudo (T-199-47). -->
  <q-dialog :model-value="modelValue" position="bottom" @update:model-value="onUpdateModelValue">
    <q-card
      v-if="current"
      class="sponsor-sheet"
      :style="{ '--b-bg': current.bgColor, '--b-fg': current.textColor }"
    >
      <div class="sponsor-sheet__grab" />

      <div class="sponsor-sheet__head">
        <span class="sponsor-sheet__logo">
          <img
            v-if="current.logoUrl"
            :src="current.logoUrl"
            alt=""
            class="sponsor-sheet__logo-img"
            referrerpolicy="no-referrer"
          />
          <q-icon v-else-if="current.icon" :name="current.icon" size="26px" />
          <template v-else>{{ monogram(current.name) }}</template>
        </span>
        <div>
          <b class="sponsor-sheet__name">{{ current.name }}</b>
          <small class="sponsor-sheet__cat">{{ current.category }}</small>
        </div>
      </div>

      <div class="sponsor-sheet__big">{{ current.benefit }}</div>
      <div class="sponsor-sheet__det">{{ current.detail }}</div>
      <p v-if="current.conditions" class="sponsor-sheet__cond">{{ current.conditions }}</p>

      <!-- Canje: el estado sale de UNA sola fuente (`redeemState`). -->
      <div v-if="redeemState === 'loading'" class="sponsor-sheet__lock" role="status">
        <q-spinner-dots size="16px" color="primary" />
        <span>Verificando tu plan…</span>
      </div>

      <template v-else-if="redeemState === 'locked'">
        <div class="sponsor-sheet__lock">
          <q-icon name="lock" size="18px" />
          <span>Este beneficio es para socios con plan activo.</span>
        </div>
        <button type="button" class="sponsor-sheet__btn" @click="goToPlans">
          Activá tu plan para usarlo
        </button>
      </template>

      <div
        v-else-if="current.redeemType === 'code' && current.redeemCode"
        class="sponsor-sheet__code"
      >
        <b class="sponsor-sheet__code-value">{{ current.redeemCode }}</b>
        <button
          type="button"
          class="sponsor-sheet__btn sponsor-sheet__btn--inline"
          @click="copyCode"
        >
          Copiar
        </button>
      </div>

      <button
        v-else-if="current.redeemType === 'carnet'"
        type="button"
        class="sponsor-sheet__btn"
        @click="showCard"
      >
        <q-icon name="card_membership" size="20px" />
        Mostrá tu carnet
      </button>

      <button type="button" class="sponsor-sheet__close" @click="close">Cerrar</button>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
/**
 * D-21: la fuente de "plan activo" es `sponsorsStore.canRedeem` (la calcula el server con la
 * misma regla que /me/plan-status y es la misma que decide si manda el código). NO se usa
 * la suscripción del userStore: puede no estar cargada tras el login. Mientras el feed o
 * el estado de plan cargan se muestra la fila neutra de verificación, nunca el candado.
 * D-25 / L53: el evento `redeem` se registra fail-open UNA vez por apertura de la hoja
 * (al copiar el código con éxito o al abrir el carnet), no al montarla.
 * L40: se cierra con el atrás de Android y al cambiar de ruta.
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useQuasar } from 'quasar'
import { useSponsorsStore, type Sponsor } from 'src/stores/useSponsorsStore'
import { useUserStore } from 'src/stores/useUserStore'
import { copyWithFallback } from 'src/utils/clipboard'
import { useBackButtonClose } from 'src/composables/useBackButtonClose'
import { monogram } from '../utils/sponsors'

const props = defineProps<{
  modelValue: boolean
  sponsor: Sponsor | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'show-card': []
}>()

const $q = useQuasar()
const route = useRoute()
const router = useRouter()
const store = useSponsorsStore()
const userStore = useUserStore()
const backClose = useBackButtonClose(close)

// Copia local de la marca: el padre limpia `sponsor` al cerrar y el contenido no debe
// desaparecer en plena animación de salida.
const current = ref<Sponsor | null>(props.sponsor)
watch(
  () => props.sponsor,
  (next) => {
    if (next) current.value = next
  },
)

const redeemState = computed<'ok' | 'loading' | 'locked'>(() =>
  store.canRedeem ? 'ok' : store.loading || userStore.planStateLoading ? 'loading' : 'locked',
)

// `redeem` una sola vez por apertura de la hoja (copiar dos veces no duplica el evento).
let redeemReported = false

function reportRedeem(): void {
  if (redeemReported || !current.value) return
  redeemReported = true
  void store.markRedeem(current.value.id)
}

function close(): void {
  emit('update:modelValue', false)
}

function onUpdateModelValue(value: boolean): void {
  emit('update:modelValue', value)
}

function goToPlans(): void {
  close()
  void router.push('/planes')
}

async function copyCode(): Promise<void> {
  const code = current.value?.redeemCode
  if (!code || redeemState.value !== 'ok') return
  const copied = await copyWithFallback(code)
  if (copied) {
    $q.notify({ type: 'positive', message: 'Código copiado', timeout: 2500 })
    reportRedeem()
  } else {
    // El código sigue visible y seleccionable en la caja.
    $q.notify({ type: 'warning', message: 'No pudimos copiar, anotalo a mano', timeout: 4000 })
  }
}

function showCard(): void {
  if (redeemState.value !== 'ok') return
  reportRedeem()
  emit('show-card')
  close()
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      redeemReported = false
      void backClose.attach()
    } else {
      backClose.cleanup()
    }
  },
  { immediate: true },
)

watch(
  () => route.fullPath,
  () => {
    if (props.modelValue) close()
  },
)

onBeforeUnmount(() => {
  backClose.cleanup()
})
</script>

<style scoped lang="scss">
.sponsor-sheet {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 480px;
  max-height: 90vh;
  margin: 0 auto;
  overflow-y: auto;
  padding: 10px 20px 22px;
  background: #ffffff;
  border-radius: 20px 20px 0 0;
  box-shadow: none;
  font-family: 'Geologica', sans-serif;

  &__grab {
    flex: none;
    align-self: center;
    width: 40px;
    height: 4px;
    margin: 0 auto 14px;
    border-radius: 2px;
    background: #d9cfc1;
  }

  &__head {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 14px;
  }

  // Los colores de la marca (no invertidos), como en la vista previa del admin.
  &__logo {
    flex: none;
    display: grid;
    place-items: center;
    width: 48px;
    height: 48px;
    overflow: hidden;
    border-radius: 12px;
    background: var(--b-bg);
    color: var(--b-fg);
    font:
      800 16px 'Montserrat',
      sans-serif;
  }

  &__logo-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  &__name {
    display: block;
    font:
      800 17px 'Montserrat',
      sans-serif;
    color: #2c2318;
  }

  &__cat {
    font-size: 13px;
    color: #6b6459;
  }

  &__big {
    font:
      800 32px/1 'Montserrat',
      sans-serif;
    color: #2c2318;
    overflow-wrap: anywhere;
  }

  &__det {
    margin: 4px 0 10px;
    font-size: 15px;
    color: #2c2318;
  }

  &__cond {
    margin: 0 0 16px;
    font-size: 13px;
    line-height: 1.45;
    color: #6b6459;
    white-space: pre-line;
  }

  &__code {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 10px;
    padding: 10px 12px;
    border: 1.5px dashed #96593a;
    border-radius: 12px;
  }

  &__code-value {
    flex: 1;
    min-width: 0;
    overflow-wrap: anywhere;
    user-select: all;
    font:
      700 22px 'Courier New',
      monospace;
    letter-spacing: 0.08em;
    color: #2c2318;
  }

  &__lock {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
    padding: 10px 12px;
    border-radius: 10px;
    background: #f4ece3;
    font-size: 14px;
    color: #2c2318;
  }

  &__btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    width: 100%;
    min-height: 48px;
    padding: 0 16px;
    border: 0;
    border-radius: 12px;
    background: #96593a;
    color: #ffffff;
    font:
      600 15px 'Geologica',
      sans-serif;
    cursor: pointer;

    &--inline {
      flex: none;
      width: auto;
      min-height: 44px;
    }
  }

  &__close {
    display: block;
    min-height: 44px;
    margin: 4px auto 0;
    padding: 6px 16px;
    border: 0;
    background: transparent;
    color: #96593a;
    font:
      600 14px 'Geologica',
      sans-serif;
    cursor: pointer;
  }
}
</style>
