# Phase 86: QR Promo — Free Month Campaign - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-27
**Phase:** 86-qr-promo-free-month-campaign
**Areas discussed:** Redemption flow, QR & URL strategy, Promo scope & limits, Landing page experience, Training content, Admin management, Templo Online research

---

## QR & URL Strategy

| Option                       | Description                                                          | Selected |
| ---------------------------- | -------------------------------------------------------------------- | -------- |
| Unique URL per event         | eltemplo.org/qr/bcn and eltemplo.org/qr/aura-club — track per source | ✓        |
| One universal URL with param | eltemplo.org/qr?source=bcn — simpler but tamperable                  |          |
| Completely separate QR codes | Different codes with independent limits                              |          |

**User's choice:** Unique URL per event
**Notes:** Two events: BCN branch inauguration (Sunday) and Aura Club first event (broadcasting BCN aperture). Promo codes: TEMPLOPASSBCN and AURACLUB1. No time constraint on QR creation — build feature first, then print.

---

## Promo Scope & Limits

| Option                        | Description                     | Selected |
| ----------------------------- | ------------------------------- | -------- |
| Unlimited with per-user limit | Anyone can redeem, one per user | ✓        |
| Configurable max per code     | Each code has optional cap      |          |
| Fixed limit for all           | Same hardcoded limit everywhere |          |

**User's choice:** Unlimited total, one per user. Code is auto-applied via URL (not typed in). Validity: Sunday 2026-03-29 00:01 to Monday 2026-03-30 12:00 (UTC-3).

| Option                   | Description                       | Selected |
| ------------------------ | --------------------------------- | -------- |
| No — new users only      | Only brand new registrations      | ✓        |
| No — new or expired only | Users without active subscription |          |
| Yes — extends current    | Adds month after current ends     |          |

**User's choice:** New users only. Existing users see "Ya tenés cuenta."

---

## Redemption Flow

| Option                      | Description                                 | Selected |
| --------------------------- | ------------------------------------------- | -------- |
| Auto-assign on registration | Register → free month created automatically | ✓        |
| Register then claim         | Register, then separate redemption step     |          |
| Register then admin assigns | Admin manually assigns after registration   |          |

**User's choice:** Auto-assign on registration.

| Option                               | Description                                            | Selected |
| ------------------------------------ | ------------------------------------------------------ | -------- |
| New promo-specific plan              | Online-only, 30 days, price=0, hidden from normal list | ✓        |
| Use existing Foundation plan at zero | Override price via promo                               |          |
| Different plan per code              | Each code maps to different plan                       |          |

**User's choice:** New promo-specific plan, but NO flexible booking. Users can use Entrenar (training content) but cannot book physical classes. Reservas shows "Activá tu plan."

---

## Landing Page Experience

| Option                          | Description                                            | Selected |
| ------------------------------- | ------------------------------------------------------ | -------- |
| Registration page in member app | Redirect to app.eltemplo.org/register with promo badge | ✓        |
| Promo landing on eltemplo.org   | Branded page with CTA to register                      |          |
| App store redirect              | Download app first                                     |          |

**User's choice:** Direct redirect to app.eltemplo.org/register. No app stores yet. Change registration title to "Bienvenido al Templo" for ALL users.

| Option                | Description                 | Selected |
| --------------------- | --------------------------- | -------- |
| Raw QR code only      | PNG files named after codes | ✓        |
| Simple branded card   | QR with logo and text       |          |
| Two different designs | Per-event design            |          |

**User's choice:** Raw QR codes as PNG files (TEMPLOPASSBCN.png, AURACLUB1.png).

---

## Training Content

| Option                | Description                                            | Selected |
| --------------------- | ------------------------------------------------------ | -------- |
| Regular sessions      | Same algorithm-generated sessions as physical branches | ✓        |
| Needs investigation   | Unsure if generation works for ONLINE                  |          |
| Specific content only | Curated exercises                                      |          |

**User's choice:** Regular sessions.

---

## Member App Behavior (Online Users)

**User clarifications:**

- Reservas tab: currently hidden for online users → make visible with "Activá tu plan" state
- "Hoy es tu día de descanso" card: hide for online users without subscription
- Entrenar: already shows "Activá tu plan" without subscription — correct behavior

---

## Admin Management

| Option                            | Description                            | Selected |
| --------------------------------- | -------------------------------------- | -------- |
| Separate Promos section in Planes | New section with promo-specific fields | ✓        |
| Separate page                     | New /promos route                      |          |
| Inline with regular plans         | Add fields to existing plan form       |          |

**User's choice:** Separate section in Planes page. Two promo types: QR auto-assigned AND admin-assignable.

---

## Post-Promo Expiry

| Option                          | Description                                       | Selected |
| ------------------------------- | ------------------------------------------------- | -------- |
| Upsell badge in Mi Templo       | Always visible, encouraging physical branch visit | ✓        |
| Push notification before expiry | 3-day reminder                                    |          |
| No notifications                | Silent expiry                                     |          |

**User's choice:** Upsell badge. No push notifications (app not on stores). Email campaigns handled by separate project.

---

## Claude's Discretion

- Upsell badge copy and styling
- Promo badge design on registration
- "Ya tenés cuenta" page layout
- Database table structure for promo system
- QR redirect implementation approach

## Deferred Ideas

- Deep linking when app hits stores
- Push notification promo campaigns
- Online plan monetization (v6.0+)
- Promo analytics dashboard
