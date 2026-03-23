# Phase 76: Play Store Setup & Listing - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-23
**Phase:** 76-play-store-setup-listing
**Areas discussed:** Store listing content, Visual assets, Privacy policy, Data safety form, App category & audience, Content rating, Contact & support info, Release strategy

---

## Store Listing - App Name

| Option               | Description                                 | Selected |
| -------------------- | ------------------------------------------- | -------- |
| El Templo            | Matches branding, short and clean           |          |
| El Templo Training   | More descriptive, hints at fitness          |          |
| El Templo Calistenia | Includes discipline for SEO/discoverability | ✓        |

**User's choice:** El Templo Calistenia
**Notes:** None

## Store Listing - Copy Authorship

| Option        | Description                                             | Selected |
| ------------- | ------------------------------------------------------- | -------- |
| Claude drafts | SEO-friendly Spanish copy                               |          |
| User provides | Has marketing copy ready                                |          |
| Collaborate   | User gives bullet points, Claude shapes into store copy | ✓        |

**User's choice:** Collaborate
**Notes:** "we should collab in this, still don't know how but note it"

## Visual Assets - Feature Graphic

| Option           | Description                          | Selected |
| ---------------- | ------------------------------------ | -------- |
| Create myself    | Has design tools                     |          |
| Use brand assets | Combine existing logo/colors         |          |
| Need guidance    | Want specs on what it should contain | ✓        |

**User's choice:** Need guidance
**Notes:** None

## Visual Assets - Screenshots

| Option                   | Description                                | Selected |
| ------------------------ | ------------------------------------------ | -------- |
| Capture from real device | Install APK, take screenshots              | ✓        |
| Capture from emulator    | Android Studio emulator                    |          |
| Framed mockups           | Device frames with marketing text overlays |          |

**User's choice:** Capture from real device
**Notes:** None

## Privacy Policy - Location

| Option                  | Description                   | Selected |
| ----------------------- | ----------------------------- | -------- |
| eltemplo.org/privacidad | Host on landing page          | ✓        |
| Standalone page on API  | Static HTML from API          |          |
| External service        | Free privacy policy generator |          |

**User's choice:** eltemplo.org/privacidad
**Notes:** None

## Privacy Policy - Content

| Option           | Description                                | Selected |
| ---------------- | ------------------------------------------ | -------- |
| Draft one for me | Audit data collection, generate in Spanish | ✓        |
| I have one ready | Already has a document                     |          |

**User's choice:** Claude drafts by auditing app data collection
**Notes:** None

## Data Safety - Schema Audit

| Option               | Description                                              | Selected |
| -------------------- | -------------------------------------------------------- | -------- |
| Yes, audit and draft | Check DB schema and API routes, map to Google categories | ✓        |
| Fill it myself       | User knows what data is collected                        |          |

**User's choice:** Audit and draft
**Notes:** None

## Data Safety - Third Parties

| Option             | Description                         | Selected |
| ------------------ | ----------------------------------- | -------- |
| Only Sentry        | Crash data to Sentry only           | ✓        |
| Sentry + analytics | Plan to add analytics before launch |          |
| None               | No third-party data sharing         |          |

**User's choice:** Sentry only
**Notes:** User initially considered adding analytics but agreed to defer — Sentry is sufficient for v1, analytics can be added post-launch.

## App Category

| Option           | Description                                  | Selected |
| ---------------- | -------------------------------------------- | -------- |
| Health & Fitness | Most gym/training apps, best discoverability | ✓        |
| Sports           | More competitive/sport-focused               |          |
| Lifestyle        | Broader, less targeted                       |          |

**User's choice:** Health & Fitness
**Notes:** None

## Target Audience

| Option   | Description                              | Selected |
| -------- | ---------------------------------------- | -------- |
| 18+ only | Simplest compliance, matches gym reality | ✓        |
| 13+      | Allows teens, more compliance            |          |
| All ages | No restriction, more scrutiny            |          |

**User's choice:** 18+ only
**Notes:** None

## Content Rating (IARC)

| Option               | Description                           | Selected |
| -------------------- | ------------------------------------- | -------- |
| No sensitive content | No violence, UGC, purchases, location | ✓        |

**User's choice:** No sensitive content currently
**Notes:** "nothing yet but maybe in the future app purchases"

## Contact Info

| Option           | Description                        | Selected |
| ---------------- | ---------------------------------- | -------- |
| Use eltemplo.org | Developer website + business email | ✓        |
| Personal email   | Personal email as contact          |          |
| Need to set up   | No dedicated email yet             |          |

**User's choice:** eltemplo.org + business email (TBD)
**Notes:** None

## Release Strategy

| Option                 | Description                                             | Selected |
| ---------------------- | ------------------------------------------------------- | -------- |
| Internal testing first | Upload to internal track, test, promote                 |          |
| Closed beta            | Internal → closed beta with select members → production | ✓        |
| Straight to production | Skip testing tracks                                     |          |

**User's choice:** Closed beta
**Notes:** Select gym members will test via Play Store before public release. Affects Phase 77 scope.

---

## Claude's Discretion

- Feature graphic content layout and design recommendations
- Which specific app screens to recommend for screenshots
- Data safety form category mappings based on schema audit
- Privacy policy legal structure and section ordering

## Deferred Ideas

- Analytics SDK integration (Firebase Analytics or similar) — post-launch phase
- In-app purchases — future versions, will need data safety and content rating updates
