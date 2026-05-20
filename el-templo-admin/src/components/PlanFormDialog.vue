<template>
  <q-dialog :model-value="modelValue" @update:model-value="$emit('update:modelValue', $event)">
    <q-card style="width: 600px; max-width: 95vw">
      <q-card-section>
        <div class="text-h6">{{ isEditMode ? 'Editar Plan' : 'Nuevo Plan' }}</div>
      </q-card-section>

      <q-separator />

      <q-form ref="formRef" @submit.prevent="onSubmit">
        <q-card-section style="max-height: 70vh; overflow-y: auto">
          <!-- General -->
          <div class="text-subtitle2 text-weight-bold q-mb-sm">General</div>

          <div class="q-gutter-sm">
            <q-input
              v-model="form.name"
              label="Nombre *"
              dense
              outlined
              :rules="[requiredRule('Nombre')]"
            />

            <q-input
              v-model="form.description"
              label="Descripcion"
              type="textarea"
              :rows="2"
              dense
              outlined
            />

            <q-select
              v-model="form.planCategory"
              :options="PLAN_CATEGORY_OPTIONS"
              label="Categoria *"
              dense
              outlined
              emit-value
              map-options
              :rules="[(val) => !!val || 'Categoria es requerida']"
            />

            <!-- Country selector (editable on create, readonly on edit per D-16/T-98-14) -->
            <div class="row q-col-gutter-sm">
              <div class="col-12 col-sm-6">
                <q-select
                  v-model="form.country"
                  :options="COUNTRY_OPTIONS"
                  label="Pais *"
                  dense
                  outlined
                  emit-value
                  map-options
                  :readonly="isEditMode"
                  :rules="[(val) => !!val || 'Pais es requerido']"
                />
              </div>
              <div class="col-12 col-sm-6">
                <q-input
                  :model-value="form.country === 'ES' ? 'EUR' : 'ARS'"
                  label="Moneda"
                  dense
                  outlined
                  readonly
                  hint="Derivada del pais"
                />
              </div>
            </div>
          </div>

          <!-- Precios -->
          <div class="text-subtitle2 text-weight-bold q-mt-lg q-mb-sm">Precios</div>

          <div class="row q-col-gutter-sm">
            <div class="col-12 col-sm-4">
              <q-input
                v-model.number="form.priceRegular"
                label="Regular *"
                type="number"
                dense
                outlined
                prefix="$"
                :rules="[requiredNumberRule('Precio regular')]"
              />
            </div>
            <div class="col-12 col-sm-4">
              <q-input
                v-model.number="form.priceZero"
                label="Zero *"
                type="number"
                dense
                outlined
                prefix="$"
                :rules="[requiredNumberRule('Precio zero')]"
              />
            </div>
            <div class="col-12 col-sm-4">
              <q-input
                v-model.number="form.priceCreditCard"
                label="Tarjeta"
                type="number"
                dense
                outlined
                prefix="$"
              />
            </div>
          </div>

          <!-- Weekly price display for online plans -->
          <div
            v-if="form.planCategory !== 'presencial' && weeklyPrice"
            class="text-caption text-grey-7 q-mt-xs"
          >
            Precio semanal: {{ formatPrice(weeklyPrice, derivedCurrency) }}/sem
          </div>

          <!-- Duracion y Clases -->
          <div class="text-subtitle2 text-weight-bold q-mt-lg q-mb-sm">Duracion y Clases</div>

          <div class="row q-col-gutter-sm">
            <div class="col-12 col-sm-6">
              <q-input
                v-model.number="form.durationDays"
                label="Duracion *"
                type="number"
                dense
                outlined
                suffix="dias"
                :rules="[requiredNumberRule('Duracion')]"
              />
            </div>
            <div v-if="form.planCategory === 'presencial'" class="col-12 col-sm-6">
              <q-input
                v-model.number="form.classesPerWeek"
                label="Clases por semana"
                type="number"
                dense
                outlined
                hint="Dejar vacio = ilimitado"
              />
            </div>
          </div>

          <!-- Tier and Booking Mode (presencial only) -->
          <div v-if="form.planCategory === 'presencial'" class="row q-col-gutter-sm q-mt-sm">
            <div class="col-12 col-sm-6">
              <q-select
                v-model="form.planTier"
                :options="tierOptions"
                label="Tier *"
                dense
                outlined
                emit-value
                map-options
                :rules="[requiredRule('Tier')]"
              />
            </div>
            <div class="col-12 col-sm-6">
              <q-select
                v-model="form.bookingMode"
                :options="bookingModeOptions"
                label="Modo de Reserva *"
                dense
                outlined
                emit-value
                map-options
                :rules="[requiredRule('Modo de reserva')]"
              />
            </div>
          </div>

          <!-- Programa Vinculado -->
          <!-- Para presencial es opcional (default Foundation — Cuerpo Completo, -->
          <!-- editable). Para planes online es obligatorio (o usar el bundle). -->
          <div class="q-mt-lg">
            <div class="text-subtitle2 text-weight-bold q-mb-sm">Programa Vinculado</div>
            <q-select
              v-model="form.linkedProgramId"
              :options="programOptions"
              label="Programa Vinculado"
              dense
              outlined
              emit-value
              map-options
              clearable
              :rules="[
                (val) =>
                  form.planCategory === 'presencial' ||
                  form.grantsAllPrograms ||
                  !!val ||
                  'Programa es requerido para planes online',
              ]"
              :loading="loadingPrograms"
              :disable="form.grantsAllPrograms"
            />
            <div
              v-if="programOptions.length === 0 && !loadingPrograms"
              class="text-caption text-grey-7 q-mt-xs"
            >
              No hay programas. Crea uno en la pagina de Programas.
            </div>

            <div class="q-mt-md">
              <q-toggle v-model="form.grantsAllPrograms" label="Da acceso a TODOS los programas" />
              <div class="text-caption text-grey-7 q-ml-md" style="margin-top: -4px">
                Inscribe automaticamente al miembro en todos los programas activos durante la
                vigencia del plan
              </div>
            </div>
          </div>

          <!-- Opciones -->
          <div class="text-subtitle2 text-weight-bold q-mt-lg q-mb-xs">Opciones</div>

          <div>
            <q-toggle v-model="form.multiBranch" label="Multi-sucursal" />
            <q-toggle v-model="form.isTrial" label="Plan de prueba" />
            <q-toggle v-model="form.isGroup" label="Plan grupal" />
          </div>

          <q-input
            v-if="form.isGroup"
            v-model.number="form.groupMaxMembers"
            label="Maximo miembros del grupo"
            type="number"
            dense
            outlined
            class="q-mt-sm"
          />
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
import { useSubscriptionsApi } from 'src/composables/useSubscriptionsApi';
import { useProgramsApi } from 'src/composables/useProgramsApi';
import { formatPrice, type Currency } from 'src/utils/format-price';
import {
  PLAN_TIER_LABELS,
  BOOKING_MODE_LABELS,
  PLAN_CATEGORY_OPTIONS,
  type PlanListItem,
  type PlanTier,
  type BookingMode,
  type PlanCategory,
} from 'src/types/subscription';
import type { Program } from 'src/types/program';

const log = createLogger('PlanFormDialog');

// =========================================================================
// Country / Currency options (D-06, D-08)
// =========================================================================

const COUNTRY_OPTIONS = [
  { label: 'Argentina', value: 'AR' as const },
  { label: 'España', value: 'ES' as const },
];

// =========================================================================
// Props & Emits
// =========================================================================

const props = defineProps<{
  modelValue: boolean;
  plan?: PlanListItem | null;
  presetCategory?: PlanCategory;
  presetCountry?: 'AR' | 'ES';
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  saved: [];
}>();

// =========================================================================
// State
// =========================================================================

const subscriptionsApi = useSubscriptionsApi();
const programsApi = useProgramsApi();
const formRef = ref<InstanceType<typeof QForm> | null>(null);
const submitting = ref(false);
const programs = ref<Program[]>([]);
const loadingPrograms = ref(false);

const isEditMode = computed(() => !!props.plan);

// Form data
const form = ref({
  name: '',
  description: '',
  planCategory: 'presencial' as PlanCategory,
  planTier: 'flex' as PlanTier,
  bookingMode: 'flexible' as BookingMode,
  priceRegular: null as number | null,
  priceZero: null as number | null,
  priceCreditCard: null as number | null,
  durationDays: null as number | null,
  classesPerWeek: null as number | null,
  linkedProgramId: null as number | null,
  grantsAllPrograms: false,
  multiBranch: false,
  isTrial: false,
  isGroup: false,
  groupMaxMembers: null as number | null,
  country: 'AR' as 'AR' | 'ES',
});

// Currency is derived from country (ARS for AR, EUR for ES) — D-08
const derivedCurrency = computed<Currency>(() => (form.value.country === 'ES' ? 'EUR' : 'ARS'));

// =========================================================================
// Computed
// =========================================================================

const weeklyPrice = computed(() =>
  form.value.priceRegular ? Math.round(form.value.priceRegular / 4.33) : null
);

const programOptions = computed(() =>
  programs.value
    .filter((p) => p.isActive)
    .map((p) => ({
      label: `${p.name} (${p.durationWeeks} sem)`,
      value: p.id,
    }))
);

// =========================================================================
// Options
// =========================================================================

const tierOptions = (Object.keys(PLAN_TIER_LABELS) as PlanTier[]).map((key) => ({
  label: PLAN_TIER_LABELS[key],
  value: key,
}));

const bookingModeOptions = (Object.keys(BOOKING_MODE_LABELS) as BookingMode[]).map((key) => ({
  label: BOOKING_MODE_LABELS[key],
  value: key,
}));

// =========================================================================
// Validation rules
// =========================================================================

function requiredRule(fieldName: string) {
  return (val: string | null | undefined) => (val && val.length > 0) || `${fieldName} es requerido`;
}

function requiredNumberRule(fieldName: string) {
  return (val: number | null | undefined) =>
    (val !== null && val !== undefined && val >= 0) || `${fieldName} es requerido`;
}

// =========================================================================
// Programs loading
// =========================================================================

async function loadPrograms() {
  loadingPrograms.value = true;
  try {
    programs.value = await programsApi.getPrograms();
    // Programs cargados — aplicar default Foundation si corresponde
    // (create-mode presencial sin selección previa, o edit-mode de un plan
    // presencial legacy con linked_program_id NULL).
    prefillFoundationProgram();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error loading programs', { error: message });
  } finally {
    loadingPrograms.value = false;
  }
}

// =========================================================================
// Category change watcher
// =========================================================================

watch(
  () => form.value.planCategory,
  (newCategory) => {
    if (newCategory === 'presencial') {
      // Switching to presencial: por convención todos los planes presenciales
      // dan acceso a Foundation — Cuerpo Completo (migración 0072). Si el
      // admin no eligió otro programa, prefijar ese default. No tocamos
      // grantsAllPrograms ni un linkedProgramId que el admin ya haya elegido.
      prefillFoundationProgram();
    } else {
      // Switching to online: set defaults, clear presencial-specific fields
      form.value.planTier = 'other';
      form.value.bookingMode = 'flexible';
      form.value.classesPerWeek = null;
    }
  }
);

const FOUNDATION_PROGRAM_NAME = 'Foundation — Cuerpo Completo';

function prefillFoundationProgram() {
  if (
    form.value.planCategory !== 'presencial' ||
    form.value.grantsAllPrograms ||
    form.value.linkedProgramId !== null ||
    programs.value.length === 0
  ) {
    return;
  }
  const foundation = programs.value.find((p) => p.isActive && p.name === FOUNDATION_PROGRAM_NAME);
  if (foundation) {
    form.value.linkedProgramId = foundation.id;
  }
}

// Bundle plans don't bind to a single program — clear the linked id when
// the toggle flips ON so we never POST both fields populated.
watch(
  () => form.value.grantsAllPrograms,
  (next) => {
    if (next) {
      form.value.linkedProgramId = null;
    }
  }
);

// =========================================================================
// Form Lifecycle
// =========================================================================

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return;

    // Load programs for the linked program dropdown
    loadPrograms();

    if (props.plan) {
      form.value = {
        name: props.plan.name,
        description: props.plan.description ?? '',
        planCategory: props.plan.planCategory,
        planTier: props.plan.planTier,
        bookingMode: props.plan.bookingMode,
        priceRegular: props.plan.priceRegular,
        priceZero: props.plan.priceZero,
        priceCreditCard: props.plan.priceCreditCard,
        durationDays: props.plan.durationDays,
        classesPerWeek: props.plan.classesPerWeek,
        linkedProgramId: props.plan.linkedProgramId,
        grantsAllPrograms: props.plan.grantsAllPrograms ?? false,
        multiBranch: props.plan.multiBranch,
        isTrial: props.plan.isTrial,
        isGroup: props.plan.isGroup,
        groupMaxMembers: props.plan.groupMaxMembers,
        // Fall back to AR if the plan pre-dates the country column (legacy row).
        country: props.plan.country ?? 'AR',
      };
    } else {
      form.value = {
        name: '',
        description: '',
        planCategory: props.presetCategory ?? 'presencial',
        planTier: 'flex',
        bookingMode: 'flexible',
        priceRegular: null,
        priceZero: null,
        priceCreditCard: null,
        durationDays: null,
        classesPerWeek: null,
        linkedProgramId: null,
        grantsAllPrograms: false,
        multiBranch: false,
        isTrial: false,
        isGroup: false,
        groupMaxMembers: null,
        // Inherit owner's currently-selected country from PlanesPage; else AR.
        country: props.presetCountry ?? 'AR',
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
    const payload = {
      name: form.value.name,
      description: form.value.description || undefined,
      planCategory: form.value.planCategory,
      planTier:
        form.value.planCategory === 'presencial' ? form.value.planTier : ('other' as PlanTier),
      bookingMode:
        form.value.planCategory === 'presencial'
          ? form.value.bookingMode
          : ('flexible' as BookingMode),
      priceRegular: form.value.priceRegular!,
      priceZero: form.value.priceZero!,
      priceCreditCard: form.value.priceCreditCard ?? undefined,
      durationDays: form.value.durationDays!,
      classesPerWeek:
        form.value.planCategory === 'presencial'
          ? (form.value.classesPerWeek ?? undefined)
          : undefined,
      linkedProgramId: form.value.grantsAllPrograms
        ? undefined
        : (form.value.linkedProgramId ?? undefined),
      grantsAllPrograms:
        form.value.planCategory !== 'presencial' ? form.value.grantsAllPrograms : false,
      multiBranch: form.value.multiBranch,
      isTrial: form.value.isTrial,
      isGroup: form.value.isGroup,
      groupMaxMembers: form.value.isGroup ? (form.value.groupMaxMembers ?? undefined) : undefined,
    };

    if (isEditMode.value && props.plan) {
      // Edit: country is immutable (T-98-14) — do NOT send it.
      await subscriptionsApi.updatePlan(props.plan.id, payload);
    } else {
      // Create: attach the owner-selected country; server derives currency.
      await subscriptionsApi.createPlan({ ...payload, country: form.value.country });
    }

    emit('saved');
    emit('update:modelValue', false);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error saving plan', { error: message });
  } finally {
    submitting.value = false;
  }
}
</script>
