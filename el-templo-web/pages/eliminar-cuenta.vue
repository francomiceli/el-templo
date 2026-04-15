<script setup lang="ts">
useHead({
  title: "Eliminar Cuenta | El Templo",
  meta: [
    {
      name: "description",
      content:
        "Solicitá la eliminación de tu cuenta y datos personales de la app El Templo.",
    },
    { property: "og:title", content: "Eliminar Cuenta | El Templo" },
    {
      property: "og:description",
      content:
        "Solicitá la eliminación de tu cuenta y datos personales de la app El Templo.",
    },
    { property: "og:url", content: "https://eltemplo.org/eliminar-cuenta" },
    { property: "og:type", content: "website" },
    { property: "og:site_name", content: "El Templo" },
  ],
  link: [{ rel: "canonical", href: "https://eltemplo.org/eliminar-cuenta" }],
});
</script>

<template>
  <main class="delete-account">
    <div class="delete-account__container">
      <h1 class="delete-account__title">Eliminar Cuenta</h1>

      <section class="delete-account__section">
        <h2>Cómo eliminar tu cuenta</h2>
        <p>
          Podés eliminar tu cuenta directamente desde la app, en la sección
          <strong>Mi Perfil</strong>. La eliminación se procesa de forma
          inmediata.
        </p>
        <p>
          También podés solicitarlo enviando un email a
          <a href="mailto:comunidad@eltemplo.org">comunidad@eltemplo.org</a>
          desde la dirección de correo con la que te registraste, con el asunto
          <strong>"Eliminar mi cuenta"</strong>.
        </p>
      </section>

      <section class="delete-account__section">
        <h2>Qué datos se eliminan</h2>
        <p>
          Al procesar tu solicitud, eliminamos de forma permanente toda la
          información vinculada a tu cuenta:
        </p>
        <ul>
          <li>Datos personales (nombre, email, teléfono, DNI)</li>
          <li>Historial de reservas y asistencia</li>
          <li>Sesiones de entrenamiento y progreso</li>
          <li>Perfil de entrenamiento y preferencias</li>
        </ul>
      </section>

      <section class="delete-account__section">
        <h2>Plazo</h2>
        <p>
          Tu solicitud será procesada en un máximo de 30 días. Una vez
          completada, la eliminación es irreversible.
        </p>
      </section>
    </div>
  </main>
</template>

<style scoped>
.delete-account {
  background-color: #1a1714;
  min-height: 100vh;
  padding: 80px 24px 60px;
}

.delete-account__container {
  max-width: 760px;
  margin: 0 auto;
  color: #f2ede5;
}

.delete-account__title {
  font-family: "Montserrat", sans-serif;
  font-weight: 700;
  font-size: 2rem;
  letter-spacing: 0.04em;
  margin-bottom: 40px;
  color: #f2ede5;
}

.delete-account__section {
  margin-bottom: 32px;
}

.delete-account__section h2 {
  font-family: "Montserrat", sans-serif;
  font-weight: 600;
  font-size: 1.2rem;
  color: #f2ede5;
  margin-bottom: 12px;
  letter-spacing: 0.02em;
}

.delete-account__section p {
  font-size: 0.95rem;
  line-height: 1.7;
  color: rgba(242, 237, 229, 0.7);
  margin-bottom: 12px;
}

.delete-account__section ul {
  padding-left: 20px;
  margin-bottom: 12px;
}

.delete-account__section li {
  font-size: 0.95rem;
  line-height: 1.7;
  color: rgba(242, 237, 229, 0.7);
  margin-bottom: 6px;
}

.delete-account__section a {
  color: #c45a3c;
  text-decoration: none;
  transition: color 0.2s ease;
}

.delete-account__section a:hover {
  color: #d4a843;
}

.delete-account__section strong {
  color: rgba(242, 237, 229, 0.9);
}
</style>
