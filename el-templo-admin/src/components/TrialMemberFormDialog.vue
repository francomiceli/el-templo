<template>
  <q-dialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    @hide="onHide"
  >
    <q-card style="width: 480px; max-width: 95vw">
      <q-card-section>
        <div class="text-h6">Nuevo en Prueba</div>
        <div class="text-caption text-grey-7">
          Soft register: solo nombre, apellido, teléfono y sede. Completá el resto cuando el lead se
          convierta.
        </div>
      </q-card-section>

      <q-separator />

      <q-card-section>
        <q-form ref="formRef" @submit.prevent="onSubmit">
          <div class="q-gutter-sm">
            <div class="row q-col-gutter-sm">
              <div class="col-12 col-sm-6">
                <q-input
                  v-model="form.firstName"
                  label="Nombre *"
                  dense
                  outlined
                  autofocus
                  :rules="[requiredRule('Nombre')]"
                />
              </div>
              <div class="col-12 col-sm-6">
                <q-input
                  v-model="form.lastName"
                  label="Apellido *"
                  dense
                  outlined
                  :rules="[requiredRule('Apellido')]"
                />
              </div>
            </div>

            <q-input
              v-model="form.phone"
              label="Teléfono *"
              dense
              outlined
              :rules="[requiredRule('Teléfono')]"
            />

            <q-select
              v-model="form.branchId"
              :options="branchOptions"
              label="Sede *"
              dense
              outlined
              emit-value
              map-options
              :disable="lockBranch"
              :rules="[(v: number | null) => v !== null || 'Sede es requerida']"
            />
          </div>
        </q-form>
      </q-card-section>

      <q-card-actions align="right">
        <q-btn flat label="Cancelar" :disable="submitting" @click="onCancel" />
        <q-btn color="primary" label="Crear" :loading="submitting" @click="onSubmit" />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useQuasar, type QForm } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { useMembersApi } from 'src/composables/useMembersApi';
import { extractError, isExpectedClientError } from 'src/utils/extract-error';
import type { BranchOption, MemberProfile } from 'src/types/member';

const log = createLogger('TrialMemberFormDialog');

const props = defineProps<{
  modelValue: boolean;
  branches: BranchOption[];
  /** Pre-select a sede and lock the field (used from SlotDetailDialog). */
  defaultBranchId?: number | null;
  /** When true, the sede selector is disabled even if a default is set. */
  lockBranch?: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  created: [member: MemberProfile];
}>();

const membersApi = useMembersApi();
const $q = useQuasar();
const formRef = ref<InstanceType<typeof QForm> | null>(null);
const submitting = ref(false);

interface TrialForm {
  firstName: string;
  lastName: string;
  phone: string;
  branchId: number | null;
}

function emptyForm(): TrialForm {
  return {
    firstName: '',
    lastName: '',
    phone: '',
    branchId: props.defaultBranchId ?? null,
  };
}

const form = ref<TrialForm>(emptyForm());

const branchOptions = computed(() => props.branches.map((b) => ({ label: b.name, value: b.id })));

function requiredRule(fieldName: string) {
  return (val: string | null | undefined) =>
    (val !== null && val !== undefined && String(val).trim().length > 0) ||
    `${fieldName} es requerido`;
}

// Reset form whenever the dialog reopens so a previous abandoned attempt
// doesn't leak into the next "person at the door" flow.
watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      form.value = emptyForm();
      submitting.value = false;
    }
  }
);

async function onSubmit(): Promise<void> {
  if (!formRef.value) return;
  const valid = await formRef.value.validate();
  if (!valid) return;

  submitting.value = true;
  try {
    const member = await membersApi.createTrialMember({
      firstName: form.value.firstName.trim(),
      lastName: form.value.lastName.trim(),
      phone: form.value.phone.trim(),
      branchId: form.value.branchId as number,
    });
    $q.notify({ type: 'positive', message: 'Alumno en prueba creado' });
    emit('created', member);
    emit('update:modelValue', false);
  } catch (err: unknown) {
    const message = extractError(err, 'Error creando sesión de prueba');
    if (!isExpectedClientError(err)) {
      log.error('Error creating trial member', { error: message });
    }
    $q.notify({ type: 'negative', message });
  } finally {
    submitting.value = false;
  }
}

function onCancel(): void {
  emit('update:modelValue', false);
}

function onHide(): void {
  form.value = emptyForm();
}
</script>
