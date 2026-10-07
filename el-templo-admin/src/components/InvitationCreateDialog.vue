<!--
  Canal asistido de invitaciones (Fase 194 D-16): recepción/gestión crea la invitación
  en nombre de un socio, con las MISMAS reglas que la app (cupo del invitador y
  elegibilidad del invitado). El servidor decide: si rechaza, el motivo en español se
  muestra acá y el diálogo queda abierto para corregir (otro invitador, otro teléfono).
-->
<template>
  <q-dialog
    :model-value="modelValue"
    persistent
    @update:model-value="$emit('update:modelValue', $event)"
    @hide="onHide"
  >
    <q-card style="width: 480px; max-width: 95vw">
      <q-card-section>
        <div class="text-h6">Crear invitación</div>
        <div class="text-caption text-grey-7">
          Invitás a {{ memberName }} en nombre de un socio. Cuenta para el cupo mensual de quien
          invita y le da accesos de prueba en la sede elegida.
        </div>
      </q-card-section>

      <q-separator />

      <q-card-section>
        <q-form ref="formRef" @submit.prevent="onSubmit">
          <div class="q-gutter-sm">
            <ReferrerSelect
              ref="inviterSelect"
              v-model="form.inviterId"
              label="Lo invita *"
              hint="Buscá por nombre o DNI al socio que invita"
              :disable="submitting"
            />

            <q-select
              v-model="form.branchId"
              :options="branchOptions"
              label="Sede *"
              hint="Sede física donde va a entrenar"
              dense
              outlined
              emit-value
              map-options
              :disable="submitting"
              :rules="[(v: number | null) => v !== null || 'Sede es requerida']"
            />

            <q-input
              v-model="form.phone"
              label="Teléfono *"
              dense
              outlined
              :disable="submitting"
              :rules="[phoneRule]"
            />

            <q-input
              v-model="form.dni"
              label="DNI (opcional)"
              dense
              outlined
              :disable="submitting"
            />
          </div>
        </q-form>

        <q-banner v-if="failureMessage" dense rounded class="bg-red-1 text-negative q-mt-md">
          {{ failureMessage }}
        </q-banner>
      </q-card-section>

      <q-card-actions align="right">
        <q-btn flat label="Cancelar" :disable="submitting" @click="onCancel" />
        <q-btn
          color="primary"
          label="Crear invitación"
          :loading="submitting"
          :disable="form.inviterId === null"
          @click="onSubmit"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useQuasar, type QForm } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { useMembersApi, parseInvitationFailure } from 'src/composables/useMembersApi';
import { extractError, isExpectedClientError } from 'src/utils/extract-error';
import { formatDate } from 'src/utils/format-date';
import { accessesCountLabel } from 'src/utils/invitation-meta';
import type { BranchOption, InvitationActivation } from 'src/types/member';
import ReferrerSelect from './ReferrerSelect.vue';

const log = createLogger('InvitationCreateDialog');

const props = defineProps<{
  modelValue: boolean;
  /** Alumno que recibe la invitación. */
  userId: number;
  memberName: string;
  /** Teléfono guardado del alumno (precarga el campo; el servidor exige uno). */
  memberPhone: string | null;
  branches: BranchOption[];
  /** Sede del alumno: se preselecciona si es física. */
  memberBranchId: number | null;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  created: [activation: InvitationActivation];
}>();

const membersApi = useMembersApi();
const $q = useQuasar();
const formRef = ref<InstanceType<typeof QForm> | null>(null);
const inviterSelect = ref<{ reset: () => void } | null>(null);
const submitting = ref(false);
// Motivo (en español, del servidor) del último rechazo: se muestra en el diálogo.
const failureMessage = ref<string | null>(null);

interface InvitationForm {
  inviterId: number | null;
  branchId: number | null;
  phone: string;
  dni: string;
}

// Solo sedes físicas: el servidor rechaza las virtuales (el plan Invitación es presencial).
const physicalBranches = computed(() => props.branches.filter((b) => b.isVirtual !== true));
const branchOptions = computed(() =>
  physicalBranches.value.map((b) => ({ label: b.name, value: b.id }))
);

function defaultBranchId(): number | null {
  const own = physicalBranches.value.find((b) => b.id === props.memberBranchId);
  if (own) return own.id;
  return physicalBranches.value.length === 1 ? physicalBranches.value[0].id : null;
}

function emptyForm(): InvitationForm {
  return {
    inviterId: null,
    branchId: defaultBranchId(),
    phone: props.memberPhone ?? '',
    dni: '',
  };
}

const form = ref<InvitationForm>(emptyForm());

// El servidor acepta 6 a 30 caracteres; validar acá evita el 400 genérico.
function phoneRule(val: string): true | string {
  const len = val.trim().length;
  if (len === 0) return 'Teléfono es requerido';
  return (len >= 6 && len <= 30) || 'El teléfono debe tener entre 6 y 30 caracteres';
}

// Cada apertura arranca limpia: un intento abandonado no puede filtrarse a otro alumno.
watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      form.value = emptyForm();
      failureMessage.value = null;
      submitting.value = false;
      inviterSelect.value?.reset();
    }
  }
);

async function onSubmit(): Promise<void> {
  if (!formRef.value || form.value.inviterId === null || form.value.branchId === null) return;
  const valid = await formRef.value.validate();
  if (!valid) return;

  submitting.value = true;
  failureMessage.value = null;
  try {
    const dni = form.value.dni.trim();
    const activation = await membersApi.createAssistedInvitation(props.userId, {
      inviterId: form.value.inviterId,
      branchId: form.value.branchId,
      phone: form.value.phone.trim(),
      ...(dni ? { dni } : {}),
    });
    $q.notify({
      type: 'positive',
      message: `Invitación activada: ${accessesCountLabel(activation.classesBudget)} hasta ${formatDate(activation.accessExpiresOn)}`,
    });
    emit('created', activation);
    emit('update:modelValue', false);
  } catch (err: unknown) {
    // Reglas de invitación (cupo, elegibilidad, teléfono): el servidor manda el motivo.
    const failure = parseInvitationFailure(err);
    const message = failure?.message ?? extractError(err, 'Error creando la invitación');
    failureMessage.value = message;
    if (isExpectedClientError(err)) {
      log.warn('Invitation rejected by server', { reason: failure?.reason, message });
    } else {
      log.error('Error creating assisted invitation', { message });
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
  failureMessage.value = null;
  inviterSelect.value?.reset();
}
</script>
