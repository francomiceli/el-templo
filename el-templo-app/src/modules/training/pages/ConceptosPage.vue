<template>
  <q-page class="conceptos-page">
    <div class="conceptos-page__header">
      <q-btn
        flat
        round
        dense
        icon="arrow_back"
        color="grey-8"
        @click="$router.back()"
      />
      <div class="conceptos-page__title text-h5">Conceptos</div>
    </div>

    <div class="conceptos-page__subtitle text-subtitle1 text-grey-7">
      Guia de Conceptos
    </div>

    <q-list class="conceptos-page__content">
      <!-- Bloques Section -->
      <q-expansion-item
        group="conceptos"
        icon="view_module"
        label="Bloques"
        header-class="conceptos-section-header"
      >
        <q-card>
          <q-card-section>
            <div class="conceptos-item">
              <div class="conceptos-item__title">Initium</div>
              <div class="conceptos-item__description">
                Bloque de calentamiento. Prepara tu cuerpo para la sesion con movilidad
                y activacion muscular progresiva.
              </div>
            </div>

            <q-separator class="q-my-md" />

            <div class="conceptos-item">
              <div class="conceptos-item__title">Nucleus</div>
              <div class="conceptos-item__description">
                Bloque principal de trabajo. Aqui se concentra el mayor volumen e
                intensidad de la sesion segun tu ruta del dia.
              </div>
            </div>

            <q-separator class="q-my-md" />

            <div class="conceptos-item">
              <div class="conceptos-item__title">Deuteros</div>
              <div class="conceptos-item__description">
                Bloque complementario. Eliges entre dos opciones para trabajar
                aspectos adicionales segun tus objetivos.
              </div>
            </div>

            <q-separator class="q-my-md" />

            <div class="conceptos-item">
              <div class="conceptos-item__title">Athlos / Epikos</div>
              <div class="conceptos-item__description">
                Bloque de desafio final. Athlos es un reto corto e intenso.
                Epikos es un desafio mas largo que aparece alternadamente.
              </div>
            </div>
          </q-card-section>
        </q-card>
      </q-expansion-item>

      <!-- Rutas Section -->
      <q-expansion-item
        group="conceptos"
        icon="route"
        label="Rutas"
        header-class="conceptos-section-header"
      >
        <q-card>
          <q-card-section>
            <div class="conceptos-item">
              <div class="conceptos-item__title">Strength (Fuerza)</div>
              <div class="conceptos-item__description">
                Desarrollo de fuerza maxima. Ejercicios con menor numero de
                repeticiones y mayor intensidad.
              </div>
            </div>

            <q-separator class="q-my-md" />

            <div class="conceptos-item">
              <div class="conceptos-item__title">Power (Potencia)</div>
              <div class="conceptos-item__description">
                Trabajo explosivo. Combina fuerza y velocidad para desarrollar
                potencia muscular.
              </div>
            </div>

            <q-separator class="q-my-md" />

            <div class="conceptos-item">
              <div class="conceptos-item__title">Endurance (Resistencia)</div>
              <div class="conceptos-item__description">
                Resistencia muscular. Mayor volumen con intensidad moderada para
                mejorar capacidad de trabajo.
              </div>
            </div>

            <q-separator class="q-my-md" />

            <div class="conceptos-item">
              <div class="conceptos-item__title">Hypertrophy (Hipertrofia)</div>
              <div class="conceptos-item__description">
                Crecimiento muscular. Rango medio de repeticiones con enfoque en
                tension muscular sostenida.
              </div>
            </div>

            <q-separator class="q-my-md" />

            <div class="conceptos-item">
              <div class="conceptos-item__title">Skill (Habilidad)</div>
              <div class="conceptos-item__description">
                Desarrollo tecnico. Practica de movimientos avanzados y progresiones
                de calistenia.
              </div>
            </div>
          </q-card-section>
        </q-card>
      </q-expansion-item>

      <!-- Formatos Section -->
      <q-expansion-item
        group="conceptos"
        icon="timer"
        label="Formatos"
        header-class="conceptos-section-header"
      >
        <q-card>
          <q-card-section>
            <div class="conceptos-item">
              <div class="conceptos-item__title">EMOM (Every Minute On the Minute)</div>
              <div class="conceptos-item__description">
                Realiza los ejercicios al inicio de cada minuto. El tiempo
                restante es tu descanso.
              </div>
            </div>

            <q-separator class="q-my-md" />

            <div class="conceptos-item">
              <div class="conceptos-item__title">AMRAP (As Many Rounds As Possible)</div>
              <div class="conceptos-item__description">
                Completa tantas rondas como puedas en el tiempo establecido.
              </div>
            </div>

            <q-separator class="q-my-md" />

            <div class="conceptos-item">
              <div class="conceptos-item__title">For Time</div>
              <div class="conceptos-item__description">
                Completa todos los ejercicios lo mas rapido posible con buena tecnica.
              </div>
            </div>

            <q-separator class="q-my-md" />

            <div class="conceptos-item">
              <div class="conceptos-item__title">Tabata</div>
              <div class="conceptos-item__description">
                20 segundos de trabajo, 10 segundos de descanso. Repite 8 veces
                por ejercicio.
              </div>
            </div>

            <q-separator class="q-my-md" />

            <div class="conceptos-item">
              <div class="conceptos-item__title">Series</div>
              <div class="conceptos-item__description">
                Formato tradicional. Realiza las series y repeticiones indicadas
                con descanso entre series.
              </div>
            </div>
          </q-card-section>
        </q-card>
      </q-expansion-item>

      <!-- Intensidad Section -->
      <q-expansion-item
        group="conceptos"
        icon="speed"
        label="Intensidad"
        header-class="conceptos-section-header"
      >
        <q-card>
          <q-card-section>
            <div class="conceptos-item">
              <div class="conceptos-item__title">30-50% (Baja)</div>
              <div class="conceptos-item__description">
                Esfuerzo bajo. Ideal para calentamiento, tecnica y recuperacion activa.
              </div>
            </div>

            <q-separator class="q-my-md" />

            <div class="conceptos-item">
              <div class="conceptos-item__title">50-70% (Moderada)</div>
              <div class="conceptos-item__description">
                Esfuerzo moderado. Zona de trabajo para resistencia y volumen.
                Puedes mantener conversacion.
              </div>
            </div>

            <q-separator class="q-my-md" />

            <div class="conceptos-item">
              <div class="conceptos-item__title">70-85% (Alta)</div>
              <div class="conceptos-item__description">
                Esfuerzo alto. Zona de hipertrofia y fuerza. Requiere concentracion
                y buena tecnica.
              </div>
            </div>

            <q-separator class="q-my-md" />

            <div class="conceptos-item">
              <div class="conceptos-item__title">85-100% (Maxima)</div>
              <div class="conceptos-item__description">
                Esfuerzo maximo. Para trabajo de fuerza maxima y potencia.
                Requiere descansos largos.
              </div>
            </div>
          </q-card-section>
        </q-card>
      </q-expansion-item>
    </q-list>
  </q-page>
</template>

<script setup lang="ts">
/**
 * Conceptos Page
 *
 * Educational guide explaining key training concepts:
 * - Bloques: Block types and their purpose
 * - Rutas: Training routes (Strength, Power, etc.)
 * - Formatos: Workout formats (EMOM, AMRAP, etc.)
 * - Intensidad: Intensity percentages and effort levels
 */
</script>

<style scoped lang="scss">
@import 'src/css/quasar.variables.scss';

.conceptos-page {
  background: $cream;
  min-height: 100vh;
  padding-bottom: 24px;
}

.conceptos-page__header {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  gap: 8px;
}

.conceptos-page__title {
  font-family: 'Cinzel', Georgia, serif;
  color: $primary;
  letter-spacing: 0.1em;
}

.conceptos-page__subtitle {
  padding: 0 16px 16px;
  font-style: italic;
}

.conceptos-page__content {
  padding: 0 16px;
}

:deep(.conceptos-section-header) {
  font-family: 'Cinzel', Georgia, serif;
  font-weight: 600;
  color: $primary;
  background: rgba($secondary, 0.1);
  border-radius: 8px;
  margin-bottom: 8px;
}

.conceptos-item {
  padding: 4px 0;
}

.conceptos-item__title {
  font-weight: 600;
  color: $primary;
  margin-bottom: 4px;
}

.conceptos-item__description {
  color: #666;
  line-height: 1.5;
}
</style>
