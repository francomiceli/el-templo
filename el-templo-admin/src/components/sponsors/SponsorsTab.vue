<!-- Pestaña "Patrocinadores" de Partners (Fase 199, D-24/D-25/D-26, D-17).
     Lista por país con orden subir/bajar, activar/desactivar, vigencia y
     métricas (socios únicos que vieron / tocaron / intentaron canjear). El
     límite de activas por país se edita acá. El alta/edición usa
     `SponsorEditorDialog` (un solo formulario, nunca duplicado).

     El gate real "solo El Templo" es el API: un admin de otro gimnasio recibe
     403 y acá se ve un estado vacío claro (sin notify, no es un error).

     Robustez (L17/L22): el toggle de activo es CONTROLADO (`:model-value`),
     así que si el server rechaza (p. ej. límite alcanzado) el interruptor
     queda en su estado real. Reordenar nunca deja la lista en un orden que el
     server no tiene: ante un fallo se revierte lo que alcanzó a guardarse y se
     recarga desde el server. -->
<template>
  <div>
    <div v-if="forbidden" class="text-center q-pa-xl text-grey-7" data-test="sponsors-forbidden">
      <q-icon name="lock" size="32px" class="q-mb-sm" />
      <div class="text-subtitle1">Solo disponible para el equipo de El Templo</div>
    </div>

    <template v-else>
      <div class="row items-start q-mb-md q-col-gutter-md">
        <div class="col-12 col-md">
          <div class="text-subtitle1 text-weight-medium">Patrocinadores de Mi Templo</div>
          <div class="text-caption text-grey-7">
            Marcas que dan beneficios a nuestros socios en Mi Templo. No son Partners: los partners
            nos traen socios nuevos.
          </div>
        </div>
        <div class="col-12 col-md-auto">
          <q-btn
            color="primary"
            icon="add"
            label="Nuevo patrocinador"
            unelevated
            no-caps
            @click="openCreate"
          />
        </div>
      </div>

      <div class="row items-center q-gutter-md q-mb-md">
        <q-input
          v-model.number="limitInput"
          type="number"
          label="Límite de activas por país"
          dense
          outlined
          min="1"
          max="50"
          style="width: 220px"
          :error="limitInput !== null && !limitValid"
          error-message="Entre 1 y 50"
          hide-bottom-space
        />
        <q-btn
          color="primary"
          label="Guardar"
          unelevated
          no-caps
          :disable="!limitValid || limitInput === maxActivePerCountry"
          :loading="savingLimit"
          @click="saveLimit"
        />
        <div class="text-caption text-grey-7">
          Activas: AR {{ activeCount('AR') }}/{{ maxActivePerCountry }} · ES
          {{ activeCount('ES') }}/{{ maxActivePerCountry }}
        </div>
      </div>

      <q-tabs
        v-model="countryTab"
        dense
        align="left"
        active-color="primary"
        indicator-color="primary"
        class="q-mb-sm"
      >
        <q-tab name="AR" label="Argentina" />
        <q-tab name="ES" label="España" />
      </q-tabs>

      <q-table
        :rows="rowsForCountry"
        :columns="columns"
        row-key="id"
        :loading="loading"
        hide-pagination
        :rows-per-page-options="[0]"
        :pagination="{ rowsPerPage: 0 }"
        flat
        bordered
      >
        <template #no-data>
          <div class="full-width text-center text-grey-7 q-pa-md">
            Todavía no hay patrocinadores para {{ countryLabel(countryTab) }}.
          </div>
        </template>

        <template #body-cell-orden="cell">
          <q-td :props="cell" auto-width>
            <q-btn
              flat
              round
              dense
              icon="arrow_upward"
              :disable="!canMoveUp(cell.row) || reorderingId !== null"
              @click="move(cell.row, 'up')"
            >
              <q-tooltip>Subir</q-tooltip>
            </q-btn>
            <q-btn
              flat
              round
              dense
              icon="arrow_downward"
              :disable="!canMoveDown(cell.row) || reorderingId !== null"
              @click="move(cell.row, 'down')"
            >
              <q-tooltip>Bajar</q-tooltip>
            </q-btn>
          </q-td>
        </template>

        <template #body-cell-marca="cell">
          <q-td :props="cell">
            <div class="row items-center no-wrap q-gutter-x-sm">
              <span
                class="sp-brand-chip"
                :style="{ background: cell.row.bgColor, color: cell.row.textColor }"
              >
                <img
                  v-if="cell.row.logoUrl"
                  :src="cell.row.logoUrl"
                  alt=""
                  class="sp-brand-chip__img"
                />
                <q-icon v-else-if="cell.row.icon" :name="cell.row.icon" size="16px" />
                <template v-else>{{ monogram(cell.row.name) }}</template>
              </span>
              <div>
                <div class="text-weight-medium">{{ cell.row.name }}</div>
                <div class="text-caption text-grey-7">{{ cell.row.category }}</div>
              </div>
            </div>
          </q-td>
        </template>

        <template #body-cell-beneficio="cell">
          <q-td :props="cell">
            <div class="text-weight-medium">{{ cell.row.benefit }}</div>
            <div class="text-caption text-grey-7">{{ cell.row.detail }}</div>
          </q-td>
        </template>

        <template #body-cell-canje="cell">
          <q-td :props="cell">{{ redeemLabel(cell.row) }}</q-td>
        </template>

        <template #body-cell-paises="cell">
          <q-td :props="cell">
            <q-chip v-for="c in cell.row.countries" :key="c" dense size="sm" :label="c" />
          </q-td>
        </template>

        <template #body-cell-vigencia="cell">
          <q-td :props="cell">{{ vigenciaText(cell.row) }}</q-td>
        </template>

        <template #body-cell-activo="cell">
          <q-td :props="cell" auto-width>
            <q-toggle
              :model-value="cell.row.isActive"
              color="primary"
              :disable="togglingId !== null"
              @update:model-value="(val: boolean) => toggleActive(cell.row, val)"
            />
          </q-td>
        </template>

        <template #body-cell-views="cell">
          <q-td :props="cell" auto-width>
            {{ cell.row.views }}
            <q-tooltip>Socios únicos</q-tooltip>
          </q-td>
        </template>

        <template #body-cell-taps="cell">
          <q-td :props="cell" auto-width>
            {{ cell.row.taps }}
            <q-tooltip>Socios únicos</q-tooltip>
          </q-td>
        </template>

        <template #body-cell-redeems="cell">
          <q-td :props="cell" auto-width>
            {{ cell.row.redeems }}
            <q-tooltip>Socios únicos</q-tooltip>
          </q-td>
        </template>

        <template #body-cell-acciones="cell">
          <q-td :props="cell" auto-width>
            <q-btn flat dense round icon="edit" color="primary" @click="openEdit(cell.row)">
              <q-tooltip>Editar</q-tooltip>
            </q-btn>
            <q-btn flat dense round icon="delete" color="negative" @click="confirmRemove(cell.row)">
              <q-tooltip>Borrar</q-tooltip>
            </q-btn>
          </q-td>
        </template>
      </q-table>
    </template>

    <SponsorEditorDialog
      v-model="editorOpen"
      :sponsor="editing"
      :prefill="activePrefill"
      :max-active-per-country="maxActivePerCountry"
      @saved="load(true)"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useQuasar, type QTableProps } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { extractError } from 'src/utils/extract-error';
import { monogram } from 'src/utils/sponsors';
import {
  isForbidden,
  useSponsorsApi,
  type AdminSponsor,
  type SponsorCountry,
} from 'src/composables/useSponsorsApi';
import SponsorEditorDialog, {
  type SponsorPrefill,
} from 'src/components/sponsors/SponsorEditorDialog.vue';

const log = createLogger('SponsorsTab');
const $q = useQuasar();
const sponsorsApi = useSponsorsApi();

const props = defineProps<{ prefill: SponsorPrefill | null }>();
const emit = defineEmits<{ 'prefill-consumed': [] }>();

const DEFAULT_MAX_ACTIVE = 6;

const sponsors = ref<AdminSponsor[]>([]);
const maxActivePerCountry = ref(DEFAULT_MAX_ACTIVE);
const limitInput = ref<number | null>(DEFAULT_MAX_ACTIVE);
const loading = ref(false);
const forbidden = ref(false);
const savingLimit = ref(false);
const reorderingId = ref<number | null>(null);
const togglingId = ref<number | null>(null);
const editorOpen = ref(false);
const editing = ref<AdminSponsor | null>(null);
// Copia local del prefill: el padre lo limpia apenas se consume, pero el editor
// lo lee recién al abrirse, así que se conserva hasta que el diálogo se cierra.
const activePrefill = ref<SponsorPrefill | null>(null);
const countryTab = ref<SponsorCountry>('AR');

const columns: QTableProps['columns'] = [
  { name: 'orden', label: 'Orden', field: 'sortOrder', align: 'left' },
  { name: 'marca', label: 'Marca', field: 'name', align: 'left' },
  { name: 'beneficio', label: 'Beneficio', field: 'benefit', align: 'left' },
  { name: 'canje', label: 'Canje', field: 'redeemType', align: 'left' },
  { name: 'paises', label: 'Países', field: 'countries', align: 'left' },
  { name: 'vigencia', label: 'Vigencia', field: 'startsOn', align: 'left' },
  { name: 'activo', label: 'Activo', field: 'isActive', align: 'center' },
  { name: 'views', label: 'Vieron', field: 'views', align: 'right' },
  { name: 'taps', label: 'Tocaron', field: 'taps', align: 'right' },
  { name: 'redeems', label: 'Canjes', field: 'redeems', align: 'right' },
  { name: 'acciones', label: 'Acciones', field: 'id', align: 'center' },
];

// ── Carga ───────────────────────────────────────────────────────────────

async function load(silent = false): Promise<void> {
  if (!silent) loading.value = true;
  try {
    const result = await sponsorsApi.list();
    sponsors.value = result.sponsors;
    maxActivePerCountry.value = result.maxActivePerCountry;
    limitInput.value = result.maxActivePerCountry;
    forbidden.value = false;
  } catch (err: unknown) {
    if (isForbidden(err)) {
      forbidden.value = true;
      return;
    }
    const message = extractError(err, 'Error cargando los patrocinadores');
    log.error('Error loading sponsors', { error: message });
    $q.notify({ type: 'negative', message });
  } finally {
    loading.value = false;
  }
}

// ── Lista por país ──────────────────────────────────────────────────────

function sortedFor(country: SponsorCountry): AdminSponsor[] {
  return sponsors.value
    .filter((s) => s.countries.includes(country))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
}

const rowsForCountry = computed(() => sortedFor(countryTab.value));

function activeCount(country: SponsorCountry): number {
  return sponsors.value.filter((s) => s.isActive && s.countries.includes(country)).length;
}

function countryLabel(country: SponsorCountry): string {
  return country === 'AR' ? 'Argentina' : 'España';
}

function redeemLabel(row: AdminSponsor): string {
  return row.redeemType === 'code' && row.redeemCode ? `Código ${row.redeemCode}` : 'Carnet';
}

/** `YYYY-MM-DD` → `dd/mm` (formato corto de la tabla). */
function shortDate(iso: string): string {
  const [, month, day] = iso.split('-');
  return `${day}/${month}`;
}

function vigenciaText(row: AdminSponsor): string {
  if (row.startsOn && row.endsOn) return `${shortDate(row.startsOn)} → ${shortDate(row.endsOn)}`;
  if (row.startsOn) return `desde ${shortDate(row.startsOn)}`;
  if (row.endsOn) return `hasta ${shortDate(row.endsOn)}`;
  return 'Siempre';
}

// ── Límite de activas (D-24) ────────────────────────────────────────────

const limitValid = computed(
  () =>
    typeof limitInput.value === 'number' &&
    Number.isInteger(limitInput.value) &&
    limitInput.value >= 1 &&
    limitInput.value <= 50
);

async function saveLimit(): Promise<void> {
  if (!limitValid.value || limitInput.value === null) return;
  savingLimit.value = true;
  try {
    const result = await sponsorsApi.updateSettings(limitInput.value);
    maxActivePerCountry.value = result.maxActivePerCountry;
    limitInput.value = result.maxActivePerCountry;
    $q.notify({ type: 'positive', message: 'Límite guardado' });
  } catch (err: unknown) {
    const message = extractError(err, 'No se pudo guardar el límite');
    log.error('Error saving sponsors limit', { error: message });
    $q.notify({ type: 'negative', message });
    limitInput.value = maxActivePerCountry.value;
  } finally {
    savingLimit.value = false;
  }
}

// ── Activar / desactivar ────────────────────────────────────────────────

async function toggleActive(row: AdminSponsor, isActive: boolean): Promise<void> {
  togglingId.value = row.id;
  try {
    await sponsorsApi.update(row.id, { isActive });
    await load(true);
  } catch (err: unknown) {
    // El server puede rechazar (p. ej. límite de activas por país): el toggle
    // es controlado y `row.isActive` no se tocó, así que queda como estaba.
    const message = extractError(err, 'No se pudo cambiar el estado del patrocinador');
    log.error('Error toggling sponsor', { error: message, sponsorId: row.id });
    $q.notify({ type: 'negative', message });
  } finally {
    togglingId.value = null;
  }
}

// ── Orden (subir/bajar dentro del país visible) ─────────────────────────

function canMoveUp(row: AdminSponsor): boolean {
  return rowsForCountry.value.findIndex((s) => s.id === row.id) > 0;
}

function canMoveDown(row: AdminSponsor): boolean {
  const idx = rowsForCountry.value.findIndex((s) => s.id === row.id);
  return idx >= 0 && idx < rowsForCountry.value.length - 1;
}

/**
 * Nuevos `sortOrder` para el orden pedido: reparte los valores que ya tenía la
 * lista (ordenados) sobre el nuevo orden y los fuerza estrictamente crecientes,
 * así también funciona si dos marcas comparten `sortOrder` (un swap simple no
 * movería nada). Devuelve solo las marcas cuyo valor cambia.
 */
function planReorder(reordered: AdminSponsor[]): Array<{ sponsor: AdminSponsor; next: number }> {
  const values = reordered.map((s) => s.sortOrder).sort((a, b) => a - b);
  const plan: Array<{ sponsor: AdminSponsor; next: number }> = [];
  let prev = Number.NEGATIVE_INFINITY;
  reordered.forEach((sponsor, i) => {
    const next = Math.max(values[i] ?? 0, prev + 1);
    prev = next;
    if (next !== sponsor.sortOrder) plan.push({ sponsor, next });
  });
  return plan;
}

async function move(row: AdminSponsor, direction: 'up' | 'down'): Promise<void> {
  const list = rowsForCountry.value;
  const idx = list.findIndex((s) => s.id === row.id);
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (idx < 0 || swapIdx < 0 || swapIdx >= list.length) return;

  const reordered = [...list];
  const [moved] = reordered.splice(idx, 1);
  if (!moved) return;
  reordered.splice(swapIdx, 0, moved);
  const plan = planReorder(reordered);
  if (plan.length === 0) return;

  reorderingId.value = row.id;
  try {
    const results = await Promise.allSettled(
      plan.map((p) => sponsorsApi.update(p.sponsor.id, { sortOrder: p.next }))
    );
    const failed = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
    if (failed) {
      // Falla parcial: se devuelven a su valor anterior las que sí se guardaron
      // para no dejar un orden a medias (best-effort) y se recarga del server.
      await Promise.allSettled(
        plan
          .filter((_, i) => results[i]?.status === 'fulfilled')
          .map((p) => sponsorsApi.update(p.sponsor.id, { sortOrder: p.sponsor.sortOrder }))
      );
      const message = extractError(failed.reason, 'No se pudo reordenar');
      log.error('Error reordering sponsors', { error: message, sponsorId: row.id });
      $q.notify({ type: 'negative', message: `No se pudo reordenar: ${message}` });
    }
  } finally {
    // Siempre se recarga: la lista muestra el orden que el server realmente tiene.
    await load(true);
    reorderingId.value = null;
  }
}

// ── Alta / edición / borrado ────────────────────────────────────────────

function openCreate(): void {
  editing.value = null;
  activePrefill.value = null;
  editorOpen.value = true;
}

function openEdit(row: AdminSponsor): void {
  editing.value = row;
  activePrefill.value = null;
  editorOpen.value = true;
}

watch(editorOpen, (open) => {
  if (!open) activePrefill.value = null;
});

// Atajo desde un partner: abre el editor en modo alta con el prefill.
watch(
  () => props.prefill,
  (prefill) => {
    if (!prefill) return;
    editing.value = null;
    activePrefill.value = prefill;
    editorOpen.value = true;
    emit('prefill-consumed');
  },
  { immediate: true }
);

function confirmRemove(row: AdminSponsor): void {
  $q.dialog({
    title: 'Borrar patrocinador',
    message: `¿Borrar ${row.name}? Se pierden sus métricas.`,
    cancel: { label: 'Cancelar', flat: true },
    ok: { label: 'Borrar', color: 'negative', unelevated: true },
    persistent: true,
  }).onOk(() => {
    void handleRemove(row);
  });
}

async function handleRemove(row: AdminSponsor): Promise<void> {
  try {
    await sponsorsApi.remove(row.id);
    $q.notify({ type: 'positive', message: 'Patrocinador borrado' });
    await load(true);
  } catch (err: unknown) {
    const message = extractError(err, 'No se pudo borrar el patrocinador');
    log.error('Error deleting sponsor', { error: message, sponsorId: row.id });
    $q.notify({ type: 'negative', message });
  }
}

onMounted(() => {
  void load();
});
</script>

<style lang="scss" scoped>
.sp-brand-chip {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.7rem;
  font-weight: 800;
  flex-shrink: 0;
  overflow: hidden;
}

.sp-brand-chip__img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
</style>
