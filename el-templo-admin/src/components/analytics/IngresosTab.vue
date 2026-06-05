<template>
  <div>
    <!-- Loading skeleton -->
    <div v-if="props.loading" class="q-pa-md">
      <q-skeleton type="rect" height="160px" class="q-mb-md" />
      <q-skeleton type="rect" height="160px" />
    </div>

    <!-- Empty state: no data in any currency for either metric -->
    <div v-else-if="isEmpty" class="text-center q-pa-xl text-grey-5 text-italic">
      No hay datos para el periodo seleccionado
    </div>

    <template v-else>
      <!-- ===== Ticket (D-01) — per currency, never summed ===== -->
      <div class="text-subtitle2 q-mb-sm">Ticket promedio</div>
      <div class="row q-col-gutter-md q-mb-lg">
        <div
          v-for="cur in ticketCurrencies"
          :key="`ticket-${cur}`"
          class="col-12"
          :class="ticketCurrencies.length > 1 ? 'col-md-6' : 'col-md-12'"
        >
          <q-card flat bordered>
            <q-card-section>
              <div class="text-subtitle2 q-mb-sm">
                Ticket <span class="text-caption text-grey-6">({{ cur }})</span>
              </div>

              <!-- Double headline: promedio general + precio de lista -->
              <div class="row q-col-gutter-md">
                <div class="col-6 text-center q-pa-sm">
                  <div class="text-h4">{{ money(ticketBlock(cur).global.nominal, cur) }}</div>
                  <div class="text-caption text-grey-7">Promedio general</div>
                </div>
                <div class="col-6 text-center q-pa-sm">
                  <div class="text-h4">
                    {{ money(ticketBlock(cur).globalCohorts.listPrice.average, cur) }}
                  </div>
                  <div class="text-caption text-grey-7">Precio de lista</div>
                </div>
              </div>

              <!-- % con descuento / % a $0 — shown SEPARATED, never merged -->
              <div class="row q-col-gutter-md q-mt-xs">
                <div class="col-6 text-center q-pa-sm">
                  <div class="text-h6">{{ discountPct(ticketBlock(cur).discountMean) }}</div>
                  <div class="text-caption text-grey-7">% con descuento</div>
                </div>
                <div class="col-6 text-center q-pa-sm">
                  <div class="text-h6">{{ wholePct(ticketBlock(cur).zeroPct) }}</div>
                  <div class="text-caption text-grey-7">% a $0</div>
                </div>
              </div>

              <!-- Desglose por plan / sucursal — expandable, not always visible -->
              <q-expansion-item
                dense
                icon="expand_more"
                label="Desglose por plan / sucursal"
                class="q-mt-sm"
              >
                <q-list dense>
                  <q-item-label header class="q-pt-sm">Por plan</q-item-label>
                  <q-item
                    v-for="plan in ticketBlock(cur).perPlan"
                    :key="`plan-${plan.planName}-${plan.country}`"
                  >
                    <q-item-section>{{ plan.planName }}</q-item-section>
                    <q-item-section side>{{ money(plan.ticket.nominal, cur) }}</q-item-section>
                  </q-item>
                  <q-item v-if="ticketBlock(cur).perPlan.length === 0">
                    <q-item-section class="text-grey-6 text-italic"
                      >Sin datos por plan</q-item-section
                    >
                  </q-item>

                  <q-separator spaced />
                  <q-item-label header>Por sucursal</q-item-label>
                  <q-item v-for="br in ticketBlock(cur).byBranch" :key="`branch-${br.branchName}`">
                    <q-item-section>{{ br.branchName }}</q-item-section>
                    <q-item-section side>{{ money(br.ticket.nominal, cur) }}</q-item-section>
                  </q-item>
                  <q-item v-if="ticketBlock(cur).byBranch.length === 0">
                    <q-item-section class="text-grey-6 text-italic"
                      >Sin datos por sucursal</q-item-section
                    >
                  </q-item>
                </q-list>
              </q-expansion-item>
            </q-card-section>
          </q-card>
        </div>
      </div>

      <!-- ===== LTV (D-05) — per currency, never summed ===== -->
      <div class="text-subtitle2 q-mb-sm">LTV / vida del cliente</div>
      <div class="row q-col-gutter-md">
        <div
          v-for="cur in ltvCurrencies"
          :key="`ltv-${cur}`"
          class="col-12"
          :class="ltvCurrencies.length > 1 ? 'col-md-6' : 'col-md-12'"
        >
          <q-card flat bordered>
            <q-card-section>
              <div class="text-subtitle2 q-mb-sm">
                LTV <span class="text-caption text-grey-6">({{ cur }})</span>
              </div>

              <!-- Double headline: meses de vida + $ por cliente -->
              <div class="row q-col-gutter-md">
                <div class="col-6 text-center q-pa-sm">
                  <div class="text-h4">{{ months(props.ltv?.lifetimeHeadlineMonths) }}</div>
                  <div class="text-caption text-grey-7">Meses de vida</div>
                </div>
                <div class="col-6 text-center q-pa-sm">
                  <div class="text-h4">
                    {{ money(ltvBlock(cur).observed ?? ltvBlock(cur).projected, cur) }}
                  </div>
                  <div class="text-caption text-grey-7">$ por cliente</div>
                </div>
              </div>

              <!-- Both month estimates, labeled distinctly -->
              <div class="row q-col-gutter-md q-mt-xs">
                <div class="col-6 text-center q-pa-sm">
                  <div class="text-h6">{{ months(props.ltv?.lifetimeHeadlineMonths) }}</div>
                  <div class="text-caption text-grey-7">Estimación simple</div>
                </div>
                <div class="col-6 text-center q-pa-sm">
                  <div class="text-h6">{{ months(props.ltv?.survivalMedianMonths) }}</div>
                  <div class="text-caption text-grey-7">Supervivencia</div>
                </div>
              </div>

              <!-- Valor en plata: proyectado vs observado side by side, null-safe -->
              <div class="row q-col-gutter-md q-mt-xs">
                <div class="col-6 text-center q-pa-sm">
                  <div class="text-h6">{{ money(ltvBlock(cur).projected, cur) }}</div>
                  <div class="text-caption text-grey-7">Proyectado</div>
                </div>
                <div class="col-6 text-center q-pa-sm">
                  <div class="text-h6">{{ money(ltvBlock(cur).observed, cur) }}</div>
                  <div class="text-caption text-grey-7">Real (observado)</div>
                </div>
              </div>
            </q-card-section>
          </q-card>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { formatPrice } from 'src/utils/format-price';
import type {
  TicketAnalytics,
  TicketCurrencyBlock,
  LtvAnalytics,
  LtvCurrencyBlock,
} from 'src/types/analytics';

type CurrencyCode = 'ARS' | 'EUR';

const ALL_CURRENCIES: CurrencyCode[] = ['ARS', 'EUR'];

// -- Props ---------------------------------------------------------------

const props = defineProps<{
  ticket: TicketAnalytics | null;
  ltv: LtvAnalytics | null;
  loading: boolean;
}>();

// -- Per-currency isolation (D-01 / D-05) — ARS and EUR NEVER summed -----

function ticketBlock(cur: CurrencyCode): TicketCurrencyBlock {
  // Safe: only called inside the v-for over ticketCurrencies, which is
  // derived from props.ticket being present.
  return props.ticket!.byCurrency[cur];
}

function ltvBlock(cur: CurrencyCode): LtvCurrencyBlock {
  return props.ltv!.monetary[cur];
}

function ticketCurrencyHasData(cur: CurrencyCode): boolean {
  return !!props.ticket && props.ticket.byCurrency[cur].global.n > 0;
}

function ltvCurrencyHasData(cur: CurrencyCode): boolean {
  return !!props.ltv && props.ltv.monetary[cur].n > 0;
}

const ticketCurrencies = computed<CurrencyCode[]>(() => {
  const out = ALL_CURRENCIES.filter(ticketCurrencyHasData);
  // Always show the scoped currency rather than nothing.
  if (out.length === 0) out.push('ARS');
  return out;
});

const ltvCurrencies = computed<CurrencyCode[]>(() => {
  const out = ALL_CURRENCIES.filter(ltvCurrencyHasData);
  if (out.length === 0) out.push('ARS');
  return out;
});

const isEmpty = computed(() => {
  const ticketEmpty =
    !props.ticket || ALL_CURRENCIES.every((c) => props.ticket!.byCurrency[c].global.n === 0);
  const ltvEmpty = !props.ltv || ALL_CURRENCIES.every((c) => props.ltv!.monetary[c].n === 0);
  return ticketEmpty && ltvEmpty;
});

// -- Null-safe formatting (T-132-11: never render NaN, null → "—") -------

function money(amount: number | null | undefined, cur: CurrencyCode): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return '—';
  return formatPrice(amount, cur);
}

function months(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `${value.toFixed(1)} meses`;
}

/** Discount mean arrives as a 0-1 fraction (mean of per-charge discount). */
function discountPct(fraction: number | null | undefined): string {
  if (fraction === null || fraction === undefined || Number.isNaN(fraction)) return '—';
  return `${Math.round(fraction * 100)}%`;
}

/** zeroPct already arrives as a whole percentage. */
function wholePct(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `${Math.round(value)}%`;
}
</script>
