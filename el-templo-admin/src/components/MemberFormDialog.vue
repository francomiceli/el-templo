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
          <!-- Step 1: Select Plan -->
          <q-step :name="1" title="Seleccionar Plan" icon="list" :done="step > 1">
            <div v-if="loadingPlans" class="flex flex-center q-pa-lg">
              <q-spinner-dots size="40px" color="primary" />
            </div>

            <template v-else>
              <q-select
                v-model="form.planId"
                :options="planOptions"
                label="Plan *"
                dense
                outlined
                emit-value
                map-options
                :rules="[(v: number | null) => v !== null || 'Plan es requerido']"
                @update:model-value="onPlanSelected"
              />
              <div
                v-if="planOptions.length === 0"
                class="text-center text-grey-5 text-italic q-pa-lg"
              >
                No hay planes activos disponibles
              </div>
            </template>
          </q-step>

          <!-- Step 2: Select Branch -->
          <q-step :name="2" title="Seleccionar Sede" icon="location_on" :done="step > 2">
            <q-select
              v-model="form.branchId"
              :options="branchOptions"
              :label="selectedPlanMultiBranch ? 'Sede principal *' : 'Sede *'"
              dense
              outlined
              emit-value
              map-options
              :rules="[(v: number | null) => v !== null || 'Sede es requerida']"
            />

            <q-stepper-navigation class="q-mt-md">
              <q-btn flat label="Volver" @click="step = 1" class="q-mr-sm" />
              <q-btn
                color="primary"
                label="Continuar"
                :disable="form.branchId === null"
                @click="step = 3"
              />
            </q-stepper-navigation>
          </q-step>

          <!-- Step 3: Personal Data -->
          <q-step :name="3" title="Datos Personales" icon="person" :done="step > 3">
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

                <q-stepper-navigation class="q-mt-md">
                  <q-btn flat label="Volver" @click="step = 2" class="q-mr-sm" />
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
          </q-card-section>

          <q-separator />

          <q-card-actions align="right" class="q-pa-md">
            <q-btn flat label="Cancelar" color="grey" @click="$emit('update:modelValue', false)" />
            <q-btn
              type="submit"
              label="Guardar"
              color="primary"
              :loading="submitting"
              :disable="submitting"
            />
          </q-card-actions>
        </q-form>
      </template>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import type { QForm } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { useMembersApi } from 'src/composables/useMembersApi';
import type { MemberProfile, BranchOption } from 'src/types/member';

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
const formRef = ref<InstanceType<typeof QForm> | null>(null);
const submitting = ref(false);
const step = ref(1);
const loadingPlans = ref(false);

const isEditMode = computed(() => !!props.member);

// DNI uniqueness state
const dniStatus = ref<'idle' | 'checking' | 'available' | 'taken'>('idle');
const dniExistingName = ref('');

// Plans for create mode
interface PlanOptionData {
  id: number;
  name: string;
  planTier: string;
  multiBranch: boolean;
  priceRegular: number;
  durationDays: number;
  classesPerWeek: number | null;
}

const activePlans = ref<PlanOptionData[]>([]);

const selectedPlanMultiBranch = computed(() => {
  const plan = activePlans.value.find((p) => p.id === form.value.planId);
  return plan?.multiBranch ?? false;
});

const planOptions = computed(() =>
  activePlans.value.map((p) => ({
    label: `${p.name} — $${p.priceRegular.toLocaleString()}`,
    value: p.id,
  }))
);

// Form data
const form = ref({
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  dni: '',
  branchId: null as number | null,
  planId: null as number | null,
  level: 'alfa',
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
// Plan selection
// =========================================================================

function onPlanSelected(planId: number | null) {
  if (planId !== null) {
    step.value = 2;
  }
}

async function loadPlans() {
  loadingPlans.value = true;
  try {
    activePlans.value = await membersApi.getPlans();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error loading plans', { error: message });
  } finally {
    loadingPlans.value = false;
  }
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
        planId: null,
        level: props.member.level,
        dateOfBirth: props.member.dateOfBirth ?? '',
        gender: props.member.gender,
        emergencyContactName: props.member.emergencyContactName ?? '',
        emergencyContactPhone: props.member.emergencyContactPhone ?? '',
        emergencyContactRelationship: props.member.emergencyContactRelationship ?? '',
      };
    } else {
      // Create mode: reset everything and load plans
      step.value = 1;
      form.value = {
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        dni: '',
        branchId: null,
        planId: null,
        level: 'alfa',
        dateOfBirth: '',
        gender: null,
        emergencyContactName: '',
        emergencyContactPhone: '',
        emergencyContactRelationship: '',
      };
      loadPlans();
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
      await membersApi.updateMember(props.member.id, {
        firstName: form.value.firstName,
        lastName: form.value.lastName,
        phone: form.value.phone || null,
        dni: form.value.dni || null,
        branchId: form.value.branchId ?? undefined,
        level: form.value.level,
        dateOfBirth: form.value.dateOfBirth || null,
        gender: form.value.gender,
        emergencyContactName: form.value.emergencyContactName || null,
        emergencyContactPhone: form.value.emergencyContactPhone || null,
        emergencyContactRelationship: form.value.emergencyContactRelationship || null,
      });
    } else {
      await membersApi.createMember({
        email: form.value.email,
        firstName: form.value.firstName,
        lastName: form.value.lastName,
        phone: form.value.phone,
        dni: form.value.dni,
        branchId: form.value.branchId!,
        planId: form.value.planId!,
        level: form.value.level,
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
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error saving member', { error: message });
  } finally {
    submitting.value = false;
  }
}
</script>
