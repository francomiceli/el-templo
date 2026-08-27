<!--
  Confirmación de liquidación batch por partner (D-16, fase 179-13). "Liquidar"
  marca TODAS las comisiones `pending` del partner como `settled` en un acto —
  no mueve plata: el pago al comercio ya ocurrió fuera del sistema (efectivo,
  transferencia), esto solo lo registra. Calcado de VoidTransactionDialog.vue
  (dialog de confirmación con detalle + botón destructivo/irreversible).
-->
<template>
  <q-dialog
    :model-value="modelValue"
    persistent
    @update:model-value="(v) => emit('update:modelValue', v)"
  >
    <q-card style="min-width: 400px; max-width: 95vw">
      <q-card-section>
        <div class="text-h6">Liquidar comisiones</div>
        <div v-if="partner" class="text-body2 text-grey-8 q-mt-xs">
          {{ partner.name }}
        </div>
      </q-card-section>

      <q-card-section v-if="partner" class="q-pt-none">
        <div class="text-body1 q-mb-sm">
          {{ partner.comisionesPendientes }} comisión{{
            partner.comisionesPendientes === 1 ? '' : 'es'
          }}
          pendiente{{ partner.comisionesPendientes === 1 ? '' : 's' }} por
          <span class="text-weight-bold">{{
            formatPrice(partner.montoPendiente, partner.currency)
          }}</span>
        </div>

        <div class="text-body2 text-grey-8">
          "Liquidar" marca esas comisiones como pagadas fuera del sistema (efectivo, transferencia u
          otro medio acordado con el comercio) y
          <span class="text-weight-bold">no genera ningún movimiento de caja</span>. Confirmá solo
          si ya le pagaste al partner.
        </div>
      </q-card-section>

      <q-card-actions align="right" class="q-pa-md">
        <q-btn flat label="Cancelar" :disable="settling" @click="onCancel" />
        <q-btn
          color="primary"
          label="Liquidar"
          icon="task_alt"
          :loading="settling"
          :disable="!partner || partner.comisionesPendientes === 0"
          @click="onConfirm"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import axios from 'axios';
import { useQuasar } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { formatPrice } from 'src/utils/format-price';
import { usePartnersApi, type PartnerListItem } from 'src/composables/usePartnersApi';

const log = createLogger('PartnerSettleDialog');
const $q = useQuasar();
const partnersApi = usePartnersApi();

const props = defineProps<{
  modelValue: boolean;
  partner: PartnerListItem | null;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  settled: [];
}>();

const settling = ref(false);

function onCancel(): void {
  if (settling.value) return;
  emit('update:modelValue', false);
}

async function onConfirm(): Promise<void> {
  if (!props.partner || props.partner.comisionesPendientes === 0) return;
  settling.value = true;
  try {
    const result = await partnersApi.settleCommissions(props.partner.id);
    $q.notify({
      type: 'positive',
      message: `Liquidadas ${result.count} comisión${result.count === 1 ? '' : 'es'} por ${formatPrice(
        result.totalAmount,
        result.currency
      )}`,
    });
    emit('settled');
    emit('update:modelValue', false);
  } catch (err: unknown) {
    // T-179-52: el gate real es el 403 de la API (FINANCE_VOID_ROLES). Un rol
    // sin permiso ve un mensaje explícito en vez del error genérico de axios.
    if (axios.isAxiosError(err) && err.response?.status === 403) {
      $q.notify({ type: 'negative', message: 'No tenés permisos para liquidar comisiones' });
    } else {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      $q.notify({ type: 'negative', message: 'Error al liquidar las comisiones' });
      log.error('Error liquidando comisiones', { error: message, partnerId: props.partner.id });
    }
  } finally {
    settling.value = false;
  }
}
</script>
