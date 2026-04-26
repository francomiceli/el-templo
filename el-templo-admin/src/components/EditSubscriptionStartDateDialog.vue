<template>
  <q-dialog :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)">
    <q-card style="width: 480px; max-width: 95vw">
      <q-card-section>
        <div class="text-h6">Editar fecha de inicio</div>
      </q-card-section>

      <q-separator />

      <q-card-section v-if="subscription">
        <q-banner v-if="subscription.status === 'paused'" dense rounded class="bg-amber-1 q-mb-md">
          <template #avatar>
            <q-icon name="warning" color="warning" />
          </template>
          La suscripción está pausada. Los días de pausa siguen contando aparte al reanudar.
        </q-banner>

        <q-list dense class="q-mb-md">
          <q-item>
            <q-item-section>Plan</q-item-section>
            <q-item-section side class="text-weight-medium">
              {{ subscription.planName }}
            </q-item-section>
          </q-item>
          <q-item>
            <q-item-section>Inicio actual</q-item-section>
            <q-item-section side>
              {{ formatDate(subscription.startDate) }}
            </q-item-section>
          </q-item>
          <q-item>
            <q-item-section>Vencimiento actual</q-item-section>
            <q-item-section side>
              {{ subscription.endDate ? formatDate(subscription.endDate) : '—' }}
            </q-item-section>
          </q-item>
        </q-list>

        <q-input
          v-model="newStartDate"
          label="Nueva fecha de inicio"
          type="date"
          dense
          outlined
          :min="minDate"
          :max="maxDate"
          class="q-mb-sm"
        />

        <div class="text-caption text-grey-7 q-mb-md">
          Permitido entre {{ formatDate(minDate) }} y {{ formatDate(maxDate) }}.
        </div>

        <q-card v-if="newStartDate && newEndDate" flat bordered class="bg-grey-1">
          <q-card-section>
            <div class="text-caption text-grey-7 q-mb-xs">Resumen del cambio</div>
            <q-list dense>
              <q-item>
                <q-item-section>Nuevo inicio</q-item-section>
                <q-item-section side class="text-weight-medium">
                  {{ formatDate(newStartDate) }}
                </q-item-section>
              </q-item>
              <q-item>
                <q-item-section>Nuevo vencimiento</q-item-section>
                <q-item-section side class="text-weight-medium">
                  {{ formatDate(newEndDate) }}
                </q-item-section>
              </q-item>
              <q-item v-if="statusTransition">
                <q-item-section>Estado</q-item-section>
                <q-item-section side>
                  <q-badge :color="statusTransition.color" :label="statusTransition.label" />
                </q-item-section>
              </q-item>
            </q-list>
          </q-card-section>
        </q-card>
      </q-card-section>

      <q-separator />

      <q-card-actions align="right" class="q-pa-md">
        <q-btn flat label="Cancelar" color="grey" @click="emit('update:modelValue', false)" />
        <q-btn
          color="primary"
          label="Guardar"
          icon="check"
          :loading="saving"
          :disable="!canSave"
          @click="save"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useQuasar } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { formatDate } from 'src/utils/format-date';
import { extractError, isExpectedClientError } from 'src/utils/extract-error';
import { useSubscriptionsApi } from 'src/composables/useSubscriptionsApi';
import type { SubscriptionDetail } from 'src/types/subscription';

const PAST_LIMIT_DAYS = 90;
const FUTURE_LIMIT_DAYS = 60;

const log = createLogger('EditSubscriptionStartDateDialog');
const $q = useQuasar();
const subsApi = useSubscriptionsApi();

const props = defineProps<{
  modelValue: boolean;
  subscription: SubscriptionDetail | null;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  saved: [];
}>();

const newStartDate = ref('');
const saving = ref(false);

function offsetIso(days: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

const minDate = computed(() => offsetIso(-PAST_LIMIT_DAYS));
const maxDate = computed(() => offsetIso(FUTURE_LIMIT_DAYS));
const today = computed(() => offsetIso(0));

const durationDays = computed(() => {
  const sub = props.subscription;
  if (!sub?.endDate) return 0;
  const startMs = new Date(sub.startDate).getTime();
  const endMs = new Date(sub.endDate).getTime();
  return Math.round((endMs - startMs) / (1000 * 60 * 60 * 24));
});

const newEndDate = computed(() => {
  if (!newStartDate.value || !durationDays.value) return '';
  const d = new Date(newStartDate.value);
  d.setDate(d.getDate() + durationDays.value);
  return d.toISOString().split('T')[0];
});

const statusTransition = computed(() => {
  const sub = props.subscription;
  if (!sub || !newStartDate.value) return null;
  if (sub.status === 'paused') return null;
  const willBeScheduled = newStartDate.value > today.value;
  const isScheduled = sub.status === 'scheduled';
  if (willBeScheduled && !isScheduled) {
    return { label: 'Pasará a Programada', color: 'blue-grey' };
  }
  if (!willBeScheduled && isScheduled) {
    return { label: 'Pasará a Activa', color: 'positive' };
  }
  return null;
});

const canSave = computed(() => {
  if (!props.subscription) return false;
  if (!newStartDate.value) return false;
  if (newStartDate.value === props.subscription.startDate) return false;
  if (newStartDate.value < minDate.value) return false;
  if (newStartDate.value > maxDate.value) return false;
  return true;
});

async function save() {
  if (!props.subscription) return;
  saving.value = true;
  try {
    await subsApi.editSubscriptionStartDate(props.subscription.id, newStartDate.value);
    $q.notify({ type: 'positive', message: 'Fecha de inicio actualizada' });
    emit('saved');
    emit('update:modelValue', false);
  } catch (err: unknown) {
    const message = extractError(err, 'Error editando fecha de inicio');
    if (isExpectedClientError(err)) {
      log.warn('Edit start date rejected by server', { error: message });
    } else {
      log.error('Error editing start date', { error: message });
    }
    $q.notify({ type: 'negative', message, timeout: 5000 });
  } finally {
    saving.value = false;
  }
}

watch(
  () => props.modelValue,
  (open) => {
    if (open && props.subscription) {
      newStartDate.value = props.subscription.startDate;
    }
  }
);
</script>
