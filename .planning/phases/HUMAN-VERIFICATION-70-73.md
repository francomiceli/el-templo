# Human Verification Checklist — Phases 70-73

Consolidated manual QA checklist for phases 70 (Personalizadas Cycle Config), 71 (Plan-Driven Personalizada Assignment), 72 (Unified Training Experience), and 73 (Mi Plan Catalog).

**Prerequisites:**
- Staging environment with recent DB migration (including 0053_plan_descriptions)
- Test accounts: member WITH active personalizada subscription, member WITH expired personalizada, member with NO subscription, member with regular (non-personalizada) subscription

---

## Phase 70 — Personalizadas Cycle Config

### 70-1: Progress bar visual fill level
- **Steps:** Log in as member with active personalizada. Go to Mi Camino > Personalizadas.
- **Expected:** q-linear-progress bar fills proportionally to currentWeek/cycleWeeks (e.g. 30-day plan on day 3 = Semana 1 de 5 = ~20% fill).
- [ ] PASS / FAIL

### 70-2: Wrap-up card on expired cycle
- **Steps:** Use a member whose personalizada startedAt is more than durationDays ago. Go to Mi Camino.
- **Expected:** Progress bar section hidden. "Ciclo Completo!" card shows: trophy icon, total completions, duration breakdown tiles (20/40/60 min), "Cambiar Personalizada" button, "Consulta en recepcion para renovar" button.
- [ ] PASS / FAIL

### 70-3: Default tab selection on load
- **Steps:** As member with active personalizada, navigate to /mi-camino.
- **Expected:** Personalizadas tab is selected by default (not Entrenamiento). Content loads immediately.
- [ ] PASS / FAIL

---

## Phase 71 — Plan-Driven Personalizada Assignment

### 71-1: Admin — personalizada type dropdown
- **Steps:** In admin app, go to Planes > create or edit a plan. Toggle "Es Personalizada" ON.
- **Expected:** A "Tipo de Personalizada" dropdown appears with 6 options (tren_superior, tren_inferior, empuje, traccion, cuerpo_completo, movilidad). Toggling OFF hides the dropdown and clears the selection.
- [ ] PASS / FAIL

### 71-2: Auto-assignment on plan assignment
- **Steps:** In admin, assign a personalizada plan (e.g. Foundation+ with personalizadaType=tren_superior) to a member.
- **Expected:** Check DB — member_personalizadas row auto-created with personalizadaType matching the plan's type. No manual selection needed by the member.
- [ ] PASS / FAIL

### 71-3: Member app — no self-selection flow
- **Steps:** Log in as member with personalizada plan in the member app. Check navigation.
- **Expected:** No "Personalizada" tab in bottom nav or drawer. No way to reach a personalizada selection/overview page. The old /personalizada route should not exist.
- [ ] PASS / FAIL

### 71-4: Dead route cleanup (gap from verification)
- **Steps:** As member WITHOUT active personalizada, navigate to Mi Camino.
- **Expected:** Should see a message about contacting admin/trainer — NOT an "Elegir Personalizada" button that links to a dead route. If clicking "Cambiar Personalizada" in any dialog, it should NOT navigate to /personalizada (404).
- [ ] PASS / FAIL — **NOTE:** Verification found dead links in PersonalizadaSection.vue and DurationPicker.vue pointing to deleted /personalizada route. Confirm these are fixed.

---

## Phase 72 — Unified Training Experience

### 72-1: Context-aware Entrenar tab (personalizada member)
- **Steps:** Log in as member with active personalizada. Navigate to /training (Entrenar tab).
- **Expected:** Info card with personalizada name, tier badge, and "Semana X de Y" progress. Three duration cards (20/40/60 min) below. Weekly training view is NOT shown.
- [ ] PASS / FAIL

### 72-2: Context-aware Entrenar tab (regular member)
- **Steps:** Log in as member with regular (non-personalizada) subscription. Navigate to /training.
- **Expected:** Weekly training view loads as normal. No personalizada info card or duration picker.
- [ ] PASS / FAIL

### 72-3: Subscription blocking (no subscription)
- **Steps:** Log in as member with no active subscription. Navigate to /training.
- **Expected:** Blocked state: fitness_center icon, "Activa Tu Plan" heading, "Consulta en recepcion..." message.
- [ ] PASS / FAIL

### 72-4: Post-session flow — personalizada
- **Steps:** Complete a personalizada session through to the progress indicator. Click "Continuar".
- **Expected:** App navigates to /mi-camino (NOT back to the duration picker).
- [ ] PASS / FAIL

### 72-5: Post-session flow — regular training
- **Steps:** Complete a regular training session through DayPlayer to RPE/notes summary. Submit.
- **Expected:** App navigates to /mi-camino (NOT back to /training).
- [ ] PASS / FAIL

### 72-6: Unified Mi Camino (personalizada member)
- **Steps:** Navigate to /mi-camino as a personalizada member.
- **Expected:** PersonalizadaSection renders as primary content. "Entrenar" CTA visible. Collapsible "Estadisticas de Entrenamiento" section visible but collapsed. NO Entrenamiento/Personalizadas tabs shown.
- [ ] PASS / FAIL

### 72-7: Expired personalizada — archived data + renewal
- **Steps:** Log in as member with expired personalizada. Go to /mi-camino.
- **Expected:** Archived personalizada data visible. Banner with "Consulta en recepcion para renovar" shown.
- [ ] PASS / FAIL

---

## Phase 73 — Mi Plan Catalog

### 73-1: Planes tab in navigation
- **Steps:** Open member app on mobile. Check bottom tab bar.
- **Expected:** 5th tab "Planes" with card_membership icon visible. Tapping loads the catalog.
- [ ] PASS / FAIL

### 73-2: Plan descriptions visible
- **Steps:** Navigate to /planes. Check gym plan cards.
- **Expected:** Each plan card shows its description text below the badges:
  - Flex: "Turnos fijos en una sede. Incluye 2 sesiones de regalo en tu primer mes."
  - Flex+: "Turnos fijos o libres en una sede. Incluye acceso a clases ROM los sabados."
  - Foundation: "Turnos fijos en una sede. Compromiso de 4 meses con 2 sesiones de regalo."
  - Foundation+: "Turnos fijos o libres con acceso a todas las sedes. Incluye clases ROM los sabados."
  - Performance: "Nuestro plan mas completo. Turnos fijos o libres en todas las sedes con acceso a ROM y eventos exclusivos."
- [ ] PASS / FAIL

### 73-3: Current plan highlighting (with subscription)
- **Steps:** Log in as member with active subscription. Navigate to /planes.
- **Expected:** Current plan card shows "Tu plan actual" badge (primary color) and "Activo — vence DD/MM/YYYY". Other plans show WhatsApp CTA labeled "Contacta para cambiar de plan".
- [ ] PASS / FAIL

### 73-4: New member contextual CTA (no subscription)
- **Steps:** Log in as member with no subscription. Navigate to /planes.
- **Expected:** All plan cards show "Contacta para elegir tu plan" (not "cambiar").
- [ ] PASS / FAIL

### 73-5: WhatsApp CTA functionality
- **Steps:** Tap WhatsApp CTA on any non-current plan card.
- **Expected:** Opens wa.me/5492235820521 with pre-filled message "Hola, me interesa el plan [name]".
- [ ] PASS / FAIL

### 73-6: Personalizada plans with zone badges
- **Steps:** On /planes, scroll to "Clases Personalizadas" section.
- **Expected:** Personalizada plans show zone badges (e.g. "Hombros", "Pecho", etc.). No tier badges on personalizada cards.
- [ ] PASS / FAIL

---

## Summary

| Phase | Checks | Critical |
|-------|--------|----------|
| 70    | 3      | 70-2 (wrap-up card) |
| 71    | 4      | 71-4 (dead route cleanup) |
| 72    | 7      | 72-1, 72-4, 72-5 (core flows) |
| 73    | 6      | 73-2 (descriptions), 73-3 (highlighting) |
| **Total** | **20** | |
