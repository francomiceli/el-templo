<template>
  <q-dialog :model-value="modelValue" @update:model-value="$emit('update:modelValue', $event)">
    <q-card style="width: 600px; max-width: 95vw">
      <q-card-section>
        <div class="text-h6">{{ isEditMode ? 'Editar Alumno' : 'Crear Alumno' }}</div>
      </q-card-section>

      <q-separator />

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
                :disable="isEditMode"
                :rules="[requiredRule('Email'), emailRule]"
              />
            </div>
            <div v-if="!isEditMode" class="col-12 col-sm-6">
              <q-input
                v-model="form.password"
                label="Contrasena *"
                :type="showPassword ? 'text' : 'password'"
                dense
                outlined
                :rules="[requiredRule('Contrasena'), minLengthRule(6)]"
              >
                <template #append>
                  <q-icon
                    :name="showPassword ? 'visibility_off' : 'visibility'"
                    class="cursor-pointer"
                    @click="showPassword = !showPassword"
                  />
                </template>
              </q-input>
            </div>
          </div>

          <div class="row q-col-gutter-sm">
            <div class="col-12 col-sm-6">
              <q-input
                v-model="form.phone"
                label="Telefono *"
                dense
                outlined
                :rules="[requiredRule('Telefono')]"
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
              <div v-else-if="dniStatus === 'available'" class="text-caption text-positive q-mt-xs">
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
            :label="isEditMode ? 'Guardar' : 'Crear'"
            color="primary"
            :loading="submitting"
            :disable="submitting"
          />
        </q-card-actions>
      </q-form>
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
const showPassword = ref(false);

const isEditMode = computed(() => !!props.member);

// DNI uniqueness state
const dniStatus = ref<'idle' | 'checking' | 'available' | 'taken'>('idle');
const dniExistingName = ref('');

// Form data
const form = ref({
  firstName: '',
  lastName: '',
  email: '',
  password: '',
  phone: '',
  dni: '',
  branchId: null as number | null,
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

function minLengthRule(min: number) {
  return (val: string) => (val && val.length >= min) || `Minimo ${min} caracteres`;
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
    showPassword.value = false;

    if (props.member) {
      form.value = {
        firstName: props.member.firstName ?? '',
        lastName: props.member.lastName ?? '',
        email: props.member.email,
        password: '',
        phone: props.member.phone ?? '',
        dni: props.member.dni ?? '',
        branchId: props.member.branchId,
        level: props.member.level,
        dateOfBirth: props.member.dateOfBirth ?? '',
        gender: props.member.gender,
        emergencyContactName: props.member.emergencyContactName ?? '',
        emergencyContactPhone: props.member.emergencyContactPhone ?? '',
        emergencyContactRelationship: props.member.emergencyContactRelationship ?? '',
      };
    } else {
      form.value = {
        firstName: '',
        lastName: '',
        email: '',
        password: '',
        phone: '',
        dni: '',
        branchId: null,
        level: 'alfa',
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
        password: form.value.password,
        firstName: form.value.firstName,
        lastName: form.value.lastName,
        phone: form.value.phone,
        dni: form.value.dni,
        branchId: form.value.branchId!,
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
