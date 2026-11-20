<!-- Regalos por profe (fase 215, ajustes, ME-06): cuántos regalos dio cada profe en una semana de
     lunes a domingo (hora de la sede), con el total y las semanas anteriores navegables. Cuenta solo
     los regalos vigentes. El recorte por sede lo hace el servidor (admin_sede ve solo las suyas); la
     sede elegida en la pestaña viene por `branchId`. Si el pedido falla, el resto de la pestaña sigue. -->
<template>
  <q-card flat bordered class="q-mb-md" data-test="regalos-by-coach">
    <q-card-section>
      <div class="row items-center q-col-gutter-sm">
        <div class="col">
          <div class="text-subtitle1">Regalos por profe</div>
          <div class="text-body2 text-grey-8">Cuántos regalos dio cada profe en la semana.</div>
        </div>
        <div class="col-auto row items-center no-wrap">
          <q-btn
            flat
            round
            dense
            icon="chevron_left"
            aria-label="Semana anterior"
            :disable="weeksBack >= MAX_WEEKS_BACK"
            data-test="regalos-by-coach-prev"
            @click="goToWeek(weeksBack + 1)"
          />
          <div class="text-body2 text-center tabular week-label" data-test="regalos-by-coach-week">
            <template v-if="data">{{ weekLabel(data.weekStart) }}</template>
            <q-skeleton v-else type="text" width="90px" />
          </div>
          <q-btn
            flat
            round
            dense
            icon="chevron_right"
            aria-label="Semana siguiente"
            :disable="weeksBack <= 0"
            data-test="regalos-by-coach-next"
            @click="goToWeek(weeksBack - 1)"
          />
        </div>
      </div>

      <template v-if="loadState === 'loading' && !data">
        <q-skeleton type="text" class="q-mt-sm" />
        <q-skeleton type="text" />
      </template>

      <div
        v-else-if="loadState === 'error'"
        class="text-body2 q-mt-sm"
        data-test="regalos-by-coach-error"
      >
        No pudimos cargar los regalos por profe.
        <q-btn flat dense no-caps color="primary" label="Reintentar" @click="load" />
      </div>

      <div
        v-else-if="loadState === 'unavailable'"
        class="text-body2 q-mt-sm"
        data-test="regalos-by-coach-unavailable"
      >
        Los regalos de Aura no están disponibles por ahora.
      </div>

      <div
        v-else-if="data && data.coaches.length === 0"
        class="text-body2 text-grey-8 q-mt-sm"
        data-test="regalos-by-coach-empty"
      >
        Ningún profe dio Aura esta semana.
      </div>

      <q-markup-table
        v-else-if="data"
        flat
        dense
        class="q-mt-sm"
        :class="{ 'is-stale': refreshing }"
      >
        <thead>
          <tr>
            <th class="text-left">Profe</th>
            <th class="text-right">Regalos</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="coach in data.coaches" :key="coach.userId" data-test="regalos-by-coach-row">
            <td class="text-left">{{ coach.name }}</td>
            <td class="text-right tabular">{{ coach.gifts }}</td>
          </tr>
        </tbody>
        <tfoot>
          <tr class="text-weight-bold">
            <td class="text-left">Total</td>
            <td class="text-right tabular" data-test="regalos-by-coach-total">{{ data.total }}</td>
          </tr>
        </tfoot>
      </q-markup-table>
    </q-card-section>
  </q-card>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import axios from 'axios';
import { giftErrorCode, useAuraGiftsApi, type GiftsByCoach } from 'src/composables/useAuraGiftsApi';
import { createLogger } from 'src/utils/logger';
import { weekLabel } from 'src/utils/ymd';

const props = defineProps<{
  /** Sede elegida en la pestaña; null = todas las del usuario. */
  branchId: number | null;
}>();

const log = createLogger('RegalosPorProfeCard');
const giftsApi = useAuraGiftsApi();

type LoadState = 'loading' | 'ready' | 'error' | 'unavailable';

/** Tope que acepta el servidor (`weeksBack` hasta 52). */
const MAX_WEEKS_BACK = 52;

const loadState = ref<LoadState>('loading');
const refreshing = ref(false);
const data = ref<GiftsByCoach | null>(null);
const weeksBack = ref(0);

/** Un contador descarta las respuestas viejas si se cambia de semana o de sede con otra en vuelo. */
let loadSeq = 0;

async function load(): Promise<void> {
  const seq = ++loadSeq;
  if (data.value) refreshing.value = true;
  else loadState.value = 'loading';
  try {
    const result = await giftsApi.giftsByCoach({
      branchId: props.branchId ?? undefined,
      weeksBack: weeksBack.value,
    });
    if (seq !== loadSeq) return;
    data.value = result;
    loadState.value = 'ready';
  } catch (err: unknown) {
    if (seq !== loadSeq) return;
    // 404 sin `code` = módulo apagado en este gimnasio.
    if (axios.isAxiosError(err) && err.response?.status === 404 && giftErrorCode(err) === null) {
      loadState.value = 'unavailable';
      return;
    }
    log.error('No se pudieron cargar los regalos por profe', {
      error: err instanceof Error ? err.message : String(err),
    });
    loadState.value = 'error';
  } finally {
    if (seq === loadSeq) refreshing.value = false;
  }
}

function goToWeek(target: number): void {
  weeksBack.value = Math.min(Math.max(target, 0), MAX_WEEKS_BACK);
  void load();
}

watch(
  () => props.branchId,
  () => {
    void load();
  }
);

onMounted(() => {
  void load();
});
</script>

<style scoped>
.tabular {
  font-variant-numeric: tabular-nums;
}
.week-label {
  min-width: 110px;
}
.is-stale {
  opacity: 0.6;
}
</style>
