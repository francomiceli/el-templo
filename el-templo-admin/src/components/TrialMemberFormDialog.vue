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

            <!-- Fase 194 D-24: "Lo invita" crea la invitación con accesos (mismo cupo y
                 elegibilidad que la app). Si se deja vacío es un alta de prueba común.
                 Solo para los roles del canal asistido: el servidor da 403 al coach. -->
            <ReferrerSelect
              v-if="canInvite"
              ref="inviterSelect"
              v-model="form.inviterId"
              label="Lo invita (opcional)"
              hint="Si lo invita un socio, se activa la invitación con sus accesos de prueba"
              :disable="submitting"
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
import { useMembersApi, parseInvitationFailure } from 'src/composables/useMembersApi';
import { useAuthStore } from 'src/stores/useAuthStore';
import { extractError, isExpectedClientError } from 'src/utils/extract-error';
import { formatDate } from 'src/utils/format-date';
import type { BranchOption, CreateTrialMemberResponse, MemberProfile } from 'src/types/member';
import ReferrerSelect from './ReferrerSelect.vue';

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
const authStore = useAuthStore();
const $q = useQuasar();
const formRef = ref<InstanceType<typeof QForm> | null>(null);
const inviterSelect = ref<{ reset: () => void } | null>(null);
const submitting = ref(false);

// Espejo de INVITATION_ASSISTED_ROLES en la API (coach queda afuera). Solo oculta el
// campo: con `inviterId` el servidor valida el rol (T-194-78).
const canInvite = computed(() => {
  const role = authStore.user?.role;
  return (
    role === 'owner' ||
    role === 'admin' ||
    role === 'gestion' ||
    role === 'admin_sede' ||
    role === 'recepcion'
  );
});

interface TrialForm {
  firstName: string;
  lastName: string;
  phone: string;
  branchId: number | null;
  inviterId: number | null;
}

function emptyForm(): TrialForm {
  return {
    firstName: '',
    lastName: '',
    phone: '',
    branchId: props.defaultBranchId ?? null,
    inviterId: null,
  };
}

// Avisa el resultado de la invitación sin perder el lead: si la activación falla DESPUÉS de
// crearlo, el lead existe igual y el motivo se muestra como advertencia (D-24).
function notifyCreated(created: CreateTrialMemberResponse, invited: boolean): void {
  if (!invited) {
    $q.notify({ type: 'positive', message: 'Alumno en prueba creado' });
    return;
  }
  if (created.invitation) {
    $q.notify({
      type: 'positive',
      message: `Lead creado con ${created.invitation.classesBudget} accesos de invitación hasta ${formatDate(created.invitation.accessExpiresOn)}`,
    });
    return;
  }
  const reason = created.invitationError?.message ?? 'motivo desconocido';
  log.warn('Trial lead created but invitation not activated', {
    reason: created.invitationError?.reason,
  });
  $q.notify({
    type: 'warning',
    message: `Lead creado, pero la invitación no se activó: ${reason}`,
    timeout: 8000,
  });
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
      inviterSelect.value?.reset();
    }
  }
);

async function onSubmit(): Promise<void> {
  if (!formRef.value) return;
  const valid = await formRef.value.validate();
  if (!valid) return;

  submitting.value = true;
  try {
    const inviterId = canInvite.value ? form.value.inviterId : null;
    const member = await membersApi.createTrialMember({
      firstName: form.value.firstName.trim(),
      lastName: form.value.lastName.trim(),
      phone: form.value.phone.trim(),
      branchId: form.value.branchId as number,
      ...(inviterId !== null ? { inviterId } : {}),
    });
    notifyCreated(member, inviterId !== null);
    emit('created', member);
    emit('update:modelValue', false);
  } catch (err: unknown) {
    // Con "Lo invita" el servidor valida cupo y elegibilidad ANTES de crear el lead: si
    // rechaza (409/404) no queda ningún lead y el formulario sigue abierto con el motivo.
    const failure = parseInvitationFailure(err);
    const message = failure?.message ?? extractError(err, 'Error creando sesión de prueba');
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
  inviterSelect.value?.reset();
}
</script>
