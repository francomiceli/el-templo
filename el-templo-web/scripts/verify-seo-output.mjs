#!/usr/bin/env node
/**
 * Verificador post-build de la web (fase 195, D-29 / T-195-10).
 *
 * Corre DESPUES de `pnpm run generate` sobre `.output/public` y lee
 * `data/generated/web-data.json`. Falla (exit 1) si aparece un dato prohibido
 * (direccion vieja, sedes que ya no existen, wa.me roto) o falta una pagina
 * esperada. Corre en CI (web-check) y, con `--require-api`, en el deploy
 * (195-11) para impedir publicar un build hecho con el fixture.
 *
 * Uso:
 *   node scripts/verify-seo-output.mjs [--require-api]
 *        [--public-dir=<ruta>] [--data=<ruta>] [--src-data-dir=<ruta>]
 *        (los tres ultimos, para tests)
 *
 * COMO AGREGAR UN CHEQUEO (planes 195-04 a 195-06): al final de la lista
 * `CHECKS` agregar `{ name: "descripcion", run: (ctx) => [...problemas] }`.
 * `run` devuelve un array de problemas ([] = OK) y puede usar:
 *   ctx.data            web-data.json parseado (WebData)
 *   ctx.exists(rel)     existe `rel` dentro de .output/public
 *   ctx.read(rel)       contenido de `rel` (utf8)
 *   ctx.htmlFiles       rutas relativas de todos los .html generados
 * Un chequeo que lanza una excepcion cuenta como FALLA.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SITE_URL = "https://eltemplo.org";

function argValue(name) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}

const PUBLIC_DIR = resolve(
  argValue("public-dir") ?? join(ROOT, ".output/public"),
);
const DATA_PATH = resolve(
  argValue("data") ?? join(ROOT, "data/generated/web-data.json"),
);
const REQUIRE_API = process.argv.includes("--require-api");
// Carpeta con data/disciplinas.ts y data/profes.ts (flag solo para tests).
const SRC_DATA_DIR = resolve(argValue("src-data-dir") ?? join(ROOT, "data"));

const FORBIDDEN = [
  "Alem 3958",
  "Chapadmalal",
  "8 sedes",
  "54223XXXXXXX",
  "logo-eltemplo.svg",
];
const REQUIRED_FILES = [
  "index.html",
  "404.html",
  "robots.txt",
  "llms.txt",
  "sitemap.xml",
];
const AI_BOTS = ["OAI-SearchBot", "Claude-SearchBot", "PerplexityBot"];
const ORG_ID = `${SITE_URL}/#organization`;
const LD_JSON_RE =
  /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g;

function out(message) {
  process.stdout.write(`${message}\n`);
}

function walkHtml(dir) {
  const found = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      found.push(...walkHtml(full));
    } else if (entry.endsWith(".html")) {
      found.push(relative(PUBLIC_DIR, full));
    }
  }
  return found;
}

/** Bloques JSON-LD crudos (texto entre el <script ld+json> y el primer </script>). */
function jsonLdBlocks(html) {
  return [...html.matchAll(LD_JSON_RE)].map((m) => m[1]);
}

/** Nodos JSON-LD de un html: parsea cada bloque y aplana `@graph`. Lanza si un bloque no es JSON. */
function jsonLdNodes(html) {
  const nodes = [];
  for (const block of jsonLdBlocks(html)) {
    const parsed = JSON.parse(block);
    nodes.push(
      ...(Array.isArray(parsed["@graph"]) ? parsed["@graph"] : [parsed]),
    );
  }
  return nodes;
}

const typeOf = (node) =>
  Array.isArray(node["@type"]) ? node["@type"] : [node["@type"]];
const nodesOfType = (nodes, type) =>
  nodes.filter((n) => typeOf(n).includes(type));

/** Misma regla que `hasExactGeo` (utils/schema-graph.ts): >= 5 decimales en lat y lng. */
function decimals(value) {
  const m = /\.(\d+)$/.exec(String(value));
  return m ? m[1].length : 0;
}
function hasExactGeo(sede) {
  return (
    sede.geo !== null &&
    sede.geo !== undefined &&
    decimals(sede.geo.lat) >= 5 &&
    decimals(sede.geo.lng) >= 5
  );
}

const pageRel = (sede) =>
  sede.country === "ES"
    ? `es/sedes/${sede.slug}/index.html`
    : `sedes/${sede.slug}/index.html`;
const pageUrlPath = (sede) =>
  sede.country === "ES" ? `/es/sedes/${sede.slug}` : `/sedes/${sede.slug}`;

/** Problemas de la pagina de una sede con clases (ExerciseGym). */
function gymPageProblems(ctx, sede) {
  const rel = pageRel(sede);
  if (!ctx.exists(rel)) return [`falta ${rel}`];
  const html = ctx.read(rel);
  const gyms = nodesOfType(jsonLdNodes(html), "ExerciseGym");
  if (gyms.length !== 1) {
    return [`${rel} tiene ${gyms.length} nodos ExerciseGym (debe ser 1)`];
  }
  const gym = gyms[0];
  const problems = [];
  const expectedId = `${SITE_URL}${pageUrlPath(sede)}#gym`;
  if (gym["@id"] !== expectedId) {
    problems.push(`${rel}: @id ${gym["@id"]} (esperado ${expectedId})`);
  }
  if (gym.parentOrganization?.["@id"] !== ORG_ID) {
    problems.push(`${rel}: parentOrganization no apunta a ${ORG_ID}`);
  }
  if (gym.address?.streetAddress !== sede.address.street) {
    problems.push(`${rel}: streetAddress distinto de la direccion de la sede`);
  }
  if (
    typeof gym.telephone !== "string" ||
    !/^\+\d{8,15}$/.test(gym.telephone)
  ) {
    problems.push(`${rel}: ExerciseGym sin telephone valido`);
  }
  const specs = gym.openingHoursSpecification;
  if (sede.openingHours.length === 0) {
    if (specs !== undefined) {
      problems.push(
        `${rel}: sede sin horarios pero con openingHoursSpecification`,
      );
    }
    if (!html.includes("horarios por WhatsApp")) {
      problems.push(
        `${rel}: sede sin horarios sin el copy "horarios por WhatsApp"`,
      );
    }
  } else if (
    !Array.isArray(specs) ||
    specs.length !== sede.openingHours.length
  ) {
    problems.push(
      `${rel}: openingHoursSpecification con ${Array.isArray(specs) ? specs.length : 0} entradas (esperadas ${sede.openingHours.length})`,
    );
  }
  const exact = hasExactGeo(sede);
  if (exact && !gym.geo) {
    problems.push(`${rel}: coordenadas exactas pero sin geo`);
  }
  if (!exact && gym.geo) {
    problems.push(`${rel}: geo publicado con coordenadas aproximadas`);
  }
  return problems;
}

/** Quita entidades HTML basicas para comparar texto visible con los datos. */
function decodeEntities(text) {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&euro;|&#8364;|&#x20ac;/gi, "€")
    .replace(/&dollar;|&#36;|&#x24;/gi, "$")
    .replace(/&amp;/g, "&");
}

const gymsOf = (ctx, country) =>
  ctx.data.sedes.filter((s) => s.kind === "gym" && s.country === country);

// --- Plan 195-05: lectura de los archivos de datos editables (regex simple) ---

const LEVEL_NAMES = ["Alfa", "Delta", "Sigma", "Omega", "Spartan", "Olympic"];
// '$' pegado a un digito, ARS, EUR o el simbolo del euro.
const PRICE_RE = /\$\s?\d|\bARS\b|€|\bEUR\b/;

/** Fuente TS sin los comentarios `//` (para no leer los ejemplos comentados). */
function readSource(name) {
  return readFileSync(join(SRC_DATA_DIR, name), "utf8")
    .split("\n")
    .filter((line) => !/^\s*\/\//.test(line))
    .join("\n");
}

/** Trozos de la fuente: uno por cada `slug: "..."` hasta el siguiente. */
function entriesBySlug(source) {
  const marks = [...source.matchAll(/^\s*slug:\s*"([a-z0-9-]+)"/gm)];
  return marks.map((m, i) => ({
    slug: m[1],
    body: source.slice(m.index, marks[i + 1]?.index ?? source.length),
  }));
}

/** Disciplinas de data/disciplinas.ts: `{ slug, matchers[] }`. */
function parseDisciplinas() {
  return entriesBySlug(readSource("disciplinas.ts")).map(({ slug, body }) => {
    const arr = /matchers:\s*\[([^\]]*)\]/.exec(body);
    const matchers = arr
      ? [...arr[1].matchAll(/"([^"]+)"/g)].map((m) => m[1])
      : [];
    return { slug, matchers };
  });
}

/** Profes de data/profes.ts: publicados (publicado + foto + bio) y no publicados. */
function parseProfes() {
  const source = readSource("profes.ts");
  const published = [];
  const unpublished = [];
  for (const { slug, body } of entriesBySlug(source)) {
    const isPublished =
      /publicado:\s*true/.test(body) &&
      /foto:\s*"/.test(body) &&
      /bio:\s*\[\s*"/.test(body);
    (isPublished ? published : unpublished).push(slug);
  }
  const author = /DEFAULT_BLOG_AUTHOR_SLUG\s*=\s*"([a-z0-9-]+)"/.exec(source);
  return { published, unpublished, defaultAuthor: author ? author[1] : null };
}

/** Misma regla que `nameMatches` (data/disciplinas.ts): palabra completa, sin acentos. */
function normalizeText(text) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}
function nameMatches(name, matcher) {
  const words = ` ${normalizeText(name).replace(/[^a-z0-9]+/g, " ")} `;
  return words.includes(` ${normalizeText(matcher)} `);
}

/** Html sin <style> ni <script> que no sean JSON-LD (el payload de Nuxt no es texto visible). */
function stripNonLdScripts(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>/g, "")
    .replace(/<script(?![^>]*application\/ld\+json)[\s\S]*?<\/script>/g, "");
}

// --- Plan 195-06: hreflang, lang, consentimiento y Smart App Banner ---

// Pares equivalentes AR <-> ES. MANTENER EN SYNC con utils/hreflang.ts
// (HREFLANG_PAIRS): es el oraculo independiente. Si una pagina cambia en un
// solo lado, el chequeo "fuera de un par" o el del par la detecta.
const HREFLANG_PAIRS = [
  { ar: "/", es: "/es" },
  { ar: "/primera-clase-gratis", es: "/es/primera-clase-gratis" },
  { ar: "/planes", es: "/es/planes" },
];

const trimSlash = (url) => (url.length > 1 ? url.replace(/\/+$/, "") : url);
const absUrl = (path) => (path === "/" ? `${SITE_URL}/` : `${SITE_URL}${path}`);

/** Ruta publica (`/es/planes`) de un html (`es/planes/index.html` o `es/planes.html`). */
function urlPathOfHtml(rel) {
  const clean = rel.replace(/\\/g, "/").replace(/\.html$/, "");
  const dir = clean === "index" ? "" : clean.replace(/\/?index$/, "");
  return `/${dir}`;
}

/** Archivo html de una ruta publica (`/` -> index.html), o null si no existe. */
function htmlOfUrlPath(ctx, urlPath) {
  const base = urlPath === "/" ? "" : urlPath.slice(1);
  const candidates = base
    ? [`${base}/index.html`, `${base}.html`]
    : ["index.html"];
  return candidates.find((c) => ctx.exists(c)) ?? null;
}

/** Atributo de una etiqueta (`<link ...>` o `<meta ...>`), o null. */
function attr(tag, name) {
  const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag);
  return m ? m[1] : null;
}

/** `<link rel="alternate" hreflang href>` de un html: [{ hreflang, href }]. */
function hreflangsOf(html) {
  return [...html.matchAll(/<link\b[^>]*>/g)]
    .map((m) => m[0])
    .filter((tag) => attr(tag, "rel") === "alternate" && attr(tag, "hreflang"))
    .map((tag) => ({
      hreflang: attr(tag, "hreflang"),
      href: attr(tag, "href"),
    }));
}

const canonicalOf = (html) => {
  const tag = [...html.matchAll(/<link\b[^>]*>/g)]
    .map((m) => m[0])
    .find((t) => attr(t, "rel") === "canonical");
  return tag ? attr(tag, "href") : null;
};

const langOf = (html) => /<html\b[^>]*\slang="([^"]*)"/.exec(html)?.[1] ?? null;

/** Todos los html bajo `es/` (la seccion de Barcelona). */
const esHtml = (ctx) =>
  ctx.htmlFiles.filter((f) => f.replace(/\\/g, "/").startsWith("es/"));

// Cualquier rastro de GA4 o del Pixel en el HTML estatico de /es: los scripts
// se cargan solo en el cliente y solo con consentimiento (D-22).
const TRACKER_RE =
  /googletagmanager\.com|google-analytics\.com|gtag\/js|connect\.facebook\.net|facebook\.com\/tr|fbevents|\bgtag\s*\(|\bfbq\s*\(|\bdataLayer\b/i;

const STATIC_TRACKER_TAG_RE =
  /<(?:script|link)\b[^>]*(?:googletagmanager\.com|google-analytics\.com|connect\.facebook\.net)[^>]*>/i;

/** Id de la app en el App Store, de `storeLinks.appStore` (data/app-landing.ts). */
function appStoreId() {
  const source = readFileSync(join(SRC_DATA_DIR, "app-landing.ts"), "utf8");
  return /apps\.apple\.com\/[^"']*\/id(\d+)/.exec(source)?.[1] ?? null;
}

/** Lista de chequeos. Agregar los nuevos AL FINAL. */
const CHECKS = [
  {
    name: "existen index.html, 404.html, robots.txt, llms.txt y sitemap.xml",
    run: (ctx) =>
      REQUIRED_FILES.filter((f) => !ctx.exists(f)).map((f) => `falta ${f}`),
  },
  {
    name: "robots.txt permite los bots de busqueda IA y declara el sitemap",
    run: (ctx) => {
      const robots = ctx.read("robots.txt");
      const problems = AI_BOTS.filter(
        (bot) => !new RegExp(`^User-agent:\\s*${bot}\\s*$`, "m").test(robots),
      ).map((bot) => `robots.txt sin User-agent: ${bot}`);
      if (!/^Sitemap:\s*\S+/m.test(robots)) {
        problems.push("robots.txt sin linea Sitemap:");
      }
      return problems;
    },
  },
  {
    name: "llms.txt lista la direccion de cada sede y no menciona Chapadmalal",
    run: (ctx) => {
      const llms = ctx.read("llms.txt");
      const problems = ctx.data.sedes
        .filter((s) => !llms.includes(s.address.street))
        .map(
          (s) => `llms.txt sin la direccion de ${s.slug}: ${s.address.street}`,
        );
      if (llms.includes("Chapadmalal")) {
        problems.push("llms.txt menciona Chapadmalal");
      }
      return problems;
    },
  },
  {
    name: "ningun html ni llms.txt contiene datos prohibidos",
    run: (ctx) => {
      const problems = [];
      for (const file of [...ctx.htmlFiles, "llms.txt"]) {
        const text = ctx.read(file);
        for (const bad of FORBIDDEN) {
          if (text.includes(bad)) {
            problems.push(`${file} contiene "${bad}"`);
          }
        }
      }
      return problems;
    },
  },
  {
    name: "todo wa.me/<numero> de los html es un WhatsApp de ventas de web-data",
    run: (ctx) => {
      const allowed = new Set(
        Object.values(ctx.data.countries)
          .map((c) => c.salesWhatsapp)
          .filter(Boolean),
      );
      const problems = [];
      for (const file of ctx.htmlFiles) {
        for (const m of ctx.read(file).matchAll(/wa\.me\/(\d+)/g)) {
          if (!allowed.has(m[1])) {
            problems.push(`${file} usa wa.me/${m[1]} (no es de web-data)`);
          }
        }
      }
      return [...new Set(problems)];
    },
  },
  {
    name: "cada post del blog tiene su pagina y esta en sitemap.xml",
    run: (ctx) => {
      const sitemap = ctx.read("sitemap.xml");
      const problems = [];
      for (const { slug } of ctx.data.blog.posts) {
        if (
          !ctx.exists(`blog/${slug}/index.html`) &&
          !ctx.exists(`blog/${slug}.html`)
        ) {
          problems.push(`falta la pagina del post ${slug}`);
        }
        if (!sitemap.includes(`<loc>${SITE_URL}/blog/${slug}</loc>`)) {
          problems.push(`sitemap.xml sin /blog/${slug}`);
        }
      }
      return problems;
    },
  },
  ...(REQUIRE_API
    ? [
        {
          name: "--require-api: web-data.json viene de la API (no del fixture)",
          run: (ctx) =>
            ctx.data.source === "api"
              ? []
              : [
                  `web-data.json tiene source "${ctx.data.source}": el build se hizo con el fixture`,
                ],
        },
        {
          name: "--require-api: ningun html publica marcadores PENDIENTE DE COMPLETAR",
          run: (ctx) =>
            ctx.htmlFiles
              .filter((file) =>
                ctx.read(file).includes("PENDIENTE DE COMPLETAR"),
              )
              .map(
                (file) =>
                  `${file} tiene un marcador "PENDIENTE DE COMPLETAR" (completar antes de publicar)`,
              ),
        },
      ]
    : []),
  // --- Plan 195-04: schema y paginas de sede ---
  {
    name: "home: un solo bloque JSON-LD con exactamente un Organization (@id fijo) y ningun ExerciseGym",
    run: (ctx) => {
      const html = ctx.read("index.html");
      const problems = [];
      const blocks = jsonLdBlocks(html);
      if (blocks.length !== 1) {
        problems.push(
          `index.html tiene ${blocks.length} bloques JSON-LD (debe ser 1)`,
        );
      }
      const nodes = jsonLdNodes(html);
      const orgs = nodesOfType(nodes, "Organization").filter(
        (n) => n["@id"] === ORG_ID,
      );
      if (orgs.length !== 1) {
        problems.push(
          `index.html tiene ${orgs.length} nodos Organization con @id ${ORG_ID}`,
        );
      }
      if (
        nodesOfType(nodes, "ExerciseGym").length > 0 ||
        html.includes("ExerciseGym")
      ) {
        problems.push("index.html menciona ExerciseGym");
      }
      return problems;
    },
  },
  {
    name: "cada sede con clases de Argentina tiene su ExerciseGym correcto en /sedes/<slug>",
    run: (ctx) => gymsOf(ctx, "AR").flatMap((s) => gymPageProblems(ctx, s)),
  },
  {
    name: "cada sede con clases de Espana tiene su ExerciseGym correcto en /es/sedes/<slug>",
    run: (ctx) => gymsOf(ctx, "ES").flatMap((s) => gymPageProblems(ctx, s)),
  },
  {
    name: "los espacios de comunidad tienen un Place y ningun ExerciseGym",
    run: (ctx) => {
      const problems = [];
      for (const sede of ctx.data.sedes.filter(
        (s) => s.kind === "community_space",
      )) {
        const rel = pageRel(sede);
        if (!ctx.exists(rel)) {
          problems.push(`falta ${rel}`);
          continue;
        }
        const nodes = jsonLdNodes(ctx.read(rel));
        if (nodesOfType(nodes, "ExerciseGym").length > 0) {
          problems.push(`${rel} tiene ExerciseGym`);
        }
        const places = nodesOfType(nodes, "Place");
        if (places.length !== 1) {
          problems.push(
            `${rel} tiene ${places.length} nodos Place (debe ser 1)`,
          );
        } else if (places[0].parentOrganization) {
          problems.push(`${rel}: el Place tiene parentOrganization`);
        }
      }
      return problems;
    },
  },
  {
    name: "las sedes de Espana no tienen pagina bajo /sedes ni las de Argentina bajo /es/sedes",
    run: (ctx) => {
      const problems = [];
      for (const s of ctx.data.sedes) {
        const wrong =
          s.country === "ES" ? `sedes/${s.slug}` : `es/sedes/${s.slug}`;
        if (ctx.exists(`${wrong}/index.html`) || ctx.exists(`${wrong}.html`)) {
          problems.push(
            `existe ${wrong} para la sede ${s.slug} (${s.country})`,
          );
        }
      }
      return problems;
    },
  },
  {
    name: "sitemap.xml lista el hub /sedes y la pagina de cada sede",
    run: (ctx) => {
      const sitemap = ctx.read("sitemap.xml");
      return ["/sedes", ...ctx.data.sedes.map((s) => pageUrlPath(s))]
        .filter((path) => !sitemap.includes(`<loc>${SITE_URL}${path}</loc>`))
        .map((path) => `sitemap.xml sin ${path}`);
    },
  },
  {
    name: "ningun bloque JSON-LD puede cerrar el <script> (sin '<' crudo y todos parsean)",
    run: (ctx) => {
      const problems = [];
      for (const file of ctx.htmlFiles) {
        for (const block of jsonLdBlocks(ctx.read(file))) {
          if (block.includes("<")) {
            problems.push(`${file}: JSON-LD con '<' sin escapar`);
          }
          try {
            JSON.parse(block);
          } catch {
            problems.push(`${file}: JSON-LD que no parsea (bloque cortado)`);
          }
        }
      }
      return problems;
    },
  },
  {
    name: "el name de cada ExerciseGym empieza con el nombre de marca de los datos",
    run: (ctx) => {
      const brand = ctx.data.brand.name;
      const problems = [];
      for (const file of ctx.htmlFiles) {
        for (const gym of nodesOfType(
          jsonLdNodes(ctx.read(file)),
          "ExerciseGym",
        )) {
          if (typeof gym.name !== "string" || !gym.name.startsWith(brand)) {
            problems.push(
              `${file}: name "${gym.name}" no empieza con "${brand}"`,
            );
          }
        }
      }
      return problems;
    },
  },
  {
    name: "el footer no escribe direcciones de sedes y enlaza a /sedes",
    run: (ctx) => {
      const problems = [];
      for (const file of ctx.htmlFiles) {
        const footer = /<footer[\s\S]*?<\/footer>/.exec(ctx.read(file));
        if (!footer) continue;
        const text = decodeEntities(footer[0]);
        for (const s of ctx.data.sedes) {
          if (s.address.street && text.includes(s.address.street)) {
            problems.push(
              `${file}: el footer escribe la direccion "${s.address.street}"`,
            );
          }
        }
        if (!/href="\/sedes"/.test(footer[0])) {
          problems.push(`${file}: el footer no enlaza a /sedes`);
        }
      }
      return [...new Set(problems)];
    },
  },
  {
    name: "fixture: cubre sede sin horarios, geo exacta/aproximada y direccion hostil",
    run: (ctx) => {
      if (ctx.data.source !== "fixture") return [];
      const gyms = ctx.data.sedes.filter((s) => s.kind === "gym");
      const problems = [];
      if (!gyms.some((s) => s.openingHours.length === 0)) {
        problems.push(
          "el fixture no tiene ninguna sede con openingHours vacio",
        );
      }
      if (!gyms.some((s) => hasExactGeo(s))) {
        problems.push("el fixture no tiene ninguna sede con geo exacta");
      }
      if (!gyms.some((s) => s.geo && !hasExactGeo(s))) {
        problems.push("el fixture no tiene ninguna sede con geo aproximada");
      }
      if (!ctx.data.sedes.some((s) => (s.address.street ?? "").includes("<"))) {
        problems.push(
          "el fixture no tiene ninguna direccion con '<' (prueba de escape del JSON-LD)",
        );
      }
      return problems;
    },
  },
  // --- Plan 195-05: disciplinas, planes, profes, primera clase y blog ---
  {
    name: "cada disciplina de data/disciplinas.ts tiene su pagina, con los 6 niveles en calistenia, y el hub existe",
    run: (ctx) => {
      const problems = [];
      if (!ctx.exists("disciplinas/index.html")) {
        problems.push("falta disciplinas/index.html");
      }
      const disciplinas = parseDisciplinas();
      if (disciplinas.length === 0) {
        problems.push("data/disciplinas.ts no tiene ninguna disciplina");
      }
      for (const d of disciplinas) {
        const rel = `disciplinas/${d.slug}/index.html`;
        if (!ctx.exists(rel)) {
          problems.push(`falta ${rel}`);
          continue;
        }
        if (d.slug === "calistenia") {
          const html = ctx.read(rel);
          for (const level of LEVEL_NAMES) {
            if (!html.includes(level)) {
              problems.push(`${rel} no menciona el nivel ${level}`);
            }
          }
        }
      }
      return problems;
    },
  },
  {
    name: "'Dónde se dicta' de cada disciplina lista exactamente las sedes con una actividad que coincide (o el aviso de WhatsApp)",
    run: (ctx) => {
      const problems = [];
      for (const d of parseDisciplinas()) {
        const rel = `disciplinas/${d.slug}/index.html`;
        if (!ctx.exists(rel)) continue; // ya lo informa el chequeo anterior
        const html = ctx.read(rel);
        const section =
          /D(?:ó|&oacute;)nde se dicta<\/h2>([\s\S]*?)<\/section>/.exec(html);
        if (!section) {
          problems.push(`${rel} no tiene la seccion "Dónde se dicta"`);
          continue;
        }
        const actual = new Set(
          [...section[1].matchAll(/href="((?:\/es)?\/sedes\/[^"]+)"/g)].map(
            (m) => m[1],
          ),
        );
        const expected = new Set(
          ctx.data.sedes
            .filter(
              (s) =>
                s.kind === "gym" &&
                s.activities.some((a) =>
                  d.matchers.some((m) => nameMatches(a.name, m)),
                ),
            )
            .map((s) => pageUrlPath(s)),
        );
        for (const path of expected) {
          if (!actual.has(path)) problems.push(`${rel} no lista ${path}`);
        }
        for (const path of actual) {
          if (!expected.has(path)) {
            problems.push(`${rel} lista ${path} sin actividad que coincida`);
          }
        }
        if (
          expected.size === 0 &&
          !decodeEntities(section[1]).includes(
            "Consultá disponibilidad por WhatsApp",
          )
        ) {
          problems.push(
            `${rel}: sin sedes y sin el aviso "Consultá disponibilidad por WhatsApp"`,
          );
        }
      }
      return problems;
    },
  },
  {
    name: "planes: sin precios (sin '$<n>', ARS, EUR ni euro) y con al menos un wa.me",
    run: (ctx) => {
      if (!ctx.exists("planes/index.html")) return ["falta planes/index.html"];
      const problems = [];
      for (const rel of ["planes/index.html", "es/planes/index.html"]) {
        if (!ctx.exists(rel)) continue;
        const html = ctx.read(rel);
        const visible = decodeEntities(stripNonLdScripts(html));
        const hit = PRICE_RE.exec(visible);
        if (hit) {
          problems.push(
            `${rel} contiene un patron de precio: "${hit[0]}" (contexto: ${visible
              .slice(Math.max(0, hit.index - 20), hit.index + 20)
              .replace(/\s+/g, " ")})`,
          );
        }
        if (!/wa\.me\/\d/.test(html)) {
          problems.push(`${rel} no tiene ningun link wa.me/`);
        }
      }
      return problems;
    },
  },
  {
    name: "profes: cada profe publicado tiene su Person en /profes/<slug>, los no publicados no tienen pagina y el autor del blog esta publicado",
    run: (ctx) => {
      const problems = [];
      const { published, unpublished, defaultAuthor } = parseProfes();
      if (!ctx.exists("profes/index.html"))
        problems.push("falta profes/index.html");
      if (!defaultAuthor) {
        problems.push("data/profes.ts no define DEFAULT_BLOG_AUTHOR_SLUG");
      } else if (!published.includes(defaultAuthor)) {
        problems.push(
          `el autor por defecto del blog (${defaultAuthor}) no esta publicado`,
        );
      }
      for (const slug of published) {
        const rel = `profes/${slug}/index.html`;
        if (!ctx.exists(rel)) {
          problems.push(`falta ${rel}`);
          continue;
        }
        const persons = nodesOfType(jsonLdNodes(ctx.read(rel)), "Person");
        const expectedId = `${SITE_URL}/profes/${slug}#person`;
        if (persons.length !== 1) {
          problems.push(
            `${rel} tiene ${persons.length} nodos Person (debe ser 1)`,
          );
          continue;
        }
        const person = persons[0];
        if (person["@id"] !== expectedId) {
          problems.push(
            `${rel}: @id ${person["@id"]} (esperado ${expectedId})`,
          );
        }
        if (person.worksFor?.["@id"] !== ORG_ID) {
          problems.push(`${rel}: worksFor no apunta a ${ORG_ID}`);
        }
        if (typeof person.name !== "string" || person.name.length === 0) {
          problems.push(`${rel}: Person sin name`);
        }
      }
      for (const slug of unpublished) {
        if (
          ctx.exists(`profes/${slug}/index.html`) ||
          ctx.exists(`profes/${slug}.html`)
        ) {
          problems.push(
            `el profe no publicado ${slug} tiene pagina en /profes`,
          );
        }
      }
      for (const file of ctx.htmlFiles) {
        const m = /^profes\/([^/]+)\/index\.html$/.exec(file);
        if (m && !published.includes(m[1])) {
          problems.push(`${file} existe pero ${m[1]} no esta publicado`);
        }
      }
      return problems;
    },
  },
  {
    name: "primera-clase-gratis existe, con el registro online de cada sede de Argentina y un wa.me",
    run: (ctx) => {
      const rel = "primera-clase-gratis/index.html";
      if (!ctx.exists(rel)) return [`falta ${rel}`];
      const html = ctx.read(rel);
      const problems = [];
      if (!html.includes("app.eltemplo.org/register")) {
        problems.push(`${rel} no enlaza a app.eltemplo.org/register`);
      }
      for (const sede of gymsOf(ctx, "AR")) {
        if (!new RegExp(`register\\?branchId=${sede.id}(?:&|")`).test(html)) {
          problems.push(
            `${rel} sin "Reservá online" de ${sede.slug} (branchId ${sede.id})`,
          );
        }
      }
      if (!/wa\.me\/\d/.test(html)) problems.push(`${rel} sin wa.me/`);
      return problems;
    },
  },
  {
    name: "sitemap.xml lista disciplinas, planes, profes publicados y primera clase gratis",
    run: (ctx) => {
      const sitemap = ctx.read("sitemap.xml");
      const paths = [
        "/disciplinas",
        ...parseDisciplinas().map((d) => `/disciplinas/${d.slug}`),
        "/planes",
        "/profes",
        ...parseProfes().published.map((slug) => `/profes/${slug}`),
        "/primera-clase-gratis",
      ];
      return paths
        .filter((path) => !sitemap.includes(`<loc>${SITE_URL}${path}</loc>`))
        .map((path) => `sitemap.xml sin ${path}`);
    },
  },
  {
    name: "las paginas nuevas (disciplinas, planes, profes, primera clase) llevan un Organization (@id fijo) y un BreadcrumbList",
    run: (ctx) => {
      const pages = [
        "disciplinas/index.html",
        ...parseDisciplinas().map((d) => `disciplinas/${d.slug}/index.html`),
        "planes/index.html",
        "profes/index.html",
        ...parseProfes().published.map((slug) => `profes/${slug}/index.html`),
        "primera-clase-gratis/index.html",
      ];
      const problems = [];
      for (const rel of pages) {
        if (!ctx.exists(rel)) continue; // ya lo informa el chequeo de la pagina
        const nodes = jsonLdNodes(ctx.read(rel));
        const orgs = nodesOfType(nodes, "Organization").filter(
          (n) => n["@id"] === ORG_ID,
        );
        if (orgs.length !== 1) {
          problems.push(
            `${rel} tiene ${orgs.length} Organization con @id ${ORG_ID}`,
          );
        }
        const crumbs = nodesOfType(nodes, "BreadcrumbList");
        if (crumbs.length !== 1) {
          problems.push(
            `${rel} tiene ${crumbs.length} BreadcrumbList (debe ser 1)`,
          );
        }
      }
      return problems;
    },
  },
  {
    name: "cada post del blog publica un Article con el autor Person por defecto (data/profes.ts)",
    run: (ctx) => {
      const { defaultAuthor } = parseProfes();
      const expectedId = `${SITE_URL}/profes/${defaultAuthor}#person`;
      const problems = [];
      for (const post of ctx.data.blog.posts) {
        const rel = [
          `blog/${post.slug}/index.html`,
          `blog/${post.slug}.html`,
        ].find((r) => ctx.exists(r));
        if (!rel) continue; // ya lo informa el chequeo de posts con pagina
        const articles = nodesOfType(jsonLdNodes(ctx.read(rel)), "Article");
        if (articles.length !== 1) {
          problems.push(
            `${rel} tiene ${articles.length} nodos Article (debe ser 1)`,
          );
          continue;
        }
        if (!/^https?:\/\/\S+$/.test(articles[0].image ?? "")) {
          problems.push(
            `${rel}: el Article no tiene una image absoluta (cover o imagen de reserva)`,
          );
        }
        if (articles[0].author?.["@id"] !== expectedId) {
          problems.push(
            `${rel}: author ${articles[0].author?.["@id"]} (esperado ${expectedId})`,
          );
        }
      }
      return problems;
    },
  },
  {
    name: "fixture: cubre una actividad cuyo nombre contiene un matcher sin ser palabra completa (Moreno + 'Aromaterapia')",
    run: (ctx) => {
      if (ctx.data.source !== "fixture") return [];
      const hit = ctx.data.sedes.some((sede) =>
        parseDisciplinas().some(({ matchers }) => {
          const wholeWord = sede.activities.some((a) =>
            matchers.some((m) => nameMatches(a.name, m)),
          );
          const substring = sede.activities.some((a) =>
            matchers.some((m) =>
              normalizeText(a.name).includes(normalizeText(m)),
            ),
          );
          return substring && !wholeWord;
        }),
      );
      return hit
        ? []
        : [
            "el fixture no tiene ninguna sede cuyo unico parecido con un matcher sea una subcadena (prueba de coincidencia por palabra completa)",
          ];
    },
  },
  {
    name: "fixture: cubre una sede que solo matchea una disciplina gracias a quitar acentos y un espacio de comunidad con actividad que matchea",
    run: (ctx) => {
      if (ctx.data.source !== "fixture") return [];
      const problems = [];
      const disciplinas = parseDisciplinas();
      // Sin quitar acentos, "Sesión Grupal" ya no coincide con "sesion grupal".
      const rawMatch = (name, matcher) =>
        ` ${name.toLowerCase().replace(/[^a-z0-9]+/g, " ")} `.includes(
          ` ${matcher} `,
        );
      const accented = ctx.data.sedes.some(
        (sede) =>
          sede.kind === "gym" &&
          disciplinas.some(
            ({ matchers }) =>
              sede.activities.some((a) =>
                matchers.some((m) => nameMatches(a.name, m)),
              ) &&
              !sede.activities.some((a) =>
                matchers.some((m) => rawMatch(a.name, m)),
              ),
          ),
      );
      if (!accented) {
        problems.push(
          "el fixture no tiene ninguna sede de clases que solo matchee una disciplina quitando acentos o mayusculas",
        );
      }
      const community = ctx.data.sedes.some(
        (sede) =>
          sede.kind === "community_space" &&
          disciplinas.some(({ matchers }) =>
            sede.activities.some((a) =>
              matchers.some((m) => nameMatches(a.name, m)),
            ),
          ),
      );
      if (!community) {
        problems.push(
          "el fixture no tiene ningun espacio de comunidad con una actividad que coincida con una disciplina (prueba del filtro kind gym)",
        );
      }
      return problems;
    },
  },
  {
    name: "hreflang: cada par AR/ES tiene los tres links (es-AR, es-ES, x-default) con las URLs exactas, en los dos lados y autorreferentes",
    run: (ctx) => {
      const problems = [];
      for (const pair of HREFLANG_PAIRS) {
        const expected = {
          "es-AR": absUrl(pair.ar),
          "es-ES": absUrl(pair.es),
          "x-default": absUrl(pair.ar),
        };
        for (const side of [pair.ar, pair.es]) {
          const rel = htmlOfUrlPath(ctx, side);
          if (!rel) {
            problems.push(`falta la pagina ${side}`);
            continue;
          }
          const links = hreflangsOf(ctx.read(rel));
          if (links.length !== 3) {
            problems.push(
              `${rel}: ${links.length} links hreflang (deben ser 3)`,
            );
          }
          for (const [lang, href] of Object.entries(expected)) {
            const found = links.filter((l) => l.hreflang === lang);
            if (found.length !== 1 || found[0].href !== href) {
              problems.push(
                `${rel}: hreflang ${lang} = ${found.map((l) => l.href).join(",") || "ausente"} (esperado ${href})`,
              );
            }
          }
          // Autorreferencia: la pagina se lista a si misma y su canonical coincide.
          const self = absUrl(side);
          if (
            !links.some((l) => l.href && trimSlash(l.href) === trimSlash(self))
          ) {
            problems.push(`${rel}: no se autorreferencia en hreflang`);
          }
          const canonical = canonicalOf(ctx.read(rel));
          if (!canonical || trimSlash(canonical) !== trimSlash(self)) {
            problems.push(`${rel}: canonical ${canonical} distinto de ${self}`);
          }
        }
      }
      return problems;
    },
  },
  {
    name: "hreflang: todo link apunta a una pagina que existe y que se lista de vuelta (reciprocidad) y las paginas fuera de un par no tienen hreflang",
    run: (ctx) => {
      const problems = [];
      const inPair = new Set(
        HREFLANG_PAIRS.flatMap((p) => [p.ar, p.es]).map(trimSlash),
      );
      for (const rel of ctx.htmlFiles) {
        const path = urlPathOfHtml(rel);
        const links = hreflangsOf(ctx.read(rel));
        if (links.length === 0) continue;
        if (!inPair.has(trimSlash(path))) {
          problems.push(`${rel}: no es parte de un par y tiene hreflang`);
          continue;
        }
        for (const link of links) {
          const target = link.href?.startsWith(SITE_URL)
            ? link.href.slice(SITE_URL.length) || "/"
            : null;
          const targetRel = target
            ? htmlOfUrlPath(ctx, trimSlash(target))
            : null;
          if (!targetRel) {
            problems.push(
              `${rel}: hreflang ${link.hreflang} apunta a ${link.href}, que no existe`,
            );
            continue;
          }
          const back = hreflangsOf(ctx.read(targetRel));
          if (
            !back.some(
              (b) => b.href && trimSlash(b.href) === trimSlash(absUrl(path)),
            )
          ) {
            problems.push(
              `${rel}: hreflang ${link.hreflang} -> ${link.href} no es reciproco (${targetRel} no lista ${absUrl(path)})`,
            );
          }
        }
      }
      return problems;
    },
  },
  {
    name: "lang: todo html bajo es/ declara es-ES y el resto es-AR",
    run: (ctx) => {
      const problems = [];
      const es = new Set(esHtml(ctx));
      for (const rel of ctx.htmlFiles) {
        const html = ctx.read(rel);
        // Fuera de /es: 200.html y 404.html son shells de la SPA (sin SSR, sin
        // <head> de la app) y los redirects de routeRules solo traen un meta refresh.
        const isShell =
          rel === "200.html" ||
          rel === "404.html" ||
          html.includes('http-equiv="refresh"');
        if (isShell && !es.has(rel)) continue;
        const expected = es.has(rel) ? "es-ES" : "es-AR";
        const lang = langOf(html);
        if (lang !== expected) {
          problems.push(`${rel}: lang="${lang}" (esperado ${expected})`);
        }
      }
      for (const required of [
        "es/index.html",
        "es/primera-clase-gratis/index.html",
        "es/planes/index.html",
      ]) {
        if (!ctx.exists(required)) problems.push(`falta ${required}`);
      }
      return problems;
    },
  },
  {
    name: "consentimiento: ningun html bajo es/ trae GA4 ni Pixel (scripts, preconnect, gtag(), fbq(), dataLayer) y ningun html del sitio los trae como <script>/<link> estatico",
    run: (ctx) => {
      const problems = [];
      const files = esHtml(ctx);
      if (files.length === 0) return ["no hay ningun html bajo es/"];
      for (const rel of files) {
        const html = ctx.read(rel);
        const hit = TRACKER_RE.exec(html);
        if (hit) {
          const at = hit.index;
          problems.push(
            `${rel}: contiene "${hit[0]}" (...${html.slice(Math.max(0, at - 30), at + 60).replace(/\s+/g, " ")}...)`,
          );
        }
      }
      // Nunca en el HTML estatico del resto del sitio: en Argentina tambien
      // se insertan solo desde el cliente (plugins ga4 y meta-pixel).
      const es = new Set(files);
      for (const rel of ctx.htmlFiles) {
        if (es.has(rel)) continue;
        const tag = STATIC_TRACKER_TAG_RE.exec(ctx.read(rel));
        if (tag) {
          problems.push(
            `${rel}: etiqueta estatica de GA4 o Pixel: ${tag[0].slice(0, 120)}`,
          );
        }
      }
      return problems;
    },
  },
  {
    name: "Smart App Banner: el home de AR y el de ES llevan apple-itunes-app con el id de la app de data/app-landing.ts",
    run: (ctx) => {
      const id = appStoreId();
      if (!id)
        return ["no se pudo leer el id de la app en data/app-landing.ts"];
      const problems = [];
      for (const rel of ["index.html", "es/index.html"]) {
        if (!ctx.exists(rel)) {
          problems.push(`falta ${rel}`);
          continue;
        }
        const metas = [...ctx.read(rel).matchAll(/<meta\b[^>]*>/g)]
          .map((m) => m[0])
          .filter((t) => attr(t, "name") === "apple-itunes-app");
        if (
          metas.length !== 1 ||
          attr(metas[0], "content") !== `app-id=${id}`
        ) {
          problems.push(
            `${rel}: apple-itunes-app = ${metas.map((t) => attr(t, "content")).join(",") || "ausente"} (esperado un solo app-id=${id})`,
          );
        }
      }
      return problems;
    },
  },
  // AGREGAR CHEQUEOS NUEVOS ABAJO (plan 195-07 en adelante).
];

function main() {
  if (!existsSync(PUBLIC_DIR)) {
    process.stderr.write(
      `No existe ${PUBLIC_DIR}: corré pnpm run generate antes de verificar.\n`,
    );
    process.exit(1);
  }
  if (!existsSync(DATA_PATH)) {
    process.stderr.write(`No existe ${DATA_PATH}: corré pnpm prepare-data.\n`);
    process.exit(1);
  }
  const data = JSON.parse(readFileSync(DATA_PATH, "utf8"));
  const ctx = {
    data,
    htmlFiles: walkHtml(PUBLIC_DIR),
    exists: (rel) => existsSync(join(PUBLIC_DIR, rel)),
    read: (rel) => readFileSync(join(PUBLIC_DIR, rel), "utf8"),
  };

  let failed = 0;
  for (const check of CHECKS) {
    let problems;
    try {
      problems = check.run(ctx);
    } catch (e) {
      problems = [`excepcion: ${e instanceof Error ? e.message : String(e)}`];
    }
    if (problems.length === 0) {
      out(`OK     ${check.name}`);
    } else {
      failed += 1;
      out(`FALLA  ${check.name}`);
      for (const p of problems.slice(0, 20)) {
        out(`         - ${p}`);
      }
      if (problems.length > 20) {
        out(`         ... y ${problems.length - 20} mas`);
      }
    }
  }
  out(
    failed === 0
      ? `verify-seo-output: ${CHECKS.length} chequeos OK`
      : `verify-seo-output: ${failed} de ${CHECKS.length} chequeos con FALLA`,
  );
  process.exit(failed === 0 ? 0 : 1);
}

main();
