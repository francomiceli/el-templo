<template>
  <div>
    <!-- ================================================================== -->
    <!-- Integraciones de medición apagadas (no se muestra si están todas) -->
    <!-- ================================================================== -->
    <IntegracionesApagadasCard :integrations="result?.integrations ?? []" />

    <!-- ================================================================== -->
    <!-- Encabezado -->
    <!-- ================================================================== -->
    <div class="text-caption text-grey-7 q-mb-sm">
      De dónde salen los alumnos que pagan y cuánto cuesta cada uno: registro → prueba → pago →
      facturación, por canal, campaña y sede. Las altas se cuentan por fecha de registro; los pagos,
      hasta hoy.
    </div>

    <!-- ================================================================== -->
    <!-- Filtros: rango de fechas + agrupación -->
    <!-- ================================================================== -->
    <div class="row q-col-gutter-sm q-mb-md items-end">
      <div class="col-auto">
        <q-btn-dropdown outline :label="dateRangeLabel" icon="date_range" dense>
          <q-list dense>
            <q-item
              v-for="preset in DATE_PRESETS"
              :key="preset.label"
              v-close-popup
              clickable
              :active="presetLabel === preset.label"
              @click="applyPreset(preset)"
            >
              <q-item-section>{{ preset.label }}</q-item-section>
            </q-item>
            <q-separator />
            <q-item clickable @click="showCustomRange = !showCustomRange">
              <q-item-section>Personalizado</q-item-section>
              <q-item-section side>
                <q-icon :name="showCustomRange ? 'expand_less' : 'expand_more'" />
              </q-item-section>
            </q-item>
            <template v-if="showCustomRange">
              <q-item>
                <q-item-section>
                  <q-input v-model="customFrom" type="date" label="Desde" dense outlined />
                </q-item-section>
              </q-item>
              <q-item>
                <q-item-section>
                  <q-input v-model="customTo" type="date" label="Hasta" dense outlined />
                </q-item-section>
              </q-item>
              <q-item>
                <q-item-section>
                  <q-btn
                    v-close-popup
                    label="Aplicar"
                    color="primary"
                    dense
                    flat
                    :disable="!isCustomRangeValid"
                    @click="applyCustomRange"
                  />
                </q-item-section>
              </q-item>
            </template>
          </q-list>
        </q-btn-dropdown>
      </div>
      <div class="col-auto">
        <q-btn-toggle
          v-model="groupBy"
          :options="GROUP_OPTIONS"
          dense
          no-caps
          unelevated
          toggle-color="primary"
          color="grey-3"
          text-color="grey-8"
        />
      </div>
    </div>

    <q-banner v-if="errorMessage" class="bg-red-1 text-negative q-mb-md" rounded>
      {{ errorMessage }}
    </q-banner>

    <!-- ================================================================== -->
    <!-- Embudo -->
    <!-- ================================================================== -->
    <q-card flat bordered class="q-mb-md">
      <q-inner-loading :showing="loading" />
      <q-markup-table flat dense separator="horizontal" data-test="funnel-table">
        <thead>
          <tr>
            <th v-if="showChannel" class="text-left">Canal</th>
            <th v-if="showCampaign" class="text-left">Campaña</th>
            <th v-if="showBranch" class="text-left">Sede</th>
            <th class="text-right">Registros</th>
            <th class="text-right">Con prueba</th>
            <th class="text-right">Pagaron</th>
            <th class="text-right">% pago</th>
            <th class="text-right">Facturación</th>
            <th class="text-right">
              Gasto
              <q-icon name="info_outline" size="14px" color="grey-6">
                <q-tooltip max-width="280px">
                  El gasto de Meta es de campaña: una campaña trae alumnos a varias sedes. En la
                  vista por sede solo aparece para campañas cuyo nombre incluye la sede.
                </q-tooltip>
              </q-icon>
            </th>
            <th class="text-right">Costo por alumno pago</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in tableRows" :key="row.key">
            <td v-if="showChannel" class="text-left">{{ row.channel }}</td>
            <td v-if="showCampaign" class="text-left">{{ row.campaign }}</td>
            <td v-if="showBranch" class="text-left">{{ row.branch }}</td>
            <td class="text-right">{{ row.registros }}</td>
            <td class="text-right">{{ row.conPrueba }}</td>
            <td class="text-right">{{ row.pagaron }}</td>
            <td class="text-right">{{ formatRate(row.pagaron, row.registros) }}</td>
            <td class="text-right">
              <MoneyLines :items="row.facturacion" />
            </td>
            <td class="text-right">
              <MoneyLines :items="row.gasto" />
            </td>
            <td class="text-right">
              <MoneyLines :items="row.costo" />
            </td>
          </tr>
          <tr v-if="!loading && tableRows.length === 0">
            <td :colspan="columnCount" class="text-center text-grey-6 q-pa-lg">
              Sin altas en este período
            </td>
          </tr>
        </tbody>
        <tfoot v-if="result && tableRows.length > 0">
          <tr class="text-weight-bold bg-grey-2">
            <td :colspan="labelColumns" class="text-left">Total</td>
            <td class="text-right">{{ result.totals.registros }}</td>
            <td class="text-right">{{ result.totals.conPrueba }}</td>
            <td class="text-right">{{ result.totals.pagaron }}</td>
            <td class="text-right">
              {{ formatRate(result.totals.pagaron, result.totals.registros) }}
            </td>
            <td class="text-right">
              <MoneyLines :items="result.totals.facturacion" />
            </td>
            <td class="text-right">
              <MoneyLines :items="result.totals.gasto" />
            </td>
            <td class="text-right">—</td>
          </tr>
        </tfoot>
      </q-markup-table>
      <div
        v-if="result && result.totals.gasto.length === 0"
        class="text-caption text-grey-7 q-pa-sm"
      >
        Sin gasto de Meta: falta conectar la cuenta publicitaria (o no hubo gasto en el período).
      </div>
    </q-card>

    <!-- ================================================================== -->
    <!-- Campañas: gasto de campaña, alumnos pagos de TODAS sus sedes -->
    <!-- ================================================================== -->
    <div class="text-subtitle1 q-mb-xs">Campañas</div>
    <q-card flat bordered class="q-mb-md">
      <q-markup-table flat dense separator="horizontal" data-test="campaigns-table">
        <thead>
          <tr>
            <th class="text-left" style="width: 36px"></th>
            <th class="text-left">Campaña</th>
            <th class="text-left">Sede en el nombre</th>
            <th class="text-right">Registros</th>
            <th class="text-right">Pagaron</th>
            <th class="text-right">Facturación</th>
            <th class="text-right">Gasto</th>
            <th class="text-right">Costo por alumno pago</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="camp in campaigns" :key="camp.utmCampaign">
            <tr>
              <td>
                <q-btn
                  flat
                  round
                  dense
                  size="sm"
                  :icon="expandedCampaigns.has(camp.utmCampaign) ? 'expand_less' : 'expand_more'"
                  :aria-label="`Ver sedes de ${camp.utmCampaign}`"
                  @click="toggle(expandedCampaigns, camp.utmCampaign)"
                />
              </td>
              <td class="text-left">{{ camp.utmCampaign }}</td>
              <td class="text-left">{{ camp.sedeCodificada?.branchName ?? 'Varias' }}</td>
              <td class="text-right">{{ camp.registros }}</td>
              <td class="text-right">{{ camp.pagaron }}</td>
              <td class="text-right"><MoneyLines :items="camp.facturacion" /></td>
              <td class="text-right"><MoneyLines :items="camp.gasto" /></td>
              <td class="text-right"><MoneyLines :items="camp.costoPorAlumnoPago" /></td>
            </tr>
            <tr v-if="expandedCampaigns.has(camp.utmCampaign)" class="bg-grey-1">
              <td></td>
              <td colspan="7" class="text-left">
                <div v-for="s in camp.porSede" :key="String(s.branchId)" class="text-caption">
                  {{ s.branchName ?? 'Sin sede' }}: {{ s.registros }} registros, {{ s.pagaron }}
                  pagaron
                </div>
              </td>
            </tr>
          </template>
          <tr v-if="!loading && campaigns.length === 0">
            <td colspan="8" class="text-center text-grey-6 q-pa-lg">
              Ninguna alta del período vino con campaña
            </td>
          </tr>
        </tbody>
      </q-markup-table>
    </q-card>

    <div class="row q-col-gutter-md q-mb-md">
      <!-- ================================================================ -->
      <!-- Tráfico de IA -->
      <!-- ================================================================ -->
      <div class="col-12 col-md-6">
        <q-card flat bordered class="full-height">
          <q-card-section>
            <div class="text-subtitle1">Llegaron desde IA</div>
            <div class="text-caption text-grey-7">
              ChatGPT, Perplexity y otros asistentes, por sitio de origen
            </div>
          </q-card-section>
          <q-list v-if="result && result.ia.length > 0" separator dense data-test="ia-list">
            <q-item v-for="item in result.ia" :key="item.referrerHost ?? 'sin-sitio'">
              <q-item-section>{{ item.referrerHost ?? 'Sitio sin informar' }}</q-item-section>
              <q-item-section side>
                {{ item.registros }} registros · {{ item.pagaron }} pagaron
              </q-item-section>
            </q-item>
          </q-list>
          <q-card-section v-else class="text-grey-6">
            Ninguna alta del período llegó desde una IA
          </q-card-section>
        </q-card>
      </div>

      <!-- ================================================================ -->
      <!-- Gasto sin altas atribuidas -->
      <!-- ================================================================ -->
      <div class="col-12 col-md-6">
        <q-card flat bordered class="full-height">
          <q-card-section>
            <div class="text-subtitle1">Gasto sin altas atribuidas</div>
            <div class="text-caption text-grey-7">
              Campañas de Meta con gasto en el período y ningún registro
            </div>
          </q-card-section>
          <q-list v-if="result && result.gastoSinAtribuir.length > 0" separator dense>
            <q-item
              v-for="item in result.gastoSinAtribuir"
              :key="`${item.campaignName}-${item.currency}`"
            >
              <q-item-section>{{ item.campaignName }}</q-item-section>
              <q-item-section side>{{ formatPrice(item.amount, item.currency) }}</q-item-section>
            </q-item>
          </q-list>
          <q-card-section v-else class="text-grey-6">
            {{
              result && result.totals.gasto.length === 0
                ? 'Sin gasto de Meta: falta conectar la cuenta publicitaria'
                : 'Todo el gasto del período tiene altas atribuidas'
            }}
          </q-card-section>
        </q-card>
      </div>
    </div>

    <!-- ================================================================== -->
    <!-- Google Search Console -->
    <!-- ================================================================== -->
    <div class="text-subtitle1 q-mb-xs">Google Search Console</div>
    <q-card flat bordered class="q-mb-md">
      <q-inner-loading :showing="loadingGsc" />
      <q-card-section v-if="gscErrorMessage" class="text-negative">
        {{ gscErrorMessage }}
      </q-card-section>
      <q-card-section v-else-if="!loadingGsc && !gsc?.period" class="text-grey-6">
        Todavía no hay datos de Search Console: se cargan cuando Franco conecta la cuenta.
      </q-card-section>
      <template v-else-if="gsc?.period">
        <q-card-section class="q-pb-none text-caption text-grey-7">
          Período {{ formatDay(gsc.period.periodStart) }} al {{ formatDay(gsc.period.periodEnd) }} ·
          páginas de sede de la web
        </q-card-section>
        <q-markup-table flat dense separator="horizontal" data-test="gsc-table">
          <thead>
            <tr>
              <th class="text-left" style="width: 36px"></th>
              <th class="text-left">Página</th>
              <th class="text-right">Clics</th>
              <th class="text-right">Impresiones</th>
              <th class="text-right">CTR</th>
              <th class="text-right">Posición</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="p in gsc.pages" :key="p.page">
              <tr>
                <td>
                  <q-btn
                    flat
                    round
                    dense
                    size="sm"
                    :icon="expandedPages.has(p.page) ? 'expand_less' : 'expand_more'"
                    :aria-label="`Ver consultas de ${pagePath(p.page)}`"
                    @click="toggle(expandedPages, p.page)"
                  />
                </td>
                <td class="text-left">{{ pagePath(p.page) }}</td>
                <td class="text-right">{{ p.clicks }}</td>
                <td class="text-right">{{ p.impressions }}</td>
                <td class="text-right">{{ formatCtr(p.ctr) }}</td>
                <td class="text-right">{{ formatPosition(p.position) }}</td>
              </tr>
              <template v-if="expandedPages.has(p.page)">
                <tr v-for="q in queriesOf(p.page)" :key="`${p.page}|${q.query}`" class="bg-grey-1">
                  <td></td>
                  <td class="text-left text-caption q-pl-lg">{{ q.query }}</td>
                  <td class="text-right text-caption">{{ q.clicks }}</td>
                  <td class="text-right text-caption">{{ q.impressions }}</td>
                  <td class="text-right text-caption">{{ formatCtr(q.ctr) }}</td>
                  <td class="text-right text-caption">{{ formatPosition(q.position) }}</td>
                </tr>
                <tr v-if="queriesOf(p.page).length === 0" class="bg-grey-1">
                  <td></td>
                  <td colspan="5" class="text-left text-caption text-grey-6 q-pl-lg">
                    Sin consultas para esta página
                  </td>
                </tr>
              </template>
            </template>
          </tbody>
        </q-markup-table>
      </template>
    </q-card>
  </div>
</template>

<script setup lang="ts">
import {
  ref,
  computed,
  watch,
  onMounted,
  onUnmounted,
  defineComponent,
  h,
  type PropType,
} from 'vue';
import IntegracionesApagadasCard from './IntegracionesApagadasCard.vue';
import { useReportsApi } from 'src/composables/useReportsApi';
import { createLogger } from 'src/utils/logger';
import { extractError } from 'src/utils/extract-error';
import { formatPrice } from 'src/utils/format-price';
import { todayInTz } from 'src/utils/tz';
import { RENEWALS_TZ } from 'src/utils/renewals-week';
import { monthToRange } from 'src/utils/date-range';
import type {
  AttributionCampaign,
  AttributionFunnelResult,
  AttributionFunnelRow,
  MoneyByCurrency,
  SearchConsoleReport,
} from 'src/types/report';

const props = defineProps<{
  branchId?: number | null | undefined;
  /** País del selector de ReportesPage (owner). Un admin queda fijo en su país (lo fuerza el server). */
  country?: 'AR' | 'ES' | undefined;
}>();

const log = createLogger('OrigenAltasReport');
const reportsApi = useReportsApi();

// ─── Importes por moneda ────────────────────────────────────────────────
//
// Una línea por moneda (nunca se suman ARS con EUR); "—" si no hay dato.

const MoneyLines = defineComponent({
  props: {
    items: { type: Array as PropType<MoneyByCurrency[] | null>, default: null },
  },
  setup(p) {
    return () =>
      p.items && p.items.length > 0
        ? h(
            'div',
            p.items.map((m) => h('div', { key: m.currency }, formatPrice(m.amount, m.currency)))
          )
        : h('span', { class: 'text-grey-6' }, '—');
  },
});

// ─── Etiquetas de canal (CHANNELS de la API) ────────────────────────────

const CHANNEL_LABELS: Record<string, string> = {
  ia: 'IA (ChatGPT, etc.)',
  meta_ads: 'Anuncios Meta',
  google_ads: 'Google Ads',
  google_maps: 'Google Maps',
  instagram: 'Instagram',
  facebook: 'Facebook',
  buscador: 'Buscador',
  qr: 'Volante / QR',
  email: 'Email',
  referido: 'Referido',
  promo: 'Código promo',
  web: 'Web',
  otro_sitio: 'Otro sitio',
  presencial: 'Presencial',
  otro: 'Otro',
  directo: 'Directo',
};

function channelLabel(channel: string): string {
  return CHANNEL_LABELS[channel] ?? channel;
}

// ─── Rango de fechas ────────────────────────────────────────────────────

interface DatePreset {
  label: string;
  range: () => { dateFrom: string; dateTo: string };
}

/** Suma días a una fecha YYYY-MM-DD vía mediodía UTC (sin drift de huso). */
function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!, 12, 0, 0));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function monthRangeInAr(offsetMonths: number): { dateFrom: string; dateTo: string } {
  const [y, m] = todayInTz(RENEWALS_TZ).split('-').map(Number);
  const d = new Date(Date.UTC(y!, m! - 1 + offsetMonths, 1));
  const { dateFrom, dateTo } = monthToRange(d.toISOString().slice(0, 7));
  return { dateFrom: dateFrom!, dateTo: dateTo! };
}

const DATE_PRESETS: DatePreset[] = [
  {
    label: 'Últimos 30 días',
    range: () => {
      const today = todayInTz(RENEWALS_TZ);
      return { dateFrom: addDays(today, -29), dateTo: today };
    },
  },
  { label: 'Este mes', range: () => monthRangeInAr(0) },
  { label: 'Mes pasado', range: () => monthRangeInAr(-1) },
];

const presetLabel = ref(DATE_PRESETS[0]!.label);
const initialRange = DATE_PRESETS[0]!.range();
const dateFrom = ref(initialRange.dateFrom);
const dateTo = ref(initialRange.dateTo);
const showCustomRange = ref(false);
const customFrom = ref('');
const customTo = ref('');

const isCustomRangeValid = computed(
  () => !!customFrom.value && !!customTo.value && customFrom.value <= customTo.value
);

function formatDay(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

const dateRangeLabel = computed(
  () => presetLabel.value || `${formatDay(dateFrom.value)} - ${formatDay(dateTo.value)}`
);

function applyPreset(preset: DatePreset): void {
  const range = preset.range();
  dateFrom.value = range.dateFrom;
  dateTo.value = range.dateTo;
  presetLabel.value = preset.label;
  showCustomRange.value = false;
}

function applyCustomRange(): void {
  dateFrom.value = customFrom.value;
  dateTo.value = customTo.value;
  presetLabel.value = '';
}

// ─── Agrupación visual ──────────────────────────────────────────────────

type GroupBy = 'canal' | 'campania' | 'sede' | 'detalle';

const GROUP_OPTIONS: Array<{ label: string; value: GroupBy }> = [
  { label: 'Por canal', value: 'canal' },
  { label: 'Por campaña', value: 'campania' },
  { label: 'Por sede', value: 'sede' },
  { label: 'Detalle', value: 'detalle' },
];

const groupBy = ref<GroupBy>('canal');

const showChannel = computed(() => groupBy.value === 'canal' || groupBy.value === 'detalle');
const showCampaign = computed(() => groupBy.value === 'campania' || groupBy.value === 'detalle');
const showBranch = computed(() => groupBy.value === 'sede' || groupBy.value === 'detalle');
const labelColumns = computed(
  () => Number(showChannel.value) + Number(showCampaign.value) + Number(showBranch.value)
);
const columnCount = computed(() => labelColumns.value + 7);

// ─── Datos ──────────────────────────────────────────────────────────────

const result = ref<AttributionFunnelResult | null>(null);
const loading = ref(false);
const errorMessage = ref<string | null>(null);

const gsc = ref<SearchConsoleReport | null>(null);
const loadingGsc = ref(false);
const gscErrorMessage = ref<string | null>(null);

// Respuesta vieja que llega después de un cambio de filtro: se descarta.
let funnelRequestId = 0;

async function loadFunnel(): Promise<void> {
  const requestId = ++funnelRequestId;
  loading.value = true;
  errorMessage.value = null;
  try {
    const data = await reportsApi.getAttributionFunnel({
      dateFrom: dateFrom.value,
      dateTo: dateTo.value,
      branchId: props.branchId ?? undefined,
      country: props.country,
    });
    if (requestId === funnelRequestId) result.value = data;
  } catch (err: unknown) {
    if (requestId !== funnelRequestId) return;
    result.value = null;
    errorMessage.value = extractError(err, 'No se pudo cargar el origen de altas');
    log.error('Failed to load attribution funnel', {
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    if (requestId === funnelRequestId) loading.value = false;
  }
}

async function loadSearchConsole(): Promise<void> {
  loadingGsc.value = true;
  gscErrorMessage.value = null;
  try {
    gsc.value = await reportsApi.getSearchConsoleReport();
  } catch (err: unknown) {
    gscErrorMessage.value = extractError(err, 'No se pudo cargar Search Console');
    log.error('Failed to load search console report', {
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    loadingGsc.value = false;
  }
}

// ─── Filas de la tabla del embudo (agrupadas en el cliente) ─────────────

interface TableRow {
  key: string;
  channel: string;
  campaign: string;
  branch: string;
  registros: number;
  conPrueba: number;
  pagaron: number;
  facturacion: MoneyByCurrency[];
  gasto: MoneyByCurrency[] | null;
  costo: MoneyByCurrency[] | null;
}

/** Suma listas de importes por moneda (ordenadas por código). */
function sumMoney(lists: Array<MoneyByCurrency[] | null>): MoneyByCurrency[] {
  const byCurrency = new Map<string, number>();
  for (const list of lists) {
    for (const m of list ?? []) {
      byCurrency.set(m.currency, (byCurrency.get(m.currency) ?? 0) + m.amount);
    }
  }
  return [...byCurrency.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, amount]) => ({ currency, amount: Math.round(amount * 100) / 100 }));
}

function costPerPaid(gasto: MoneyByCurrency[], pagaron: number): MoneyByCurrency[] | null {
  if (gasto.length === 0 || pagaron <= 0) return null;
  return gasto.map((g) => ({
    currency: g.currency,
    amount: Math.round((g.amount / pagaron) * 100) / 100,
  }));
}

function groupKeyOf(row: AttributionFunnelRow, by: GroupBy): string {
  switch (by) {
    case 'canal':
      return row.channel;
    case 'campania':
      return row.utmCampaign ?? '';
    case 'sede':
      return String(row.branchId ?? '');
    default:
      return `${row.channel}|${row.utmCampaign ?? ''}|${row.branchId ?? ''}`;
  }
}

const tableRows = computed<TableRow[]>(() => {
  const data = result.value;
  if (!data) return [];
  const by = groupBy.value;

  const groups = new Map<string, AttributionFunnelRow[]>();
  for (const row of data.rows) {
    const key = groupKeyOf(row, by);
    const list = groups.get(key);
    if (list) list.push(row);
    else groups.set(key, [row]);
  }

  const out: TableRow[] = [];
  for (const [key, rows] of groups) {
    const first = rows[0]!;
    const pagaron = rows.reduce((n, r) => n + r.pagaron, 0);

    // El gasto sale de donde está bien definido para cada agrupación:
    //  - canal: el gasto total de Meta (todo `ad_spend_daily` es de Meta);
    //  - campaña: el gasto de la campaña (todas sus sedes);
    //  - sede/detalle: solo las filas donde la campaña codifica la sede.
    let gasto: MoneyByCurrency[] = [];
    let costo: MoneyByCurrency[] | null = null;
    if (by === 'canal') {
      if (first.channel === 'meta_ads') {
        gasto = data.totals.gasto;
        costo = costPerPaid(gasto, pagaron);
      }
    } else if (by === 'campania') {
      const camp = data.campaigns.find((c) => c.utmCampaign === first.utmCampaign);
      gasto = camp?.gasto ?? [];
      costo = camp?.costoPorAlumnoPago ?? null;
    } else {
      const withSpend = rows.filter((r) => r.gasto !== null);
      gasto = sumMoney(withSpend.map((r) => r.gasto));
      costo = costPerPaid(
        gasto,
        withSpend.reduce((n, r) => n + r.pagaron, 0)
      );
    }

    out.push({
      key,
      channel: channelLabel(first.channel),
      campaign: first.utmCampaign ?? 'Sin campaña',
      branch: first.branchName ?? 'Sin sede',
      registros: rows.reduce((n, r) => n + r.registros, 0),
      conPrueba: rows.reduce((n, r) => n + r.conPrueba, 0),
      pagaron,
      facturacion: sumMoney(rows.map((r) => r.facturacion)),
      gasto: gasto.length > 0 ? gasto : null,
      costo,
    });
  }
  return out.sort((a, b) => b.registros - a.registros || a.key.localeCompare(b.key));
});

const campaigns = computed<AttributionCampaign[]>(() => result.value?.campaigns ?? []);

function formatRate(part: number, whole: number): string {
  if (whole <= 0) return '—';
  return `${((part / whole) * 100).toFixed(1).replace('.', ',')} %`;
}

// ─── Search Console ─────────────────────────────────────────────────────

function pagePath(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

function formatCtr(ctr: number): string {
  return `${(ctr * 100).toFixed(2).replace('.', ',')} %`;
}

function formatPosition(position: number): string {
  return position.toFixed(1).replace('.', ',');
}

function queriesOf(page: string): SearchConsoleReport['queries'] {
  return (gsc.value?.queries ?? []).filter((q) => q.page === page);
}

// ─── Filas expandibles ──────────────────────────────────────────────────

const expandedCampaigns = ref(new Set<string>());
const expandedPages = ref(new Set<string>());

function toggle(target: Set<string>, key: string): void {
  if (target.has(key)) target.delete(key);
  else target.add(key);
}

// ─── Ciclo de vida ──────────────────────────────────────────────────────

watch([() => props.branchId, () => props.country, dateFrom, dateTo], () => {
  void loadFunnel();
});

onMounted(() => {
  void loadFunnel();
  void loadSearchConsole();
});

/** Invalida respuestas en vuelo y limpia el estado del composable. */
function cleanup(): void {
  funnelRequestId += 1;
  reportsApi.cleanup();
}

onUnmounted(cleanup);
</script>
