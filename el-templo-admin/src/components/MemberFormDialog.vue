<template>
  <q-dialog :model-value="modelValue" @update:model-value="$emit('update:modelValue', $event)">
    <q-card style="width: 650px; max-width: 95vw">
      <q-card-section>
        <div class="text-h6">{{ isEditMode ? 'Editar Alumno' : 'Crear Alumno' }}</div>
      </q-card-section>

      <q-separator />

      <!-- ============================================================ -->
      <!-- CREATE MODE: Plan-first QStepper -->
      <!-- ============================================================ -->
      <template v-if="!isEditMode">
        <q-stepper v-model="step" animated flat>
          <!-- Step 1: Select Branch (must come first so plan list is country-scoped) -->
          <q-step :name="1" title="Seleccionar Sede" icon="location_on" :done="step > 1">
            <q-select
              v-model="form.branchId"
              :options="branchOptions"
              label="Sede *"
              dense
              outlined
              emit-value
              map-options
              :rules="[(v: number | null) => v !== null || 'Sede es requerida']"
            />
          </q-step>

          <!-- Step 2: Personal Data -->
          <q-step :name="2" title="Datos Personales" icon="person" :done="step > 2">
            <q-form id="member-create-form" ref="formRef" @submit.prevent="onSubmit">
              <div class="q-gutter-sm">
                <div class="row q-col-gutter-sm">
                  <div class="col-12 col-sm-6">
                    <q-input
                      v-model="form.firstName"
                      label="Nombre *"
                      dense
                      outlined
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

                <div class="row q-col-gutter-sm">
                  <div class="col-12 col-sm-6">
                    <q-input
                      v-model="form.email"
                      label="Email *"
                      type="email"
                      dense
                      outlined
                      :rules="[requiredRule('Email'), emailRule]"
                    />
                  </div>
                  <div class="col-12 col-sm-6">
                    <q-input
                      v-model="form.phone"
                      label="Telefono *"
                      dense
                      outlined
                      :rules="[requiredRule('Telefono')]"
                    />
                  </div>
                </div>

                <div class="row q-col-gutter-sm">
                  <div class="col-12 col-sm-6">
                    <q-select
                      v-model="form.documentType"
                      :options="documentTypeOptions"
                      label="Tipo de documento *"
                      dense
                      outlined
                      emit-value
                      map-options
                      clearable
                      :rules="[
                        (v: string | null) =>
                          (v !== null && v.length > 0) || 'Tipo de documento es requerido',
                      ]"
                    />
                  </div>
                  <div class="col-12 col-sm-6">
                    <q-input
                      v-model="form.dni"
                      label="DNI *"
                      dense
                      outlined
                      :rules="[requiredRule('DNI')]"
                      :error="dniStatus === 'taken'"
                      :error-message="`DNI ya registrado para ${dniExistingName}`"
                      debounce="500"
                      @update:model-value="onDniChange"
                    >
                      <template #append>
                        <q-spinner v-if="dniStatus === 'checking'" size="xs" color="grey" />
                        <q-icon
                          v-else-if="dniStatus === 'available'"
                          name="check_circle"
                          color="positive"
                          size="xs"
                        >
                          <q-tooltip>DNI disponible</q-tooltip>
                        </q-icon>
                      </template>
                    </q-input>
                  </div>
                </div>

                <div class="row q-col-gutter-sm">
                  <div class="col-12 col-sm-6">
                    <q-select
                      v-model="form.level"
                      :options="levelOptions"
                      label="Nivel"
                      dense
                      outlined
                      emit-value
                      map-options
                    />
                  </div>
                  <div class="col-12 col-sm-6">
                    <q-input
                      v-model="form.address"
                      label="Domicilio"
                      dense
                      outlined
                      clearable
                      maxlength="500"
                    />
                  </div>
                </div>

                <div class="row q-col-gutter-sm q-mt-sm">
                  <div class="col-12 col-sm-6">
                    <q-input
                      v-model="form.dateOfBirth"
                      label="Fecha de Nacimiento *"
                      type="date"
                      dense
                      outlined
                      :rules="[requiredRule('Fecha de Nacimiento')]"
                    />
                  </div>
                  <div class="col-12 col-sm-6">
                    <q-select
                      v-model="form.gender"
                      :options="genderOptions"
                      label="Genero *"
                      dense
                      outlined
                      emit-value
                      map-options
                      clearable
                      :rules="[
                        (v: string | null) => (v !== null && v.length > 0) || 'Genero es requerido',
                      ]"
                    />
                  </div>
                </div>

                <!-- Contacto de Emergencia -->
                <div class="text-subtitle2 text-weight-bold q-mt-md">Contacto de Emergencia</div>
                <div class="row q-col-gutter-sm">
                  <div class="col-12 col-sm-6">
                    <q-input
                      v-model="form.emergencyContactName"
                      label="Nombre del Contacto"
                      dense
                      outlined
                    />
                  </div>
                  <div class="col-12 col-sm-6">
                    <q-input
                      v-model="form.emergencyContactPhone"
                      label="Telefono del Contacto"
                      dense
                      outlined
                    />
                  </div>
                  <div class="col-12">
                    <q-input
                      v-model="form.emergencyContactRelationship"
                      label="Relacion (ej: madre, padre, pareja)"
                      dense
                      outlined
                    />
                  </div>
                </div>
              </div>
            </q-form>
          </q-step>
        </q-stepper>

        <q-separator />

        <q-card-actions class="row q-pa-md">
          <q-btn flat label="Cancelar" color="grey" @click="$emit('update:modelValue', false)" />
          <q-space />
          <template v-if="step === 1">
            <q-btn
              color="primary"
              label="Continuar"
              :disable="form.branchId === null"
              @click="step = 2"
            />
          </template>
          <template v-else-if="step === 2">
            <q-btn flat label="Volver" class="q-mr-sm" @click="step = 1" />
            <q-btn
              type="submit"
              form="member-create-form"
              label="Crear"
              color="primary"
              :loading="submitting"
              :disable="submitting || dniStatus === 'taken'"
            />
          </template>
        </q-card-actions>
      </template>

      <!-- ============================================================ -->
      <!-- EDIT MODE: Flat form (no stepper) -->
      <!-- ============================================================ -->
      <template v-else>
        <q-form ref="formRef" @submit.prevent="onSubmit">
          <q-card-section class="q-gutter-sm">
            <!-- Datos Personales -->
            <div class="text-subtitle2 text-weight-bold q-mt-sm">Datos Personales</div>

            <div class="row q-col-gutter-sm">
              <div class="col-12 col-sm-6">
                <q-input
                  v-model="form.firstName"
                  label="Nombre *"
                  dense
                  outlined
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

            <div class="row q-col-gutter-sm">
              <div class="col-12 col-sm-6">
                <q-input
                  v-model="form.email"
                  label="Email *"
                  type="email"
                  dense
                  outlined
                  :disable="true"
                  :rules="[requiredRule('Email'), emailRule]"
                />
              </div>
              <div class="col-12 col-sm-6">
                <q-input
                  v-model="form.phone"
                  label="Telefono *"
                  dense
                  outlined
                  :rules="[requiredRule('Telefono')]"
                />
              </div>
            </div>

            <div class="row q-col-gutter-sm">
              <div class="col-12 col-sm-6">
                <q-select
                  v-model="form.documentType"
                  :options="documentTypeOptions"
                  label="Tipo de documento"
                  dense
                  outlined
                  emit-value
                  map-options
                  clearable
                />
              </div>
              <div class="col-12 col-sm-6">
                <q-input
                  v-model="form.dni"
                  label="DNI *"
                  dense
                  outlined
                  :rules="[requiredRule('DNI')]"
                  :error="dniStatus === 'taken'"
                  :error-message="`DNI ya registrado para ${dniExistingName}`"
                  debounce="500"
                  @update:model-value="onDniChange"
                >
                  <template #append>
                    <q-spinner v-if="dniStatus === 'checking'" size="xs" color="grey" />
                    <q-icon
                      v-else-if="dniStatus === 'available'"
                      name="check_circle"
                      color="positive"
                      size="xs"
                    >
                      <q-tooltip>DNI disponible</q-tooltip>
                    </q-icon>
                  </template>
                </q-input>
              </div>
            </div>

            <q-input
              v-model="form.address"
              label="Domicilio"
              dense
              outlined
              clearable
              maxlength="500"
            />

            <!-- Sede y Nivel -->
            <div class="text-subtitle2 text-weight-bold q-mt-md">Sede y Nivel</div>

            <div class="row q-col-gutter-sm">
              <div class="col-12 col-sm-6">
                <q-select
                  v-model="form.branchId"
                  :options="branchOptions"
                  label="Sucursal *"
                  dense
                  outlined
                  emit-value
                  map-options
                  :rules="[(v: number | null) => v !== null || 'Sucursal es requerida']"
                />
              </div>
              <div class="col-12 col-sm-6">
                <q-select
                  v-model="form.level"
                  :options="levelOptions"
                  label="Nivel"
                  dense
                  outlined
                  emit-value
                  map-options
                />
              </div>
            </div>

            <div class="row q-col-gutter-sm q-mt-sm">
              <div class="col-12 col-sm-6">
                <q-input
                  v-model="form.dateOfBirth"
                  label="Fecha de Nacimiento *"
                  type="date"
                  dense
                  outlined
                  :rules="[requiredRule('Fecha de Nacimiento')]"
                />
              </div>
              <div class="col-12 col-sm-6">
                <q-select
                  v-model="form.gender"
                  :options="genderOptions"
                  label="Genero *"
                  dense
                  outlined
                  emit-value
                  map-options
                  clearable
                  :rules="[
                    (v: string | null) => (v !== null && v.length > 0) || 'Genero es requerido',
                  ]"
                />
              </div>
            </div>

            <!-- Contacto de Emergencia -->
            <div class="text-subtitle2 text-weight-bold q-mt-md">Contacto de Emergencia</div>
            <div class="row q-col-gutter-sm">
              <div class="col-12 col-sm-6">
                <q-input
                  v-model="form.emergencyContactName"
                  label="Nombre del Contacto"
                  dense
                  outlined
                />
              </div>
              <div class="col-12 col-sm-6">
                <q-input
                  v-model="form.emergencyContactPhone"
                  label="Telefono del Contacto"
                  dense
                  outlined
                />
              </div>
              <div class="col-12">
                <q-input
                  v-model="form.emergencyContactRelationship"
                  label="Relacion (ej: madre, padre, pareja)"
                  dense
                  outlined
                />
              </div>
            </div>
          </q-card-section>

          <q-separator />

          <q-card-actions align="right" class="q-pa-md">
            <q-btn flat label="Cancelar" color="grey" @click="$emit('update:modelValue', false)" />
            <q-btn
              type="submit"
              label="Guardar"
              color="primary"
              :loading="submitting"
              :disable="submitting || dniStatus === 'taken'"
            />
          </q-card-actions>
        </q-form>
      </template>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useQuasar, type QForm } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { useMembersApi } from 'src/composables/useMembersApi';
import { extractError, isExpectedClientError } from 'src/utils/extract-error';
import type { MemberProfile, BranchOption, UpdateMemberInput } from 'src/types/member';

const log = createLogger('MemberFormDialog');

// =========================================================================
// Props & Emits
// =========================================================================

const props = defineProps<{
  modelValue: boolean;
  member?: MemberProfile | null;
  branches: BranchOption[];
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  // saved fires with the newly created member on creation, or null on edit.
  // Parents use the create payload to chain into the assign-plan flow.
  saved: [created: MemberProfile | null];
}>();

// =========================================================================
// State
// =========================================================================

const membersApi = useMembersApi();
const $q = useQuasar();
const formRef = ref<InstanceType<typeof QForm> | null>(null);
const submitting = ref(false);
const step = ref(1);

const isEditMode = computed(() => !!props.member);

// DNI uniqueness state
const dniStatus = ref<'idle' | 'checking' | 'available' | 'taken'>('idle');
const dniExistingName = ref('');

// Form data
const form = ref({
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  dni: '',
  branchId: null as number | null,
  level: 'alfa',
  documentType: null as string | null,
  address: '',
  dateOfBirth: '',
  gender: null as string | null,
  emergencyContactName: '',
  emergencyContactPhone: '',
  emergencyContactRelationship: '',
});

// =========================================================================
// Options
// =========================================================================

const branchOptions = computed(() => props.branches.map((b) => ({ label: b.name, value: b.id })));

const levelOptions = [
  { label: 'Alfa', value: 'alfa' },
  { label: 'Delta', value: 'delta' },
  { label: 'Sigma', value: 'sigma' },
  { label: 'Omega', value: 'omega' },
  { label: 'Spartan', value: 'spartan' },
];

const genderOptions = [
  { label: 'Masculino', value: 'male' },
  { label: 'Femenino', value: 'female' },
  { label: 'Otro', value: 'other' },
  { label: 'No especificar', value: 'unspecified' },
];

const documentTypeOptions = [
  { label: 'DNI', value: 'DNI' },
  { label: 'Pasaporte', value: 'Pasaporte' },
  { label: 'NIE', value: 'NIE' },
  { label: 'NIF', value: 'NIF' },
  { label: 'Otro', value: 'Otro' },
];

// =========================================================================
// Validation rules
// =========================================================================

function requiredRule(fieldName: string) {
  return (val: string | null | undefined) => (val && val.length > 0) || `${fieldName} es requerido`;
}

function emailRule(val: string) {
  if (!val) return true;
  const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return pattern.test(val) || 'Email invalido';
}

// =========================================================================
// DNI Check
// =========================================================================

async function onDniChange(val: string | number | null) {
  const dni = typeof val === 'string' ? val.trim() : '';
  if (!dni || dni.length < 3) {
    dniStatus.value = 'idle';
    return;
  }

  dniStatus.value = 'checking';
  try {
    const excludeUserId = props.member?.id;
    const result = await membersApi.checkDni(dni, excludeUserId);
    if (result.available) {
      dniStatus.value = 'available';
    } else {
      dniStatus.value = 'taken';
      dniExistingName.value = result.existingMemberName ?? 'Desconocido';
    }
  } catch {
    dniStatus.value = 'idle';
  }
}

// =========================================================================
// Form Lifecycle
// =========================================================================

// Populate form when editing, reset for create
watch(
  () => props.modelValue,
  (open) => {
    if (!open) return;
    dniStatus.value = 'idle';
    dniExistingName.value = '';

    if (props.member) {
      form.value = {
        firstName: props.member.firstName ?? '',
        lastName: props.member.lastName ?? '',
        email: props.member.email,
        phone: props.member.phone ?? '',
        dni: props.member.dni ?? '',
        branchId: props.member.branchId,
        level: props.member.level,
        documentType: props.member.documentType,
        address: props.member.address ?? '',
        dateOfBirth: props.member.dateOfBirth ?? '',
        gender: props.member.gender,
        emergencyContactName: props.member.emergencyContactName ?? '',
        emergencyContactPhone: props.member.emergencyContactPhone ?? '',
        emergencyContactRelationship: props.member.emergencyContactRelationship ?? '',
      };
    } else {
      // Create mode: reset everything
      step.value = 1;
      form.value = {
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        dni: '',
        branchId: null,
        level: 'alfa',
        documentType: null,
        address: '',
        dateOfBirth: '',
        gender: null,
        emergencyContactName: '',
        emergencyContactPhone: '',
        emergencyContactRelationship: '',
      };
    }
  }
);

// =========================================================================
// Submit
// =========================================================================

async function onSubmit() {
  const valid = await formRef.value?.validate();
  if (!valid) return;

  submitting.value = true;
  try {
    if (isEditMode.value && props.member) {
      const updatePayload: UpdateMemberInput = {
        firstName: form.value.firstName,
        lastName: form.value.lastName,
        phone: form.value.phone || null,
        dni: form.value.dni || null,
        branchId: form.value.branchId ?? undefined,
        level: form.value.level,
        documentType: form.value.documentType || null,
        address: form.value.address || null,
        dateOfBirth: form.value.dateOfBirth || null,
        gender: form.value.gender,
        emergencyContactName: form.value.emergencyContactName || null,
        emergencyContactPhone: form.value.emergencyContactPhone || null,
        emergencyContactRelationship: form.value.emergencyContactRelationship || null,
      };
      await membersApi.updateMember(props.member.id, updatePayload);
      emit('saved', null);
    } else {
      const created = await membersApi.createMember({
        email: form.value.email,
        firstName: form.value.firstName,
        lastName: form.value.lastName,
        phone: form.value.phone,
        dni: form.value.dni,
        branchId: form.value.branchId!,
        level: form.value.level,
        documentType: form.value.documentType,
        address: form.value.address || null,
        dateOfBirth: form.value.dateOfBirth || null,
        gender: form.value.gender,
        emergencyContactName: form.value.emergencyContactName || null,
        emergencyContactPhone: form.value.emergencyContactPhone || null,
        emergencyContactRelationship: form.value.emergencyContactRelationship || null,
      });
      // Pass the new member up so the parent can offer to load a membership
      // right after creation (skipping the "go find user → edit → subs"
      // navigation). Edits emit null because the parent already has the row.
      emit('saved', created);
    }

    emit('update:modelValue', false);
  } catch (err: unknown) {
    const message = extractError(err, 'Error guardando miembro');
    if (isExpectedClientError(err)) {
      log.warn('Member save rejected by server', { error: message });
    } else {
      log.error('Error saving member', { error: message });
    }
    $q.notify({ type: 'negative', message, timeout: 5000 });
  } finally {
    submitting.value = false;
  }
}
</script>
