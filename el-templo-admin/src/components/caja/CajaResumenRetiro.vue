<template>
  <div class="caja-resumen">
    <!-- Quedó al último retiro -->
    <div class="row items-baseline no-wrap q-py-xs">
      <div class="col">
        <div>Quedó en caja al último retiro</div>
        <div class="text-caption text-grey-7">
          <template v-if="summary.lastWithdrawal">
            {{ formatDate(summary.lastWithdrawal.transactionDate) }} ·
            {{ summary.lastWithdrawal.responsibleName }} se llevó
            {{ formatPrice(summary.lastWithdrawal.amount, currency) }}
          </template>
          <template v-else>Todavía no hay retiros: saldo desde el corte de la caja</template>
        </div>
      </div>
      <div class="text-body1 text-weight-medium">
        {{ formatPrice(summary.previousBalance, currency) }}
      </div>
    </div>

    <!-- + Ingresos / − Salidas, abribles -->
    <q-expansion-item
      v-for="section in sections"
      :key="section.key"
      dense
      dense-toggle
      expand-icon-class="text-grey-6"
      header-class="q-px-none"
      :disable="section.rows.length === 0"
    >
      <template #header>
        <q-item-section>
          <div>
            {{ section.label }}
            <span class="text-caption text-grey-7">({{ section.rows.length }})</span>
          </div>
        </q-item-section>
        <q-item-section side>
          <div class="text-body1 text-weight-medium" :class="section.amountClass">
            {{ section.sign }} {{ formatPrice(section.total, currency) }}
          </div>
        </q-item-section>
      </template>
      <q-list dense separator class="q-mb-sm rounded-borders bg-grey-1">
        <q-item v-for="row in section.rows" :key="row.id">
          <q-item-section>
            <q-item-label>{{ row.description }}</q-item-label>
            <q-item-label caption>
              {{ formatDate(row.transactionDate) }}
              <span v-if="row.detail"> · {{ row.detail }}</span>
              <span v-if="row.recorderName"> · cargó {{ row.recorderName }}</span>
            </q-item-label>
          </q-item-section>
          <q-item-section side class="text-grey-9">
            {{ formatPrice(row.amount, currency) }}
          </q-item-section>
        </q-item>
      </q-list>
    </q-expansion-item>

    <q-separator class="q-my-xs" />

    <!-- = Disponible -->
    <div class="row items-baseline no-wrap q-py-xs">
      <div class="col text-weight-bold">Disponible para retirar</div>
      <div
        class="text-h6 text-weight-bold"
        :class="summary.firmeBalance < 0 ? 'text-negative' : ''"
      >
        {{ formatPrice(summary.firmeBalance, currency) }}
      </div>
    </div>

    <!-- Lo que está en el cajón pero no se retira -->
    <div class="text-caption text-grey-7">
      <div v-if="summary.changeFund > 0">
        <q-icon name="savings" size="14px" class="q-mr-xs" />
        Fondo de cambio {{ formatPrice(summary.changeFund, currency) }}: queda en la caja.
      </div>
      <div v-if="awaitingValidation.rows.length > 0" class="text-warning">
        <q-icon name="hourglass_top" size="14px" class="q-mr-xs" />
        {{ awaitingValidation.rows.length }}
        {{ awaitingValidation.rows.length === 1 ? 'cobro' : 'cobros' }} sin validar por
        {{ formatPrice(awaitingValidation.total, currency) }}: están en el cajón pero no se pueden
        retirar hasta validarlos.
        <a v-if="showPendientesLink" href="#" class="text-primary" @click.prevent="emit('go-pendientes')"
          >Ir a Pendientes</a
        >
      </div>
      <div v-if="summary.expectedInDrawer !== summary.firmeBalance">
        En el cajón debería haber {{ formatPrice(summary.expectedInDrawer, currency) }} en total.
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { formatPrice } from 'src/utils/format-price';
import type {
  WithdrawalFlowItem,
  WithdrawalPaymentItem,
  WithdrawalSummary,
} from 'src/types/transaction';

// =========================================================================
// La cuenta que hace quien abre el cajón para retirar (feedback de Martín,
// 2026-09-23): lo que quedó al último retiro + lo que entró − lo que salió
// (la yerba, un remís, un movimiento a otra caja) = lo que hay para llevarse.
// Quién pagó cada cobro queda en el detalle, que es secundario. La cuenta la
// arma la API (GET /withdrawals/pending → summary); acá solo se muestra.
// Lo usan la pestaña Retiros y el diálogo Registrar retiro.
// =========================================================================

const props = defineProps<{
  summary: WithdrawalSummary;
  awaitingValidation: { rows: WithdrawalPaymentItem[]; total: number };
  currency: string;
  /** El link a Pendientes solo tiene sentido fuera de un diálogo. */
  showPendientesLink?: boolean;
}>();

const emit = defineEmits<{
  (e: 'go-pendientes'): void;
}>();

interface Section {
  key: 'in' | 'out';
  label: string;
  sign: '+' | '−';
  total: number;
  rows: WithdrawalFlowItem[];
  amountClass: string;
}

const sections = computed<Section[]>(() => [
  {
    key: 'in',
    label: 'Ingresos desde entonces',
    sign: '+',
    total: props.summary.inflowTotal,
    rows: props.summary.inflows,
    amountClass: 'text-positive',
  },
  {
    key: 'out',
    label: 'Salidas desde entonces',
    sign: '−',
    total: props.summary.outflowTotal,
    rows: props.summary.outflows,
    amountClass: 'text-negative',
  },
]);

function formatDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}
</script>
