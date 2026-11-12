<template>
  <q-dialog v-model="show">
    <q-card style="width: 860px; max-width: 95vw; max-height: 92vh" class="column no-wrap">
      <!-- Encabezado -->
      <q-card-section class="row items-start no-wrap q-pb-none">
        <div class="col">
          <div class="text-h6">
            {{ detail ? detail.destinationName : 'Detalle del resumen' }} ·
            {{ monthLabel(month) }}
          </div>
          <div class="text-caption text-grey-7">
            Por rubro y concepto. Tocá un concepto para ver el gasto completo.
          </div>
        </div>
        <q-btn flat dense round icon="close" aria-label="Cerrar" v-close-popup />
      </q-card-section>

      <q-card-section class="col scroll relative-position">
        <!-- Error de carga -->
        <q-banner v-if="loadError && !detail" dense rounded class="bg-red-1 text-negative">
          {{ loadError }}
          <template #action>
            <q-btn
              flat
              no-caps
              color="primary"
              icon="refresh"
              label="Reintentar"
              @click="load(false)"
            />
          </template>
        </q-banner>

        <!-- Cargando por primera vez -->
        <div v-else-if="!detail" class="text-center q-pa-xl">
          <q-spinner color="primary" size="32px" />
        </div>

        <!-- Sin movimientos -->
        <div v-else-if="detail.groups.length === 0" class="text-center q-pa-lg text-grey-6">
          Sin gastos ni pagos para este destino en el mes.
        </div>

        <!-- Un bloque por rubro -->
        <template v-else>
          <q-expansion-item
            v-for="group in detail.groups"
            :key="group.costCenterId"
            default-opened
            expand-separator
            header-class="bg-amber-1"
            class="q-mb-sm resumen-group"
          >
            <template #header>
              <q-item-section>
                <q-item-label class="text-weight-bold">{{ group.costCenterName }}</q-item-label>
              </q-item-section>
              <q-item-section side class="text-right">
                <div class="text-caption text-grey-8">
                  Costo
                  <span class="text-weight-bold">{{ formatPrice(group.cost, currency) }}</span>
                  · Pendiente
                  <span class="text-weight-bold">{{ formatPrice(group.pending, currency) }}</span>
                  · Pagado en el mes
                  <span class="text-weight-bold">{{
                    formatPrice(group.paidInMonth, currency)
                  }}</span>
                </div>
              </q-item-section>
            </template>

            <q-list separator>
              <q-item
                v-for="c in group.concepts"
                :key="c.expenseRecordId"
                clickable
                v-ripple
                @click="emit('open-detail', c.expenseRecordId)"
              >
                <q-item-section>
                  <q-item-label class="text-weight-medium">{{ c.concept }}</q-item-label>
                  <q-item-label v-if="c.beneficiary" caption>{{ c.beneficiary }}</q-item-label>
                  <q-item-label caption class="q-mt-xs">
                    <q-badge
                      v-if="c.estimated"
                      color="amber-8"
                      :label="AMOUNT_STATUS_LABELS.estimado"
                      class="q-mr-xs"
                    />
                    <span v-if="c.imputationMonth !== month" class="text-deep-orange-9">
                      imputado a {{ monthLabel(c.imputationMonth) }}
                    </span>
                  </q-item-label>
                </q-item-section>
                <q-item-section side top class="text-right text-body2">
                  <div>
                    <span class="text-grey-7">Costo</span>
                    {{ formatPrice(c.cost, currency) }}
                  </div>
                  <div>
                    <span class="text-grey-7">Pendiente</span>
                    {{ formatPrice(c.pending, currency) }}
                  </div>
                  <div>
                    <span class="text-grey-7">Pagado en el mes</span>
                    {{ formatPrice(c.paidInMonth, currency) }}
                  </div>
                </q-item-section>
              </q-item>
            </q-list>
          </q-expansion-item>
        </template>

        <q-inner-loading :showing="loading && detail !== null" />
      </q-card-section>

      <q-separator />
      <q-card-actions align="right">
        <q-btn flat no-caps label="Cerrar" v-close-popup />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import { createLogger } from 'src/utils/logger';
import { extractError } from 'src/utils/extract-error';
import { formatPrice } from 'src/utils/format-price';
import { useExpensesApi } from 'src/composables/useExpensesApi';
import { AMOUNT_STATUS_LABELS, monthLabel } from 'src/utils/expenses';
import type { ExpenseCountry, ExpenseSummaryDetail } from 'src/types/expense';

/**
 * Detalle del Resumen (DI-12) de un destino en un mes: un bloque por rubro con sus
 * subtotales y, dentro, cada concepto. Los números vienen de la API tal cual.
 *
 * - `destination`: la `key` de la columna del Resumen (id de sede, `casa_matriz` o `total`).
 * - `currency`: la moneda del resumen (`summary.currency`).
 * - `refreshKey`: si cambia con el diálogo abierto (el detalle de un gasto modificó algo),
 *   se vuelven a pedir los números sin vaciar lo que se ve.
 * - Emite `open-detail(expenseRecordId)` al tocar un concepto: la página abre el gasto.
 *   Un concepto con `imputationMonth` distinto del mes es un pago de este mes de un
 *   gasto de otro mes, y se marca con su mes de imputación.
 */
const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    country: ExpenseCountry;
    month: string;
    destination: string | null;
    currency: 'ARS' | 'EUR';
    refreshKey?: number;
  }>(),
  { refreshKey: 0 }
);

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'open-detail', id: number): void;
}>();

const log = createLogger('ResumenDetalleDialog');
const expensesApi = useExpensesApi();

const show = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
});

const detail = ref<ExpenseSummaryDetail | null>(null);
const loading = ref(false);
const loadError = ref<string | null>(null);
let loadSeq = 0;

async function load(keepCurrent: boolean) {
  if (props.destination === null) return;
  const seq = ++loadSeq;
  if (!keepCurrent) detail.value = null;
  loading.value = true;
  loadError.value = null;
  try {
    const result = await expensesApi.getExpenseSummaryDetail(
      props.country,
      props.month,
      props.destination
    );
    if (seq === loadSeq) detail.value = result;
  } catch (err: unknown) {
    if (seq !== loadSeq) return;
    loadError.value = extractError(err, 'Error cargando el detalle del resumen');
    log.error('Error cargando el detalle del resumen', { error: loadError.value });
  } finally {
    if (seq === loadSeq) loading.value = false;
  }
}

// Cada apertura (o cambio de destino, mes o país) arranca de cero: nunca se ve el destino anterior.
watch(
  () => [props.modelValue, props.destination, props.month, props.country] as const,
  ([open, destination]) => {
    if (!open || destination === null) return;
    void load(false);
  },
  { immediate: true }
);

watch(
  () => props.refreshKey,
  () => {
    if (props.modelValue && props.destination !== null) void load(true);
  }
);

onUnmounted(() => {
  expensesApi.cleanup();
});
</script>
