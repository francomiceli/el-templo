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
                      @blur="onLookupBlur"
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
                      @blur="onLookupBlur"
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

                <!-- Phase 111 REQ-4: inline duplicate-match banner. Renders below
                     the DNI/phone row when /admin/members/check-duplicates returns
                     a match. Submit is disabled while the banner is visible —
                     admin must click "Ver alumno" to navigate to the existing
                     record (the duplicate-creation path is closed). -->
                <div
                  v-if="existingMatch && !props.member"
                  class="q-pa-sm bg-amber-1 rounded-borders"
                >
                  <div class="row items-center q-gutter-sm">
                    <q-icon name="warning" color="warning" size="sm" />
                    <div class="text-body2">
                      <span class="text-weight-medium">Ya existe:</span>
                      {{ existingMatchDisplayName }}
                      ({{ existingMatch.branchName }})
                      <span class="text-caption text-grey-7">
                        — coincide por
                        {{ existingMatch.matchedField === 'dni' ? 'DNI' : 'teléfono' }}
                      </span>
                    </div>
                    <q-space />
                    <q-btn
                      flat
                      dense
                      color="primary"
                      label="Ver alumno"
                      :to="`/alumnos/${existingMatch.id}`"
                    />
                  </div>
                </div>

                <!-- Referido por (opcional) — atribución de referido, create-only (157-05) -->
                <div class="row q-col-gutter-sm">
                  <div class="col-12">
                    <q-select
                      v-model="referrer"
                      :options="referrerSearchResults"
                      option-value="id"
                      option-label="displayLabel"
                      label="Referido por (opcional)"
                      hint="Buscá por nombre o DNI al socio que lo refirió"
                      dense
                      outlined
                      clearable
                      use-input
                      input-debounce="300"
                      :loading="searchingReferrer"
                      @filter="onReferrerSearch"
                    >
                      <template #no-option>
                        <q-item>
                          <q-item-section class="text-grey">
                            No se encontró ningún socio
                          </q-item-section>
                        </q-item>
                      </template>
                    </q-select>
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
              :loading="submitting || lookupChecking"
              :disable="submitDisabled"
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
                  label="Email"
                  type="email"
                  dense
                  outlined
                  :disable="member?.status !== 'prueba' && !!member?.email"
                  :rules="[emailRule]"
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

            <div class="row q-col-gutter-sm items-start">
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
              <div v-if="canResetPassword" class="col-12 col-sm-6">
                <q-btn
                  flat
                  icon="lock_reset"
                  label="Resetear contraseña"
                  color="primary"
                  :loading="resettingPassword"
                  class="full-width"
                  style="height: 40px"
                  @click="onResetPasswordClick"
                />
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

            <!-- Domiciliación bancaria — solo sedes de España. Aparece/desaparece
                 en vivo al cambiar la sucursal del select de arriba. -->
            <template v-if="isSpainBranchSelected">
              <div class="text-subtitle2 text-weight-bold q-mt-md">
                Domiciliación bancaria (España)
              </div>
              <div class="text-caption text-grey-7">
                Datos del titular de la cuenta para el débito mensual del banco.
              </div>
              <div class="row q-col-gutter-sm">
                <div class="col-12 col-sm-6">
                  <q-input
                    v-model="form.sepaDebtorName"
                    label="Nombre del deudor"
                    dense
                    outlined
                    clearable
                    maxlength="150"
                    hint="Titular de la cuenta bancaria"
                  />
                </div>
                <div class="col-12 col-sm-6">
                  <q-input
                    v-model="form.sepaNif"
                    label="NIF / CIF"
                    dense
                    outlined
                    clearable
                    maxlength="20"
                  />
                </div>
              </div>
              <div class="row q-col-gutter-sm">
                <div class="col-12">
                  <q-input
                    v-model="form.sepaIban"
                    label="IBAN"
                    dense
                    outlined
                    clearable
                    maxlength="42"
                    :rules="[ibanRule]"
                    hint="Ej: ES91 2100 0418 4502 0005 1332"
                  />
                </div>
              </div>
              <div class="row q-col-gutter-sm">
                <div class="col-12">
                  <q-input
                    v-model="form.sepaAddress"
                    label="Dirección del deudor"
                    dense
                    outlined
                    clearable
                    maxlength="255"
                  />
                </div>
              </div>
              <div class="row q-col-gutter-sm">
                <div class="col-6 col-sm-4">
                  <q-input
                    v-model="form.sepaPostalCode"
                    label="Código postal"
                    dense
                    outlined
                    clearable
                    maxlength="10"
                  />
                </div>
                <div class="col-6 col-sm-4">
                  <q-input
                    v-model="form.sepaCity"
                    label="Población"
                    dense
                    outlined
                    clearable
                    maxlength="100"
                  />
                </div>
                <div class="col-12 col-sm-4">
                  <q-input
                    v-model="form.sepaCountry"
                    label="País"
                    dense
                    outlined
                    maxlength="2"
                    hint="Código ISO, ej: ES"
                  />
                </div>
              </div>
            </template>

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
import { useMembersApi, type DuplicateMatch } from 'src/composables/useMembersApi';
import { useAuthStore } from 'src/stores/useAuthStore';
import { extractError, isExpectedClientError } from 'src/utils/extract-error';
import { normalizePhone } from 'src/utils/phone';
import { isValidIban } from 'src/utils/iban';
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
const authStore = useAuthStore();
const formRef = ref<InstanceType<typeof QForm> | null>(null);
const submitting = ref(false);
const step = ref(1);
const resettingPassword = ref(false);

const isEditMode = computed(() => !!props.member);

// MEMBER_LIFECYCLE_ROLES (owner | admin | gestion) — mirrors the backend
// guard on PUT /admin/members/:userId/password. The button is hidden in
// create mode (no user yet) and for roles outside the allowlist.
const canResetPassword = computed(() => {
  if (!isEditMode.value) return false;
  const role = authStore.user?.role;
  return role === 'owner' || role === 'admin' || role === 'gestion';
});

async function onResetPasswordClick(): Promise<void> {
  if (!props.member) return;
  $q.dialog({
    title: 'Resetear contraseña',
    message:
      `Vas a resetear la contraseña de ${props.member.firstName ?? ''} ${
        props.member.lastName ?? ''
      }`.trim() +
      '. La nueva contraseña va a ser <b>eltemplo2026</b>. ' +
      'El alumno la tendrá que cambiar luego desde el perfil.',
    html: true,
    cancel: { label: 'Cancelar', flat: true },
    ok: { label: 'Resetear', color: 'primary' },
    persistent: true,
  }).onOk(() => {
    void resetPassword();
  });
}

async function resetPassword(): Promise<void> {
  if (!props.member) return;
  resettingPassword.value = true;
  try {
    await membersApi.resetMemberPassword(props.member.id);
    $q.notify({
      type: 'positive',
      message: 'Contraseña reseteada a eltemplo2026',
    });
  } catch (err: unknown) {
    const message = extractError(err, 'Error reseteando contraseña');
    log.error('Error resetting member password', {
      error: message,
      userId: props.member.id,
    });
    $q.notify({ type: 'negative', message });
  } finally {
    resettingPassword.value = false;
  }
}

// DNI uniqueness state
const dniStatus = ref<'idle' | 'checking' | 'available' | 'taken'>('idle');
const dniExistingName = ref('');

// Phase 111 REQ-4: duplicate-detection state. Tracks the strongest match
// returned by /admin/members/check-duplicates (DNI > phone preferred per
// backend dedup rule). Null when no match (or in edit mode — D-07 gates the
// lookup to create only). When a match is set, the inline banner renders
// below the form and `submitDisabled` blocks the create button.
const existingMatch = ref<DuplicateMatch | null>(null);
const lookupChecking = ref(false);
let lookupTimeout: ReturnType<typeof setTimeout> | null = null;

// Form data
const form = ref({
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  dni: '',
  branchId: null as number | null,
  level: 'kairos',
  documentType: null as string | null,
  address: '',
  dateOfBirth: '',
  gender: null as string | null,
  emergencyContactName: '',
  emergencyContactPhone: '',
  emergencyContactRelationship: '',
  // Domiciliación bancaria (SEPA) — solo visible/enviado con sucursal de España.
  sepaDebtorName: '',
  sepaNif: '',
  sepaIban: '',
  sepaAddress: '',
  sepaPostalCode: '',
  sepaCity: '',
  sepaCountry: 'ES',
});

// ¿Quién lo trajo? (opcional) — atribución de referido, create-only (157-05).
// El id elegido viaja como referredBy en el create; el server valida.
const referrer = ref<{ id: number; displayLabel: string } | null>(null);
const referrerSearchResults = ref<Array<{ id: number; displayLabel: string }>>([]);
const searchingReferrer = ref(false);

function onReferrerSearch(val: string, update: (fn: () => void) => void, _abort: () => void) {
  if (!val || val.length < 2) {
    update(() => {
      referrerSearchResults.value = [];
    });
    return;
  }
  searchingReferrer.value = true;
  membersApi
    .searchMembers(val, 10)
    .then((members) => {
      update(() => {
        referrerSearchResults.value = members.map((m) => ({
          id: m.id,
          displayLabel: `${m.firstName} ${m.lastName}${m.dni ? ` (${m.dni})` : ''}`,
        }));
      });
    })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      log.error('Error searching referrer', { error: message });
      update(() => {
        referrerSearchResults.value = [];
      });
    })
    .finally(() => {
      searchingReferrer.value = false;
    });
}

// Sección SEPA: gateada por el país de la sucursal seleccionada EN el form
// (no la guardada) — al mover un socio a una sede ES los campos aparecen en
// el mismo save, sin tener que guardar dos veces.
const isSpainBranchSelected = computed(() => {
  const branch = props.branches.find((b) => b.id === form.value.branchId);
  return branch?.country === 'ES';
});

// =========================================================================
// Options
// =========================================================================

const branchOptions = computed(() => props.branches.map((b) => ({ label: b.name, value: b.id })));

const levelOptions = [
  { label: 'Kairos', value: 'kairos' },
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

// IBAN opcional (carga progresiva de la ficha) — pero si hay valor tiene que
// pasar el checksum mod-97. El backend re-valida igual.
function ibanRule(val: string | null | undefined) {
  if (!val || !val.trim()) return true;
  return isValidIban(val) || 'IBAN inválido (verificá los dígitos de control)';
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
// Phase 111 REQ-4: duplicate lookup (create mode only)
// =========================================================================
//
// On blur of DNI or phone we debounce 300ms then hit
// /admin/members/check-duplicates with whichever fields are populated. The
// backend dedupes by user id and prefers the DNI match when both criteria
// hit the same row. We only consider the FIRST match (strongest signal) —
// the form already has a path to the member detail page via "Ver alumno".
//
// Edit mode is excluded entirely — admins editing an existing member will
// trivially "match themselves" so the lookup adds noise, not safety.

async function runLookup() {
  if (props.member) {
    existingMatch.value = null;
    return;
  }
  const dni = (form.value.dni ?? '').trim();
  const phoneRaw = (form.value.phone ?? '').trim();
  const phoneNormalized = phoneRaw ? normalizePhone(phoneRaw) : '';
  if (!dni && !phoneNormalized) {
    existingMatch.value = null;
    return;
  }

  lookupChecking.value = true;
  try {
    const result = await membersApi.checkDuplicates({
      dni: dni || undefined,
      // Send the raw phone — the backend re-normalizes via SQL. Keeps the
      // composable contract simple (no double-normalization).
      phone: phoneRaw || undefined,
    });
    existingMatch.value = result.matches[0] ?? null;
  } catch {
    // Network errors aren't a hard block — let the user submit and the
    // backend will catch real conflicts via the existing 409 path.
    existingMatch.value = null;
  } finally {
    lookupChecking.value = false;
  }
}

function scheduleLookup() {
  if (lookupTimeout !== null) {
    clearTimeout(lookupTimeout);
  }
  lookupTimeout = setTimeout(() => {
    void runLookup();
  }, 300);
}

function onLookupBlur() {
  scheduleLookup();
}

const submitDisabled = computed(() => {
  if (submitting.value) return true;
  if (dniStatus.value === 'taken') return true;
  // Phase 111 REQ-4 (D-07): block submit while a non-deleted match exists.
  // Edit mode skips the lookup entirely so existingMatch stays null.
  if (existingMatch.value) return true;
  return false;
});

const existingMatchDisplayName = computed(() => {
  if (!existingMatch.value) return '';
  const parts = [existingMatch.value.firstName, existingMatch.value.lastName].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : `#${existingMatch.value.id}`;
});

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
    // Phase 111 REQ-4: clear duplicate-match state on every reopen so a
    // previous create's lookup doesn't bleed into the next admin session.
    existingMatch.value = null;
    if (lookupTimeout !== null) {
      clearTimeout(lookupTimeout);
      lookupTimeout = null;
    }

    if (props.member) {
      const sepa = props.member.sepaDetails;
      form.value = {
        firstName: props.member.firstName ?? '',
        lastName: props.member.lastName ?? '',
        email: props.member.email ?? '',
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
        sepaDebtorName: sepa?.debtorName ?? '',
        sepaNif: sepa?.nif ?? '',
        sepaIban: sepa?.iban ?? '',
        sepaAddress: sepa?.address ?? '',
        sepaPostalCode: sepa?.postalCode ?? '',
        sepaCity: sepa?.city ?? '',
        sepaCountry: sepa?.country ?? 'ES',
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
        level: 'kairos',
        documentType: null,
        address: '',
        dateOfBirth: '',
        gender: null,
        emergencyContactName: '',
        emergencyContactPhone: '',
        emergencyContactRelationship: '',
        sepaDebtorName: '',
        sepaNif: '',
        sepaIban: '',
        sepaAddress: '',
        sepaPostalCode: '',
        sepaCity: '',
        sepaCountry: 'ES',
      };
      // Reset la atribución de referido en cada apertura del alta.
      referrer.value = null;
      referrerSearchResults.value = [];
    }
  }
);

// =========================================================================
// Submit
// =========================================================================

/**
 * Detect a "convert online → presencial" save: the user is moving from a
 * virtual branch (typically Templo Online) to a physical one. Returns true
 * if the caller should pause and ask for explicit confirmation; false if the
 * save can proceed silently.
 */
function isConvertingToPresencial(): boolean {
  if (!isEditMode.value || !props.member) return false;
  const newBranchId = form.value.branchId;
  if (newBranchId === null || newBranchId === props.member.branchId) {
    return false;
  }
  const oldBranch = props.branches.find((b) => b.id === props.member!.branchId);
  const newBranch = props.branches.find((b) => b.id === newBranchId);
  if (!oldBranch || !newBranch) return false;
  return oldBranch.isVirtual === true && newBranch.isVirtual !== true;
}

// Detect a sede change between two physical branches (or presencial → online).
// The online → presencial flow has its own confirmConversion above. Any other
// branch change triggers the destructive cleanup downstream — back-end cancels
// future bookings and clears fixed schedules — so the admin must opt in.
function isChangingPhysicalBranch(): boolean {
  if (!isEditMode.value || !props.member) return false;
  const newBranchId = form.value.branchId;
  if (newBranchId === null || newBranchId === props.member.branchId) {
    return false;
  }
  if (isConvertingToPresencial()) return false;
  return true;
}

function confirmBranchChange(): Promise<boolean> {
  const oldBranch = props.branches.find((b) => b.id === props.member!.branchId);
  const newBranch = props.branches.find((b) => b.id === form.value.branchId);
  const oldName = oldBranch?.name ?? 'sede actual';
  const newName = newBranch?.name ?? 'nueva sede';
  return new Promise((resolve) => {
    $q.dialog({
      title: 'Cambiar de sede',
      message:
        `Vas a mover al alumno de <b>${oldName}</b> a <b>${newName}</b>. ` +
        'Esto va a:<ul class="q-pl-md q-mt-sm">' +
        '<li>Cancelar todas sus reservas futuras.</li>' +
        '<li>Borrar sus turnos fijos.</li>' +
        '</ul><p class="q-mt-sm q-mb-none">Después vas a tener que reasignarle los turnos fijos en la nueva sede desde la suscripción del alumno.</p>' +
        '<p class="q-mt-sm q-mb-none text-caption text-grey-7"><b>Excepción:</b> si el alumno tiene plan multi-sucursal (Performance, Foundation+), sus reservas y turnos fijos se conservan — sólo se actualiza la sede principal.</p>',
      html: true,
      cancel: { label: 'Cancelar', flat: true },
      ok: { label: 'Cambiar de sede', color: 'primary' },
      persistent: true,
    })
      .onOk(() => resolve(true))
      .onCancel(() => resolve(false))
      .onDismiss(() => resolve(false));
  });
}

function confirmConversion(): Promise<boolean> {
  return new Promise((resolve) => {
    $q.dialog({
      title: 'Convertir a presencial',
      message:
        'Vas a mover al alumno desde el Templo Online a una sede presencial. ' +
        'Esto va a:<ul class="q-pl-md q-mt-sm">' +
        '<li>Cancelar la suscripción online activa, si tiene.</li>' +
        '<li>Dejar al alumno en estado <b>Inactivo</b> hasta que le crees una suscripción presencial.</li>' +
        '<li>Validar los datos obligatorios para alta presencial (DNI, tipo de documento y fecha de nacimiento).</li>' +
        '</ul><p class="q-mt-sm q-mb-none">La contraseña <b>no</b> se resetea automáticamente. Usá el botón "Resetear contraseña" si lo necesitás.</p>',
      html: true,
      cancel: { label: 'Cancelar', flat: true },
      ok: { label: 'Convertir', color: 'primary' },
      persistent: true,
    })
      .onOk(() => resolve(true))
      .onCancel(() => resolve(false))
      .onDismiss(() => resolve(false));
  });
}

async function onSubmit() {
  const valid = await formRef.value?.validate();
  if (!valid) return;

  if (isConvertingToPresencial()) {
    const confirmed = await confirmConversion();
    if (!confirmed) return;
  } else if (isChangingPhysicalBranch()) {
    const confirmed = await confirmBranchChange();
    if (!confirmed) return;
  }

  submitting.value = true;
  try {
    if (isEditMode.value && props.member) {
      const updatePayload: UpdateMemberInput = {
        // Only sent when set: the backend honors it solely for members
        // without an email yet (trial → alumno) and ignores it otherwise.
        email: form.value.email || undefined,
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
      // Domiciliación (SEPA): solo se manda con sucursal de España — para
      // sedes AR el campo va ausente y el backend no toca datos existentes.
      if (isSpainBranchSelected.value) {
        updatePayload.sepaDetails = {
          debtorName: form.value.sepaDebtorName || null,
          nif: form.value.sepaNif || null,
          iban: form.value.sepaIban || null,
          address: form.value.sepaAddress || null,
          postalCode: form.value.sepaPostalCode || null,
          city: form.value.sepaCity || null,
          country: form.value.sepaCountry || null,
        };
      }
      const wasPrueba = props.member.status === 'prueba';
      const updated = await membersApi.updateMember(props.member.id, updatePayload);
      // SP → legajo conversion: surface the updated member so the parent
      // can offer to assign a plan right away (mirrors the post-create
      // flow in AlumnosPage). Plain edits keep emitting null so the parent
      // doesn't get prompted for an unrelated change.
      emit('saved', wasPrueba ? updated : null);
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
        referredBy: referrer.value?.id ?? null,
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
