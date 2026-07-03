<template>
  <div class="q-pa-md">
    <!-- Header: alta de cuenta (CTA-01) -->
    <div class="row items-center q-mb-md">
      <div class="text-subtitle1 text-weight-medium col">Cuentas bancarias</div>
      <q-btn icon="add" label="Nueva cuenta" color="primary" unelevated dense @click="openCreate" />
    </div>

    <q-table
      :rows="accounts"
      :columns="columns"
      row-key="id"
      flat
      bordered
      :loading="loading"
      :pagination="{ rowsPerPage: 0 }"
      hide-bottom
    >
      <!-- Cerradas atenuadas (D-07) -->
      <template #body="tableProps">
        <q-tr :props="tableProps" :class="{ 'text-grey-5': !tableProps.row.isActive }">
          <q-td key="name" :props="tableProps">
            <div class="row items-center q-gutter-xs no-wrap">
              <span>{{ tableProps.row.name }}</span>
              <q-badge
                v-if="!tableProps.row.isActive"
                color="grey-4"
                text-color="grey-8"
                label="Cerrada"
              />
            </div>
          </q-td>
          <q-td key="bankName" :props="tableProps">{{ tableProps.row.bankName }}</q-td>
          <q-td key="accountHolder" :props="tableProps">{{ tableProps.row.accountHolder }}</q-td>
          <q-td key="currency" :props="tableProps">{{ tableProps.row.currency }}</q-td>
          <q-td key="balance" :props="tableProps" class="text-weight-medium">
            {{ formatPrice(tableProps.row.balance, tableProps.row.currency) }}
          </q-td>
          <q-td key="actions" :props="tableProps">
            <div class="row items-center q-gutter-xs no-wrap justify-end">
              <q-btn flat dense round icon="edit" color="primary" @click="openEdit(tableProps.row)">
                <q-tooltip>Editar</q-tooltip>
              </q-btn>
              <q-btn
                flat
                dense
                round
                icon="payments"
                color="secondary"
                @click="openRetiro(tableProps.row)"
              >
                <q-tooltip>Registrar retiro</q-tooltip>
              </q-btn>
              <q-btn
                v-if="tableProps.row.isActive"
                flat
                dense
                round
                icon="lock"
                color="negative"
                @click="onClose(tableProps.row)"
              >
                <q-tooltip>Cerrar cuenta</q-tooltip>
              </q-btn>
              <q-btn
                v-else
                flat
                dense
                round
                icon="lock_open"
                color="positive"
                @click="onReactivate(tableProps.row)"
              >
                <q-tooltip>Reactivar cuenta</q-tooltip>
              </q-btn>
            </div>
          </q-td>
        </q-tr>
      </template>

      <template #no-data>
        <div class="full-width text-center text-grey-6 q-pa-md">
          Todavía no hay cuentas bancarias. Creá la primera con "Nueva cuenta".
        </div>
      </template>
    </q-table>

    <!-- Alta / edición (CTA-01) -->
    <CuentaBancariaFormDialog
      v-model="showForm"
      :selected-country="selectedCountry"
      :is-owner="isOwner"
      :account="editingAccount"
      @saved="onSaved"
    />

    <!-- Retiro del dueño con centro 'Retiros' preseleccionado (CTA-03 / D-10) -->
    <RegistrarMovEgresoDialog
      v-model="showRetiro"
      :selected-country="selectedCountry"
      :is-owner="isOwner"
      prefill-tab="egreso"
      :prefill-caja-id="retiroCajaId ?? undefined"
      prefill-cost-center-name="Retiros"
      @registered="onRetiroRegistered"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, onUnmounted } from 'vue';
import { useQuasar, type QTableColumn } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { extractError } from 'src/utils/extract-error';
import { formatPrice } from 'src/utils/format-price';
import { useTransactionsApi } from 'src/composables/useTransactionsApi';
import type { BankAccount } from 'src/types/transaction';
import CuentaBancariaFormDialog from 'src/components/caja/CuentaBancariaFormDialog.vue';
import RegistrarMovEgresoDialog from 'src/components/caja/RegistrarMovEgresoDialog.vue';

const props = defineProps<{
  selectedCountry: 'AR' | 'ES';
  isOwner: boolean;
}>();

const log = createLogger('CuentasTab');
const $q = useQuasar();
const transactionsApi = useTransactionsApi();

const accounts = ref<BankAccount[]>([]);
const loading = ref(false);

const columns: QTableColumn<BankAccount>[] = [
  { name: 'name', label: 'Cuenta', field: 'name', align: 'left' },
  { name: 'bankName', label: 'Banco', field: 'bankName', align: 'left' },
  { name: 'accountHolder', label: 'Titular', field: 'accountHolder', align: 'left' },
  { name: 'currency', label: 'Moneda', field: 'currency', align: 'left' },
  { name: 'balance', label: 'Saldo firme', field: 'balance', align: 'left' },
  { name: 'actions', label: 'Acciones', field: 'id', align: 'right' },
];

// =========================================================================
// Data loading — reactivo al país (owner AR/ES) igual que los demás tabs.
// =========================================================================

async function load() {
  loading.value = true;
  try {
    const { accounts: rows } = await transactionsApi.listBankAccounts();
    accounts.value = rows;
  } catch (err: unknown) {
    const message = extractError(err, 'Error cargando cuentas bancarias');
    log.error('Error loading bank accounts', { error: message });
    $q.notify({ type: 'negative', message });
  } finally {
    loading.value = false;
  }
}

// =========================================================================
// Alta / edición (CTA-01)
// =========================================================================

const showForm = ref(false);
const editingAccount = ref<BankAccount | null>(null);

function openCreate() {
  editingAccount.value = null;
  showForm.value = true;
}

function openEdit(account: BankAccount) {
  editingAccount.value = account;
  showForm.value = true;
}

function onSaved() {
  void load();
}

// =========================================================================
// Cerrar / reactivar (CTA-02) — baja lógica; el warning muestra el SALDO FIRME
// (row.balance) y advierte, pero permite confirmar (D-06). Nunca suma pendiente
// (CAJA-03).
// =========================================================================

function onClose(account: BankAccount) {
  const hasBalance = account.balance !== 0;
  const message = hasBalance
    ? `La cuenta "${account.name}" tiene un saldo firme de ` +
      `${formatPrice(account.balance, account.currency)}. ` +
      'Los saldos dejarán de reflejar la realidad si no se transfiere antes de cerrar. ' +
      '¿Cerrar de todos modos?'
    : `¿Cerrar la cuenta "${account.name}"? Podrás reactivarla más adelante.`;

  $q.dialog({
    title: 'Cerrar cuenta',
    message,
    cancel: true,
    persistent: true,
    ok: { label: 'Cerrar cuenta', color: hasBalance ? 'negative' : 'primary' },
  }).onOk(() => {
    void closeAccount(account.id);
  });
}

async function closeAccount(id: number) {
  try {
    await transactionsApi.closeBankAccount(id);
    $q.notify({ type: 'positive', message: 'Cuenta cerrada' });
    await load();
  } catch (err: unknown) {
    const message = extractError(err, 'Error cerrando la cuenta');
    log.error('Error closing bank account', { error: message });
    $q.notify({ type: 'negative', message });
  }
}

function onReactivate(account: BankAccount) {
  void reactivateAccount(account.id);
}

async function reactivateAccount(id: number) {
  try {
    await transactionsApi.reactivateBankAccount(id);
    $q.notify({ type: 'positive', message: 'Cuenta reactivada' });
    await load();
  } catch (err: unknown) {
    const message = extractError(err, 'Error reactivando la cuenta');
    log.error('Error reactivating bank account', { error: message });
    $q.notify({ type: 'negative', message });
  }
}

// =========================================================================
// Registrar retiro (CTA-03 / D-10) — monta el dialog de egreso con centro
// 'Retiros' + la caja de la fila preseleccionados.
// =========================================================================

const showRetiro = ref(false);
const retiroCajaId = ref<number | null>(null);

function openRetiro(account: BankAccount) {
  retiroCajaId.value = account.id;
  showRetiro.value = true;
}

function onRetiroRegistered() {
  void load();
}

// =========================================================================
// Lifecycle
// =========================================================================

onMounted(load);

watch(() => props.selectedCountry, load);

onUnmounted(() => {
  transactionsApi.cleanup();
});
</script>
