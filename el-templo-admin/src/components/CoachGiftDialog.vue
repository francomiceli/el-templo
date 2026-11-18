<template>
  <q-dialog :model-value="modelValue" @update:model-value="onToggle">
    <q-card style="min-width: 320px; max-width: 400px">
      <q-card-section>
        <div class="text-h6">Dar Aura a {{ memberName }}</div>
        <div class="text-body2 text-grey-8 q-mt-xs">
          Suma {{ amount }} de Aura. Le llega un aviso con tu nombre y el motivo.
        </div>
      </q-card-section>

      <q-card-section class="q-pt-none">
        <q-option-group
          v-model="reason"
          type="radio"
          :options="reasonOptions"
          aria-label="Motivo"
        />
      </q-card-section>

      <q-card-actions align="right">
        <q-btn flat label="Cancelar" :disable="giving" @click="close" />
        <q-btn
          unelevated
          color="primary"
          label="Dar Aura"
          :disable="reason === null"
          :loading="giving"
          @click="onGive"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useQuasar } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { GIFT_REASONS, type GiftReasonCode } from 'src/config/gift-reasons';
import { giftErrorCode, useAuraGiftsApi } from 'src/composables/useAuraGiftsApi';

const log = createLogger('CoachGiftDialog');
const $q = useQuasar();
const giftsApi = useAuraGiftsApi();

const props = defineProps<{
  modelValue: boolean;
  /** Nombre y apellido, para el título. */
  memberName: string;
  /** Nombre de pila, para los avisos. */
  firstName: string;
  attendanceId: number;
  /** `coachGiftAmount` del panel: lo que suma el regalo. */
  amount: number;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  given: [payload: { amount: number; reason: GiftReasonCode }];
  'already-given': [];
  stale: [];
}>();

const reasonOptions = GIFT_REASONS.map((r) => ({ label: r.label, value: r.code }));

const reason = ref<GiftReasonCode | null>(null);
const giving = ref(false);

// Cada vez que se abre, el motivo arranca sin elegir (nunca hay uno por defecto).
watch(
  () => props.modelValue,
  (open) => {
    if (open) reason.value = null;
  }
);

function close() {
  emit('update:modelValue', false);
}

// Mientras el regalo va no se cierra con Escape ni con un clic afuera.
function onToggle(value: boolean) {
  if (!value && giving.value) return;
  emit('update:modelValue', value);
}

async function onGive() {
  const chosen = reason.value;
  if (chosen === null || giving.value) return;

  giving.value = true;
  try {
    const result = await giftsApi.giveAsCoach(props.attendanceId, chosen);
    close();
    emit('given', { amount: result.amount, reason: chosen });
    $q.notify({
      type: 'positive',
      message: `Le diste ${result.amount} de Aura a ${props.firstName}.`,
    });
  } catch (err: unknown) {
    const code = giftErrorCode(err);
    if (code === 'REGALO_YA_DADO') {
      close();
      emit('already-given');
      $q.notify({ type: 'info', message: `Ya le diste Aura hoy a ${props.firstName}.` });
    } else if (code === 'REGALO_VENCIDO' || code === 'REGALO_NO_DISPONIBLE') {
      close();
      emit('stale');
      $q.notify({
        type: 'warning',
        message: `${props.firstName} ya no puede recibir Aura de esta clase.`,
      });
    } else {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      log.error('Error dando Aura como profe', { error: message, code });
      $q.notify({ type: 'negative', message: 'No pudimos dar el Aura. Probá de nuevo.' });
    }
  } finally {
    giving.value = false;
  }
}
</script>
