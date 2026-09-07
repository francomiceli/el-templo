<template>
  <div class="q-pa-md">
    <!-- Nota explicativa fija (Phase 152 / D-10 / CAJA-06). No dismissible: la -->
    <!-- confusión sobre qué muestra Saldos es recurrente. Combina qué es el     -->
    <!-- saldo firme + el aviso de registrar egresos/retiros.                    -->
    <q-banner rounded class="bg-blue-1 text-grey-9 q-mb-md">
      <template #avatar>
        <q-icon name="info" color="primary" />
      </template>
      Muestra el <strong>saldo firme por caja</strong>: solo los movimientos validados desde el
      corte. Los cobros pendientes se muestran aparte y nunca se suman al saldo firme. Si no se
      registran los <strong>egresos</strong> y <strong>retiros</strong>, los saldos no reflejarán la
      realidad.
    </q-banner>

    <!-- Rango del período + export. El rango NO cambia el saldo firme (que es
         acumulado desde el corte): agrega el movimiento del período por caja,
         que es lo que el staff necesita para conciliar (UAT 2026-07-21). -->
    <div class="row items-center q-col-gutter-md q-mb-md">
      <div class="col-12 col-sm-4">
        <DateRangeFilter
          :model-value="dateRange"
          month-label="Movimientos del mes"
          @update:model-value="onDateRangeChange"
        />
      </div>
      <div class="col-12 col-sm row justify-end">
        <q-btn
          icon="download"
          label="Exportar Excel"
          color="primary"
          outline
          dense
          :loading="exporting"
          @click="onExportSaldos"
        />
      </div>
    </div>

    <!-- Groups in fixed order: Efectivo sucursales → Efectivo central → Banco (D-06) -->
    <div v-for="(group, idx) in groups" :key="group.key" :class="{ 'q-mt-xl': idx > 0 }">
      <div class="text-subtitle1 text-weight-medium q-mb-sm">{{ group.label }}</div>

      <!-- Empty group -->
      <div v-if="group.rows.length === 0" class="text-caption text-grey-5">
        Sin cajas de este tipo.
      </div>

      <template v-else>
        <!-- Caja cards -->
        <div class="row q-col-gutter-md">
          <div v-for="row in group.rows" :key="row.cashRegisterId" class="col-6 col-sm-4 col-md-3">
            <q-card flat bordered>
              <q-card-section>
                <!-- name + moneda badge beside -->
                <div class="row items-center q-gutter-xs no-wrap">
                  <div class="text-subtitle2 ellipsis col">{{ row.name }}</div>
                  <q-badge color="grey-3" text-color="grey-8" :label="row.currency" />
                </div>

                <!-- saldo firme (large, dominant) -->
                <div v-if="loading" class="q-mt-xs">
                  <q-skeleton type="text" width="120px" />
                </div>
                <div v-else class="text-h5 text-weight-bold q-mt-xs">
                  {{ formatPrice(row.firmeBalance, row.currency) }}
                </div>

                <!-- pendiente (small, gold, never added to firme) -->
                <div v-if="loading" class="q-mt-xs">
                  <q-skeleton type="text" width="80px" />
                </div>
                <div v-else class="text-caption text-warning q-mt-xs">
                  Pendiente: {{ formatPrice(row.pendienteAmount, row.currency) }}
                </div>

                <!-- Movimiento del período: entradas/salidas/neto. Separado del
                     saldo por una línea para que no se lea como parte de él. -->
                <template v-if="!loading && row.period">
                  <q-separator class="q-my-sm" />
                  <div class="text-caption text-grey-7">
                    <div class="row justify-between">
                      <span>Entradas</span>
                      <span class="text-positive"
                        >+{{ formatPrice(row.period.inflow, row.currency) }}</span
                      >
                    </div>
                    <div class="row justify-between">
                      <span>Salidas</span>
                      <span class="text-negative"
                        >-{{ formatPrice(row.period.outflow, row.currency) }}</span
                      >
                    </div>
                    <div class="row justify-between text-weight-medium text-grey-9">
                      <span>Neto</span>
                      <span :class="row.period.net < 0 ? 'text-negative' : 'text-positive'">
                        {{ row.period.net < 0 ? '' : '+'
                        }}{{ formatPrice(row.period.net, row.currency) }}
                      </span>
                    </div>
                  </div>
                </template>
              </q-card-section>
            </q-card>
          </div>
        </div>

        <!-- per-currency subtotal chips — NEVER a cross-currency total (D-06) -->
        <div class="row q-gutter-sm q-mt-sm">
          <q-chip
            v-for="sub in group.subtotals"
            :key="sub.currency"
            outline
            color="primary"
            text-color="primary"
            dense
          >
            Subtotal {{ sub.currency }}: {{ formatPrice(sub.total, sub.currency) }}
          </q-chip>
        </div>
      </template>
    </div>

    <!-- Ingresos por sede en el período (feedback 2026-09-07): todo lo que entró
         por la sede, sin importar la caja — efectivo, transferencia, tarjeta,
         domiciliación. Plata firme, misma condición que las tarjetas del
         Historial de cobros. -->
    <div class="q-mt-xl">
      <div class="text-subtitle1 text-weight-medium q-mb-sm">
        Ingresos por sede
        <span class="text-caption text-grey-7 q-ml-sm">{{ incomePeriodLabel }}</span>
      </div>
      <div v-if="!hasRange" class="text-caption text-grey-5">
        Elegí un rango de fechas completo para ver los ingresos del período.
      </div>
      <q-table
        v-else
        :rows="income"
        :columns="incomeColumns"
        row-key="key"
        flat
        bordered
        dense
        :loading="loadingIncome"
        :pagination="{ rowsPerPage: 0 }"
        hide-bottom
      >
        <template #body-cell-sede="cellProps">
          <q-td :props="cellProps" class="text-weight-medium">
            {{ cellProps.row.branchName }}
            <q-badge
              class="q-ml-xs"
              color="grey-3"
              text-color="grey-8"
              :label="cellProps.row.currency"
            />
          </q-td>
        </template>
        <template
          v-for="col in incomeMoneyColumns"
          :key="col.name"
          #[`body-cell-${col.name}`]="cellProps"
        >
          <q-td :props="cellProps" :class="{ 'text-weight-bold': col.name === 'total' }">
            {{ formatPrice(col.value(cellProps.row), cellProps.row.currency) }}
          </q-td>
        </template>
        <template #bottom-row v-if="income.length > 1">
          <q-tr v-for="sub in incomeSubtotals" :key="sub.currency" class="text-weight-bold">
            <q-td>Total {{ sub.currency }}</q-td>
            <q-td v-for="col in incomeMoneyColumns" :key="col.name" class="text-right">
              {{ formatPrice(sub[col.name], sub.currency) }}
            </q-td>
          </q-tr>
        </template>
        <template #no-data>
          <div class="full-width text-center text-grey-6 q-pa-md">
            Sin ingresos firmes en el período.
          </div>
        </template>
      </q-table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useQuasar, type QTableColumn } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { formatPrice } from 'src/utils/format-price';
import { useTransactionsApi } from 'src/composables/useTransactionsApi';
import DateRangeFilter from 'src/components/caja/DateRangeFilter.vue';
import { currentMonthRange, type DateRangeValue } from 'src/utils/date-range';
import type { CajaSaldoRow, IncomeByBranchRow } from 'src/types/transaction';

// =========================================================================
// Props — shared selectedCountry / isOwner from the CajaPage hub.
// =========================================================================

const props = defineProps<{
  selectedCountry: 'AR' | 'ES';
  isOwner: boolean;
}>();

const log = createLogger('SaldosPorCajaTab');
const $q = useQuasar();
const transactionsApi = useTransactionsApi();

const rows = ref<CajaSaldoRow[]>([]);
const loading = ref(false);
const exporting = ref(false);

// =========================================================================
// Grouping by tipo (D-06). The enum is only efectivo/banco, so the
// "Efectivo central" group is derived from type=efectivo && branchId=null.
// Group order is FIXED: sucursales → central → banco.
// =========================================================================

interface SaldoGroup {
  key: string;
  label: string;
  rows: CajaSaldoRow[];
  subtotals: Array<{ currency: string; total: number }>;
}

/** Per-currency subtotals — one entry per distinct currency, NEVER combined. */
function perCurrencySubtotals(
  groupRows: CajaSaldoRow[]
): Array<{ currency: string; total: number }> {
  const byCurrency = new Map<string, number>();
  for (const r of groupRows) {
    byCurrency.set(r.currency, (byCurrency.get(r.currency) ?? 0) + r.firmeBalance);
  }
  return Array.from(byCurrency.entries()).map(([currency, total]) => ({ currency, total }));
}

const groups = computed<SaldoGroup[]>(() => {
  const sucursales = rows.value.filter((r) => r.type === 'efectivo' && r.branchId !== null);
  const central = rows.value.filter((r) => r.type === 'efectivo' && r.branchId === null);
  const banco = rows.value.filter((r) => r.type === 'banco');
  return [
    {
      key: 'efectivo_sucursales',
      label: 'Efectivo sucursales',
      rows: sucursales,
      subtotals: perCurrencySubtotals(sucursales),
    },
    {
      key: 'efectivo_central',
      label: 'Efectivo central',
      rows: central,
      subtotals: perCurrencySubtotals(central),
    },
    {
      key: 'banco',
      label: 'Banco',
      rows: banco,
      subtotals: perCurrencySubtotals(banco),
    },
  ];
});

// =========================================================================
// Data loading — owner scopes by selectedCountry; non-owner is auto-scoped
// server-side (country param omitted).
// =========================================================================

// Rango del período (D-03, mismo control que Historial de cobros). Arranca en el
// mes corriente. NO afecta el saldo firme — sólo el bloque de movimientos.
const dateRange = ref<DateRangeValue>(currentMonthRange());

function onDateRangeChange(value: DateRangeValue) {
  dateRange.value = value;
  void loadBalances();
}

// El rango va completo o no va (el server rechaza uno solo con 400).
const hasRange = computed(
  () => dateRange.value.dateFrom !== undefined && dateRange.value.dateTo !== undefined
);

async function loadBalances() {
  loading.value = true;
  try {
    // Con el control en modo "por día" y una sola fecha elegida, el rango se
    // omite: los saldos se siguen mostrando, sin el bloque de movimientos.
    const { dateFrom, dateTo } = dateRange.value;
    rows.value = await transactionsApi.getCashRegisterBalances({
      country: props.isOwner ? props.selectedCountry : undefined,
      ...(hasRange.value ? { dateFrom, dateTo } : {}),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error loading cash-register balances', { error: message });
    $q.notify({ type: 'negative', message: 'Error cargando saldos' });
  } finally {
    loading.value = false;
  }
  void loadIncome();
}

// =========================================================================
// Ingresos por sede en el período (2026-09-07) — misma plata firme que las
// tarjetas del Historial, agrupada por (sede, moneda) y abierta por método.
// =========================================================================

type IncomeRow = IncomeByBranchRow & { key: string };
const income = ref<IncomeRow[]>([]);
const loadingIncome = ref(false);

type IncomeColName = 'cash' | 'transfer' | 'card' | 'direct_debit' | 'otros' | 'total';
type IncomeSubtotal = { currency: string } & Record<IncomeColName, number>;

const incomeMoneyColumns: Array<{
  name: IncomeColName;
  label: string;
  value: (r: IncomeByBranchRow) => number;
}> = [
  { name: 'cash', label: 'Efectivo', value: (r) => r.byMethod.cash },
  { name: 'transfer', label: 'Transferencia', value: (r) => r.byMethod.transfer },
  { name: 'card', label: 'Tarjeta', value: (r) => r.byMethod.card },
  { name: 'direct_debit', label: 'Domiciliación', value: (r) => r.byMethod.direct_debit },
  // AURA / interno: no es plata que entra a una caja, pero el summary lo cuenta
  // como ingreso; se muestra aparte para que el total cierre con el Historial.
  { name: 'otros', label: 'AURA / interno', value: (r) => r.byMethod.aura_credit + r.byMethod.internal },
  { name: 'total', label: 'Total', value: (r) => r.total },
];

const incomeColumns: QTableColumn<IncomeRow>[] = [
  { name: 'sede', label: 'Sede', field: 'branchName', align: 'left' },
  ...incomeMoneyColumns.map(
    (c): QTableColumn<IncomeRow> => ({
      name: c.name,
      label: c.label,
      field: (r) => c.value(r),
      align: 'right',
    })
  ),
];

/** Totales por moneda (nunca cross-currency, D-06). */
const incomeSubtotals = computed<IncomeSubtotal[]>(() => {
  const byCurrency = new Map<string, IncomeSubtotal>();
  for (const r of income.value) {
    const acc: IncomeSubtotal = byCurrency.get(r.currency) ?? {
      currency: r.currency,
      cash: 0,
      transfer: 0,
      card: 0,
      direct_debit: 0,
      otros: 0,
      total: 0,
    };
    for (const c of incomeMoneyColumns) acc[c.name] += c.value(r);
    byCurrency.set(r.currency, acc);
  }
  return Array.from(byCurrency.values());
});

const incomePeriodLabel = computed(() => {
  const { dateFrom, dateTo } = dateRange.value;
  if (dateFrom === undefined || dateTo === undefined) return '';
  return `${dateFrom} → ${dateTo}`;
});

async function loadIncome() {
  if (!hasRange.value) {
    income.value = [];
    return;
  }
  loadingIncome.value = true;
  try {
    const { dateFrom, dateTo } = dateRange.value;
    const rowsIncome = await transactionsApi.getIncomeByBranch({
      country: props.isOwner ? props.selectedCountry : undefined,
      dateFrom,
      dateTo,
    });
    income.value = rowsIncome.map((r) => ({ ...r, key: `${r.branchId}:${r.currency}` }));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error loading income by branch', { error: message });
    $q.notify({ type: 'negative', message: 'Error cargando ingresos por sede' });
  } finally {
    loadingIncome.value = false;
  }
}

// =========================================================================
// Excel export (REP-04) — reuses the blob-download pattern (createObjectURL).
// =========================================================================

async function onExportSaldos(): Promise<void> {
  exporting.value = true;
  try {
    const blob = await transactionsApi.exportCashBalancesToExcel({
      country: props.isOwner ? props.selectedCountry : undefined,
    });
    const today = new Date().toISOString().slice(0, 10);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `saldos-${today}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    $q.notify({ type: 'positive', message: 'Excel exportado' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error exportando saldos', { error: message });
    $q.notify({ type: 'negative', message: 'Error exportando saldos' });
  } finally {
    exporting.value = false;
  }
}

// =========================================================================
// Lifecycle
// =========================================================================

onMounted(loadBalances);

// Re-fetch when the hub switches country (owner AR/ES).
watch(() => props.selectedCountry, loadBalances);

// Component-level onUnmounted is allowed (the rule forbids onUnmounted INSIDE
// the composable, not in the SFC). Drives the composable cleanup().
onUnmounted(() => {
  transactionsApi.cleanup();
});
</script>
