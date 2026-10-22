<!--
  Evolución del alumno en la ficha de Conquer (fase 201, §6, §7.2, D-08): el día 0 y el último
  control lado a lado, con una pose a la vez (Frente, Perfil, Espalda), la tabla de medidas con la
  diferencia y las banderas de publicación del alumno ("Autorizó publicar", "Sin cara"). Las fotos
  son privadas: ConquerPhoto pide la URL firmada de la pose visible y no la guarda ni la loguea.
  El par es el que arma el API (`compare`: el control con contenido más viejo contra el más nuevo).
  Las banderas no vienen en la ficha: se leen de la galería (un alumno sin controles con contenido
  no aparece y las banderas no se muestran).
-->
<template>
  <div>
    <q-banner dense rounded class="bg-grey-3 text-accent q-mb-md">
      <template #avatar><q-icon name="lock" color="secondary" /></template>
      Fotos privadas: solo las ven el alumno, el dueño y los administradores.
    </q-banner>

    <div v-if="loading && !data" class="text-center q-pa-lg">
      <q-spinner size="28px" color="secondary" />
    </div>

    <q-banner v-else-if="loadError && !data" dense rounded class="bg-grey-3 text-accent">
      {{ loadError }}
      <template #action>
        <q-btn flat no-caps color="secondary" label="Reintentar" @click="load" />
      </template>
    </q-banner>

    <template v-else-if="data">
      <div v-if="flags" class="row q-gutter-xs q-mb-md" data-test="conquer-evolution-flags">
        <q-chip
          dense
          square
          :color="flags.publishEnabled ? 'secondary' : 'grey-3'"
          :text-color="flags.publishEnabled ? 'white' : 'accent'"
          class="q-ma-none q-mr-xs"
        >
          {{ flags.publishEnabled ? 'Autorizó publicar' : 'No autorizó publicar' }}
        </q-chip>
        <q-chip
          v-if="flags.publishEnabled && flags.publishNoFace"
          dense
          square
          outline
          color="accent"
        >
          Sin cara
        </q-chip>
      </div>

      <div v-if="!before" class="text-grey-8 q-pa-sm" data-test="conquer-evolution-empty">
        Todavía no hizo el control físico.
      </div>

      <template v-else>
        <div class="text-body2 q-mb-sm" data-test="conquer-evolution-weeks">
          <template v-if="data.compare">
            <q-icon name="schedule" class="q-mr-xs" />
            {{ weeksText(data.compare.weeks) }} entre los dos controles ({{
              formatDate(before.checkDate)
            }}
            → {{ formatDate(after?.checkDate ?? before.checkDate) }})
          </template>
          <template v-else>
            Un solo control hasta ahora ({{ formatDate(before.checkDate) }}). Con el segundo se arma
            la comparación.
          </template>
        </div>

        <!-- Medidas -->
        <q-markup-table flat bordered dense separator="horizontal" class="q-mb-md">
          <thead>
            <tr>
              <th class="text-left">Medida</th>
              <th class="text-right">{{ after ? 'Antes' : 'Día 0' }}</th>
              <th v-if="after" class="text-right">Después</th>
              <th v-if="after" class="text-right">Diferencia</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="m in measureRows" :key="m.key">
              <td class="text-left">{{ m.label }}</td>
              <td class="text-right">{{ measureText(m.from, m.unit) }}</td>
              <td v-if="after" class="text-right">{{ measureText(m.to, m.unit) }}</td>
              <td v-if="after" class="text-right text-weight-medium">
                {{ diffText(m.diff, m.unit) }}
              </td>
            </tr>
          </tbody>
        </q-markup-table>

        <!-- Fotos: una pose a la vez, solo se piden las de la pose visible -->
        <template v-if="poses.length > 0 && pose">
          <q-tabs
            v-model="pose"
            dense
            align="left"
            no-caps
            active-color="secondary"
            indicator-color="secondary"
            class="text-grey-8"
          >
            <q-tab v-for="p in poses" :key="p" :name="p" :label="POSE_LABELS[p]" />
          </q-tabs>
          <q-separator class="q-mb-md" />

          <div class="row q-col-gutter-md">
            <div v-for="side in sides" :key="side.key" class="col-12 col-sm-6">
              <div class="text-caption text-grey-8 q-mb-xs">
                {{ side.label }} · {{ formatDate(side.check.checkDate) }}
              </div>
              <ConquerPhoto
                v-if="side.check.photos[pose]"
                :key="`${side.check.id}-${pose}`"
                :user-id="userId"
                :check-id="side.check.id"
                :pose="pose"
                :alt="`Foto de ${POSE_LABELS[pose].toLowerCase()}, ${side.label.toLowerCase()}`"
              />
              <div v-else class="conquer-nophoto text-grey-8 text-body2">
                Sin foto de {{ POSE_LABELS[pose].toLowerCase() }} en este control.
              </div>
            </div>
          </div>
        </template>
        <div v-else class="text-grey-8">Estos controles no tienen fotos.</div>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import ConquerPhoto from 'src/components/conquer/ConquerPhoto.vue';
import { useConquerAdminApi } from 'src/composables/useConquerAdminApi';
import type { BodyCheckView, BodyChecksResponse, GalleryItem, Pose } from 'src/types/conquer';
import {
  POSE_LABELS,
  checkHasContent,
  diffText,
  measureText,
  posesWithPhotos,
  weeksText,
} from 'src/utils/conquer-format';
import { formatDate } from 'src/utils/format-date';

const props = defineProps<{
  userId: number;
}>();

const conquerApi = useConquerAdminApi();

const data = ref<BodyChecksResponse | null>(null);
const loading = ref(false);
const loadError = ref<string | null>(null);
const flags = ref<Pick<GalleryItem, 'publishEnabled' | 'publishNoFace'> | null>(null);
const pose = ref<Pose | null>(null);

interface MeasureRow {
  key: string;
  label: string;
  unit: 'cm' | 'kg';
  from: number | null;
  to: number | null;
  diff: number | null;
}

// El control de hoy puede venir vacío: solo cuentan los que tienen fotos o medidas.
const contentChecks = computed<BodyCheckView[]>(() =>
  (data.value?.checks ?? []).filter(checkHasContent)
);

function checkById(id: number): BodyCheckView | null {
  return (data.value?.checks ?? []).find((c) => c.id === id) ?? null;
}

// "Antes" = el par del API (más viejo con contenido); sin par y con un solo control, ese control.
const before = computed<BodyCheckView | null>(() => {
  const compare = data.value?.compare;
  if (compare) return checkById(compare.from.id);
  return contentChecks.value[0] ?? null;
});
const after = computed<BodyCheckView | null>(() => {
  const compare = data.value?.compare;
  return compare ? checkById(compare.to.id) : null;
});

const sides = computed(() => {
  const list: { key: string; label: string; check: BodyCheckView }[] = [];
  if (before.value)
    list.push({ key: 'from', label: after.value ? 'Antes' : 'Día 0', check: before.value });
  if (after.value) list.push({ key: 'to', label: 'Después', check: after.value });
  return list;
});

const poses = computed(() => posesWithPhotos([before.value, after.value]));

const MEASURE_FIELDS: {
  key: string;
  label: string;
  unit: 'cm' | 'kg';
  pick: (c: BodyCheckView) => number | null;
}[] = [
  { key: 'arm', label: 'Brazo', unit: 'cm', pick: (c) => c.armCm },
  { key: 'chest', label: 'Pecho', unit: 'cm', pick: (c) => c.chestCm },
  { key: 'shoulders', label: 'Hombros', unit: 'cm', pick: (c) => c.shouldersCm },
  { key: 'waist', label: 'Cintura', unit: 'cm', pick: (c) => c.waistCm },
  { key: 'weight', label: 'Peso', unit: 'kg', pick: (c) => c.weightKg },
];

// Con comparación, las filas salen del API (la diferencia la calcula el servidor); con un solo
// control se arman desde sus campos, sin diferencia.
const measureRows = computed<MeasureRow[]>(() => {
  const compare = data.value?.compare;
  if (compare) {
    return compare.measures.map((m) => ({
      key: m.key,
      label: m.label,
      unit: m.key === 'weight' ? 'kg' : 'cm',
      from: m.from,
      to: m.to,
      diff: m.diff,
    }));
  }
  const single = before.value;
  if (!single) return [];
  return MEASURE_FIELDS.map((f) => ({
    key: f.key,
    label: f.label,
    unit: f.unit,
    from: f.pick(single),
    to: null,
    diff: null,
  }));
});

// Si la pose elegida ya no tiene foto en el par (o no hay ninguna elegida), pasa a la primera.
watch(
  poses,
  (available) => {
    if (pose.value === null || !available.includes(pose.value)) pose.value = available[0] ?? null;
  },
  { immediate: true }
);

async function loadFlags(): Promise<void> {
  try {
    const gallery = await conquerApi.getGallery();
    const item = gallery.items.find((i) => i.userId === props.userId);
    flags.value = item
      ? { publishEnabled: item.publishEnabled, publishNoFace: item.publishNoFace }
      : null;
  } catch {
    // Las banderas son un extra: si la galería falla, la evolución se muestra igual.
    flags.value = null;
  }
}

async function load(): Promise<void> {
  loading.value = true;
  loadError.value = null;
  try {
    data.value = await conquerApi.getMemberBodyChecks(props.userId);
    void loadFlags();
  } catch (err: unknown) {
    loadError.value =
      err instanceof Error ? err.message : 'No pudimos cargar los controles del alumno';
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<style scoped lang="scss">
.conquer-nophoto {
  min-height: 220px;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  background: $grey-2;
  border-radius: 4px;
}
</style>
