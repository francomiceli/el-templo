<script setup lang="ts">
// Email obfuscation — assembled at runtime to prevent scraper harvesting
const emailUser = "info";
const emailDomain = "eltemplo.org";
const emailAddress = computed(() => `${emailUser}@${emailDomain}`);
const emailHref = computed(() => `mailto:${emailAddress.value}`);

interface FooterLink {
  label: string;
  href: string;
  disabled: boolean;
}

interface FooterColumn {
  title: string;
  links: FooterLink[];
}

const columns: FooterColumn[] = [
  {
    title: "Entrená",
    links: [
      { label: "El Método", href: "/#metodo", disabled: false },
      { label: "Sistema de Niveles", href: "/#niveles", disabled: false },
      { label: "Los 5 Enfoques", href: "/#enfoques", disabled: false },
      { label: "Descubrí tu Nivel", href: "/#descubri-nivel", disabled: false },
      {
        label: "Reservar Sesión",
        href: "https://wa.me/5492235820521?text=Hola%21%20Quiero%20reservar%20mi%20primera%20sesi%C3%B3n%20de%20prueba",
        disabled: false,
      },
    ],
  },
  {
    title: "Ecosistema",
    links: [
      { label: "Templo Online", href: "/app", disabled: false },
      { label: "Academy", href: "/academy", disabled: false },
      { label: "Franquicias", href: "/franquicias", disabled: false },
      { label: "Gladius", href: "/gladius", disabled: false },
      { label: "Blog", href: "/blog", disabled: false },
      { label: "AURA CLUB", href: "/aura-club", disabled: true },
    ],
  },
  {
    title: "Empresa",
    links: [
      { label: "Nuestra Filosofía", href: "/filosofia", disabled: true },
      { label: "Ignacio Bordón", href: "/ignacio-bordon", disabled: true },
      { label: "Sedes", href: "/#sedes", disabled: false },
      { label: "Contacto", href: "/contacto", disabled: true },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Términos", href: "/terminos", disabled: true },
      { label: "Privacidad", href: "/privacidad", disabled: false },
      { label: "Eliminar Cuenta", href: "/eliminar-cuenta", disabled: false },
      { label: "Cookies", href: "/cookies", disabled: true },
    ],
  },
];
</script>

<template>
  <footer class="footer">
    <div class="footer__container">
      <!-- Zone 2: Nav Columns -->
      <div class="footer__nav">
        <div v-for="col in columns" :key="col.title" class="footer__col">
          <h4 class="footer__col-title">{{ col.title }}</h4>
          <template v-for="link in col.links" :key="link.label">
            <NuxtLink
              v-if="!link.disabled"
              :to="link.href"
              :target="link.href.startsWith('http') ? '_blank' : undefined"
              :rel="
                link.href.startsWith('http') ? 'noopener noreferrer' : undefined
              "
              class="footer__link"
            >
              {{ link.label }}
            </NuxtLink>
            <span v-else class="footer__link footer__link--disabled">
              {{ link.label }}
            </span>
          </template>
        </div>
      </div>

      <!-- Zone 3: Contact + Social -->
      <div class="footer__contact">
        <div class="footer__logo">
          <NuxtLink to="/" class="footer__logo-text">El Templo</NuxtLink>
        </div>
        <div class="footer__info">
          <a :href="emailHref" class="footer__info-link">
            {{ emailAddress }}
          </a>
          <a href="tel:+5492235820521" class="footer__info-link">
            +54 9 223 582-0521
          </a>
          <span class="footer__info-address">
            Av. Constituci&oacute;n 6745, Mar del Plata, Argentina
          </span>
        </div>
        <div class="footer__social">
          <a
            href="https://www.instagram.com/eltemplomdp/"
            target="_blank"
            rel="noopener noreferrer"
            class="footer__social-icon"
            aria-label="Instagram"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
              <circle cx="12" cy="12" r="5" />
              <circle cx="17.5" cy="6.5" r="1.5" />
            </svg>
          </a>
          <a
            href="https://www.youtube.com/@ElTemplomdp/"
            target="_blank"
            rel="noopener noreferrer"
            class="footer__social-icon"
            aria-label="YouTube"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path
                d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19.1c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.43z"
              />
              <polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02" />
            </svg>
          </a>
          <a
            href="https://www.facebook.com/eltemplomdp/"
            target="_blank"
            rel="noopener noreferrer"
            class="footer__social-icon"
            aria-label="Facebook"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path
                d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"
              />
            </svg>
          </a>
        </div>
      </div>

      <!-- Zone 4: Legal -->
      <div class="footer__legal">
        <p>&copy; 2026 El Templo Calistenia. Todos los derechos reservados.</p>
      </div>
    </div>
  </footer>
</template>

<style scoped>
.footer {
  background: var(--color-deep-charcoal);
}

.footer__container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 5%;
}

/* Nav columns */
.footer__nav {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 32px;
  padding: 48px 0;
  border-top: 1px solid rgba(242, 237, 229, 0.1);
}

.footer__col {
  display: flex;
  flex-direction: column;
}

.footer__col-title {
  font-family: var(--font-authority);
  font-weight: 700;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--color-terracotta);
  margin: 0 0 16px 0;
}

.footer__link {
  display: block;
  font-family: var(--font-clarity);
  font-weight: 400;
  font-size: 14px;
  color: var(--color-sandy-beige);
  text-decoration: none;
  padding: 4px 0;
  transition: color 200ms ease;
}

.footer__link:hover {
  color: var(--color-marble-cream);
}

/* DISABLED links — CONTEXT.md decision */
.footer__link--disabled {
  color: var(--color-olive-stone);
  cursor: default;
}

.footer__link--disabled:hover {
  color: var(--color-olive-stone);
}

/* Contact zone */
.footer__contact {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 32px 0;
  border-top: 1px solid rgba(242, 237, 229, 0.1);
}

.footer__logo-text {
  font-family: var(--font-authority);
  font-weight: 700;
  font-size: 18px;
  color: var(--color-marble-cream);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  text-decoration: none;
}

.footer__info {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.footer__info-link {
  display: block;
  font-family: var(--font-clarity);
  font-size: 14px;
  color: var(--color-sandy-beige);
  text-decoration: none;
  transition: color 200ms ease;
}

.footer__info-link:hover {
  color: var(--color-marble-cream);
}

/* Address text */
.footer__info-address {
  display: block;
  font-family: var(--font-clarity);
  font-size: 14px;
  color: var(--color-sandy-beige);
}

/* Social icons */
.footer__social {
  display: flex;
  gap: 16px;
}

.footer__social-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  color: var(--color-sandy-beige);
  text-decoration: none;
  transition: color 200ms ease;
}

.footer__social-icon:hover {
  color: var(--color-marble-cream);
}

.footer__social-icon svg {
  width: 20px;
  height: 20px;
}

/* Legal zone */
.footer__legal {
  padding: 24px 0;
  border-top: 1px solid rgba(242, 237, 229, 0.08);
}

.footer__legal p {
  font-family: var(--font-clarity);
  font-size: 12px;
  color: var(--color-olive-stone);
  text-align: center;
  margin: 0;
}

/* Responsive */
@media (max-width: 768px) {
  .footer__nav {
    grid-template-columns: 1fr 1fr;
  }

  .footer__contact {
    flex-direction: column;
    gap: 24px;
    text-align: center;
  }
}

@media (max-width: 480px) {
  .footer__nav {
    grid-template-columns: 1fr 1fr;
    gap: 24px;
  }
}
</style>
