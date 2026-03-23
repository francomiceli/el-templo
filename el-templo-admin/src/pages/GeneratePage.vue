<template>
  <q-page class="q-pa-md">
    <div class="text-h5 q-mb-md">Generar Sesiones</div>

    <!-- Tabs for General / Personalizadas -->
    <q-tabs
      v-model="activeTab"
      dense
      class="text-grey"
      active-color="primary"
      indicator-color="primary"
      align="left"
    >
      <q-tab name="general" label="General" />
      <q-tab name="personalizadas" label="Personalizadas" />
    </q-tabs>

    <q-separator class="q-mb-md" />

    <q-tab-panels v-model="activeTab" animated>
      <!-- ============================================================ -->
      <!-- GENERAL TAB (existing functionality, unchanged) -->
      <!-- ============================================================ -->
      <q-tab-panel name="general" class="q-pa-none">
        <!-- Week selector - ONLY FUTURE WEEKS (currentWeek + 1 minimum) -->
        <q-card flat bordered class="q-mb-md">
          <q-card-section>
            <div class="row items-center q-gutter-md">
              <q-select
                v-model="selectedWeek"
                :options="weekOptions"
                label="Semana"
                outlined
                dense
                emit-value
                map-options
                style="min-width: 280px"
                @update:model-value="loadWeekSummary"
              />
            </div>
          </q-card-section>
        </q-card>

        <!-- Hierarchical regeneration controls (future weeks only) -->
        <q-card v-if="weekSummary && isFutureWeek" flat bordered class="q-mb-md">
          <q-card-section>
            <div class="text-subtitle1 q-mb-md">Nivel de Regeneracion</div>

            <q-option-group
              v-model="generationScope"
              :options="scopeOptions"
              inline
              class="q-mb-md"
            />

            <!-- Day selector (visible for 'day' and 'day_level' scopes) -->
            <div v-if="generationScope !== 'week'" class="q-mb-md">
              <div class="text-caption q-mb-sm">Seleccionar Dia:</div>
              <q-btn-toggle
                v-model="selectedDay"
                toggle-color="primary"
                :options="dayOptions"
                spread
              />
            </div>

            <!-- Level selector (visible only for 'day_level' scope) -->
            <div v-if="generationScope === 'day_level'" class="q-mb-md">
              <div class="text-caption q-mb-sm">Seleccionar Nivel:</div>
              <q-btn-toggle
                v-model="selectedLevel"
                toggle-color="primary"
                :options="levelOptions"
              />
            </div>

            <!-- Generate button -->
            <div class="row q-gutter-md q-mt-md">
              <q-btn
                color="primary"
                icon="auto_awesome"
                :label="generateButtonLabel"
                :loading="generateApi.loading.value"
                :disable="!canGenerate"
                @click="handleGenerate"
              />
            </div>
          </q-card-section>
        </q-card>

        <!-- Week summary -->
        <q-card v-if="weekSummary" flat bordered>
          <q-card-section>
            <div class="text-subtitle1 q-mb-md">Estado de {{ formatWeekLabel(selectedWeek) }}</div>

            <q-table
              :rows="summaryRows"
              :columns="summaryColumns"
              row-key="day"
              flat
              bordered
              hide-pagination
              :pagination="{ rowsPerPage: 0 }"
            >
              <template #body-cell-alfa_delta="props">
                <q-td :props="props">
                  <StatusIndicator :status="props.row.alfa_delta" :locked="!isFutureWeek" />
                </q-td>
              </template>
              <template #body-cell-sigma="props">
                <q-td :props="props">
                  <StatusIndicator :status="props.row.sigma" :locked="!isFutureWeek" />
                </q-td>
              </template>
              <template #body-cell-omega="props">
                <q-td :props="props">
                  <StatusIndicator :status="props.row.omega" :locked="!isFutureWeek" />
                </q-td>
              </template>
            </q-table>
          </q-card-section>

          <!-- Regenerate options -->
          <q-card-section v-if="isFutureWeek && hasExistingSessionsInScope" class="bg-grey-2">
            <q-checkbox
              v-model="regenerate"
              label="Regenerar sesiones existentes (se eliminaran permanentemente)"
            />
          </q-card-section>
        </q-card>

        <!-- Generate result -->
        <q-banner v-if="lastResult" :class="lastResultBannerClass" class="q-mt-md">
          <template #avatar>
            <q-icon :name="lastResultIcon" />
          </template>
          Generadas: {{ lastResult.generated }} sesiones.
          <span v-if="lastResult.skipped > 0">
            Omitidas: {{ lastResult.skipped }} (ya existian).
          </span>
          <span v-if="lastResult.failed"> Fallaron: {{ lastResult.failed }}. </span>
        </q-banner>

        <!-- Warnings detail -->
        <q-banner
          v-if="lastResult && lastResult.warnings && lastResult.warnings.length > 0"
          class="bg-warning text-white q-mt-sm"
        >
          <template #avatar>
            <q-icon name="warning" />
          </template>
          <div class="text-weight-bold q-mb-xs">Sesiones con errores:</div>
          <div v-for="(w, i) in lastResult.warnings" :key="i" class="text-caption">
            {{ w }}
          </div>
        </q-banner>
      </q-tab-panel>

      <!-- ============================================================ -->
      <!-- PERSONALIZADAS TAB (personalizada session generation) -->
      <!-- ============================================================ -->
      <q-tab-panel name="personalizadas" class="q-pa-none">
        <!-- Week selector -->
        <q-card flat bordered class="q-mb-md">
          <q-card-section>
            <div class="row items-center q-gutter-md">
              <q-select
                v-model="personalizadaWeek"
                :options="weekOptions"
                label="Semana"
                outlined
                dense
                emit-value
                map-options
                style="min-width: 280px"
              />
            </div>
          </q-card-section>
        </q-card>

        <!-- Personalizada type selection -->
        <q-card v-if="isPersonalizadaFutureWeek" flat bordered class="q-mb-md">
          <q-card-section>
            <div class="text-subtitle1 q-mb-md">Tipos de Personalizada</div>

            <!-- Grouped by tier -->
            <div v-for="tier in personalizadaTiers" :key="tier.key" class="q-mb-md">
              <div class="text-caption text-weight-bold q-mb-xs" :class="`text-${tier.color}`">
                {{ tier.label }}
              </div>
              <div class="row q-gutter-sm">
                <q-chip
                  v-for="jt in tier.types"
                  :key="jt.type"
                  :selected="selectedPersonalizadaTypes.includes(jt.type)"
                  clickable
                  :color="selectedPersonalizadaTypes.includes(jt.type) ? tier.color : 'grey-3'"
                  :text-color="selectedPersonalizadaTypes.includes(jt.type) ? 'white' : 'grey-8'"
                  @click="togglePersonalizadaType(jt.type)"
                >
                  {{ jt.label }}
                </q-chip>
              </div>
            </div>

            <!-- Regenerate option -->
            <q-checkbox
              v-model="personalizadaRegenerate"
              label="Regenerar sesiones existentes"
              class="q-mb-md"
            />

            <!-- Generate all selected button -->
            <div class="row q-gutter-md">
              <q-btn
                color="primary"
                icon="auto_awesome"
                label="Generar Todo"
                :loading="personalizadaGenerating"
                :disable="selectedPersonalizadaTypes.length === 0"
                @click="handlePersonalizadaGenerateAll"
              />
            </div>
          </q-card-section>
        </q-card>

        <!-- Per-type generation rows -->
        <q-card v-if="isPersonalizadaFutureWeek" flat bordered class="q-mb-md">
          <q-card-section>
            <div class="text-subtitle1 q-mb-md">Generacion por Tipo</div>

            <q-list separator>
              <q-item v-for="jt in allPersonalizadaTypesList" :key="jt.type">
                <q-item-section>
                  <q-item-label>
                    {{ jt.label }}
                    <q-badge
                      :color="PERSONALIZADA_TIER_COLORS[jt.tier]"
                      :label="PERSONALIZADA_TIER_LABELS[jt.tier]"
                      class="q-ml-sm"
                    />
                  </q-item-label>
                </q-item-section>
                <q-item-section side>
                  <div class="row items-center q-gutter-sm">
                    <span
                      v-if="personalizadaResults[jt.type]"
                      class="text-caption"
                      :class="
                        personalizadaResults[jt.type]!.generated > 0 ? 'text-positive' : 'text-grey'
                      "
                    >
                      {{ personalizadaResults[jt.type]!.generated }} generadas
                      <template v-if="personalizadaResults[jt.type]!.skipped > 0">
                        , {{ personalizadaResults[jt.type]!.skipped }} omitidas
                      </template>
                    </span>
                    <q-btn
                      dense
                      flat
                      color="primary"
                      icon="play_arrow"
                      label="Generar"
                      :loading="personalizadaTypeLoading === jt.type"
                      @click="handlePersonalizadaGenerateSingle(jt.type)"
                    />
                  </div>
                </q-item-section>
              </q-item>
            </q-list>
          </q-card-section>
        </q-card>

        <!-- No future week selected -->
        <q-banner v-if="!isPersonalizadaFutureWeek" class="bg-warning text-white q-mt-md">
          <template #avatar>
            <q-icon name="info" />
          </template>
          Selecciona una semana futura para generar sesiones personalizadas.
        </q-banner>
      </q-tab-panel>
    </q-tab-panels>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, defineComponent, h } from 'vue';
import { useQuasar, QIcon } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { formatWeekLabel } from 'src/utils/weekDates';
import {
  useGenerateApi,
  type WeekSummary,
  type GenerateResult,
} from 'src/composables/useGenerateApi';
import { usePersonalizadasAdminApi } from 'src/composables/usePersonalizadasAdminApi';
import {
  ALL_PERSONALIZADA_TYPES,
  PERSONALIZADA_TIER_MAP,
  PERSONALIZADA_TYPE_LABELS,
  PERSONALIZADA_TIER_LABELS,
  PERSONALIZADA_TIER_COLORS,
  type PersonalizadaType,
  type PersonalizadaTier,
  type PersonalizadaGenerateResult,
} from 'src/types/personalizada';

const log = createLogger('GeneratePage');
const $q = useQuasar();
const generateApi = useGenerateApi();
const personalizadaApi = usePersonalizadasAdminApi();

// ============================================================
// Shared state
// ============================================================
const activeTab = ref('general');

// Week selector options: all future weeks until end of cycle (week 52)
const weekOptions = computed(() => {
  const options = [];
  for (let w = currentWeek.value + 1; w <= 52; w++) {
    options.push({ label: formatWeekLabel(w), value: w });
  }
  return options;
});
const currentWeek = ref(1);

// ============================================================
// General tab state (existing)
// ============================================================
const selectedWeek = ref(2);
const weekSummary = ref<WeekSummary | null>(null);
const regenerate = ref(false);
const lastResult = ref<GenerateResult | null>(null);

// Hierarchical generation scope
const generationScope = ref<'week' | 'day' | 'day_level'>('week');
const selectedDay = ref<string>('lunes');
const selectedLevel = ref<string>('alfa_delta');

const scopeOptions = [
  { label: 'Semana Completa', value: 'week' },
  { label: 'Un Dia', value: 'day' },
  { label: 'Dia + Nivel', value: 'day_level' },
];

const dayOptions = [
  { label: 'Lun', value: 'lunes' },
  { label: 'Mar', value: 'martes' },
  { label: 'Mie', value: 'miercoles' },
  { label: 'Jue', value: 'jueves' },
  { label: 'Vie', value: 'viernes' },
  { label: 'Sab', value: 'sabado' },
];

const levelOptions = [
  { label: 'Alfa/Delta', value: 'alfa_delta' },
  { label: 'Sigma', value: 'sigma' },
  { label: 'Omega', value: 'omega' },
];

const summaryColumns = [
  { name: 'day', label: 'Dia', field: 'dayLabel', align: 'left' as const },
  { name: 'alfa_delta', label: 'a/D', field: 'alfa_delta', align: 'center' as const },
  { name: 'sigma', label: 'S', field: 'sigma', align: 'center' as const },
  { name: 'omega', label: 'O', field: 'omega', align: 'center' as const },
];

const summaryRows = computed(() => {
  if (!weekSummary.value) return [];
  const dayLabels: Record<string, string> = {
    lunes: 'Lunes',
    martes: 'Martes',
    miercoles: 'Miercoles',
    jueves: 'Jueves',
    viernes: 'Viernes',
    sabado: 'Sabado',
  };

  return weekSummary.value.days.map((d) => ({
    day: d.day,
    dayLabel: dayLabels[d.day] || d.day,
    alfa_delta: d.levels.find((l) => l.levelGroup === 'alfa_delta')?.status || null,
    sigma: d.levels.find((l) => l.levelGroup === 'sigma')?.status || null,
    omega: d.levels.find((l) => l.levelGroup === 'omega')?.status || null,
  }));
});

const lastResultBannerClass = computed(() => {
  if (!lastResult.value) return '';
  if (lastResult.value.failed && lastResult.value.generated === 0) return 'bg-negative text-white';
  if (lastResult.value.failed) return 'bg-warning text-white';
  return 'bg-positive text-white';
});

const lastResultIcon = computed(() => {
  if (!lastResult.value) return 'check_circle';
  if (lastResult.value.failed && lastResult.value.generated === 0) return 'error';
  if (lastResult.value.failed) return 'warning';
  return 'check_circle';
});

const hasExistingSessionsInScope = computed(() => {
  if (!weekSummary.value) return false;

  if (generationScope.value === 'week') {
    return weekSummary.value.days.some((d) => d.levels.some((l) => l.hasSession));
  } else if (generationScope.value === 'day') {
    const dayData = weekSummary.value.days.find((d) => d.day === selectedDay.value);
    return dayData?.levels.some((l) => l.hasSession) || false;
  } else {
    // day_level
    const dayData = weekSummary.value.days.find((d) => d.day === selectedDay.value);
    const levelData = dayData?.levels.find((l) => l.levelGroup === selectedLevel.value);
    return levelData?.hasSession || false;
  }
});

const isFutureWeek = computed(() => selectedWeek.value > currentWeek.value);

const canGenerate = computed(() => isFutureWeek.value);

const generateButtonLabel = computed(() => {
  if (generationScope.value === 'week') {
    return 'Generar Semana Completa';
  } else if (generationScope.value === 'day') {
    const dayLabel =
      dayOptions.find((d) => d.value === selectedDay.value)?.label || selectedDay.value;
    return `Generar ${dayLabel}`;
  } else {
    const dayLabel =
      dayOptions.find((d) => d.value === selectedDay.value)?.label || selectedDay.value;
    const levelLabel =
      levelOptions.find((l) => l.value === selectedLevel.value)?.label || selectedLevel.value;
    return `Generar ${dayLabel} - ${levelLabel}`;
  }
});

async function loadWeekSummary() {
  if (!selectedWeek.value || selectedWeek.value < 1) {
    weekSummary.value = null;
    return;
  }
  try {
    weekSummary.value = await generateApi.getWeekSummary(selectedWeek.value);
  } catch {
    $q.notify({ type: 'negative', message: 'Error cargando estado de semana' });
  }
}

async function handleGenerate() {
  if (selectedWeek.value <= currentWeek.value) {
    $q.notify({
      type: 'warning',
      message: 'No se pueden generar semanas pasadas o la semana actual',
    });
    return;
  }

  if (hasExistingSessionsInScope.value && regenerate.value) {
    // Confirmation dialog for regeneration (permanent deletion)
    $q.dialog({
      title: 'Confirmar Regeneracion',
      message:
        'Las sesiones existentes se ELIMINARAN permanentemente y se generaran nuevas. Esta accion no se puede deshacer. Continuar?',
      cancel: true,
      persistent: true,
      ok: {
        label: 'Eliminar y Regenerar',
        color: 'negative',
      },
    }).onOk(() => {
      doGenerate();
    });
    return;
  }

  if (hasExistingSessionsInScope.value && !regenerate.value) {
    $q.dialog({
      title: 'Sesiones existentes',
      message: 'Ya existen sesiones para esta seleccion. Activar regeneracion para reemplazarlas?',
      cancel: true,
    }).onOk(() => {
      regenerate.value = true;
      // Show the deletion confirmation
      handleGenerate();
    });
    return;
  }

  doGenerate();
}

async function doGenerate() {
  try {
    const options: {
      week: number;
      days?: string[];
      levelGroups?: string[];
      regenerate: boolean;
    } = {
      week: selectedWeek.value,
      regenerate: regenerate.value,
    };

    // Apply hierarchical scope
    if (generationScope.value === 'day') {
      options.days = [selectedDay.value];
    } else if (generationScope.value === 'day_level') {
      options.days = [selectedDay.value];
      options.levelGroups = [selectedLevel.value];
    }

    lastResult.value = await generateApi.generateWeek(options);
    const hasWarnings = lastResult.value.warnings && lastResult.value.warnings.length > 0;
    const hasFailed = lastResult.value.failed && lastResult.value.failed > 0;
    $q.notify({
      type: hasFailed ? 'warning' : hasWarnings ? 'warning' : 'positive',
      message: hasFailed
        ? `Generadas ${lastResult.value.generated} sesiones. ${lastResult.value.failed} fallaron.`
        : hasWarnings
          ? `Generadas ${lastResult.value.generated} sesiones con advertencias.`
          : `Generadas ${lastResult.value.generated} sesiones`,
    });
    loadWeekSummary();
  } catch {
    $q.notify({ type: 'negative', message: 'Error generando sesiones' });
  }
}

// StatusIndicator inline component
const StatusIndicator = defineComponent({
  props: {
    status: {
      type: String,
      default: null,
    },
    locked: {
      type: Boolean,
      default: false,
    },
  },
  setup(props) {
    return () => {
      if (props.locked) {
        return h(QIcon, {
          name: props.status ? 'lock' : 'remove',
          color: props.status ? 'grey-6' : 'grey-5',
          size: 'sm',
        });
      }

      const iconName =
        props.status === 'approved'
          ? 'check_circle'
          : props.status === 'pending_review'
            ? 'pending'
            : 'remove';

      const iconColor =
        props.status === 'approved'
          ? 'positive'
          : props.status === 'pending_review'
            ? 'warning'
            : 'grey-5';

      return h(QIcon, {
        name: iconName,
        color: iconColor,
        size: 'sm',
      });
    };
  },
});

// ============================================================
// Personalizadas tab state
// ============================================================
const personalizadaWeek = ref(2);
const selectedPersonalizadaTypes = ref<PersonalizadaType[]>([...ALL_PERSONALIZADA_TYPES]);
const personalizadaRegenerate = ref(false);
const personalizadaGenerating = ref(false);
const personalizadaTypeLoading = ref<PersonalizadaType | null>(null);
const personalizadaResults = ref<Record<string, PersonalizadaGenerateResult>>({});

const isPersonalizadaFutureWeek = computed(() => personalizadaWeek.value > currentWeek.value);

interface PersonalizadaTierGroup {
  key: PersonalizadaTier;
  label: string;
  color: string;
  types: Array<{ type: PersonalizadaType; label: string }>;
}

const personalizadaTiers = computed<PersonalizadaTierGroup[]>(() => {
  const tiers: PersonalizadaTier[] = ['principiante', 'intermedio', 'avanzado'];
  return tiers.map((tier) => ({
    key: tier,
    label: PERSONALIZADA_TIER_LABELS[tier],
    color: PERSONALIZADA_TIER_COLORS[tier],
    types: ALL_PERSONALIZADA_TYPES.filter((jt) => PERSONALIZADA_TIER_MAP[jt] === tier).map(
      (jt) => ({
        type: jt,
        label: PERSONALIZADA_TYPE_LABELS[jt],
      })
    ),
  }));
});

const allPersonalizadaTypesList = computed(() =>
  ALL_PERSONALIZADA_TYPES.map((jt) => ({
    type: jt,
    label: PERSONALIZADA_TYPE_LABELS[jt],
    tier: PERSONALIZADA_TIER_MAP[jt],
  }))
);

function togglePersonalizadaType(jt: PersonalizadaType) {
  const idx = selectedPersonalizadaTypes.value.indexOf(jt);
  if (idx >= 0) {
    selectedPersonalizadaTypes.value.splice(idx, 1);
  } else {
    selectedPersonalizadaTypes.value.push(jt);
  }
}

async function handlePersonalizadaGenerateAll() {
  if (selectedPersonalizadaTypes.value.length === 0) return;

  personalizadaGenerating.value = true;
  personalizadaResults.value = {};

  let totalGenerated = 0;
  let totalSkipped = 0;

  try {
    for (const jt of selectedPersonalizadaTypes.value) {
      try {
        const result = await personalizadaApi.generatePersonalizadaSessions(
          personalizadaWeek.value,
          jt,
          {
            regenerate: personalizadaRegenerate.value,
          }
        );
        personalizadaResults.value[jt] = result;
        totalGenerated += result.generated;
        totalSkipped += result.skipped;
      } catch (err: unknown) {
        log.error('Error generating personalizada type', {
          personalizadaType: jt,
          error: err instanceof Error ? err.message : String(err),
        });
        personalizadaResults.value[jt] = { generated: 0, skipped: 0 };
      }
    }

    $q.notify({
      type: 'positive',
      message: `Generadas ${totalGenerated} sesiones de personalizada. ${totalSkipped > 0 ? `${totalSkipped} omitidas.` : ''}`,
    });
  } finally {
    personalizadaGenerating.value = false;
  }
}

async function handlePersonalizadaGenerateSingle(jt: PersonalizadaType) {
  personalizadaTypeLoading.value = jt;
  try {
    const result = await personalizadaApi.generatePersonalizadaSessions(
      personalizadaWeek.value,
      jt,
      {
        regenerate: personalizadaRegenerate.value,
      }
    );
    personalizadaResults.value[jt] = result;
    $q.notify({
      type: 'positive',
      message: `${PERSONALIZADA_TYPE_LABELS[jt]}: ${result.generated} generadas${result.skipped > 0 ? `, ${result.skipped} omitidas` : ''}`,
    });
  } catch {
    $q.notify({ type: 'negative', message: `Error generando ${PERSONALIZADA_TYPE_LABELS[jt]}` });
  } finally {
    personalizadaTypeLoading.value = null;
  }
}

// ============================================================
// Init
// ============================================================
onMounted(async () => {
  try {
    currentWeek.value = await generateApi.getCurrentWeek();
  } catch {
    $q.notify({ type: 'negative', message: 'Error cargando semana actual' });
  }
  selectedWeek.value = currentWeek.value + 1;
  personalizadaWeek.value = currentWeek.value + 1;
  loadWeekSummary();
});
</script>
