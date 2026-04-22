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

            <q-stepper-navigation class="q-mt-md">
              <q-btn
                color="primary"
                label="Continuar"
                :disable="form.branchId === null"
                @click="step = 2"
              />
            </q-stepper-navigation>
          </q-step>

          <!-- Step 2: Personal Data -->
          <q-step :name="2" title="Datos Personales" icon="person" :done="step > 2">
            <q-form ref="formRef" @submit.prevent="onSubmit">
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
                      debounce="500"
                      @update:model-value="onDniChange"
                    />
                    <div v-if="dniStatus === 'checking'" class="text-caption text-grey q-mt-xs">
                      Verificando DNI...
                    </div>
                    <div v-else-if="dniStatus === 'taken'" class="text-caption text-orange q-mt-xs">
                      DNI ya registrado para {{ dniExistingName }}
                    </div>
                    <div
                      v-else-if="dniStatus === 'available'"
                      class="text-caption text-positive q-mt-xs"
                    >
                      <q-icon name="check_circle" size="xs" /> DNI disponible
                    </div>
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

                <!-- Datos Adicionales -->
                <q-expansion-item
                  label="Datos Adicionales"
                  header-class="text-subtitle2 text-weight-bold"
                  dense
                >
                  <div class="q-pa-sm q-gutter-sm">
                    <div class="row q-col-gutter-sm">
                      <div class="col-12 col-sm-6">
                        <q-input
                          v-model="form.dateOfBirth"
                          label="Fecha de Nacimiento"
                          type="date"
                          dense
                          outlined
                        />
                      </div>
                      <div class="col-12 col-sm-6">
                        <q-select
                          v-model="form.gender"
                          :options="genderOptions"
                          label="Genero"
                          dense
                          outlined
                          emit-value
                          map-options
                          clearable
                        />
                      </div>
                    </div>
                  </div>
                </q-expansion-item>

                <!-- Contacto de Emergencia -->
                <q-expansion-item
                  label="Contacto de Emergencia"
                  header-class="text-subtitle2 text-weight-bold"
                  dense
                >
                  <div class="q-pa-sm q-gutter-sm">
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
                    </div>
                    <q-input
                      v-model="form.emergencyContactRelationship"
                      label="Relacion (ej: madre, padre, pareja)"
                      dense
                      outlined
                    />
                  </div>
                </q-expansion-item>

                <q-stepper-navigation class="q-mt-md">
                  <q-btn flat label="Volver" @click="step = 1" class="q-mr-sm" />
                  <q-btn
                    type="submit"
                    label="Crear"
                    color="primary"
                    :loading="submitting"
                    :disable="submitting || dniStatus === 'taken'"
                  />
                </q-stepper-navigation>
              </div>
            </q-form>
          </q-step>
        </q-stepper>

        <q-separator />

        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat label="Cancelar" color="grey" @click="$emit('update:modelValue', false)" />
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
                  debounce="500"
                  @update:model-value="onDniChange"
                />
                <div v-if="dniStatus === 'checking'" class="text-caption text-grey q-mt-xs">
                  Verificando DNI...
                </div>
                <div v-else-if="dniStatus === 'taken'" class="text-caption text-orange q-mt-xs">
                  DNI ya registrado para {{ dniExistingName }}
                </div>
                <div
                  v-else-if="dniStatus === 'available'"
                  class="text-caption text-positive q-mt-xs"
                >
                  <q-icon name="check_circle" size="xs" /> DNI disponible
                </div>
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

            <!-- Datos Adicionales -->
            <q-expansion-item
              label="Datos Adicionales"
              header-class="text-subtitle2 text-weight-bold"
              dense
            >
              <div class="q-pa-sm q-gutter-sm">
                <div class="row q-col-gutter-sm">
                  <div class="col-12 col-sm-6">
                    <q-input
                      v-model="form.dateOfBirth"
                      label="Fecha de Nacimiento"
                      type="date"
                      dense
                      outlined
                    />
                  </div>
                  <div class="col-12 col-sm-6">
                    <q-select
                      v-model="form.gender"
                      :options="genderOptions"
                      label="Genero"
                      dense
                      outlined
                      emit-value
                      map-options
                      clearable
                    />
                  </div>
                </div>
              </div>
            </q-expansion-item>

            <!-- Contacto de Emergencia -->
            <q-expansion-item
              label="Contacto de Emergencia"
              header-class="text-subtitle2 text-weight-bold"
              dense
            >
              <div class="q-pa-sm q-gutter-sm">
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
                </div>
                <q-input
                  v-model="form.emergencyContactRelationship"
                  label="Relacion (ej: madre, padre, pareja)"
                  dense
                  outlined
                />
              </div>
            </q-expansion-item>

            <!-- ─── Deuda (Phase 101) ─────────────────────────────────────── -->
            <q-separator class="q-my-md" />
            <div class="text-subtitle2 text-weight-bold">Deuda</div>

            <q-toggle v-model="form.isDebtor" label="Deudor" color="negative" class="q-mt-sm" />

            <div v-if="form.isDebtor" class="q-gutter-sm q-mt-sm">
              <div class="row q-col-gutter-sm">
                <div class="col-12 col-sm-6">
                  <q-input
                    v-model.number="form.debtAmount"
                    label="Monto adeudado *"
                    type="number"
                    min="1"
                    dense
                    outlined
                    :rules="[
                      (val: number | null) =>
                        (val !== null && val > 0) || 'El monto debe ser mayor a 0',
                    ]"
                  />
                </div>
                <div class="col-12 col-sm-6">
                  <q-select
                    v-model="form.debtCurrency"
                    :options="debtCurrencyOptions"
                    label="Moneda"
                    dense
                    outlined
                    emit-value
                    map-options
                  />
                </div>
              </div>
              <q-input
                v-model="form.debtNote"
                label="Nota (opcional)"
                type="textarea"
                rows="2"
                dense
                outlined
                maxlength="500"
                placeholder="Aclarar de qué suscripción es la deuda (ej: debe $20000 de la mensualidad de abril)"
              />
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
import { DEBT_CURRENCY_OPTIONS } from 'src/types/member';

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
  saved: [];
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
  isDebtor: false,
  debtAmount: null as number | null,
  debtCurrency: 'ARS' as 'ARS' | 'EUR' | 'USD',
  debtNote: '',
});

// Tracks whether the loaded member already had an active debt so we know
// whether to emit `debt: null` (explicit cancel) on submit when the toggle
// is off, vs. omitting the field entirely.
const hadDebtOnLoad = ref(false);

const debtCurrencyOptions = DEBT_CURRENCY_OPTIONS;

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
        isDebtor: props.member.debt !== null,
        debtAmount: props.member.debt?.amount ?? null,
        debtCurrency: (props.member.debt?.currency as 'ARS' | 'EUR' | 'USD') ?? 'ARS',
        debtNote: props.member.debt?.note ?? '',
      };
      hadDebtOnLoad.value = props.member.debt !== null;
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
        isDebtor: false,
        debtAmount: null,
        debtCurrency: 'ARS',
        debtNote: '',
      };
      hadDebtOnLoad.value = false;
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
      // Build debt payload based on toggle state + whether the member had a
      // debt on load. Three cases (D-09):
      //   toggle on          → upsert (object)
      //   toggle off + had   → explicit cancel (null)
      //   toggle off + none  → omit key entirely (undefined)
      let debtPayload:
        | { amount: number; currency: 'ARS' | 'EUR' | 'USD'; note: string | null }
        | null
        | undefined;
      if (form.value.isDebtor) {
        if (form.value.debtAmount === null || form.value.debtAmount <= 0) {
          // Client-side guard (server also validates — D-13).
          $q.notify({
            type: 'negative',
            message: 'El monto de la deuda debe ser mayor a 0',
          });
          submitting.value = false;
          return;
        }
        debtPayload = {
          amount: form.value.debtAmount,
          currency: form.value.debtCurrency,
          note: form.value.debtNote.trim() === '' ? null : form.value.debtNote.trim(),
        };
      } else if (hadDebtOnLoad.value) {
        debtPayload = null;
      } else {
        debtPayload = undefined;
      }

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
      if (debtPayload !== undefined) {
        updatePayload.debt = debtPayload;
      }
      await membersApi.updateMember(props.member.id, updatePayload);
    } else {
      await membersApi.createMember({
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
    }

    emit('saved');
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
