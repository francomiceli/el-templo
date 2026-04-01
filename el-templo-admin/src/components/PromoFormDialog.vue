<template>
  <q-dialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    persistent
  >
    <q-card style="min-width: 450px">
      <q-card-section>
        <div class="text-h6">{{ isEdit ? 'Editar Promo' : 'Nueva Promo' }}</div>
      </q-card-section>

      <q-card-section>
        <q-form @submit="onSubmit" class="q-gutter-y-md">
          <q-input v-model="form.name" label="Nombre" outlined dense :rules="[required]" />
          <q-input
            v-model="form.promoCode"
            label="Codigo Promo"
            outlined
            dense
            :rules="[required]"
            :disable="isEdit"
            hint="Sin espacios, ej: TEMPLOPASSBCN"
          />
          <q-input
            v-model.number="form.planDurationDays"
            label="Duracion (dias)"
            type="number"
            outlined
            dense
            :rules="[required]"
          />

          <q-input
            v-model="form.startDate"
            label="Fecha Inicio"
            type="datetime-local"
            outlined
            dense
            :rules="[required]"
          />
          <q-input
            v-model="form.expiryDate"
            label="Fecha Expiracion"
            type="datetime-local"
            outlined
            dense
            :rules="[required]"
          />

          <q-select
            v-model="form.promoType"
            :options="promoTypeOptions"
            label="Tipo"
            outlined
            dense
            emit-value
            map-options
          />

          <q-select
            v-model="form.subscriptionPlanId"
            :options="planOptions"
            label="Plan a Asignar"
            outlined
            dense
            emit-value
            map-options
            :rules="[required]"
          />

          <q-card-actions align="right">
            <q-btn flat label="Cancelar" @click="$emit('update:modelValue', false)" />
            <q-btn color="primary" label="Guardar" type="submit" :loading="saving" />
          </q-card-actions>
        </q-form>
      </q-card-section>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { useQuasar } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { useSubscriptionsApi } from 'src/composables/useSubscriptionsApi';
import type {
  PromoListItem,
  CreatePromoInput,
  PromoType,
  PlanListItem,
} from 'src/types/subscription';

const log = createLogger('PromoFormDialog');
const $q = useQuasar();
const subscriptionsApi = useSubscriptionsApi();

const props = defineProps<{
  modelValue: boolean;
  promo: PromoListItem | null;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  saved: [];
}>();

const isEdit = computed(() => !!props.promo);
const saving = ref(false);
const planOptions = ref<{ label: string; value: number }[]>([]);

const promoTypeOptions = [
  { label: 'Auto-Asignar', value: 'auto' },
  { label: 'Admin Asignable', value: 'admin_assignable' },
];

const form = ref<{
  name: string;
  promoCode: string;
  planDurationDays: number;
  startDate: string;
  expiryDate: string;
  promoType: PromoType;
  subscriptionPlanId: number | null;
}>({
  name: '',
  promoCode: '',
  planDurationDays: 30,
  startDate: '',
  expiryDate: '',
  promoType: 'auto',
  subscriptionPlanId: null,
});

const required = (val: unknown) => !!val || val === 0 || 'Campo requerido';

watch(
  () => props.modelValue,
  async (show) => {
    if (show) {
      // Load subscription plans for the selector
      try {
        const plans = await subscriptionsApi.getPlans();
        planOptions.value = plans
          .filter((p: PlanListItem) => p.isActive && !p.isArchived)
          .map((p: PlanListItem) => ({
            label: `${p.name} (${p.durationDays}d, $${p.priceRegular})`,
            value: p.id,
          }));
      } catch (err: unknown) {
        log.error('Failed to load plans', {
          err: err instanceof Error ? err.message : String(err),
        });
      }

      if (props.promo) {
        form.value = {
          name: props.promo.name,
          promoCode: props.promo.promoCode,
          planDurationDays: props.promo.planDurationDays,
          startDate: props.promo.startDate.slice(0, 16),
          expiryDate: props.promo.expiryDate.slice(0, 16),
          promoType: props.promo.promoType,
          subscriptionPlanId: props.promo.subscriptionPlanId,
        };
      } else {
        form.value = {
          name: '',
          promoCode: '',
          planDurationDays: 30,
          startDate: '',
          expiryDate: '',
          promoType: 'auto',
          subscriptionPlanId: null,
        };
      }
    }
  }
);

async function onSubmit() {
  if (!form.value.subscriptionPlanId) return;
  saving.value = true;
  try {
    const input: CreatePromoInput = {
      name: form.value.name,
      promoCode: form.value.promoCode,
      planDurationDays: form.value.planDurationDays,
      startDate: new Date(form.value.startDate).toISOString(),
      expiryDate: new Date(form.value.expiryDate).toISOString(),
      promoType: form.value.promoType,
      subscriptionPlanId: form.value.subscriptionPlanId,
    };
    await subscriptionsApi.createPromo(input);
    $q.notify({ type: 'positive', message: 'Promo creada' });
    emit('update:modelValue', false);
    emit('saved');
  } catch (err: unknown) {
    log.error('Failed to create promo', {
      err: err instanceof Error ? err.message : String(err),
    });
    $q.notify({ type: 'negative', message: 'Error al crear promo' });
  } finally {
    saving.value = false;
  }
}
</script>
