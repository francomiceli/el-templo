<template>
  <div class="rpe-trend-chart">
    <LineChart :chart-data="chartData" :options="chartOptions" :height="200" />
  </div>
</template>

<script setup lang="ts">
/**
 * RpeTrendChart component
 *
 * Displays a line chart showing RPE (Rate of Perceived Exertion) trend over time.
 * Uses Chart.js with tree-shaken imports for optimal bundle size.
 * Brand colors: aged gold line (#b89b5e), terracotta points (#c07a56).
 */
import { computed } from 'vue'
import { LineChart } from 'vue-chart-3'
import {
  Chart,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  LineController,
  Title,
  Tooltip,
  Filler,
} from 'chart.js'
import type { ChartData, ChartOptions } from 'chart.js'

// Register only needed Chart.js components (tree-shaking)
Chart.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  LineController,
  Title,
  Tooltip,
  Filler,
)

interface Props {
  /** X-axis labels (dates or session identifiers) */
  labels: string[]
  /** Y-axis data points (RPE values 1-10, null for missing) */
  data: (number | null)[]
}

const props = defineProps<Props>()

// Brand colors
const AGED_GOLD = '#b89b5e'
const TERRACOTTA = '#c07a56'

/**
 * Chart data configuration
 */
const chartData = computed<ChartData<'line'>>(() => ({
  labels: props.labels,
  datasets: [
    {
      label: 'RPE',
      data: props.data,
      borderColor: AGED_GOLD,
      backgroundColor: `${AGED_GOLD}1A`, // 10% opacity
      fill: true,
      tension: 0.3,
      spanGaps: true,
      pointBackgroundColor: TERRACOTTA,
      pointBorderColor: AGED_GOLD,
      pointBorderWidth: 2,
      pointRadius: 4,
      pointHoverRadius: 6,
    },
  ],
}))

/**
 * Chart options configuration
 */
const chartOptions = computed<ChartOptions<'line'>>(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      display: false,
    },
    tooltip: {
      backgroundColor: TERRACOTTA,
      titleColor: '#fff',
      bodyColor: '#fff',
      padding: 10,
      displayColors: false,
      callbacks: {
        label: (context) => {
          const value = context.parsed.y
          return value !== null ? `RPE: ${value}` : 'Sin datos'
        },
      },
    },
  },
  scales: {
    y: {
      min: 1,
      max: 10,
      ticks: {
        stepSize: 2,
        color: TERRACOTTA,
        font: {
          size: 11,
        },
      },
      grid: {
        color: `${AGED_GOLD}20`, // 12% opacity
      },
    },
    x: {
      ticks: {
        color: TERRACOTTA,
        font: {
          size: 10,
        },
        maxRotation: 45,
        minRotation: 45,
      },
      grid: {
        display: false,
      },
    },
  },
}))
</script>

<style scoped lang="scss">
.rpe-trend-chart {
  width: 100%;
  height: 200px;
  padding: 8px 0;
}
</style>
