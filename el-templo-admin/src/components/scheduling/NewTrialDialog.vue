<template>
  <q-dialog :model-value="show" persistent @update:model-value="emit('update:show', $event)">
    <q-card style="width: 420px; max-width: 95vw">
      <q-card-section>
        <div class="text-h6">Nueva Sesión de Prueba</div>
        <div class="text-caption text-grey-7 q-mt-xs">
          {{ contextCaption }}
        </div>
      </q-card-section>

      <q-separator />

      <q-card-section class="q-gutter-sm">
        <q-input
          v-model="form.firstName"
          label="Nombre"
          dense
          outlined
          autofocus
          :disable="submitting"
        />
        <q-input v-model="form.lastName" label="Apellido" dense outlined :disable="submitting" />
        <q-input v-model="form.phone" label="Teléfono" dense outlined :disable="submitting" />
      </q-card-section>

      <q-card-actions align="right">
        <q-btn flat label="Cancelar" color="grey-7" :disable="submitting" @click="onCancel" />
        <q-btn
          unelevated
          label="Crear"
          color="primary"
          :loading="submitting"
          :disable="!canSubmit"
          @click="onSubmit"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useQuasar } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { useSchedulingApi } from 'src/composables/useSchedulingApi';

const log = createLogger('NewTrialDialog');
const $q = useQuasar();
const schedulingApi = useSchedulingApi();

const props = defineProps<{
  show: boolean;
  branchId: number;
  scheduleId: number;
  bookingDate: string; // YYYY-MM-DD
  scheduleStartTime?: string; // HH:MM, optional context caption
  branchName?: string;
}>();

const emit = defineEmits<{
  'update:show': [value: boolean];
  created: [];
}>();

const form = reactive({
  firstName: '',
  lastName: '',
  phone: '',
});

const submitting = ref(false);

const canSubmit = computed(
  () =>
    form.firstName.trim().length > 0 &&
    form.lastName.trim().length > 0 &&
    form.phone.trim().length > 0 &&
    !submitting.value
);

const formattedDate = computed(() => {
  if (!props.bookingDate) return '';
  try {
    const d = new Date(props.bookingDate + 'T12:00:00');
    return d.toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return props.bookingDate;
  }
});

const contextCaption = computed(() => {
  const parts: string[] = [];
  if (props.branchName) parts.push(`Sede: ${props.branchName}`);
  if (props.scheduleStartTime) parts.push(`Horario: ${props.scheduleStartTime}`);
  if (formattedDate.value) parts.push(`Fecha: ${formattedDate.value}`);
  return parts.join(' · ');
});

function resetForm() {
  form.firstName = '';
  form.lastName = '';
  form.phone = '';
}

function onCancel() {
  emit('update:show', false);
}

async function onSubmit() {
  if (!canSubmit.value) return;
  submitting.value = true;
  try {
    await schedulingApi.createTrial({
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      phone: form.phone.trim(),
      branchId: props.branchId,
      scheduleId: props.scheduleId,
      bookingDate: props.bookingDate,
    });
    $q.notify({ type: 'positive', message: 'Sesión de prueba creada' });
    emit('created');
    emit('update:show', false);
    resetForm();
  } catch (err: unknown) {
    const fallback = err instanceof Error ? err.message : 'Error creando sesión de prueba';
    const msg = schedulingApi.error.value ?? fallback;
    log.error('Error creating trial', { error: msg });
    $q.notify({ type: 'negative', message: msg, timeout: 5000 });
  } finally {
    submitting.value = false;
  }
}

// Reset form whenever the dialog is closed externally.
watch(
  () => props.show,
  (val) => {
    if (!val) {
      resetForm();
    }
  }
);
</script>
