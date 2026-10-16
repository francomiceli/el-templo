<template>
  <!-- Carnet de socio a pantalla completa (fase 199, D-22). El comercio ve esta pantalla:
       nombre, sede · plan, "Socio activo", fecha y hora en vivo (la hora con segundos evita
       capturas viejas, T-199-52). Nunca abre sin plan activo (D-21): la apertura exige
       `sponsorsStore.canRedeem`, la misma fuente que la hoja. -->
  <q-dialog
    :model-value="visible"
    maximized
    transition-show="fade"
    transition-hide="fade"
    @update:model-value="onUpdateModelValue"
  >
    <q-card class="member-card" role="dialog" aria-label="Carnet de socio">
      <div class="member-card__logo">EL TEMPLO</div>
      <div class="member-card__name">{{ fullName }}</div>
      <div class="member-card__where">{{ whereLine }}</div>
      <div class="member-card__ok">
        <q-icon name="verified" size="22px" />
        <span>Socio activo</span>
      </div>
      <div class="member-card__date">{{ clock.dateLabel.value }}</div>
      <div class="member-card__time" aria-live="off">{{ clock.time.value }}</div>
      <div class="member-card__hint">Mostrale esta pantalla al comercio.</div>
      <button type="button" class="member-card__btn" @click="close">Listo</button>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
/**
 * L52: el reloj (`setInterval`) vive SOLO mientras el carnet está visible y se limpia al
 * cerrar, al cambiar de ruta, al perder el plan/desloguear (el store se resetea y
 * `canRedeem` pasa a false) y al desmontar. Hora y fecha en la zona de la sede.
 * L40: se cierra con el botón "atrás" de Android.
 */
import { computed, onUnmounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useUserStore } from 'src/stores/useUserStore'
import { useSponsorsStore } from 'src/stores/useSponsorsStore'
import { useTodayBookingStore } from 'src/stores/useTodayBookingStore'
import { useLiveClock } from 'src/composables/useLiveClock'
import { useBackButtonClose } from 'src/composables/useBackButtonClose'

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const route = useRoute()
const userStore = useUserStore()
const sponsorsStore = useSponsorsStore()
const todayBookingStore = useTodayBookingStore()

const clock = useLiveClock(() => todayBookingStore.tz)
const backClose = useBackButtonClose(close)

// D-21: aunque el padre pida abrirlo, sin plan activo (según el server) no se muestra.
const visible = computed(() => props.modelValue && sponsorsStore.canRedeem)

const fullName = computed(() => {
  const profile = userStore.profile
  return `${profile?.firstName ?? ''} ${profile?.lastName ?? ''}`.trim()
})

// El plan puede no estar cargado todavía: se muestra solo la sede, nunca "undefined".
const whereLine = computed(() => {
  const planName = userStore.subscription?.planName
  return planName ? `${userStore.branchDisplayName} · ${planName}` : userStore.branchDisplayName
})

function close(): void {
  emit('update:modelValue', false)
}

function onUpdateModelValue(value: boolean): void {
  emit('update:modelValue', value)
}

watch(
  visible,
  (open) => {
    if (open) {
      clock.start()
      void backClose.attach()
    } else {
      clock.cleanup()
      backClose.cleanup()
    }
  },
  { immediate: true },
)

// Si se pierde el plan con el carnet pedido, el padre no debe quedar con el flag en true.
watch(
  () => sponsorsStore.canRedeem,
  (can) => {
    if (!can && props.modelValue) close()
  },
)

watch(
  () => route.fullPath,
  () => {
    if (props.modelValue) close()
  },
)

onUnmounted(() => {
  clock.cleanup()
  backClose.cleanup()
})
</script>

<style scoped lang="scss">
.member-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 100%;
  padding: 32px 24px;
  text-align: center;
  background: #2c2318;
  color: #f0e6d6;
  box-shadow: none;
  border-radius: 0;

  &__logo {
    margin-bottom: 28px;
    font-family: 'Montserrat', sans-serif;
    font-weight: 800;
    font-size: 22px;
    letter-spacing: -0.01em;
  }

  &__name {
    font-family: 'Montserrat', sans-serif;
    font-weight: 700;
    font-size: 26px;
  }

  &__where {
    margin-top: 4px;
    font-size: 15px;
  }

  &__ok {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    margin: 22px 0 14px;
    padding: 10px 18px;
    border-radius: 999px;
    background: #2f4a35;
    color: #d9efdc;
    font-family: 'Geologica', sans-serif;
    font-weight: 700;
    font-size: 18px;
  }

  &__date {
    font-size: 15px;
  }

  &__time {
    margin-top: 4px;
    font-family: 'Montserrat', sans-serif;
    font-weight: 700;
    font-size: 34px;
    font-variant-numeric: tabular-nums;
  }

  &__hint {
    margin-top: 22px;
    font-size: 14px;
    color: #e3c9a8;
  }

  &__btn {
    min-height: 48px;
    margin-top: 26px;
    padding: 0 32px;
    border: 0;
    border-radius: 12px;
    background: #f0e6d6;
    color: #2c2318;
    font-family: 'Geologica', sans-serif;
    font-weight: 700;
    font-size: 16px;
    cursor: pointer;
  }
}
</style>
