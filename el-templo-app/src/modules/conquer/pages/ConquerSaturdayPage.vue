<template>
  <CqScreen>
    <CqPageHeader
      title="Sábado"
      subtitle="Combos"
      :back-to="BACK_TO"
      back-label="Volver al inicio de Conquer"
    />

    <div
      v-if="!today || !form || !saturday"
      class="cq-saturday__center"
      role="status"
      aria-live="polite"
    >
      <template v-if="error">
        <p class="cq-notice" role="alert">{{ error }}</p>
        <CqButton label="Reintentar" variant="secondary" small @click="reload" />
      </template>
      <template v-else>
        <span class="cq-saturday__spin" aria-hidden="true" />
        <span class="cq-sub">Cargando el sábado</span>
      </template>
    </div>

    <template v-else>
      <CqDayPicker
        :plan="today.plan"
        :selected="today.dayKey"
        :week-complete="today.weekComplete"
        :next-day-key="today.nextDayKey"
        @select="onSelectDay"
      />

      <div v-if="today.alreadySaved" class="cq-notice cq-saturday__saved" role="status">
        Ya guardaste este día hoy: si guardás de nuevo, se reemplaza.
      </div>

      <div class="cq-card">
        <p class="cq-kicker">Entrada en calor</p>
        <p class="cq-saturday__warmup">{{ saturday.warmup }}</p>
      </div>

      <p class="cq-sub">{{ CQ_TEXTOS.sabado_combo }}</p>

      <CqComboCard
        v-if="form.push"
        :combo="saturday.push"
        :title="saturdayComboTitle('push', saturday.push)"
        :rung-id="form.push.rungId"
        :series-value="form.push.series"
        :max="SATURDAY_MAX_SERIES"
        :busy="changing || saving"
        @update:rung="(rungId: number) => setSaturdayRung('push', rungId)"
        @update:series="(v: number) => setSaturdaySeries('push', v)"
        @subir="onSubir('push')"
      />

      <CqComboCard
        v-if="form.pull"
        :combo="saturday.pull"
        :title="saturdayComboTitle('pull', saturday.pull)"
        :rung-id="form.pull.rungId"
        :series-value="form.pull.series"
        :max="SATURDAY_MAX_SERIES"
        :busy="changing || saving"
        @update:rung="(rungId: number) => setSaturdayRung('pull', rungId)"
        @update:series="(v: number) => setSaturdaySeries('pull', v)"
        @subir="onSubir('pull')"
      />

      <div class="cq-card">
        <div class="cq-saturday__line">
          <div class="cq-saturday__label">
            <b>Molestia articular</b>
            <span class="cq-sub">0 a 10 · codo, hombro</span>
          </div>
          <CqCounter
            :model-value="form.pain"
            :max="10"
            label="Molestia articular"
            :disabled="saving"
            @update:model-value="setPain"
          />
        </div>
      </div>

      <div class="cq-saturday__save">
        <CqButton label="Guardar sábado" :loading="saving" @click="onSave" />
        <p class="cq-sub cq-saturday__save-sub">
          Si algo cae, el sábado es lo primero que se recorta
        </p>
      </div>
    </template>
  </CqScreen>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useQuasar } from 'quasar'
import { useConquerStore } from '../stores/conquerStore'
import { useConquerToday } from '../composables/useConquerToday'
import type { SaturdayCombo } from '../composables/useConquerToday'
import { CQ_TEXTOS } from '../utils/format'
import { SATURDAY_DAY_KEY, SATURDAY_MAX_SERIES, saturdayComboTitle } from '../utils/todayForm'
import CqScreen from '../components/brand/CqScreen.vue'
import CqPageHeader from '../components/brand/CqPageHeader.vue'
import CqButton from '../components/brand/CqButton.vue'
import CqCounter from '../components/today/CqCounter.vue'
import CqDayPicker from '../components/today/CqDayPicker.vue'
import CqComboCard from '../components/today/CqComboCard.vue'

// Fase 201 §3.2, §7.1 Sábado, S12-3, T-201-63: el sábado de Toro. Entrada en calor como texto, los
// combos push y pull con su progresión de arranque y sus series (objetivo 13 = 3 máx + 10 drops),
// molestia y Guardar. El API decide quién puede verlo: si responde 4xx (no es Toro o el sábado está
// recortado) se avisa con su mensaje y se vuelve a la tab. El app no recalcula nada.
const BACK_TO = { path: '/training', query: { tab: 'conquer' } }

const $q = useQuasar()
const router = useRouter()
const conquerStore = useConquerStore()
const {
  today,
  form,
  saving,
  changing,
  error,
  rejected,
  load,
  setPain,
  setSaturdayRung,
  setSaturdaySeries,
  subirSaturday,
  save,
  cleanup,
} = useConquerToday()

const saturday = computed(() => today.value?.saturday ?? null)

/** Pide el sábado; si el API lo rechaza, avisa con su mensaje y vuelve a la tab (T-201-63). */
async function loadSaturday(): Promise<void> {
  await load(SATURDAY_DAY_KEY)
  if (rejected.value) {
    $q.notify({ type: 'negative', message: error.value ?? 'No tenés sábado en tu plan.' })
    await router.replace(BACK_TO)
    return
  }
  // Respuesta de un día normal (no debería pasar con `day=sabado`): se sigue en Hoy
  if (today.value && !today.value.saturday) await router.replace({ name: 'conquer-hoy' })
}

function reload(): void {
  void loadSaturday()
}

function onSelectDay(dayKey: string): void {
  if (dayKey === SATURDAY_DAY_KEY) return
  void router.push({ name: 'conquer-hoy', query: { day: dayKey } })
}

async function onSubir(which: SaturdayCombo): Promise<void> {
  await subirSaturday(which)
}

async function onSave(): Promise<void> {
  if (!(await save())) return
  $q.notify({ type: 'positive', message: 'Guardado' })
  void conquerStore.loadState()
  void router.push(BACK_TO)
}

// Los errores de las acciones van a un Notify con el texto que mandó el API (ya en español)
watch(error, (message) => {
  if (message && today.value) $q.notify({ type: 'negative', message })
})

onMounted(() => {
  void loadSaturday()
})

onBeforeUnmount(() => {
  cleanup()
})
</script>

<style scoped lang="scss">
.cq-saturday__center {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: 48px 0;
  text-align: center;
}

.cq-saturday__spin {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 2px solid var(--cq-edge-gold);
  border-right-color: transparent;
}

@media (prefers-reduced-motion: no-preference) {
  .cq-saturday__spin {
    animation: cq-saturday-spin 0.9s linear infinite;
  }
}

@keyframes cq-saturday-spin {
  to {
    transform: rotate(360deg);
  }
}

.cq-saturday__saved {
  justify-content: center;
  text-align: center;
}

.cq-saturday__warmup {
  margin: 0;
  font-size: 14px;
  line-height: 1.5;
  color: var(--cq-text);
}

.cq-saturday__line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.cq-saturday__label {
  min-width: 0;
  display: flex;
  flex-direction: column;

  b {
    font-size: 15px;
    font-weight: 600;
  }
}

.cq-saturday__save {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cq-saturday__save-sub {
  text-align: center;
}
</style>
