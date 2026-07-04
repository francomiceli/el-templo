<template>
  <q-page class="q-pa-md">
    <!-- Header -->
    <div class="row items-center q-mb-md">
      <div class="text-h5 col">Reglas de precio</div>
    </div>

    <q-card flat bordered style="max-width: 640px">
      <q-card-section>
        <div class="text-subtitle1 q-mb-xs">Recargo por pago con tarjeta</div>

        <q-banner dense rounded class="bg-grey-2 text-grey-9 q-mb-md">
          <template #avatar>
            <q-icon name="info" color="primary" />
          </template>
          Con la regla apagada, todos los medios de pago cobran el precio regular (sin recargo por
          tarjeta). Con la regla prendida, el pago con tarjeta aplica el precio de tarjeta
          configurado en cada plan.
        </q-banner>

        <q-toggle
          v-model="cardSurchargeEnabled"
          label="Aplicar recargo por pago con tarjeta"
          color="primary"
          :disable="loading || saving"
          @update:model-value="onToggle"
        />

        <div v-if="loading" class="row items-center text-grey-7 q-mt-sm">
          <q-spinner size="18px" class="q-mr-sm" />
          Cargando…
        </div>
      </q-card-section>
    </q-card>
  </q-page>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useQuasar } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { usePricingSettingsApi } from 'src/composables/usePricingSettingsApi';

const log = createLogger('ConfiguracionPreciosPage');
const $q = useQuasar();
const pricingApi = usePricingSettingsApi();

const cardSurchargeEnabled = ref(false);
const loading = ref(false);
const saving = ref(false);

async function loadSetting() {
  loading.value = true;
  try {
    cardSurchargeEnabled.value = await pricingApi.getCardSurchargeEnabled();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error loading card surcharge setting', { error: message });
    $q.notify({ type: 'negative', message: 'No se pudo cargar la configuración' });
  } finally {
    loading.value = false;
  }
}

async function onToggle(value: boolean) {
  saving.value = true;
  try {
    await pricingApi.setCardSurchargeEnabled(value);
    $q.notify({ type: 'positive', message: 'Regla actualizada' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error saving card surcharge setting', { error: message });
    $q.notify({ type: 'negative', message: 'No se pudo guardar la regla' });
    // Revert the optimistic toggle to the last known-good state.
    cardSurchargeEnabled.value = !value;
  } finally {
    saving.value = false;
  }
}

onMounted(() => {
  void loadSetting();
});
</script>
