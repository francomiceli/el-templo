<template>
  <q-dialog :model-value="modelValue" @update:model-value="$emit('update:modelValue', $event)">
    <q-card style="width: 600px; max-width: 95vw">
      <q-card-section>
        <div class="text-h6">{{ isEditMode ? 'Editar Plan' : 'Nuevo Plan' }}</div>
      </q-card-section>

      <q-separator />

      <q-form ref="formRef" @submit.prevent="onSubmit">
        <q-card-section class="q-gutter-sm" style="max-height: 70vh; overflow-y: auto">
          <!-- General -->
          <div class="text-subtitle2 text-weight-bold q-mt-sm">General</div>

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

          <div class="row q-col-gutter-sm">
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

          <!-- Precios -->
          <div class="text-subtitle2 text-weight-bold q-mt-md">Precios</div>

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

          <!-- Duracion y Clases -->
          <div class="text-subtitle2 text-weight-bold q-mt-md">Duracion y Clases</div>

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
            <div class="col-12 col-sm-6">
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

          <!-- Opciones -->
          <div class="text-subtitle2 text-weight-bold q-mt-md">Opciones</div>

          <div class="q-gutter-sm">
            <q-toggle v-model="form.multiBranch" label="Multi-sucursal" />
            <q-toggle v-model="form.isTrial" label="Plan de prueba" />
            <q-toggle v-model="form.isGroup" label="Plan grupal" />
            <q-toggle v-model="form.isPersonalizada" label="Personalizada">
              <q-tooltip>Otorga acceso a Clases Personalizadas</q-tooltip>
            </q-toggle>
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
import {
  PLAN_TIER_LABELS,
  BOOKING_MODE_LABELS,
  type PlanListItem,
  type PlanTier,
  type BookingMode,
} from 'src/types/subscription';

const log = createLogger('PlanFormDialog');

// =========================================================================
// Props & Emits
// =========================================================================

const props = defineProps<{
  modelValue: boolean;
  plan?: PlanListItem | null;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  saved: [];
}>();

// =========================================================================
// State
// =========================================================================

const subscriptionsApi = useSubscriptionsApi();
const formRef = ref<InstanceType<typeof QForm> | null>(null);
const submitting = ref(false);

const isEditMode = computed(() => !!props.plan);

// Form data
const form = ref({
  name: '',
  description: '',
  planTier: 'flex' as PlanTier,
  bookingMode: 'flexible' as BookingMode,
  priceRegular: null as number | null,
  priceZero: null as number | null,
  priceCreditCard: null as number | null,
  durationDays: null as number | null,
  classesPerWeek: null as number | null,
  multiBranch: false,
  isTrial: false,
  isGroup: false,
  isPersonalizada: false,
  groupMaxMembers: null as number | null,
});

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
// Form Lifecycle
// =========================================================================

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return;

    if (props.plan) {
      form.value = {
        name: props.plan.name,
        description: props.plan.description ?? '',
        planTier: props.plan.planTier,
        bookingMode: props.plan.bookingMode,
        priceRegular: props.plan.priceRegular,
        priceZero: props.plan.priceZero,
        priceCreditCard: props.plan.priceCreditCard,
        durationDays: props.plan.durationDays,
        classesPerWeek: props.plan.classesPerWeek,
        multiBranch: props.plan.multiBranch,
        isTrial: props.plan.isTrial,
        isGroup: props.plan.isGroup,
        isPersonalizada: props.plan.isPersonalizada,
        groupMaxMembers: props.plan.groupMaxMembers,
      };
    } else {
      form.value = {
        name: '',
        description: '',
        planTier: 'flex',
        bookingMode: 'flexible',
        priceRegular: null,
        priceZero: null,
        priceCreditCard: null,
        durationDays: null,
        classesPerWeek: null,
        multiBranch: false,
        isTrial: false,
        isGroup: false,
        isPersonalizada: false,
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
      planTier: form.value.planTier,
      bookingMode: form.value.bookingMode,
      priceRegular: form.value.priceRegular!,
      priceZero: form.value.priceZero!,
      priceCreditCard: form.value.priceCreditCard ?? undefined,
      durationDays: form.value.durationDays!,
      classesPerWeek: form.value.classesPerWeek ?? undefined,
      multiBranch: form.value.multiBranch,
      isTrial: form.value.isTrial,
      isGroup: form.value.isGroup,
      isPersonalizada: form.value.isPersonalizada,
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
