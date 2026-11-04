<template>
  <section class="tablero-group q-mb-lg" :aria-label="`Tablero de ${countryName}`">
    <div class="row items-baseline q-gutter-x-sm q-mb-sm">
      <h2 class="text-h6 q-my-none">{{ countryName }}</h2>
      <span class="text-caption tablero-group__currency">{{ currencyLabel }}</span>
    </div>

    <div class="tablero-scroll">
      <q-markup-table flat dense bordered separator="cell" class="tablero-table">
        <thead>
          <tr>
            <th class="text-left">Bloque</th>
            <th class="text-left">Métrica</th>
            <th v-for="branch in group.branches" :key="branch.id" class="text-right">
              {{ branch.name }}
            </th>
            <template v-if="group.hasTotal">
              <th class="text-right tablero-th--total">Total</th>
              <th class="text-right">Semana anterior</th>
              <th class="text-right">▲▼</th>
            </template>
            <th v-if="group.online" class="text-right tablero-th--online">
              {{ group.online.label }}
              <q-icon
                name="info_outline"
                size="14px"
                role="img"
                :aria-label="ONLINE_NOTE"
                tabindex="0"
              >
                <q-tooltip max-width="260px">{{ ONLINE_NOTE }}</q-tooltip>
              </q-icon>
            </th>
          </tr>
        </thead>
        <tbody>
          <template v-for="blockRows in blocksInOrder" :key="blockRows.block">
            <tr
              v-for="(metric, index) in blockRows.metrics"
              :key="metric.key"
              :class="{ 'tablero-row--block-start': index === 0 }"
            >
              <td v-if="index === 0" :rowspan="blockRows.metrics.length" class="tablero-td--block">
                <div class="tablero-block__title">{{ BLOCK_LABELS[blockRows.block] }}</div>
                <div class="tablero-block__chips">
                  <span
                    class="tablero-chip"
                    :class="`tablero-chip--${blockInfo(blockRows.block).current}`"
                  >
                    {{ BLOCK_STATE_LABELS[blockInfo(blockRows.block).current].label }}
                    <q-tooltip max-width="260px">
                      {{ stateTooltip(blockInfo(blockRows.block)) }}
                    </q-tooltip>
                  </span>
                  <span
                    v-if="blockInfo(blockRows.block).capturedLate"
                    class="tablero-chip tablero-chip--late"
                  >
                    Foto tomada el {{ capturedOn(blockInfo(blockRows.block)) }}
                    <q-tooltip max-width="260px">
                      La foto se sacó después del día previsto, así que puede incluir movimientos
                      posteriores al cierre.
                    </q-tooltip>
                  </span>
                </div>
              </td>

              <td class="text-left tablero-td--metric">
                <div class="row items-center no-wrap q-gutter-x-xs">
                  <span>{{ METRIC_LABELS[metric.key] }}</span>
                  <q-icon
                    v-if="METRIC_NOTES[metric.key]"
                    name="info_outline"
                    size="14px"
                    role="img"
                    :aria-label="METRIC_NOTES[metric.key]"
                    tabindex="0"
                    class="tablero-info"
                  >
                    <q-tooltip max-width="300px">{{ METRIC_NOTES[metric.key] }}</q-tooltip>
                  </q-icon>
                  <span
                    v-if="rowStateOverride(metric.key)"
                    class="tablero-chip"
                    :class="`tablero-chip--${rowStateOverride(metric.key)}`"
                  >
                    {{ BLOCK_STATE_LABELS[rowStateOverride(metric.key)!].label }}
                    <q-tooltip max-width="260px">
                      {{ stateTooltip(blocks.main) }}
                    </q-tooltip>
                  </span>
                </div>
                <div v-if="metric.key === 'cobrado'" class="tablero-metric__note">
                  {{ METRIC_NOTES.cobrado }}
                </div>
              </td>

              <td v-for="branch in group.branches" :key="branch.id" class="text-right">
                <TableroLeadsCell
                  v-if="metric.key === 'leads'"
                  :branch-id="branch.id"
                  :week-start="weekStart"
                  :cell="metric.byBranch[String(branch.id)]"
                  :editable="leadsEditable"
                  :saving="saving"
                  @save="(payload) => emit('saveLeads', payload)"
                />
                <TableroCell
                  v-else
                  :metric-key="metric.key"
                  :unit="metric.unit"
                  :currency="group.currency"
                  :cell="metric.byBranch[String(branch.id)]"
                  :danger="isDanger(metric, metric.byBranch[String(branch.id)])"
                />
              </td>

              <template v-if="group.hasTotal">
                <td class="text-right tablero-td--total">
                  <TableroCell
                    :metric-key="metric.key"
                    :unit="metric.unit"
                    :currency="group.currency"
                    :cell="metric.totalByCountry[group.country]"
                    :show-previous="false"
                    :danger="isDanger(metric, metric.totalByCountry[group.country])"
                  />
                </td>
                <td class="text-right">
                  <TableroCell
                    part="previous"
                    :metric-key="metric.key"
                    :unit="metric.unit"
                    :currency="group.currency"
                    :cell="metric.totalByCountry[group.country]"
                  />
                </td>
                <td class="text-right">
                  <TableroCell
                    part="delta"
                    :metric-key="metric.key"
                    :unit="metric.unit"
                    :currency="group.currency"
                    :cell="metric.totalByCountry[group.country]"
                  />
                </td>
              </template>

              <td v-if="group.online" class="text-right tablero-td--online">
                <TableroCell
                  muted
                  :metric-key="metric.key"
                  :unit="metric.unit"
                  :currency="group.currency"
                  :cell="metric.onlineByCountry[group.country]"
                />
              </td>
            </tr>
          </template>
        </tbody>
      </q-markup-table>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type {
  BoardBlockInfo,
  BoardBlockState,
  BoardCell,
  BoardGroup,
  BoardMetric,
  BoardMetricBlock,
  WeeklyBoardResponse,
} from 'src/types/weekly-board';
import {
  BLOCK_LABELS,
  BLOCK_STATE_LABELS,
  METRIC_LABELS,
  METRIC_NOTES,
  ddmm,
} from 'src/utils/weekly-board-format';
import { RENEWALS_TZ } from 'src/utils/renewals-week';
import { formatDateTimeInTz } from 'src/utils/tz';
import TableroCell from './TableroCell.vue';
import TableroLeadsCell from './TableroLeadsCell.vue';

const props = defineProps<{
  group: BoardGroup;
  metrics: BoardMetric[];
  blocks: WeeklyBoardResponse['blocks'];
  weekStart: string;
  leadsEditable: boolean;
  saving: boolean;
}>();

const emit = defineEmits<{
  saveLeads: [payload: { branchId: number; leads: number | null }];
}>();

/** Nombre del grupo por código de país; los que no estén acá muestran el código. */
const COUNTRY_NAMES: Record<string, string> = { AR: 'Argentina', ES: 'España' };
const CURRENCY_LABELS: Record<string, string> = { ARS: 'en pesos', EUR: 'en euros' };
const ONLINE_NOTE = 'Informativa: alumnos online (sede virtual). No suma al Total.';

const countryName = computed(() => COUNTRY_NAMES[props.group.country] ?? props.group.country);
const currencyLabel = computed(() => CURRENCY_LABELS[props.group.currency] ?? props.group.currency);

/** Filas agrupadas por bloque, en el orden en que llegan. */
const blocksInOrder = computed(() => {
  const result: Array<{ block: BoardMetricBlock; metrics: BoardMetric[] }> = [];
  for (const metric of props.metrics) {
    const last = result[result.length - 1];
    if (last && last.block === metric.block) last.metrics.push(metric);
    else result.push({ block: metric.block, metrics: [metric] });
  }
  return result;
});

/** Embudo y Renovaciones se congelan el viernes (`late`); Caja y Alumnos el lunes (`main`). */
function blockInfo(block: BoardMetricBlock): BoardBlockInfo {
  return block === 'embudo' || block === 'renovaciones' ? props.blocks.late : props.blocks.main;
}

/**
 * "Vencen la semana que viene" se congela con `main` aunque esté en el bloque
 * Renovaciones: si su estado difiere del del bloque, se marca en la propia fila.
 */
function rowStateOverride(key: BoardMetric['key']): BoardBlockState | null {
  if (key !== 'vencenSemanaSiguiente') return null;
  return props.blocks.main.current !== props.blocks.late.current ? props.blocks.main.current : null;
}

function stateTooltip(info: BoardBlockInfo): string {
  const text = BLOCK_STATE_LABELS[info.current].tooltip;
  const when = info.freezesOn ? ` el ${ddmm(info.freezesOn)}` : ' pronto';
  return text.replace(' el {fecha}', when);
}

/** "dd/mm" de la foto, en hora de Argentina. */
function capturedOn(info: BoardBlockInfo): string {
  return info.capturedAt ? formatDateTimeInTz(info.capturedAt, RENEWALS_TZ).slice(0, 5) : '';
}

/** "Sin contactar" mayor a 0 se ve en rojo (D-18). */
function isDanger(metric: BoardMetric, cell: BoardCell | undefined): boolean {
  return metric.key === 'sinContactar' && (cell?.value ?? 0) > 0;
}
</script>

<style scoped>
.tablero-group__currency {
  color: #6b6459;
}
.tablero-scroll {
  overflow-x: auto;
}
.tablero-table {
  min-width: 100%;
  color: #3d3732;
}
.tablero-table :deep(table) {
  border-color: #d9cfc1;
}
.tablero-table :deep(th),
.tablero-table :deep(td) {
  border-color: #d9cfc1;
  padding: 4px 10px;
  vertical-align: middle;
}
.tablero-table :deep(thead th) {
  background: #f2ede5;
  color: #3d3732;
  font-weight: 700;
  font-size: 12px;
  white-space: nowrap;
}
.tablero-table :deep(thead th.tablero-th--online) {
  color: #6b6459;
  font-weight: 500;
}
.tablero-row--block-start :deep(td) {
  border-top: 2px solid #8a8472;
}
.tablero-td--block {
  background: #f2ede5;
  vertical-align: top !important;
  min-width: 120px;
}
.tablero-block__title {
  font-weight: 700;
  color: #3d3732;
}
.tablero-block__chips {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  margin-top: 4px;
}
.tablero-td--metric {
  min-width: 200px;
}
.tablero-metric__note {
  font-size: 11px;
  line-height: 1.3;
  color: #6b6459;
  max-width: 260px;
  white-space: normal;
}
.tablero-info {
  color: #6b6459;
}
.tablero-td--total {
  background: #f2ede5;
  font-weight: 600;
}
.tablero-td--online {
  background: #faf8f4;
}
.tablero-chip {
  display: inline-block;
  padding: 1px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.5;
  white-space: nowrap;
  cursor: default;
  border: 1px solid transparent;
}
.tablero-chip--en_curso {
  color: #96593a;
  border-color: #96593a;
  background: #fff;
}
.tablero-chip--provisorio {
  color: #7d6520;
  background: #f7edc9;
}
.tablero-chip--congelado {
  color: #3b7249;
  background: #e3efe5;
}
.tablero-chip--sin_foto {
  color: #6b6459;
  background: #e9e4dc;
}
.tablero-chip--late {
  color: #7d6520;
  border-color: #7d6520;
  background: #fff;
}
</style>
