<template>
  <q-card
    class="booking-status-card"
    flat
    bordered
    clickable
    @click="router.push('/reservas')"
  >
    <q-card-section class="booking-status-card__content">
      <div class="booking-status-card__info">
        <q-icon
          :name="hasBooking ? 'event' : 'event_available'"
          size="32px"
          :color="hasBooking ? 'positive' : 'primary'"
        />
        <div class="booking-status-card__text">
          <p class="booking-status-card__title">
            {{ hasBooking ? `Próxima clase: ${formattedTime}` : 'Reserva tu próxima clase' }}
          </p>
          <p class="booking-status-card__subtitle">
            {{ hasBooking ? countdownText : 'Asegura tu lugar en el horario que prefieras' }}
          </p>
        </div>
      </div>
      <div class="booking-status-card__arrow">
        <q-icon name="chevron_right" size="24px" />
      </div>
    </q-card-section>
  </q-card>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()

const props = withDefaults(
  defineProps<{
    hasBooking: boolean
    nextClassTime: string | null
  }>(),
  {
    hasBooking: false,
    nextClassTime: null,
  },
)

const now = ref(new Date())
let intervalId: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  intervalId = setInterval(() => {
    now.value = new Date()
  }, 60_000)
})

onUnmounted(() => {
  if (intervalId !== null) {
    clearInterval(intervalId)
  }
})

const formattedTime = computed(() => {
  if (!props.nextClassTime) return ''
  const date = new Date(props.nextClassTime)
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
})

const countdownText = computed(() => {
  if (!props.nextClassTime) return ''
  const target = new Date(props.nextClassTime)
  const diffMs = target.getTime() - now.value.getTime()
  if (diffMs <= 0) return 'Ahora'
  const diffMinutes = Math.floor(diffMs / 60_000)
  if (diffMinutes < 60) return `En ${diffMinutes} minutos`
  const diffHours = Math.floor(diffMinutes / 60)
  return `En ${diffHours} horas`
})
</script>

<style scoped lang="scss">
@import 'src/css/quasar.variables.scss';

.booking-status-card {
  background-color: white;
  border-color: rgba($primary, 0.2);
  border-radius: 12px;
  cursor: pointer;
  transition: box-shadow 150ms ease;

  &:active {
    box-shadow: 0 0 0 2px rgba($primary, 0.2);
  }

  &__content {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
  }

  &__info {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  &__text {
    display: flex;
    flex-direction: column;
  }

  &__title {
    font-family: 'Montserrat', sans-serif;
    font-size: 16px;
    font-weight: 700;
    color: $primary;
    margin: 0;
  }

  &__subtitle {
    font-family: 'Geologica', sans-serif;
    font-size: 12px;
    color: rgba($primary, 0.6);
    margin: 0;
  }

  &__arrow {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: linear-gradient(135deg, $primary, darken($primary, 12%));
    color: white;
    flex-shrink: 0;
  }
}
</style>
