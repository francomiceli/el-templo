# Domain Pitfalls

**Project:** El Templo - Modular Fitness Training Super-App
**Domain:** Fitness/training apps with Quasar + Capacitor + MySQL
**Researched:** 2026-01-22
**Confidence:** HIGH (verified against official Capacitor, Quasar, and platform documentation)

---

## Executive Summary

This document catalogs critical, moderate, and minor pitfalls for building El Templo. The most severe risks are:

1. **Background timer death on mobile** - iOS/Android suspend JavaScript timers when app backgrounds
2. **iOS video playback failures** - Local videos using `capacitor://` protocol fail on iOS
3. **Quasar-Capacitor version mismatches** - Plugin version conflicts break builds
4. **Complex workout state corruption** - Nested session/block/timer state goes out of sync
5. **SPOM algorithm brittleness** - 52-week periodization logic hard to test and debug
6. **Multi-branch data leakage** - Improper isolation exposes data across branches

---

## Critical Pitfalls

Mistakes that cause rewrites, major architectural issues, or app-breaking bugs.

---

### Pitfall 1: Background Timer Death on iOS/Android

**What goes wrong:**
JavaScript timers (`setInterval`, `setTimeout`) stop executing when the app is backgrounded. For a fitness app with EMOM timers that need precise 60-second intervals, this is catastrophic. User puts phone in pocket mid-workout, timer dies silently.

**Why it happens:**
Mobile operating systems aggressively suspend background processes to preserve battery. This is by design, not a bug.

> "JavaScript timing functions like `setTimeout` and `setInterval` stop working when the app enters the background."
> - [Capgo: How Background Tasks Work in Capacitor](https://capgo.app/blog/how-background-tasks-work-in-capacitor/)

**Platform constraints:**
- **iOS:** ~30 seconds maximum for background task execution
- **Android:** Up to 10 minutes, but 30 seconds recommended for cross-platform consistency
- **Neither platform guarantees execution timing**

**Consequences:**
- Timer shows wrong time when user returns to app
- EMOM rounds count incorrectly
- Workout completion times are wrong
- User loses trust in app accuracy

**Prevention:**

1. **Keep screen awake during active timers:**
   ```typescript
   // Use @capacitor-community/keep-awake
   import { KeepAwake } from '@capacitor-community/keep-awake';

   async function startTimer() {
     await KeepAwake.keepAwake();
     // Start timer logic
   }

   async function stopTimer() {
     await KeepAwake.allowSleep();
   }
   ```

2. **Track elapsed time, not countdown:**
   ```typescript
   // Instead of decrementing a counter
   const startedAt = Date.now();
   const targetDuration = 60000; // 60 seconds

   // On each tick, calculate remaining from wall clock
   const elapsed = Date.now() - startedAt;
   const remaining = Math.max(0, targetDuration - elapsed);
   ```

3. **Handle app lifecycle events:**
   ```typescript
   import { App } from '@capacitor/app';

   App.addListener('appStateChange', ({ isActive }) => {
     if (isActive) {
       // App returned to foreground - recalculate timer state
       recalculateTimerFromWallClock();
     }
   });
   ```

4. **Use haptics for round transitions:**
   ```typescript
   import { Haptics, ImpactStyle } from '@capacitor/haptics';

   // Even if screen is on, vibrate to get attention
   Haptics.impact({ style: ImpactStyle.Heavy });
   ```

**Detection (warning signs):**
- Timer tests only run in browser, not on physical devices
- Timer logic uses pure `setInterval` without lifecycle handling
- No keep-awake plugin in Capacitor dependencies
- No wall-clock reconciliation on app resume

**Phase to address:** Phase 4 (Timer Components) - must be designed correctly from the start.

**Confidence:** HIGH - Verified via [Capacitor Background Runner Docs](https://capacitorjs.com/docs/apis/background-runner) and [Capgo Background Tasks Guide](https://capgo.app/blog/how-background-tasks-work-in-capacitor/).

---

### Pitfall 2: iOS Video Playback Failures with Local Files

**What goes wrong:**
HTML5 `<video>` elements fail to play local video files on iOS when using the `capacitor://` protocol. Videos work in the simulator, work on Android, work during `quasar dev`, but fail on real iOS devices.

**Why it happens:**
iOS WebKit has issues with how video byte-range requests are handled over the `capacitor://` protocol. This affects:
- Locally bundled videos
- Videos downloaded to device storage
- Any video not served over HTTP/HTTPS

**Documented issues:**
- [GitHub #6790: Video playback issues on iOS](https://github.com/ionic-team/capacitor/issues/6790) - iOS 16.5.x specific, closed as "Not Planned" (Apple bug)
- [GitHub #7258: Locally stored videos cannot play on real iOS device](https://github.com/ionic-team/capacitor/issues/7258)
- [GitHub #2634: Large video freezes app on iOS](https://github.com/ionic-team/capacitor/issues/2634) - Capacitor tries to load entire file into memory

**Consequences:**
- Exercise demonstration videos don't play on iOS
- Users see blank video player or infinite loading
- App feels broken, damages trust
- Discovered late (only on real devices)

**Prevention:**

1. **Serve videos via HTTP/HTTPS (recommended):**
   ```typescript
   // Host videos on CDN or backend
   const videoUrl = `${import.meta.env.VITE_CDN_URL}/exercises/${exerciseId}.mp4`;
   ```

2. **Use capacitor-video-player plugin for native playback:**
   ```bash
   npm install capacitor-video-player
   ```
   This uses native video players (AVPlayer on iOS, ExoPlayer on Android) which don't have the WebView limitations.

3. **Progressive video loading for large files:**
   - Keep exercise videos under 10MB each
   - Use HLS streaming for longer videos
   - Compress videos appropriately (720p is usually sufficient)

4. **Test on real iOS devices early:**
   - Don't trust the iOS Simulator
   - Test video playback in Phase 4, not Phase 6
   - Have a physical iOS test device from the start

**Detection:**
- Video playback only tested in browser/simulator
- Videos bundled locally in `public/` or `assets/`
- No CDN or video hosting in architecture
- `capacitor://` or `file://` URLs in video src

**Phase to address:** Phase 4 (Day Player) - video playback is core to exercise demonstrations.

**Confidence:** HIGH - Multiple GitHub issues confirm this is a known platform limitation.

---

### Pitfall 3: Quasar-Capacitor Version Mismatch Hell

**What goes wrong:**
Build failures, runtime crashes, or plugins not working due to version conflicts between Quasar CLI, Capacitor core, and Capacitor plugins.

**Why it happens:**
- `quasar mode add capacitor` installs Capacitor 6.x by default
- Running `npm install @capacitor/some-plugin` installs latest (v7)
- Capacitor 6 and 7 plugins are incompatible
- Gradle version prompts in Android Studio tempt developers to upgrade (breaking Capacitor)

**Documented issues:**
> "Do NOT upgrade Gradle as it will break the Capacitor project. Same goes for any other requested upgrades."
> - [Quasar Capacitor Troubleshooting](https://quasar.dev/quasar-cli-vite/developing-capacitor-apps/troubleshooting-and-tips/)

> "The `quasar mode add capacitor` command defaults to v6, but subsequent installs of Capacitor plugins will default to v7."
> - [GitHub Discussion #16261](https://github.com/quasarframework/quasar/discussions/16261)

**Consequences:**
- Build fails with cryptic Gradle errors
- Plugins report "not implemented on android"
- Hours lost debugging version conflicts
- Temptation to start fresh project (losing work)

**Prevention:**

1. **Pin Capacitor version explicitly:**
   ```bash
   # In src-capacitor/
   npm install @capacitor/core@6 @capacitor/cli@6 @capacitor/android@6 @capacitor/ios@6
   ```

2. **Always specify version when installing plugins:**
   ```bash
   # In src-capacitor/
   npm install @capacitor/preferences@6 @capacitor/haptics@6 @capacitor-community/keep-awake@6
   ```

3. **Never upgrade Gradle when Android Studio prompts:**
   - Click "Remind me later" or ignore
   - If you accidentally upgrade, File > Invalidate Caches and Restart
   - Restore `build.gradle` from git if needed

4. **Install in src-capacitor, not project root:**
   ```bash
   # CORRECT
   cd src-capacitor && npm install @capacitor/preferences@6

   # WRONG (causes confusion)
   npm install @capacitor/preferences@6  # in project root
   ```

5. **Don't run `npx cap sync` manually:**
   > "Don't run `npx cap sync` manually - that will be handled automatically the next time you run `quasar dev -m capacitor` or `quasar build -m capacitor`."
   > - [Quasar Troubleshooting](https://quasar.dev/quasar-cli-vite/developing-capacitor-apps/troubleshooting-and-tips/)

**Detection:**
- Plugins installed without version specifiers
- Mixed v6/v7 versions in `src-capacitor/package.json`
- Gradle version in `android/build.gradle` differs from Capacitor default
- "Plugin not implemented" errors on Android

**Phase to address:** Phase 1 (Project Setup) - get versions right from day one.

**Confidence:** HIGH - Verified via [Quasar Capacitor Troubleshooting](https://quasar.dev/quasar-cli-vite/developing-capacitor-apps/troubleshooting-and-tips/).

---

### Pitfall 4: Complex Workout State Corruption

**What goes wrong:**
The nested state structure (Session > Blocks > Exercises > Timer) goes out of sync. User completes a block, but the UI shows the wrong block. Timer state persists incorrectly between blocks. Session shows "completed" but blocks are still pending.

**Why it happens:**
- Workout sessions have deep nesting (session.blocks[].exercises[])
- Timer state is reactive but independent from block state
- Multiple components update state simultaneously
- No single source of truth for "current position in workout"

**Consequences:**
- User loses workout progress
- Timer behaves erratically
- Duplicate completion events logged
- Session data in database is inconsistent

**Prevention:**

1. **Finite state machine for session flow:**
   ```typescript
   type SessionState =
     | { status: 'idle' }
     | { status: 'active'; blockIndex: number; timerState: TimerState }
     | { status: 'completing'; rpe?: number }
     | { status: 'completed'; summary: SessionSummary };

   // All transitions go through explicit actions
   function advanceBlock() {
     if (state.status !== 'active') return;
     const nextIndex = state.blockIndex + 1;
     if (nextIndex >= session.blocks.length) {
       state = { status: 'completing' };
     } else {
       state = { status: 'active', blockIndex: nextIndex, timerState: 'idle' };
     }
   }
   ```

2. **Centralized workout orchestrator:**
   ```typescript
   // composables/useWorkoutSession.ts
   export function useWorkoutSession() {
     // Single store manages all workout state
     const session = ref<Session | null>(null);
     const currentBlockIndex = ref(0);
     const sessionState = ref<SessionState>({ status: 'idle' });

     // Derived state - never duplicated
     const currentBlock = computed(() =>
       session.value?.blocks[currentBlockIndex.value]
     );

     // All mutations go through actions
     function completeCurrentBlock() { /* ... */ }
     function pauseTimer() { /* ... */ }

     return { session, currentBlock, sessionState, completeCurrentBlock, pauseTimer };
   }
   ```

3. **Immutable updates for nested state:**
   ```typescript
   // Don't mutate nested objects
   session.value.blocks[0].status = 'completed'; // BAD

   // Create new objects
   session.value = {
     ...session.value,
     blocks: session.value.blocks.map((block, i) =>
       i === 0 ? { ...block, status: 'completed' } : block
     )
   }; // GOOD
   ```

4. **Event logging as state verification:**
   ```typescript
   // Log every state transition
   function completeBlock(index: number) {
     eventLog.log('block_completed', { index, timestamp: Date.now() });
     // If events and state diverge, events are source of truth
   }
   ```

**Detection:**
- Multiple stores managing overlapping workout data
- Direct mutations of nested objects
- No explicit state machine for session flow
- Timer state stored separately from block state without coordination
- No tests for state transitions

**Phase to address:** Phase 4 (Training Module) - design state architecture before building UI.

**Confidence:** HIGH - Based on [Pinia Best Practices](https://masteringpinia.com/blog/5-best-practices-for-scalable-vuejs-state-management-with-pinia).

---

### Pitfall 5: SPOM Algorithm Brittleness

**What goes wrong:**
The 52-week periodization algorithm (SPOM) produces incorrect sessions. Wrong exercises for the intensity. Wrong patterns for the week. Rules from the spreadsheet don't translate correctly to code.

**Why it happens:**
- SPOM rules are complex (intensity waves, contraction types, pattern rotations)
- Rules live in Excel, getting parsed and reimplemented
- Edge cases: week 1 vs week 52, intensity boundaries
- No way to verify output without domain expertise

**Consequences:**
- Members get inappropriate exercises (too hard/easy)
- Coaches lose trust in the system
- Bug reports are domain-specific ("week 23 should have concentric bias")
- Regression bugs as rules get added

**Prevention:**

1. **Golden test datasets from domain experts:**
   ```typescript
   // tests/spom/golden-sessions.test.ts
   const goldenSessions = [
     {
       week: 1,
       level: 'alfa',
       expectedBlocks: [
         { type: 'initium', pattern: 'MOVILIDAD', exerciseCount: 4 },
         { type: 'nucleus', pattern: 'PUSH', contractionBias: 'eccentric' },
         // ...
       ],
     },
     // One golden test per intensity wave, per level
   ];

   goldenSessions.forEach(({ week, level, expectedBlocks }) => {
     test(`Week ${week}, ${level} level produces correct session`, () => {
       const session = generateSession(week, level);
       expect(session.blocks).toMatchObject(expectedBlocks);
     });
   });
   ```

2. **Separate parsing from generation:**
   ```typescript
   // Step 1: Parse Excel to intermediate format (testable)
   const spomRules = parseSpomSpreadsheet(excelFile);

   // Step 2: Validate parsed rules
   validateSpomRules(spomRules);

   // Step 3: Generate sessions from validated rules
   const session = generateFromRules(spomRules, week, level);
   ```

3. **Admin preview/debug mode:**
   ```typescript
   // API endpoint for coaches to preview any week
   GET /api/training/preview?week=23&level=sigma

   // Returns session WITH reasoning
   {
     session: { ... },
     debug: {
       intensityWave: 'shockwave',
       calculatedIntensity: 85,
       patternRotation: 'PUSH-PULL-LOWER',
       contractionRule: 'concentric bias at 85%+',
     }
   }
   ```

4. **Explicit rule documentation in code:**
   ```typescript
   /**
    * SPOM Rule: Contraction Type Selection
    *
    * Intensity < 70%: Isometric bias (holding positions)
    * Intensity 70-85%: Eccentric bias (controlled lowering)
    * Intensity > 85%: Concentric bias (explosive movements)
    *
    * Source: [Planificaciones] - Base de Datos.xlsx, Sheet "Contraction Rules"
    */
   function selectContractionType(intensity: number): ContractionType {
     if (intensity < 70) return 'isometric';
     if (intensity <= 85) return 'eccentric';
     return 'concentric';
   }
   ```

**Detection:**
- No tests for session generation
- Rules implemented without comments/documentation
- Parsing and generation in single function
- No way for coaches to preview/debug sessions
- Excel changes require developer to update code

**Phase to address:** Phase 3 (SPOM Engine) - build with testability from the start.

**Confidence:** MEDIUM - Domain-specific, based on general algorithm testing practices.

---

### Pitfall 6: Multi-Branch Data Leakage

**What goes wrong:**
Members from Branch A can see data from Branch B. Coaches can access members outside their branch. Session generation pulls exercises from wrong branch configuration.

**Why it happens:**
- Branch filtering forgotten in some queries
- API endpoints don't validate branch ownership
- Frontend caches data across branch context switches (coach visits multiple branches)
- JOIN queries accidentally cross branch boundaries

**Consequences:**
- Privacy violations (member data exposed)
- Incorrect exercise assignments (branch-specific configurations)
- Coach confusion when viewing wrong members
- Data compliance issues if branches are separate legal entities

**Prevention:**

1. **Branch-scoped queries at database layer:**
   ```typescript
   // db/queries/members.ts
   export function getMembersByBranch(branchId: number) {
     return db
       .select()
       .from(users)
       .where(and(
         eq(users.branchId, branchId),
         eq(users.role, 'member')
       ));
   }

   // NEVER expose unscoped queries
   // export function getAllMembers() { ... } // BAD
   ```

2. **Middleware enforces branch context:**
   ```typescript
   // middleware/branchGuard.ts
   export function branchGuard(fastify: FastifyInstance) {
     fastify.addHook('preHandler', async (request) => {
       const userBranch = request.user.branchId;
       const requestedBranch = request.params.branchId || request.query.branchId;

       // Members can only access their own branch
       if (request.user.role === 'member' && requestedBranch !== userBranch) {
         throw new ForbiddenError('Cannot access other branches');
       }

       // Coaches can only access branches they're assigned to
       if (request.user.role === 'coach') {
         const coachBranches = await getCoachBranches(request.user.id);
         if (!coachBranches.includes(requestedBranch)) {
           throw new ForbiddenError('Coach not assigned to this branch');
         }
       }
     });
   }
   ```

3. **Clear frontend cache on branch context switch:**
   ```typescript
   // When coach switches branch view
   function switchBranchContext(newBranchId: number) {
     // Clear member-related caches
     memberStore.$reset();
     sessionStore.$reset();

     // Set new context
     branchStore.setCurrentBranch(newBranchId);

     // Refetch data for new branch
     await memberStore.fetchMembers(newBranchId);
   }
   ```

4. **Automated tests for data isolation:**
   ```typescript
   test('Member cannot access other branch data', async () => {
     const branchAMember = await createMember({ branchId: 1 });
     const branchBSession = await createSession({ branchId: 2 });

     const response = await api
       .get(`/sessions/${branchBSession.id}`)
       .auth(branchAMember.token);

     expect(response.status).toBe(403);
   });
   ```

**Detection:**
- Queries without branch WHERE clauses
- API routes without branch validation middleware
- Frontend stores persist data across branch switches
- No integration tests for cross-branch access attempts

**Phase to address:** Phase 1 (Foundation) and Phase 2 (Shell) - bake into architecture.

**Confidence:** MEDIUM - Based on multi-tenant application patterns, not fitness-specific documentation.

---

## Moderate Pitfalls

Mistakes that cause delays, technical debt, or require significant rework.

---

### Pitfall 7: Android Safe Area Not Handled

**What goes wrong:**
On Android devices with notches or curved screens, the app header overlaps with the system status bar. Content is hidden behind the notch.

**Why it happens:**
> "On Android devices/emulators, the q-header component overlaps with the Android system status bar, making the toolbar content unreadable. This happens with fresh Quasar installations using Capacitor. The same layout works perfectly on iOS with automatic safe area handling."
> - [GitHub Issue #18069](https://github.com/quasarframework/quasar/issues/18069)

**Consequences:**
- App looks broken on many Android devices
- Header content unreadable
- Users complain about "iOS-only quality"

**Prevention:**
```css
/* Apply safe area insets */
.q-header {
  padding-top: env(safe-area-inset-top);
}

.q-footer {
  padding-bottom: env(safe-area-inset-bottom);
}

/* Or use Quasar's built-in classes if available */
```

Test on Android devices with notches (Samsung, Pixel) early in development.

**Phase to address:** Phase 2 (Shell Layout)

**Confidence:** HIGH - Documented in [GitHub Issue #18069](https://github.com/quasarframework/quasar/issues/18069).

---

### Pitfall 8: Pinia Store Fragmentation

**What goes wrong:**
Too many small stores created, or stores split along technical rather than domain boundaries. Actions become hard to compose. Related state lives in different stores.

**Why it happens:**
> "Overuse of action composition patterns can lead to complex and less maintainable code. While composing multiple actions can promote code reuse, it's important to avoid splitting actions into smaller ones unless they are needed individually."
> - [Mastering Pinia](https://masteringpinia.com/blog/5-best-practices-for-scalable-vuejs-state-management-with-pinia)

**Consequences:**
- Hard to understand what stores exist
- Circular dependencies between stores
- Actions that should be atomic span multiple stores
- Testing becomes complex

**Prevention:**

Organize stores by domain, not by technical concern:

```
GOOD:
stores/
  useAuthStore.ts         # Authentication + session
  useUserStore.ts         # Profile + preferences + level
  useWorkoutStore.ts      # Session + blocks + timer (all workout state)

BAD:
stores/
  useSessionStore.ts      # Just session metadata
  useBlockStore.ts        # Just block state
  useTimerStore.ts        # Just timer state
  useExerciseStore.ts     # Just current exercise
  useRpeStore.ts          # Just RPE value
```

**Phase to address:** Phase 2 (Global Stores) and Phase 4 (Module Stores)

**Confidence:** HIGH - Based on [Pinia Best Practices](https://masteringpinia.com/blog/5-best-practices-for-scalable-vuejs-state-management-with-pinia).

---

### Pitfall 9: Excel Import Fragility

**What goes wrong:**
Changes to the Excel spreadsheet structure break the import process. New exercises can't be added. SPOM rules can't be updated without developer intervention.

**Why it happens:**
- Excel parsing tied to specific cell positions
- No validation of imported data
- No idempotent import (running twice duplicates data)
- No diff/preview before import

**Consequences:**
- Coaches can't update exercises independently
- Import bugs corrupt production data
- Fear of touching the spreadsheet

**Prevention:**

1. **Column-based parsing, not position-based:**
   ```typescript
   // Find columns by header name
   const headers = sheet.getRow(1);
   const patternCol = findColumnByHeader(headers, 'Pattern');
   const levelCol = findColumnByHeader(headers, 'Level');
   ```

2. **Validate before insert:**
   ```typescript
   const parsed = parseExercises(sheet);
   const validation = validateExercises(parsed);
   if (validation.errors.length > 0) {
     throw new ImportError(validation.errors);
   }
   ```

3. **Idempotent imports with merge strategy:**
   ```typescript
   // Use unique identifier to upsert
   for (const exercise of parsed) {
     await db.exercises.upsert({
       where: { externalId: exercise.id },
       update: exercise,
       create: exercise,
     });
   }
   ```

4. **Dry-run mode:**
   ```typescript
   POST /api/admin/import/exercises?dryRun=true
   // Returns what would change without committing
   ```

**Phase to address:** Phase 3 (SPOM Engine / Exercise Database)

**Confidence:** MEDIUM - General data import best practices.

---

### Pitfall 10: PWA iOS Limitations Surprise

**What goes wrong:**
Features work in development (Chrome, Safari desktop) but fail on iOS PWA:
- Push notifications require home screen installation
- Storage limited to 50MB
- No background sync
- No Bluetooth/hardware access

**Why it happens:**
> "Where Android views PWAs as first-class citizens, iOS treats them closer to a glorified web bookmark."
> - [Brainhub: PWA on iOS 2025](https://brainhub.eu/library/pwa-on-ios)

**Consequences:**
- Features promised but can't be delivered on iOS
- Offline mode works on Android but fails on iOS
- Push notification implementation wasted if iOS is priority

**Prevention:**

1. **Use Capacitor native plugins, not PWA APIs:**
   ```typescript
   // PWA Push - limited on iOS
   Notification.requestPermission(); // BAD

   // Capacitor Local Notifications - works everywhere
   import { LocalNotifications } from '@capacitor/local-notifications';
   await LocalNotifications.schedule({ ... }); // GOOD
   ```

2. **Test offline on iOS early:**
   - Enable airplane mode on real device
   - Verify app functions with cached data

3. **Feature detection before use:**
   ```typescript
   import { Capacitor } from '@capacitor/core';

   const platform = Capacitor.getPlatform();
   if (platform === 'ios' && someFeatureNotSupported) {
     showFallbackUI();
   }
   ```

**Phase to address:** Phase 2 (Capacitor Bridge Setup)

**Confidence:** HIGH - Based on [PWA iOS Limitations 2025](https://brainhub.eu/library/pwa-on-ios).

---

### Pitfall 11: Timer Drift and Inaccuracy

**What goes wrong:**
Timers become inaccurate over time. `setInterval` drifts. EMOM rounds end slightly early or late. Cumulative error over 20-minute workout.

**Why it happens:**
- `setInterval` is not precise (can be delayed by browser)
- Rendering blocks the main thread
- No compensation for drift

**Consequences:**
- EMOM rounds are inconsistent
- Total workout time doesn't match expected
- Users notice (fitness people are time-obsessive)

**Prevention:**

1. **Use wall-clock time, not interval counting:**
   ```typescript
   function useAccurateTimer(durationMs: number) {
     const startTime = ref<number>(0);
     const remaining = ref(durationMs);

     function tick() {
       const elapsed = Date.now() - startTime.value;
       remaining.value = Math.max(0, durationMs - elapsed);

       if (remaining.value > 0) {
         requestAnimationFrame(tick);
       }
     }

     function start() {
       startTime.value = Date.now();
       requestAnimationFrame(tick);
     }

     return { remaining, start };
   }
   ```

2. **Use `requestAnimationFrame` for visual updates:**
   - Smoother updates (60fps)
   - Automatically pauses when tab inactive

3. **Audio cues for critical moments:**
   - 3-2-1 countdown sounds
   - Round transition beeps
   - Users rely on audio, not just visual

**Phase to address:** Phase 4 (Timer Components)

**Confidence:** MEDIUM - Standard timer implementation practices.

---

### Pitfall 12: Fitness App UX Dark Patterns

**What goes wrong:**
App demotivates users instead of helping them. Streak anxiety. Shame from missed workouts. Overwhelming complexity.

**Why it happens:**
> "Researchers found that fitness apps can trigger feelings of shame, guilt, and demotivation when they set rigid goals that users fail to meet."
> - Multiple 2025 studies on fitness app psychology

**Fitness app UX traps:**
- **Streak shaming:** "You broke your 14-day streak!" creates anxiety
- **Rigid daily targets:** AI sets impossible goals, user feels failure
- **Achievement spam:** Constant notifications dilute meaning
- **Calorie tracking:** Creates obsessive, unhealthy relationship with food
- **Public leaderboards:** Demotivate lower performers
- **Complex onboarding:** Users abandon before first workout

**Consequences:**
- High churn (users delete app within 2 weeks)
- Negative app store reviews
- Word-of-mouth damage
- Contradicts El Templo's coaching philosophy

**Prevention for El Templo:**

1. **Positive-only notifications:**
   ```typescript
   // GOOD
   "Your next session is ready"
   "You completed Week 12!"

   // BAD - NEVER DO THIS
   "You missed yesterday's workout"
   "You're falling behind"
   ```

2. **No streaks or streak-breaking language:**
   - SPOM provides structure without pressure
   - Members train on their schedule within the gym-wide week
   - Missing a day is normal, not a failure

3. **Progressive disclosure:**
   ```typescript
   // Onboarding: Just show today's session
   // Week 2: Show weekly view
   // Month 2: Unlock progress stats
   // Don't overwhelm on day 1
   ```

4. **RPE captures reality without judgment:**
   - "How hard was that?" not "Did you hit your target?"
   - 10/10 RPE isn't failure, it's data

5. **Level progression is earned, not demanded:**
   - Coach evaluates, not algorithm judges
   - No "You're still at Alfa after 3 months" messaging

**Detection:**
- Copy uses words like "failed", "missed", "behind"
- Notifications focus on what user didn't do
- Onboarding shows all features at once
- App has calorie tracking features
- Public leaderboards visible to all members

**Phase to address:** All phases (UX principle), especially Phase 4 (UI copy) and Phase 5 (notifications)

**Confidence:** HIGH - Based on 2025 fitness app psychology research.

---

### Pitfall 13: Session Generation Performance at Scale

**What goes wrong:**
Session generation becomes slow as exercise database grows. API times out. Users see loading spinner for 10+ seconds.

**Why it happens:**
- SPOM rules require multiple database queries per block
- Exercise filtering is complex (pattern + level + contraction + availability)
- No caching of generated sessions
- Regenerating on every page load

**Consequences:**
- Poor user experience on app open
- Server load spikes at common training times (6-8 AM, 6-8 PM)
- Users abandon app waiting for session

**Prevention:**

1. **Pre-generate sessions daily via cron:**
   ```typescript
   // 4 AM daily - generate all sessions for the day
   cron.schedule('0 4 * * *', async () => {
     const branches = await db.branches.findAll({ where: { isActive: true } });
     const levels = ['alfa', 'delta', 'sigma', 'omega', 'spartan'];

     for (const branch of branches) {
       for (const level of levels) {
         const session = await spomEngine.generate(branch.id, level);
         await db.dailySessions.upsert({
           branchId: branch.id,
           level,
           date: today(),
           session,
         });
       }
     }
   });
   ```

2. **Cache at the session level:**
   ```typescript
   async function getTodaySession(userId: number) {
     const user = await getUser(userId);
     const cacheKey = `session:${user.branchId}:${user.level}:${today()}`;

     const cached = await redis.get(cacheKey);
     if (cached) return JSON.parse(cached);

     const session = await generateSession(user);
     await redis.set(cacheKey, JSON.stringify(session), 'EX', 86400);
     return session;
   }
   ```

3. **Index exercise queries:**
   ```sql
   CREATE INDEX idx_exercises_filter
   ON exercises (pattern, level, contraction_type, is_active);
   ```

**Detection:**
- Session generation queries database on every request
- No Redis or in-memory cache in architecture
- Exercise table lacks composite indexes
- API response times > 500ms for session endpoint

**Phase to address:** Phase 3 (SPOM Engine) - design for performance from start.

**Confidence:** MEDIUM - Standard API optimization patterns.

---

## Minor Pitfalls

Mistakes that cause annoyance but are easily fixable.

---

### Pitfall 14: Device Connection Issues During Development

**What goes wrong:**
Can't connect to development server from mobile device. White screen on device. Hot reload doesn't work.

**Why it happens:**
> "When developing on a mobile phone/tablet, it is very important that the external IP address of your build machine is accessible from the device, otherwise you'll get a development app with white screen only."
> - [Quasar Troubleshooting](https://quasar.dev/quasar-cli-vite/developing-capacitor-apps/troubleshooting-and-tips/)

**Prevention:**
- Ensure device and dev machine on same network
- Check firewall allows the dev port
- Use `quasar dev -m capacitor -T android --host 0.0.0.0`

**Phase to address:** Phase 1 (Development Setup)

---

### Pitfall 15: Linux USB Permissions

**What goes wrong:**
Android device connected via USB shows "no permissions" error.

**Prevention:**
Create udev rules as documented in [Quasar Troubleshooting](https://quasar.dev/quasar-cli-vite/developing-capacitor-apps/troubleshooting-and-tips/).

```bash
# /etc/udev/rules.d/51-android.rules
SUBSYSTEM=="usb", ATTR{idVendor}=="[VENDOR_ID]", MODE="0666", GROUP="plugdev"
```

**Phase to address:** Phase 1 (Development Setup)

---

### Pitfall 16: localStorage Cleared by OS

**What goes wrong:**
User data stored in `localStorage` disappears. Auth tokens lost. Preferences reset.

**Why it happens:**
> "Mobile OSs may periodically clear data set in `window.localStorage`."
> - [Capacitor Storage Guide](https://capacitorjs.com/docs/guides/storage)

**Prevention:**
Use `@capacitor/preferences` for persistent key-value storage:
```typescript
import { Preferences } from '@capacitor/preferences';

// Store
await Preferences.set({ key: 'authToken', value: token });

// Retrieve
const { value } = await Preferences.get({ key: 'authToken' });
```

**Phase to address:** Phase 2 (Capacitor Bridge Setup)

---

### Pitfall 17: Missing TypeScript Configuration for Capacitor

**What goes wrong:**
TypeScript can't find Capacitor types. Red squiggles in IDE. Build warnings.

**Why it happens:**
> "Since Quasar doesn't auto-generate the tsconfig file, TypeScript won't know about Capacitor automatically."
> - [GitHub Discussion #17493](https://github.com/quasarframework/quasar/discussions/17493)

**Prevention:**
Add Capacitor paths to `tsconfig.json`:
```json
{
  "compilerOptions": {
    "paths": {
      "@capacitor/core": ["./node_modules/@capacitor/core"]
    }
  }
}
```

**Phase to address:** Phase 1 (Project Setup)

---

### Pitfall 18: Capacitor Plugins Installed in Wrong Directory

**What goes wrong:**
Capacitor plugins installed in project root instead of `src-capacitor/`. Plugins not recognized. Duplicate dependencies.

**Prevention:**
Always install Capacitor plugins in `src-capacitor/`:
```bash
cd src-capacitor && npm install @capacitor/preferences@6
```

**Phase to address:** Phase 1 (Project Setup)

---

### Pitfall 19: Audio Playback for Timer Cues

**What goes wrong:**
Timer sound effects don't play on mobile. Silent mode blocks sounds. Audio starts late or stutters.

**Why it happens:**
- iOS requires user interaction before playing audio
- Mobile browsers have autoplay restrictions
- Audio files not preloaded

**Prevention:**

1. **Preload audio on first user interaction:**
   ```typescript
   // On first tap anywhere in app
   const timerBeep = new Audio('/sounds/beep.mp3');
   timerBeep.load(); // Preload

   // Later, during timer
   timerBeep.currentTime = 0;
   timerBeep.play();
   ```

2. **Use Web Audio API for precise timing:**
   ```typescript
   const audioContext = new AudioContext();
   // Web Audio API has better timing than HTML5 Audio
   ```

3. **Consider Capacitor native audio plugin for critical sounds:**
   ```bash
   npm install @capacitor-community/native-audio
   ```

**Phase to address:** Phase 4 (Timer Components)

**Confidence:** MEDIUM - Based on web audio best practices.

---

### Pitfall 20: Exercise Video File Size Bloat

**What goes wrong:**
App becomes too large to download. iOS App Store rejects builds over 200MB. Users complain about storage usage.

**Why it happens:**
- 1869 exercises with videos
- Videos not compressed properly
- No lazy loading strategy

**Prevention:**

1. **Never bundle videos in app:**
   - Stream from CDN
   - Download on demand
   - Cache only recently viewed

2. **Optimize video encoding:**
   - 720p maximum for exercise demos
   - 15-30 second clips
   - H.264 for compatibility
   - Target 1-5MB per video

3. **Placeholder strategy (per PROJECT.md):**
   - Launch with placeholder images
   - Add real videos incrementally
   - Users don't need all 1869 videos on day 1

**Phase to address:** Phase 4 (Day Player) - architecture decision

**Confidence:** HIGH - Standard mobile app optimization.

---

## Phase-Specific Warnings

| Phase | Likely Pitfall | Mitigation |
|-------|---------------|------------|
| Phase 1: Foundation | Version mismatches (#3), TypeScript config (#17) | Pin all Capacitor versions on day 1 |
| Phase 2: Shell | Safe area issues (#7), localStorage (#16), Branch isolation (#6) | Test on Android notch devices early, use Preferences |
| Phase 3: SPOM Engine | Algorithm brittleness (#5), Import fragility (#9), Performance (#13) | Golden tests before any UI work, caching strategy |
| Phase 4: Training UI | Timer death (#1), Video issues (#2), Audio (#19) | Keep-awake plugin, CDN for videos, preload audio |
| Phase 4: Training UI | State corruption (#4), Store fragmentation (#8) | State machine design before components |
| Phase 5: Completion | Event logging reliability | Offline queue for events |
| Phase 6: Progression | UX dark patterns (#12) | Review all copy for positive framing |

---

## Pre-Flight Checklist

Before starting development, verify:

- [ ] Capacitor 6.x pinned in `src-capacitor/package.json`
- [ ] All Capacitor plugins specify @6 version
- [ ] `@capacitor-community/keep-awake` installed
- [ ] Video hosting strategy decided (CDN vs local - must be CDN)
- [ ] Real iOS device available for testing
- [ ] Real Android device with notch available for testing
- [ ] SPOM golden test datasets prepared with domain expert
- [ ] Excel import validation strategy documented
- [ ] Branch isolation queries reviewed
- [ ] Audio preloading strategy defined
- [ ] UX copy guidelines created (positive-only framing)

---

## Sources

### Capacitor / Quasar (HIGH Confidence)
- [Quasar Capacitor Troubleshooting](https://quasar.dev/quasar-cli-vite/developing-capacitor-apps/troubleshooting-and-tips/)
- [Capacitor Background Runner Docs](https://capacitorjs.com/docs/apis/background-runner)
- [Capacitor Storage Guide](https://capacitorjs.com/docs/guides/storage)
- [Capgo: Background Tasks in Capacitor](https://capgo.app/blog/how-background-tasks-work-in-capacitor/)

### Video Issues (HIGH Confidence)
- [GitHub #6790: Video playback issues on iOS](https://github.com/ionic-team/capacitor/issues/6790)
- [GitHub #7258: Local videos fail on iOS](https://github.com/ionic-team/capacitor/issues/7258)
- [GitHub #2634: Large video freezes iOS](https://github.com/ionic-team/capacitor/issues/2634)

### State Management (HIGH Confidence)
- [Mastering Pinia Best Practices](https://masteringpinia.com/blog/5-best-practices-for-scalable-vuejs-state-management-with-pinia)

### PWA Limitations (HIGH Confidence)
- [PWA on iOS 2025](https://brainhub.eu/library/pwa-on-ios)

### Quasar-Capacitor Version Issues (HIGH Confidence)
- [GitHub Discussion #16261](https://github.com/quasarframework/quasar/discussions/16261)
- [GitHub Issue #18069: Android Safe Area](https://github.com/quasarframework/quasar/issues/18069)

### Fitness App UX (MEDIUM Confidence - Training Data)
- 2025 fitness app psychology research (multiple studies on app-induced anxiety)
- Industry patterns from Nike Training Club, MyFitnessPal, Fitbod user research

---

## Confidence Assessment

| Pitfall Category | Confidence | Reasoning |
|------------------|------------|-----------|
| Timer/Background (#1, #11) | HIGH | Official Capacitor docs + multiple community reports |
| Video Playback (#2, #20) | HIGH | Multiple GitHub issues with detailed reproduction |
| Version Conflicts (#3) | HIGH | Quasar official troubleshooting |
| State Management (#4, #8) | HIGH | Pinia official best practices |
| SPOM Algorithm (#5) | MEDIUM | Domain-specific, based on general practices |
| Multi-Branch (#6) | MEDIUM | Multi-tenant patterns, not fitness-specific |
| Safe Area (#7) | HIGH | GitHub issue with reproduction |
| Excel Import (#9) | MEDIUM | General data import practices |
| PWA iOS (#10) | HIGH | Multiple 2025 articles on iOS PWA state |
| Fitness UX (#12) | MEDIUM | Training data on fitness app psychology |
| Performance (#13) | MEDIUM | Standard API optimization patterns |
| Dev Setup (#14-18) | HIGH | Official Quasar troubleshooting |
| Audio (#19) | MEDIUM | Web audio best practices |
