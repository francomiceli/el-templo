<template>
  <q-page class="q-pa-md">
    <div class="text-h5 q-mb-md">Generar Sesiones</div>

    <!-- Week selector - ONLY FUTURE WEEKS (currentWeek + 1 minimum) -->
    <q-card flat bordered class="q-mb-md">
      <q-card-section>
        <div class="row items-center q-gutter-md">
          <q-input
            v-model.number="selectedWeek"
            type="number"
            label="Semana"
            :min="1"
            max="52"
            outlined
            dense
            style="width: 100px"
            @update:model-value="loadWeekSummary"
          />
          <span class="text-caption text-grey">
            Semana actual: {{ currentWeek }} (solo semanas futuras)
          </span>
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
        <div class="text-subtitle1 q-mb-md">Estado de Semana {{ selectedWeek }}</div>

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
        <q-checkbox v-model="regenerate" label="Regenerar sesiones existentes (se eliminaran permanentemente)" />
      </q-card-section>
    </q-card>

    <!-- Generate result -->
    <q-banner v-if="lastResult" class="bg-positive text-white q-mt-md">
      <template #avatar>
        <q-icon name="check_circle" />
      </template>
      Generadas: {{ lastResult.generated }} sesiones.
      <span v-if="lastResult.skipped > 0">
        Omitidas: {{ lastResult.skipped }} (ya existian).
      </span>
    </q-banner>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, defineComponent, h } from 'vue';
import { useQuasar, QIcon } from 'quasar';
import { useGenerateApi, type WeekSummary, type GenerateResult } from 'src/composables/useGenerateApi';

const $q = useQuasar();
const generateApi = useGenerateApi();

const currentWeek = ref(1); // TODO: Fetch from SPOM config
const selectedWeek = ref(2); // Default to next week (currentWeek + 1)
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

  return weekSummary.value.days.map(d => ({
    day: d.day,
    dayLabel: dayLabels[d.day] || d.day,
    alfa_delta: d.levels.find(l => l.levelGroup === 'alfa_delta')?.status || null,
    sigma: d.levels.find(l => l.levelGroup === 'sigma')?.status || null,
    omega: d.levels.find(l => l.levelGroup === 'omega')?.status || null,
  }));
});

const hasExistingSessionsInScope = computed(() => {
  if (!weekSummary.value) return false;

  if (generationScope.value === 'week') {
    return weekSummary.value.days.some(d => d.levels.some(l => l.hasSession));
  } else if (generationScope.value === 'day') {
    const dayData = weekSummary.value.days.find(d => d.day === selectedDay.value);
    return dayData?.levels.some(l => l.hasSession) || false;
  } else {
    // day_level
    const dayData = weekSummary.value.days.find(d => d.day === selectedDay.value);
    const levelData = dayData?.levels.find(l => l.levelGroup === selectedLevel.value);
    return levelData?.hasSession || false;
  }
});

const isFutureWeek = computed(() => selectedWeek.value > currentWeek.value);

const canGenerate = computed(() => isFutureWeek.value);

const generateButtonLabel = computed(() => {
  if (generationScope.value === 'week') {
    return 'Generar Semana Completa';
  } else if (generationScope.value === 'day') {
    const dayLabel = dayOptions.find(d => d.value === selectedDay.value)?.label || selectedDay.value;
    return `Generar ${dayLabel}`;
  } else {
    const dayLabel = dayOptions.find(d => d.value === selectedDay.value)?.label || selectedDay.value;
    const levelLabel = levelOptions.find(l => l.value === selectedLevel.value)?.label || selectedLevel.value;
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
    $q.notify({ type: 'warning', message: 'No se pueden generar semanas pasadas o la semana actual' });
    return;
  }

  if (hasExistingSessionsInScope.value && regenerate.value) {
    // Confirmation dialog for regeneration (permanent deletion)
    $q.dialog({
      title: 'Confirmar Regeneracion',
      message: 'Las sesiones existentes se ELIMINARAN permanentemente y se generaran nuevas. Esta accion no se puede deshacer. Continuar?',
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
    $q.notify({
      type: 'positive',
      message: `Generadas ${lastResult.value.generated} sesiones`,
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

      const iconName = props.status === 'approved'
        ? 'check_circle'
        : props.status === 'pending_review'
        ? 'pending'
        : 'remove';

      const iconColor = props.status === 'approved'
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

onMounted(() => {
  // TODO: Fetch current SPOM week from API
  selectedWeek.value = currentWeek.value;
  loadWeekSummary();
});
</script>
