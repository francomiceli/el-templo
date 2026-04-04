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
            Precio semanal: ${{ weeklyPrice.toLocaleString() }}/sem
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

          <!-- Programa Vinculado (online only) -->
          <div v-if="form.planCategory !== 'presencial'" class="q-mt-lg">
            <div class="text-subtitle2 text-weight-bold q-mb-sm">Programa Vinculado</div>
            <q-select
              v-model="form.linkedProgramId"
              :options="programOptions"
              label="Programa Vinculado *"
              dense
              outlined
              emit-value
              map-options
              :rules="[(val) => !!val || 'Programa es requerido para planes online']"
              :loading="loadingPrograms"
            />
            <div
              v-if="programOptions.length === 0 && !loadingPrograms"
              class="text-caption text-grey-7 q-mt-xs"
            >
              No hay programas. Crea uno en la pagina de Programas.
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
import {
  PLAN_TIER_LABELS,
  BOOKING_MODE_LABELS,
  PLAN_CATEGORY_OPTIONS,
  type PlanListItem,
  type PlanTier,
  type BookingMode,
  type PlanCategory,
} from 'src/types/subscription';
import type { MicroProgram } from 'src/types/program';

const log = createLogger('PlanFormDialog');

// =========================================================================
// Props & Emits
// =========================================================================

const props = defineProps<{
  modelValue: boolean;
  plan?: PlanListItem | null;
  presetCategory?: PlanCategory;
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
const programs = ref<MicroProgram[]>([]);
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
  multiBranch: false,
  isTrial: false,
  isGroup: false,
  groupMaxMembers: null as number | null,
});

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
      // Switching to presencial: clear online-specific fields
      form.value.linkedProgramId = null;
    } else {
      // Switching to online: set defaults, clear presencial-specific fields
      form.value.planTier = 'other';
      form.value.bookingMode = 'flexible';
      form.value.classesPerWeek = null;
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
        multiBranch: props.plan.multiBranch,
        isTrial: props.plan.isTrial,
        isGroup: props.plan.isGroup,
        groupMaxMembers: props.plan.groupMaxMembers,
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
        multiBranch: false,
        isTrial: false,
        isGroup: false,
        groupMaxMembers: null,
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
      linkedProgramId:
        form.value.planCategory !== 'presencial'
          ? (form.value.linkedProgramId ?? undefined)
          : undefined,
      multiBranch: form.value.multiBranch,
      isTrial: form.value.isTrial,
      isGroup: form.value.isGroup,
      groupMaxMembers: form.value.isGroup ? (form.value.groupMaxMembers ?? undefined) : undefined,
    };

    if (isEditMode.value && props.plan) {
      await subscriptionsApi.updatePlan(props.plan.id, payload);
    } else {
      await subscriptionsApi.createPlan(payload);
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
