<script setup lang="ts">
useHead({
  title: "Política de Privacidad | El Templo",
  meta: [
    {
      name: "description",
      content:
        "Política de privacidad de El Templo Espacio Funcional S.A. Conocé cómo recopilamos, usamos y protegemos tus datos personales.",
    },
    { property: "og:title", content: "Política de Privacidad | El Templo" },
    {
      property: "og:description",
      content:
        "Conocé cómo recopilamos, usamos y protegemos tus datos personales.",
    },
    { property: "og:url", content: "https://eltemplo.org/privacidad" },
    { property: "og:type", content: "website" },
    { property: "og:site_name", content: "El Templo" },
  ],
  link: [{ rel: "canonical", href: "https://eltemplo.org/privacidad" }],
});
</script>

<template>
  <main class="privacy">
    <div class="privacy__container">
      <h1 class="privacy__title">Política de Privacidad</h1>
      <p class="privacy__updated">Última actualización: 15 de abril de 2026</p>

      <section class="privacy__section">
        <h2>Quiénes somos</h2>
        <p>
          Somos El Templo, un espacio de entrenamiento funcional y calistenia.
          Operamos la app móvil "El Templo" y el sitio web eltemplo.org. Ante
          cualquier consulta podés escribirnos a
          <a href="mailto:comunidad@eltemplo.org">comunidad@eltemplo.org</a>.
        </p>
      </section>

      <section class="privacy__section">
        <h2>Información que usamos</h2>
        <p>
          Al crear tu cuenta, te pedimos algunos datos básicos para
          identificarte y darte acceso a la app.
        </p>
        <p>
          Mientras la usás, registramos tu actividad (como reservas,
          entrenamientos y accesos) para mejorar tu experiencia, hacer
          seguimiento de tu progreso y personalizar el contenido según tus
          objetivos.
        </p>
        <p>
          La app usa la cámara solo para escanear códigos QR de check-in.
          También usamos herramientas de diagnóstico para detectar errores
          técnicos, sin recopilar datos personales.
        </p>
      </section>

      <section class="privacy__section">
        <h2>Para qué usamos tus datos</h2>
        <p>
          Para gestionar tu cuenta, permitirte reservar clases y registrar
          asistencia, personalizar tu entrenamiento, llevar un registro de tu
          progreso y detectar errores técnicos en la app.
        </p>
        <p>
          No recopilamos ubicación, contactos del dispositivo, fotos, audio ni
          video. No usamos publicidad ni rastreo publicitario.
        </p>
      </section>

      <section class="privacy__section">
        <h2>No vendemos ni compartimos tus datos con terceros</h2>
        <p>
          Solo acceden a ellos los entrenadores y administradores de El Templo
          para gestionar tu entrenamiento, y una herramienta de diagnóstico para
          monitoreo técnico (sin datos personales).
        </p>
      </section>

      <section class="privacy__section">
        <h2>Menores de edad</h2>
        <p>
          La app no está dirigida a menores de 13 años. Si creés que un menor
          nos proporcionó datos personales, contactanos para que los eliminemos.
        </p>
      </section>

      <section class="privacy__section">
        <h2>Descargo de responsabilidad</h2>
        <p>
          Las sesiones y recomendaciones de El Templo son orientativas y no
          reemplazan el asesoramiento médico profesional. Consultá con un
          profesional de la salud antes de iniciar cualquier programa de
          ejercicio. El Templo no se responsabiliza por lesiones derivadas del
          uso de la app.
        </p>
      </section>

      <section class="privacy__section">
        <h2>Conservación de datos</h2>
        <p>
          Conservamos tus datos personales mientras tu cuenta esté activa. Los
          registros de entrenamientos, asistencia y progreso se mantienen
          durante la vigencia de tu cuenta para que puedas consultar tu
          historial completo.
        </p>
        <p>
          Si solicitás la eliminación de tu cuenta, tus datos serán eliminados
          de forma permanente en un plazo máximo de 30 días a partir de la
          solicitud.
        </p>
      </section>

      <section class="privacy__section">
        <h2>Eliminación de datos</h2>
        <p>
          Podés solicitar la eliminación de tu cuenta y todos tus datos
          personales en cualquier momento enviando un email a
          <a href="mailto:comunidad@eltemplo.org">comunidad@eltemplo.org</a>
          desde la dirección con la que te registraste, con el asunto "Eliminar
          mi cuenta".
        </p>
        <p>
          Al procesar tu solicitud, eliminamos de forma permanente: datos
          personales (nombre, email, teléfono, DNI), historial de reservas y
          asistencia, sesiones de entrenamiento, progreso y preferencias.
        </p>
        <p>
          Para más detalles, visitá nuestra página de
          <a href="/eliminar-cuenta">eliminación de cuenta</a>.
        </p>
      </section>

      <section class="privacy__section">
        <h2>Cambios en esta política</h2>
        <p>
          Si actualizamos esta política, lo publicamos acá con la nueva fecha.
          Seguir usando la app o el sitio después de un cambio implica aceptar
          la versión actualizada.
        </p>
      </section>
    </div>
  </main>
</template>

<style scoped>
.privacy {
  background-color: #1a1714;
  min-height: 100vh;
  padding: 80px 24px 60px;
}

.privacy__container {
  max-width: 760px;
  margin: 0 auto;
  color: #f2ede5;
}

.privacy__title {
  font-family: "Montserrat", sans-serif;
  font-weight: 700;
  font-size: 2rem;
  letter-spacing: 0.04em;
  margin-bottom: 8px;
  color: #f2ede5;
}

.privacy__updated {
  font-size: 0.85rem;
  color: rgba(242, 237, 229, 0.45);
  margin-bottom: 40px;
}

.privacy__section {
  margin-bottom: 32px;
}

.privacy__section h2 {
  font-family: "Montserrat", sans-serif;
  font-weight: 600;
  font-size: 1.2rem;
  color: #f2ede5;
  margin-bottom: 12px;
  letter-spacing: 0.02em;
}

.privacy__section h3 {
  font-family: "Montserrat", sans-serif;
  font-weight: 600;
  font-size: 1rem;
  color: rgba(242, 237, 229, 0.8);
  margin: 16px 0 8px;
}

.privacy__section p {
  font-size: 0.95rem;
  line-height: 1.7;
  color: rgba(242, 237, 229, 0.7);
  margin-bottom: 12px;
}

.privacy__section ul {
  padding-left: 20px;
  margin-bottom: 12px;
}

.privacy__section li {
  font-size: 0.95rem;
  line-height: 1.7;
  color: rgba(242, 237, 229, 0.7);
  margin-bottom: 6px;
}

.privacy__section a {
  color: #c45a3c;
  text-decoration: none;
  transition: color 0.2s ease;
}

.privacy__section a:hover {
  color: #d4a843;
}

.privacy__section strong {
  color: rgba(242, 237, 229, 0.9);
}
</style>
