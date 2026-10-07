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
 *        [--public-dir=<ruta>] [--data=<ruta>]   (los dos ultimos, para tests)
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
    .replace(/&amp;/g, "&");
}

const gymsOf = (ctx, country) =>
  ctx.data.sedes.filter((s) => s.kind === "gym" && s.country === country);

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
  // AGREGAR CHEQUEOS NUEVOS ABAJO (planes 195-05 y 195-06).
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
