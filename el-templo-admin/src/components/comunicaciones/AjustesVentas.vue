<!-- Bloque "Ajustes" de Comunicaciones (Fase 193, plan 14, D-20).
     Número de WhatsApp de ventas por país (`tenant_settings`), que la app
     usa cuando el destino de una push/aviso/tarjeta es "WhatsApp de ventas"
     (D-01/D-02). D-21: la app PREFIERE este número y cae al hardcode
     AR/ES actual (el-templo-app/src/utils/whatsapp.ts) si el server no
     devuelve nada — por eso un país "vacío" acá NUNCA se pre-carga con el
     hardcode como si fuera configuración real (lo pediría a propósito
     T-193-52: cargarlo por accidente lo "fijaría" como si el staff lo
     hubiera elegido).

     Mismo patrón de bloque-de-ajustes-con-guardado que
     ConfiguracionPreciosPage.vue (card + banner informativo + notify). -->
<template>
  <q-card flat bordered>
    <q-card-section>
      <q-banner dense rounded class="bg-grey-2 text-grey-9 q-mb-md">
        <template #avatar>
          <q-icon name="info" color="primary" />
        </template>
        Este número lo usa la app cuando el destino de una notificación, aviso o tarjeta es
        WhatsApp de ventas. Si está vacío, la app usa el número histórico de la sede.
      </q-banner>

      <div v-if="loading" class="row items-center text-grey-7 q-mb-md">
        <q-spinner size="18px" class="q-mr-sm" />
        Cargando…
      </div>

      <div class="row q-col-gutter-md">
        <div class="col-12 col-sm-6">
          <q-input
            v-model="form.AR"
            label="Argentina (AR)"
            dense
            outlined
            :disable="loading"
            :placeholder="HARDCODE_HINT.AR"
            hint="Solo números, sin + ni espacios (ej. 5492235820521)"
            :rules="[validateNumberRule]"
          />
        </div>
        <div class="col-12 col-sm-6">
          <q-input
            v-model="form.ES"
            label="España (ES)"
            dense
            outlined
            :disable="loading"
            :placeholder="HARDCODE_HINT.ES"
            hint="Solo números, sin + ni espacios (ej. 34680774331)"
            :rules="[validateNumberRule]"
          />
        </div>
      </div>

      <div class="row justify-end q-mt-md">
        <q-btn
          color="primary"
          label="Guardar"
          unelevated
          :loading="saving"
          :disable="!canSave"
          @click="handleSave"
        />
      </div>
    </q-card-section>
  </q-card>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue';
import { useQuasar } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { extractError } from 'src/utils/extract-error';
import { useCommunicationsApi } from 'src/composables/useCommunicationsApi';
import type { UpdateSalesNumbersInput } from 'src/composables/useCommunicationsApi';

const log = createLogger('AjustesVentas');
const $q = useQuasar();
const commsApi = useCommunicationsApi();

// Mismo patrón que el server (`SALES_NUMBER_PATTERN`,
// el-templo-api/src/modules/communications/sales-number.ts): solo dígitos,
// 8 a 15 caracteres. Si el server rechaza igual (400), se muestra su
// mensaje tal cual (no se duplica el texto de error acá).
const SALES_NUMBER_PATTERN = /^[0-9]{8,15}$/;

// Hardcode HOY vigente en el-templo-app/src/utils/whatsapp.ts — SOLO texto
// de ayuda (placeholder). Nunca se pre-carga como valor del input.
const HARDCODE_HINT = { AR: '5492235820521', ES: '34680774331' };

const form = reactive({ AR: '', ES: '' });
const loading = ref(true);
const saving = ref(false);

function validateNumberRule(val: string): boolean | string {
  if (!val) return true; // vacío = no tocar ese país al guardar
  return SALES_NUMBER_PATTERN.test(val) || 'Solo números, entre 8 y 15 dígitos';
}

const canSave = computed(() => {
  const arOk = !form.AR || SALES_NUMBER_PATTERN.test(form.AR);
  const esOk = !form.ES || SALES_NUMBER_PATTERN.test(form.ES);
  return arOk && esOk && (form.AR.length > 0 || form.ES.length > 0);
});

async function loadNumbers() {
  loading.value = true;
  try {
    const data = await commsApi.getSalesNumbers();
    form.AR = data.AR ?? '';
    form.ES = data.ES ?? '';
  } catch (err: unknown) {
    const message = extractError(err, 'No se pudo cargar el número de ventas');
    log.error('Error loading sales numbers', { error: message });
    $q.notify({ type: 'negative', message });
  } finally {
    loading.value = false;
  }
}

async function handleSave() {
  const payload: UpdateSalesNumbersInput = {};
  if (form.AR) payload.AR = form.AR.trim();
  if (form.ES) payload.ES = form.ES.trim();

  saving.value = true;
  try {
    await commsApi.setSalesNumbers(payload);
    $q.notify({ type: 'positive', message: 'Número de ventas guardado' });
    await loadNumbers();
  } catch (err: unknown) {
    const message = extractError(err, 'No se pudo guardar el número de ventas');
    log.error('Error saving sales numbers', { error: message });
    $q.notify({ type: 'negative', message });
  } finally {
    saving.value = false;
  }
}

onMounted(() => {
  void loadNumbers();
});
onUnmounted(() => {
  commsApi.cleanup();
});
</script>
