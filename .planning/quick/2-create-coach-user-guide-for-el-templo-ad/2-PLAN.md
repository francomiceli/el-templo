---
phase: quick-002
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - docs/guia-coach-admin.md
autonomous: true
requirements: [QUICK-002]
must_haves:
  truths:
    - "Un coach nuevo puede leer la guia y entender como usar cada seccion de la app admin"
    - "Cada flujo de trabajo principal tiene pasos numerados con referencias a la interfaz real"
    - "Existe un checklist de onboarding para verificar que un coach domina las funciones basicas"
    - "Existe un proceso claro para reportar ineficiencias, sugerir mejoras o pedir cambios"
  artifacts:
    - path: "docs/guia-coach-admin.md"
      provides: "Guia completa de usuario coach para el-templo-admin"
      min_lines: 300
  key_links: []
---

<objective>
Create a comprehensive coach user guide for the el-templo-admin app, written in Spanish.

Purpose: Give new and existing coaches a single reference document covering all admin app features, step-by-step workflows, an onboarding checklist, and a structured process for reporting issues and suggesting improvements.

Output: `docs/guia-coach-admin.md` — a standalone markdown guide.
</objective>

<execution_context>
@/home/franco/.claude/get-shit-done/workflows/execute-plan.md
@/home/franco/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@el-templo-admin/src/router/routes.ts
@el-templo-admin/src/pages/SessionsPage.vue
@el-templo-admin/src/pages/SessionEditPage.vue
@el-templo-admin/src/pages/GeneratePage.vue
@el-templo-admin/src/pages/ExercisesPage.vue
@el-templo-admin/src/pages/AlumnosPage.vue
@el-templo-admin/src/pages/AlumnoDetailPage.vue
@el-templo-admin/src/layouts/AdminLayout.vue
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create comprehensive coach user guide in Spanish</name>
  <files>docs/guia-coach-admin.md</files>
  <action>
Create `docs/guia-coach-admin.md` with the following structure and content. The guide must be written entirely in Spanish. Read the admin app source files listed in the context section to extract accurate UI labels, button names, tab names, URL patterns, and workflow specifics. Do NOT guess — use actual labels from the Vue templates.

**Document structure:**

1. **Encabezado y proposito** — Title "Guia del Coach — El Templo Admin", brief description of what the admin app is for, who should read this guide, and when to reference it.

2. **Acceso y navegacion** — How to log in (URL, credentials process), sidebar navigation items (Sesiones with pending count badge, Generar, Ejercicios, Alumnos), header controls (menu toggle, logout), URL-based state (?week=Y2026W08 pattern).

3. **Sesiones (Vista principal)** — Full documentation of the sessions page:
   - Two tabs: General (standard sessions) and Personalizadas (journey-based sessions)
   - Week/day navigation and filtering
   - Level display (Alfa, Delta, Sigma, Omega, Spartan)
   - Status indicators: green check (approved), amber clock (pending_review)
   - Session cards: what info is shown, how to open detail/edit
   - Bulk approve: when to use, confirmation dialog
   - PDF download: week-level and day-level, which levels included (Alfa-Omega, excludes Spartan)
   - Member preview button

4. **Edicion de sesiones** — Step-by-step editing workflow:
   - Session status flow: Generated (pending_review) -> Coach Reviews & Edits -> Approved
   - Block-level operations: swap blocks, change format (with compatibility score), change role
   - Exercise-level operations: swap exercise (with pool dialog, contraction filter, search), add exercise, remove exercise, reorder exercises, update prescriptions (blur-save behavior)
   - Mobility management: adding/swapping/editing mobility exercises per block
   - Format parameters editor
   - Budget bar and contraction mix indicators
   - Session-level actions: Approve, Revert to pending, Reset to algorithm snapshot
   - Important: explain that prescription fields save on blur (when you click away from the field)

5. **Generacion de sesiones (Generar)** — Step-by-step generation workflow:
   - Scope selection: week, day, day+level
   - Future weeks only restriction (current week + 1 minimum)
   - Week summary view before generating
   - What happens after generation (sessions appear as pending_review)
   - Low sessions warning banner and what it means (weeksAhead <= 1)
   - Journey session generation: "Generar Todos" for journey types

6. **Ejercicios** — Exercise library documentation:
   - Search and filters: name, category, level, route, contraction type, video status
   - Exercise cards: what info is displayed
   - Bulk video upload process
   - Note: "Crear ejercicio" button exists but is disabled (future feature)

7. **Alumnos** — Member management:
   - Search and filter members
   - Member detail page: journey progress, level info, completed journeys
   - What coaches can see vs what they can change

8. **Flujos de trabajo comunes** — Numbered step-by-step workflows for common tasks:
   - "Revisar y aprobar sesiones de la semana" (full review cycle)
   - "Editar un ejercicio en una sesion" (swap, change prescription)
   - "Generar sesiones para la proxima semana"
   - "Descargar PDF de un dia"
   - "Ver el progreso de un alumno"

9. **Checklist de onboarding para coaches nuevos** — Checklist format with [ ] checkboxes:
   - Login and navigate all sections
   - Review a pending session
   - Edit a prescription field
   - Swap an exercise
   - Add a mobility exercise
   - Approve a session
   - Bulk approve a day
   - Generate sessions for next week
   - Download a day PDF
   - Look up a member's journey progress
   - Understand status indicators
   - Know where to report issues

10. **Reporte de ineficiencias, mejoras y solicitudes de cambio** — Structured process:
    - When to report: bugs, UX friction, missing features, workflow inefficiencies
    - How to report: provide a template with fields (Tipo: Bug/Mejora/Solicitud, Seccion de la app, Descripcion del problema, Pasos para reproducir, Impacto, Sugerencia)
    - Where to report: specify that reports should go to the admin/dev team (leave placeholder for actual channel — Slack, email, form, etc.)
    - Priority levels: Critico (bloquea trabajo), Alto (ralentiza trabajo), Medio (molestia), Bajo (sugerencia)
    - What happens after reporting: brief description of triage and feedback loop

11. **Glosario** — Key terms: SPOM, ruta, bloque (Initium, Nucleus, Deuteros, Athlos/Epikos), nivel, formato, prescripcion, movilidad, snapshot, journey/camino.

**Writing guidelines:**

- Use formal but approachable Spanish ("usted" form is fine, but "tu" is also acceptable — be consistent)
- Use actual UI labels from the Vue templates (read the source files)
- Include URL examples where relevant (e.g., `/sessions?week=Y2026W08`)
- Use markdown formatting: headers, bullet lists, numbered steps, code blocks for URLs, bold for UI element names
- Do NOT include screenshots (this is a text-only guide)
- Target 350-500 lines
  </action>
  <verify>
  <automated>test -f docs/guia-coach-admin.md && wc -l docs/guia-coach-admin.md | awk '{if ($1 >= 300) print "PASS: " $1 " lines"; else print "FAIL: only " $1 " lines"}'</automated>
  <manual>Read through the guide and verify section completeness, accurate Spanish, and correct UI references</manual>
  </verify>
  <done> - docs/guia-coach-admin.md exists with 300+ lines - All 11 sections present and populated - Written entirely in Spanish - Workflows have numbered steps referencing actual UI elements - Onboarding checklist has checkbox items - Feedback/improvement reporting section has structured template - Glossary covers key domain terms
  </done>
  </task>

</tasks>

<verification>
- File exists at docs/guia-coach-admin.md
- Document is in Spanish
- All 11 sections are present with substantive content
- Workflows reference actual UI labels from the admin app source code
- Checklist uses [ ] checkbox format
- Feedback template is copy-pasteable
</verification>

<success_criteria>

- A coach with zero prior experience can read the guide and understand how to navigate, review, edit, approve, and generate sessions
- The onboarding checklist provides a structured path to verify competency
- The feedback process gives coaches a clear channel and format for improvement suggestions
  </success_criteria>

<output>
After completion, create `.planning/quick/2-create-coach-user-guide-for-el-templo-ad/2-SUMMARY.md`
</output>
