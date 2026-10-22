<!--
  Ajustes de Conquer (fase 201, D-14, D-20, §8.2, §14.3): los parámetros del método que Nacho
  valida en la prueba. Cuántos peldaños más fáciles que Toro arrancan Novillo y Ternero, y cuántas
  semanas seguidas con el objetivo cumplido hacen falta para que los combos ofrezcan Subir. Los
  rangos los manda el API (`ranges`) y el API vuelve a validarlos; "Guardar" manda solo lo que
  cambió y la respuesta trae los valores guardados. El arranque se aplica a las altas nuevas: las
  progresiones de los alumnos ya activos no cambian.
-->
<template>
  <div data-test="conquer-settings">
    <q-banner dense rounded class="bg-grey-3 text-accent q-mb-md">
      <template #avatar><q-icon name="tune" color="secondary" /></template>
      Son la propuesta de Nacho, a validar en la prueba.
    </q-banner>

    <div v-if="loading && !data" class="row justify-center q-pa-lg">
      <q-spinner color="secondary" size="32px" />
    </div>

    <q-banner v-else-if="loadError && !data" rounded class="bg-grey-3 text-accent">
      {{ loadError }}
      <template #action>
        <q-btn flat color="secondary" label="Reintentar" @click="load" />
      </template>
    </q-banner>

    <q-card v-else-if="data" flat bordered>
      <q-card-section>
        <div class="text-subtitle1 text-weight-medium q-mb-sm">Arranque por nivel</div>
        <div class="row q-col-gutter-md">
          <div class="col-12 col-sm-6">
            <q-input
              v-model.number="form.startOffsetNovillo"
              type="number"
              dense
              outlined
              :min="data.ranges.startOffsetNovillo.min"
              :max="data.ranges.startOffsetNovillo.max"
              label="Novillo arranca N peldaños más fácil que Toro"
              :hint="rangeHint(data.ranges.startOffsetNovillo)"
              :disable="saving"
              data-test="conquer-setting-novillo"
            />
          </div>
          <div class="col-12 col-sm-6">
            <q-input
              v-model.number="form.startOffsetTernero"
              type="number"
              dense
              outlined
              :min="data.ranges.startOffsetTernero.min"
              :max="data.ranges.startOffsetTernero.max"
              label="Ternero arranca N peldaños más fácil que Toro"
              :hint="rangeHint(data.ranges.startOffsetTernero)"
              :disable="saving"
              data-test="conquer-setting-ternero"
            />
          </div>
        </div>
        <div class="text-caption text-grey-8 q-mt-md">
          Se aplica a las altas nuevas; las progresiones de los alumnos ya activos no cambian.
        </div>
      </q-card-section>

      <q-separator />

      <q-card-section>
        <div class="text-subtitle1 text-weight-medium q-mb-sm">Combos de Toro</div>
        <div class="row q-col-gutter-md">
          <div class="col-12 col-sm-6">
            <q-input
              v-model.number="form.comboWeeksN"
              type="number"
              dense
              outlined
              :min="data.ranges.comboWeeksN.min"
              :max="data.ranges.comboWeeksN.max"
              label="Combos: aparece Subir si completó el objetivo N semanas seguidas"
              :hint="rangeHint(data.ranges.comboWeeksN)"
              :disable="saving"
              data-test="conquer-setting-combos"
            />
          </div>
        </div>
      </q-card-section>

      <q-separator />

      <q-card-actions align="right" class="q-pa-md">
        <q-btn
          unelevated
          no-caps
          color="secondary"
          label="Guardar"
          :loading="saving"
          :disable="!dirty"
          style="min-height: 44px"
          data-test="conquer-settings-save"
          @click="save"
        />
      </q-card-actions>
    </q-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useQuasar } from 'quasar';
import { useConquerAdminApi } from 'src/composables/useConquerAdminApi';
import type {
  ConquerSettingsPatch,
  ConquerSettingsResponse,
  SettingRange,
} from 'src/types/conquer';

const props = defineProps<{
  /** Sube cuando la página necesita que se relean los parámetros. */
  reloadToken: number;
}>();

const $q = useQuasar();
const conquerApi = useConquerAdminApi();

interface SettingsForm {
  startOffsetNovillo: number | null;
  startOffsetTernero: number | null;
  comboWeeksN: number | null;
}

const data = ref<ConquerSettingsResponse | null>(null);
const loading = ref(false);
const loadError = ref<string | null>(null);
const saving = ref(false);
const form = reactive<SettingsForm>({
  startOffsetNovillo: null,
  startOffsetTernero: null,
  comboWeeksN: null,
});

function rangeHint(range: SettingRange): string {
  return `Entre ${range.min} y ${range.max}`;
}

function applyToForm(response: ConquerSettingsResponse): void {
  form.startOffsetNovillo = response.settings.startOffset.novillo;
  form.startOffsetTernero = response.settings.startOffset.ternero;
  form.comboWeeksN = response.settings.comboWeeksN;
}

// Solo lo que cambió respecto de lo guardado (el API pide al menos una clave).
const patch = computed<ConquerSettingsPatch>(() => {
  const saved = data.value?.settings;
  if (!saved) return {};
  const out: ConquerSettingsPatch = {};
  if (form.startOffsetNovillo !== null && form.startOffsetNovillo !== saved.startOffset.novillo) {
    out.startOffsetNovillo = form.startOffsetNovillo;
  }
  if (form.startOffsetTernero !== null && form.startOffsetTernero !== saved.startOffset.ternero) {
    out.startOffsetTernero = form.startOffsetTernero;
  }
  if (form.comboWeeksN !== null && form.comboWeeksN !== saved.comboWeeksN) {
    out.comboWeeksN = form.comboWeeksN;
  }
  return out;
});

const dirty = computed(() => Object.keys(patch.value).length > 0);

// Un campo vacío o con decimales no se manda: el aviso sale acá, antes de ir al API.
function invalidField(): string | null {
  const ranges = data.value?.ranges;
  if (!ranges) return null;
  const checks: [number | null, SettingRange, string][] = [
    [form.startOffsetNovillo, ranges.startOffsetNovillo, 'El arranque de Novillo'],
    [form.startOffsetTernero, ranges.startOffsetTernero, 'El arranque de Ternero'],
    [form.comboWeeksN, ranges.comboWeeksN, 'Las semanas de los combos'],
  ];
  for (const [value, range, label] of checks) {
    const ok =
      value !== null && Number.isInteger(value) && value >= range.min && value <= range.max;
    if (!ok) return `${label} tiene que ser un número entero ${rangeHint(range).toLowerCase()}`;
  }
  return null;
}

async function load(): Promise<void> {
  loading.value = true;
  loadError.value = null;
  try {
    const response = await conquerApi.getSettings();
    data.value = response;
    applyToForm(response);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'No pudimos cargar los parámetros';
    loadError.value = message;
    $q.notify({ type: 'negative', message });
  } finally {
    loading.value = false;
  }
}

async function save(): Promise<void> {
  const problem = invalidField();
  if (problem) {
    $q.notify({ type: 'negative', message: problem });
    return;
  }
  saving.value = true;
  try {
    const response = await conquerApi.saveSettings(patch.value);
    data.value = response;
    applyToForm(response);
    $q.notify({ type: 'positive', message: 'Parámetros guardados' });
  } catch (err: unknown) {
    $q.notify({
      type: 'negative',
      message: err instanceof Error ? err.message : 'No pudimos guardar los parámetros',
    });
  } finally {
    saving.value = false;
  }
}

onMounted(load);
watch(() => props.reloadToken, load);
</script>
