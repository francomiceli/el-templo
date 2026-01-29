# Phase 11: V1 Visual Update - Research

**Researched:** 2026-01-29
**Domain:** Quasar theming, custom fonts, Capacitor assets, CSS textures
**Confidence:** HIGH

## Summary

This research covers the technical implementation of El Templo's brand identity in a Quasar/Vue mobile app. The phase involves updating the color palette (navy/bronze/cream), adding classical serif typography for headings, implementing Greek letter level indicators, generating app icons/splash screens, and applying marble-textured backgrounds.

The standard approach uses:
1. Quasar's SCSS variable system for compile-time theming
2. Self-hosted fonts via @fontsource for Cinzel (serif headings)
3. @capacitor/assets CLI for icon/splash generation
4. CSS SVG noise/texture overlays for marble backgrounds

**Primary recommendation:** Implement theming in layers - SCSS variables for base colors, CSS custom properties for component-level styling, self-hosted fonts for typography, and pure CSS for texture backgrounds.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Quasar SCSS Variables | Built-in | Theme color customization | Official Quasar theming mechanism |
| @fontsource/cinzel | 5.2.8 | Classical serif font for headings | Self-hosted, npm-managed, no CDN dependency |
| @capacitor/assets | 3.x | App icon and splash screen generation | Official Capacitor tool |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @fontsource-variable/cinzel | latest | Variable font (single file, multiple weights) | If multiple weights needed with smaller footprint |
| Roboto Mono | Built-in | Monospace for timers | Already in use, keep for timer displays |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| @fontsource | Google Fonts CDN | CDN adds external dependency, not ideal for offline mobile |
| Cinzel | Playfair Display | Playfair is elegant but less classical/Roman feel |
| SCSS variables | CSS custom properties only | SCSS gives compile-time optimization; CSS vars for runtime |

**Installation:**
```bash
cd el-templo-app
pnpm add @fontsource/cinzel
# OR for variable font:
pnpm add @fontsource-variable/cinzel

# In src-capacitor folder:
cd src-capacitor
pnpm add -D @capacitor/assets
```

## Architecture Patterns

### Recommended File Structure
```
el-templo-app/
├── src/
│   ├── css/
│   │   ├── quasar.variables.scss   # Brand colors, typography vars
│   │   ├── app.scss                # @font-face, global styles
│   │   ├── fonts/                  # (if manually hosting)
│   │   └── textures/
│   │       └── marble-noise.svg    # SVG noise pattern
│   ├── assets/
│   │   └── brand/
│   │       ├── logo.png            # App logo for splash
│   │       └── icon.png            # App icon source
│   └── boot/
│       └── fonts.ts                # Font preload (optional)
├── assets/                         # Capacitor assets source
│   ├── logo.png                    # 1024x1024 min
│   └── logo-dark.png               # Optional dark mode
└── src-capacitor/
    ├── ios/                        # Generated icons
    └── android/                    # Generated icons
```

### Pattern 1: Quasar SCSS Variable Theming
**What:** Override Quasar's default colors at compile time
**When to use:** For brand colors that don't change at runtime
**Example:**
```scss
// src/css/quasar.variables.scss
// Source: https://quasar.dev/style/sass-scss-variables/

// El Templo Brand Colors
$primary: #2c3e5c;      // Navy blue - headings, primary actions
$secondary: #b8956c;    // Bronze/gold - accents, icons
$accent: #b8956c;       // Same as secondary for consistency

// Semantic colors (keep for feedback)
$positive: #21ba45;
$negative: #c10015;
$info: #31ccec;
$warning: #f2c037;

// Dark mode (navy-based)
$dark: #1a2a3e;
$dark-page: #0f1a28;

// Custom El Templo variables
$cream: #f5f0e8;
$cream-dark: #e8e0d4;

// Typography
$typography-font-family: 'Roboto', '-apple-system', 'Helvetica Neue', Helvetica, Arial, sans-serif;
$heading-font-family: 'Cinzel', Georgia, 'Times New Roman', serif;
```

### Pattern 2: Self-Hosted Font Loading
**What:** Import fonts via @fontsource in app entry
**When to use:** For custom fonts without CDN dependency
**Example:**
```typescript
// src/boot/fonts.ts or directly in main.ts
// Source: https://www.npmjs.com/package/@fontsource/cinzel

import '@fontsource/cinzel/400.css';  // Regular
import '@fontsource/cinzel/700.css';  // Bold for headings

// Then in CSS:
// .heading { font-family: 'Cinzel', serif; }
```

### Pattern 3: CSS Marble Texture Background
**What:** SVG feTurbulence noise pattern for subtle texture
**When to use:** For cream/marble backgrounds on key screens
**Example:**
```scss
// src/css/app.scss
// Source: https://css-tricks.com/grainy-gradients/

.marble-bg {
  background-color: $cream;
  position: relative;

  &::before {
    content: '';
    position: absolute;
    inset: 0;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
    opacity: 0.05;
    pointer-events: none;
    mix-blend-mode: multiply;
  }
}
```

### Pattern 4: Greek Letter Level Mapping
**What:** Map level names to Greek letters in UI
**When to use:** For displaying user level badges
**Example:**
```typescript
// src/modules/training/utils/levelDisplay.ts

export const LEVEL_GREEK_MAP: Record<string, string> = {
  'Alfa': '\u03B1',    // α (alpha)
  'Delta': '\u0394',   // Δ (Delta uppercase)
  'Sigma': '\u03A3',   // Σ (Sigma uppercase)
  'Omega': '\u03A9',   // Ω (Omega uppercase)
};

export function getLevelGreek(level: string): string {
  return LEVEL_GREEK_MAP[level] || level;
}
```

### Anti-Patterns to Avoid
- **Inline color values:** Don't hardcode `#2c3e5c` in components; use SCSS variables or CSS custom properties
- **Google Fonts CDN in mobile app:** Adds external dependency, slower initial load, fails offline
- **Pure black backgrounds:** Use `$dark` (#1a2a3e) instead of #000000 for better contrast
- **Overriding Quasar component styles globally:** Use scoped styles or BEM classes to avoid conflicts
- **Large texture images:** Use SVG feTurbulence instead of PNG textures for smaller bundle

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| App icon generation | Manual resize in Photoshop | @capacitor/assets CLI | Generates all 50+ required sizes for iOS/Android |
| Font loading optimization | Manual preload logic | @fontsource packages | Handles subsetting, formats, CSS injection |
| Color theming | Custom CSS variable system | Quasar SCSS variables | Integrates with all Quasar components |
| Noise texture generation | PNG image files | SVG feTurbulence | Resolution-independent, tiny file size |
| Contrast checking | Manual color selection | Use extracted brand colors | Brand assets already define the palette |

**Key insight:** Mobile app theming has many platform-specific requirements (iOS icon sizes, Android adaptive icons, font rendering). Using established tools prevents missing edge cases.

## Common Pitfalls

### Pitfall 1: Font Loading Flash (FOUT)
**What goes wrong:** Text renders in fallback font, then jumps to custom font
**Why it happens:** Font files load after initial render
**How to avoid:**
- Use `font-display: swap` for graceful fallback
- Preload critical fonts in index.html
- Keep font file sizes small (subset if needed)
**Warning signs:** Visible text "flash" on page load

### Pitfall 2: Android 12+ Adaptive Icon Issues
**What goes wrong:** Icon appears too small or cropped on newer Android
**Why it happens:** Android 12+ uses adaptive icon system with smaller safe zone
**How to avoid:**
- Use @capacitor/assets which handles adaptive icons
- Keep important content in center 66% of icon
- Test on Android 12+ emulator/device
**Warning signs:** Icon looks different on different Android versions

### Pitfall 3: Quasar Variable Not Applying
**What goes wrong:** Changed `$primary` but components still use old color
**Why it happens:** Didn't restart dev server after creating/modifying variables file
**How to avoid:**
- Always restart `quasar dev` after changing quasar.variables.scss
- Ensure file has at least one `$` character for detection
**Warning signs:** Colors work in custom CSS but not on Quasar components

### Pitfall 4: Cream Background with Low Contrast Text
**What goes wrong:** Text becomes hard to read on cream background
**Why it happens:** Light background (#f5f0e8) with medium-gray text
**How to avoid:**
- Use navy (#2c3e5c) for body text on cream backgrounds
- Maintain 4.5:1 contrast ratio minimum for body text
- Test with browser accessibility tools
**Warning signs:** WCAG contrast checker shows failures

### Pitfall 5: Serif Font in Small Sizes
**What goes wrong:** Cinzel becomes hard to read at body text sizes
**Why it happens:** Serif fonts are designed for display/headings
**How to avoid:**
- Use Cinzel only for headings (h1-h4, block names)
- Keep Roboto for body text, captions, metrics
- Minimum Cinzel size: 16px (ideally 20px+)
**Warning signs:** Text looks cramped or spindly on mobile

### Pitfall 6: Missing iOS Status Bar Padding
**What goes wrong:** Content overlaps with status bar on iPhone
**Why it happens:** Cream backgrounds make status bar blend in
**How to avoid:**
- Keep existing `iosStatusBarPadding: true` in quasar.config.js
- Use `safe-area-inset-*` CSS for custom layouts
**Warning signs:** Text cut off at top of screen on iOS

## Code Examples

### Complete quasar.variables.scss Setup
```scss
// Source: https://quasar.dev/style/sass-scss-variables/

// El Templo Brand Colors
$primary: #2c3e5c;      // Navy blue
$secondary: #b8956c;    // Bronze/gold
$accent: #b8956c;       // Consistent with secondary

// Keep semantic colors for UX feedback
$positive: #21ba45;
$negative: #c10015;
$info: #31ccec;
$warning: #f2c037;

// Dark mode theming
$dark: #1a2a3e;
$dark-page: #0f1a28;

// Custom brand variables (available in all SCSS)
$cream: #f5f0e8;
$cream-dark: #e8e0d4;
$bronze-light: #d4b896;

// Typography customization
$body-font-size: 14px;
$body-line-height: 1.5;
```

### Font Import in app.scss
```scss
// Source: https://quasar.dev/style/typography/

// Import Cinzel from @fontsource (after npm install)
@import '@fontsource/cinzel/400.css';
@import '@fontsource/cinzel/700.css';

// Custom heading font family
$heading-font: 'Cinzel', Georgia, 'Times New Roman', serif;

// Apply to headings globally
h1, h2, h3, h4,
.text-h1, .text-h2, .text-h3, .text-h4, .text-h5, .text-h6 {
  font-family: $heading-font;
}

// Block name specific styling
.block-name {
  font-family: $heading-font;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: $primary;
}

// Subtitle styling (bronze, sans-serif, uppercase)
.block-subtitle {
  font-family: 'Roboto', sans-serif;
  font-weight: 500;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: $secondary;
}
```

### Marble Background Mixin
```scss
// Source: https://css-tricks.com/grainy-gradients/

@mixin marble-texture($opacity: 0.04) {
  position: relative;
  background-color: $cream;

  &::before {
    content: '';
    position: absolute;
    inset: 0;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
    opacity: $opacity;
    pointer-events: none;
    z-index: 0;
  }

  // Ensure content stays above texture
  > * {
    position: relative;
    z-index: 1;
  }
}

// Usage
.session-summary {
  @include marble-texture(0.05);
}
```

### Capacitor Assets Generation
```bash
# Source: https://github.com/ionic-team/capacitor-assets

# 1. Create assets folder in el-templo-app root
mkdir -p assets

# 2. Copy and resize brand icon to 1024x1024 minimum
# Use the temple icon (ICON BIG.png) as source

# 3. Generate all platform assets
cd src-capacitor
npx @capacitor/assets generate \
  --iconBackgroundColor '#f5f0e8' \
  --iconBackgroundColorDark '#1a2a3e' \
  --splashBackgroundColor '#f5f0e8' \
  --splashBackgroundColorDark '#1a2a3e' \
  --logoSplashScale 0.3

# This generates:
# - iOS: All AppIcon sizes, LaunchImage
# - Android: mipmap-* icons, adaptive icons, splash screens
```

### Greek Level Badge Component Pattern
```vue
<!-- Example enhancement to existing component -->
<template>
  <q-badge
    :color="levelColor"
    text-color="white"
    class="level-badge"
  >
    {{ greekLetter }}
  </q-badge>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  level: 'Alfa' | 'Delta' | 'Sigma' | 'Omega';
}>();

const GREEK_MAP = {
  'Alfa': '\u03B1',
  'Delta': '\u0394',
  'Sigma': '\u03A3',
  'Omega': '\u03A9',
};

const greekLetter = computed(() => GREEK_MAP[props.level] || props.level);

const levelColor = computed(() => {
  // Bronze for all levels, or differentiate if needed
  return 'secondary'; // Uses $secondary (#b8956c)
});
</script>

<style scoped lang="scss">
.level-badge {
  font-size: 14px;
  font-weight: 700;
  min-width: 28px;
  justify-content: center;
}
</style>
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Google Fonts CDN | @fontsource self-hosted | 2022+ | Better offline support, no external calls |
| PNG texture images | SVG feTurbulence | 2023+ | Smaller bundle, resolution-independent |
| cordova-res for icons | @capacitor/assets | 2023+ | Better Android 12 support, maintained |
| Manual icon resize | CLI generation | Always | Eliminates human error, all sizes covered |

**Deprecated/outdated:**
- `cordova-res`: No longer maintained, use @capacitor/assets
- Loading fonts from Google Fonts CDN in mobile apps: Adds latency, fails offline
- Android legacy splash screen approach: Android 12+ requires adaptive splash API

## Open Questions

1. **Font Weight for Block Names**
   - What we know: Cinzel 700 is bold, matches "PYROS" in mockup
   - What's unclear: Should Cinzel 400 also be loaded for any lighter uses?
   - Recommendation: Start with 700 only, add 400 if needed to minimize bundle

2. **Dark Mode Support**
   - What we know: Quasar has dark mode, we have $dark variables defined
   - What's unclear: Should cream backgrounds become navy in dark mode?
   - Recommendation: Implement light mode first per Phase 11 scope; dark mode can follow

3. **Icon Border/Padding on iOS**
   - What we know: iOS may add rounded corners to icons
   - What's unclear: Whether temple icon needs padding to avoid clipping
   - Recommendation: Test on iOS simulator after generation, adjust if needed

## Sources

### Primary (HIGH confidence)
- [Quasar SCSS Variables](https://quasar.dev/style/sass-scss-variables/) - Theme customization
- [Quasar Typography](https://quasar.dev/style/typography/) - Font loading
- [Quasar Color Palette](https://quasar.dev/style/color-palette/) - setCssVar, brand colors
- [@capacitor/assets GitHub](https://github.com/ionic-team/capacitor-assets) - Icon generation CLI
- [Capacitor Splash Screens and Icons](https://capacitorjs.com/docs/guides/splash-screens-and-icons) - Official guide

### Secondary (MEDIUM confidence)
- [@fontsource/cinzel npm](https://www.npmjs.com/package/@fontsource/cinzel) - Font package
- [CSS-Tricks Grainy Gradients](https://css-tricks.com/grainy-gradients/) - SVG texture technique
- [LogRocket Font Loading Vue](https://blog.logrocket.com/best-practices-for-loading-fonts-in-vue/) - Best practices
- [Dark Mode UI Best Practices 2026](https://www.designstudiouiux.com/blog/dark-mode-ui-design-best-practices/) - Accessibility

### Tertiary (LOW confidence)
- Fitness app design trends (general pattern research, not app-specific)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Verified with official Quasar and Capacitor docs
- Architecture: HIGH - Based on official documentation and established patterns
- Pitfalls: MEDIUM - Based on combination of docs and community experience
- Texture technique: MEDIUM - CSS-Tricks is reliable but technique may need tuning

**Research date:** 2026-01-29
**Valid until:** 2026-03-01 (Quasar stable, patterns unlikely to change)
