<template>
  <q-dialog :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)">
    <q-card style="min-width: 450px">
      <q-card-section>
        <div class="text-h6">Registrar Pago</div>
      </q-card-section>

      <q-card-section class="q-gutter-sm">
        <!-- Member search (only when no userId provided) -->
        <q-select
          v-if="!userId"
          v-model="form.selectedMember"
          :options="memberOptions"
          label="Alumno *"
          use-input
          input-debounce="300"
          option-label="label"
          option-value="value"
          emit-value
          map-options
          outlined
          dense
          :loading="searchingMembers"
          @filter="onMemberSearch"
          :rules="[(v: number | null) => v !== null || 'Selecciona un alumno']"
        >
          <template #no-option>
            <q-item>
              <q-item-section class="text-grey"> Escribe para buscar un alumno </q-item-section>
            </q-item>
          </template>
        </q-select>

        <!-- Amount -->
        <q-input
          v-model.number="form.amount"
          label="Monto *"
          type="number"
          outlined
          dense
          prefix="$"
          :rules="[(v: number) => v > 0 || 'Ingresa un monto valido']"
        />

        <!-- Payment method -->
        <q-select
          v-model="form.paymentMethod"
          :options="PAYMENT_METHOD_OPTIONS"
          label="Metodo de pago *"
          outlined
          dense
          emit-value
          map-options
          :rules="[(v: string | null) => !!v || 'Selecciona un metodo']"
        />

        <!-- Date -->
        <q-input
          v-model="form.paymentDate"
          label="Fecha *"
          type="date"
          outlined
          dense
          :rules="[(v: string) => !!v || 'Ingresa una fecha']"
        />

        <!-- Reference (optional) -->
        <q-input v-model="form.reference" label="Referencia (opcional)" outlined dense />

        <!-- Notes (optional) -->
        <q-input
          v-model="form.notes"
          label="Notas (opcional)"
          outlined
          dense
          type="textarea"
          autogrow
        />
      </q-card-section>

      <!-- Error banner -->
      <q-card-section v-if="saveError" class="q-pt-none">
        <q-banner class="bg-negative text-white" rounded dense>{{ saveError }}</q-banner>
      </q-card-section>

      <q-card-actions align="right">
        <q-btn flat label="Cancelar" v-close-popup />
        <q-btn
          color="primary"
          label="Registrar"
          :loading="saving"
          :disable="!isFormValid"
          @click="onSave"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue';
import { useQuasar } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { usePaymentsApi } from 'src/composables/usePaymentsApi';
import { useMembersApi } from 'src/composables/useMembersApi';
import { PAYMENT_METHOD_OPTIONS, type PaymentMethod } from 'src/types/payment';

const log = createLogger('RegisterPaymentDialog');
const $q = useQuasar();

// =========================================================================
// Props & Emits
// =========================================================================

const props = defineProps<{
  modelValue: boolean;
  userId?: number | null;
  memberName?: string;
  defaultAmount?: number;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  saved: [];
}>();

// =========================================================================
// State
// =========================================================================

const saving = ref(false);
const saveError = ref<string | null>(null);
const searchingMembers = ref(false);
const memberOptions = ref<Array<{ label: string; value: number }>>([]);

function todayDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const form = reactive({
  selectedMember: null as number | null,
  amount: 0,
  paymentMethod: null as PaymentMethod | null,
  paymentDate: todayDate(),
  reference: '',
  notes: '',
});

const isFormValid = computed(() => {
  const memberId = props.userId ?? form.selectedMember;
  return (
    memberId !== null &&
    memberId !== undefined &&
    form.amount > 0 &&
    form.paymentMethod !== null &&
    form.paymentDate !== ''
  );
});

// Reset form when dialog opens
watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      form.selectedMember = null;
      form.amount = props.defaultAmount ?? 0;
      form.paymentMethod = null;
      form.paymentDate = todayDate();
      form.reference = '';
      form.notes = '';
      saveError.value = null;
    }
  }
);

// =========================================================================
// Member search (for global use without userId)
// =========================================================================

async function onMemberSearch(val: string, update: (fn: () => void) => void, abort: () => void) {
  if (val.length < 2) {
    abort();
    return;
  }

  searchingMembers.value = true;
  try {
    const membersApi = useMembersApi();
    const result = await membersApi.getMembers({ search: val, isActive: true, page: 1, limit: 20 });
    update(() => {
      memberOptions.value = result.members.map((m) => {
        const name = [m.firstName, m.lastName].filter(Boolean).join(' ') || m.email;
        return { label: name, value: m.id };
      });
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error buscando';
    log.error('Error searching members', { error: message });
    abort();
  } finally {
    searchingMembers.value = false;
  }
}

// =========================================================================
// Save
// =========================================================================

async function onSave() {
  const memberId = props.userId ?? form.selectedMember;
  if (memberId === null || memberId === undefined) return;
  if (!form.paymentMethod) return;

  saving.value = true;
  saveError.value = null;

  try {
    const paymentsApi = usePaymentsApi();
    await paymentsApi.recordPayment(memberId, {
      amount: form.amount,
      paymentMethod: form.paymentMethod,
      paymentDate: form.paymentDate,
      reference: form.reference.trim() || undefined,
      notes: form.notes.trim() || undefined,
    });

    $q.notify({ type: 'positive', message: 'Pago registrado correctamente' });
    emit('saved');
    emit('update:modelValue', false);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error recording payment', { error: message });
    saveError.value = message;
  } finally {
    saving.value = false;
  }
}
</script>
