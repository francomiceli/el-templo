<template>
  <q-dialog
    :model-value="modelValue"
    persistent
    @update:model-value="(v) => emit('update:modelValue', v)"
  >
    <q-card style="min-width: 400px; max-width: 95vw">
      <q-card-section>
        <div class="text-h6">Anular transacción</div>
        <div v-if="transactionLabel" class="text-body2 text-grey-8 q-mt-xs">
          {{ transactionLabel }}
        </div>
      </q-card-section>

      <q-card-section class="q-pt-none">
        <div class="text-body2 q-mb-sm">
          Esta acción es irreversible. La transacción se marca como anulada y los saldos asociados
          se revierten automáticamente.
        </div>

        <q-input
          v-model="reason"
          label="Razón de anulación *"
          type="textarea"
          dense
          outlined
          autogrow
          autofocus
          :rules="[(v: string) => (v?.trim().length ?? 0) >= 5 || 'Mínimo 5 caracteres']"
          hint="Mínimo 5 caracteres. Visible en el log de auditoría."
          :disable="submitting"
        />
      </q-card-section>

      <q-card-actions align="right" class="q-pa-md">
        <q-btn flat label="Cancelar" :disable="submitting" @click="onCancel" />
        <q-btn
          color="negative"
          label="Anular"
          icon="cancel"
          :loading="submitting"
          :disable="!isValid"
          @click="onConfirm"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useQuasar } from 'quasar';
import { useTransactionsApi } from 'src/composables/useTransactionsApi';
import { createLogger } from 'src/utils/logger';

const props = defineProps<{
  modelValue: boolean;
  transactionId: number | null;
  transactionLabel?: string;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'voided'): void;
}>();

const $q = useQuasar();
const transactionsApi = useTransactionsApi();
const log = createLogger('VoidTransactionDialog');

const reason = ref('');
const submitting = ref(false);

const trimmedLength = computed(() => reason.value.trim().length);
const isValid = computed(() => trimmedLength.value >= 5 && props.transactionId !== null);

// Reset al abrir el dialog (D-17). Cuando se cierra no hace falta reset.
watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      reason.value = '';
      submitting.value = false;
    }
  },
);

function onCancel(): void {
  if (submitting.value) return;
  emit('update:modelValue', false);
}

async function onConfirm(): Promise<void> {
  if (!isValid.value || props.transactionId === null) return;
  submitting.value = true;
  try {
    await transactionsApi.voidTransaction(props.transactionId, reason.value.trim());
    $q.notify({ type: 'positive', message: 'Transacción anulada' });
    emit('voided');
    emit('update:modelValue', false);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error anulando transacción', {
      error: message,
      transactionId: props.transactionId,
    });
    $q.notify({ type: 'negative', message });
  } finally {
    submitting.value = false;
  }
}
</script>
