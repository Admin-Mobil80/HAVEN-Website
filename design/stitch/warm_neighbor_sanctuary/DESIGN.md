---
name: Warm Neighbor Sanctuary
colors:
  surface: '#fef8f3'
  surface-dim: '#dfd9d4'
  surface-bright: '#fef8f3'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f9f3ed'
  surface-container: '#f3ede8'
  surface-container-high: '#ede7e2'
  surface-container-highest: '#e7e1dc'
  on-surface: '#1d1b18'
  on-surface-variant: '#574238'
  inverse-surface: '#32302d'
  inverse-on-surface: '#f6f0ea'
  outline: '#8a7267'
  outline-variant: '#ddc1b3'
  surface-tint: '#9e4300'
  primary: '#9a4100'
  on-primary: '#ffffff'
  primary-container: '#bd5611'
  on-primary-container: '#fffbff'
  inverse-primary: '#ffb690'
  secondary: '#325f9b'
  on-secondary: '#ffffff'
  secondary-container: '#93bdff'
  on-secondary-container: '#194b86'
  tertiary: '#2a674c'
  on-tertiary: '#ffffff'
  tertiary-container: '#448064'
  on-tertiary-container: '#f5fff7'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffdbcb'
  primary-fixed-dim: '#ffb690'
  on-primary-fixed: '#341100'
  on-primary-fixed-variant: '#783100'
  secondary-fixed: '#d5e3ff'
  secondary-fixed-dim: '#a7c8ff'
  on-secondary-fixed: '#001c3b'
  on-secondary-fixed-variant: '#124782'
  tertiary-fixed: '#b1f0ce'
  tertiary-fixed-dim: '#95d4b3'
  on-tertiary-fixed: '#002114'
  on-tertiary-fixed-variant: '#0e5138'
  background: '#fef8f3'
  on-background: '#1d1b18'
  surface-variant: '#e7e1dc'
typography:
  display-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 40px
    fontWeight: '700'
    lineHeight: 52px
    letterSpacing: -0.02em
  display-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 42px
    letterSpacing: -0.01em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 44px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 26px
    fontWeight: '600'
    lineHeight: 36px
    letterSpacing: 0em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 34px
    letterSpacing: 0em
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 30px
    letterSpacing: 0.01em
  body-xl:
    fontFamily: Plus Jakarta Sans
    fontSize: 22px
    fontWeight: '400'
    lineHeight: 36px
    letterSpacing: 0.01em
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 19px
    fontWeight: '400'
    lineHeight: 32px
    letterSpacing: 0.01em
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 17px
    fontWeight: '400'
    lineHeight: 28px
    letterSpacing: 0.01em
  label-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 26px
    letterSpacing: 0.02em
  label-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: 0.03em
  label-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '700'
    lineHeight: 20px
    letterSpacing: 0.04em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1.5rem
  gutter-tablet: 2rem
  gutter-desktop: 2.5rem
  margin: 1.25rem
  margin-tablet: 2rem
  margin-desktop: 3.5rem
  space-xs: 0.5rem
  space-sm: 0.75rem
  space-md: 1.25rem
  space-lg: 2rem
  space-xl: 3rem
---

## Brand & Style

The design system is centered on tactile gentleness, reassurance, and radical legibility. Tailored for older adults navigating ambient AI and family communication, it avoids the cold, clinical minimalism of medical apps and the hyper-sleek abstraction of contemporary tech startups. 

The aesthetic is inspired by physical stationary, comfortable morning light, and heirloom domestic items: warm linen backdrops, soft ink tones, deep legible typography, and unmistakably distinct communication channels. Visual elements feel stable and predictable. Motion is deliberate, unhurried, and calming. Interfaces prioritize massive, unambiguous click surfaces, hyper-visible focus states, and explicit provenance markers distinguishing genuine family voices from empathetic ambient AI companion interactions.

## Colors

The palette establishes an emotional balance between the hearth-like presence of the AI companion and the distinct, grounding voice of human family ties.

- **Primary (`#D96B27` - Terracotta Honey):** Reserved exclusively for the companion AI entity (`Digital Daniel · AI`). Communicates warmth, patience, and non-intrusive support without clinical sterility.
- **Secondary (`#1D4E89` - Oceanic Blue):** Reserved for real family members, verified voice dispatches, and incoming authentic family messages. This color instantly signals to the user: *this is your actual family, not an automated persona*.
- **Tertiary (`#2D6A4F` - Foliage Green):** Handles reassurance, successful activities, medication confirmations, and system wellness statuses.
- **Neutral (`#23211E` - Warm Charcoal Ink):** Used for typography on light backgrounds to preserve WCAG AAA contrast ratios without the harsh glare of pure `#000000`.
- **Canvas & Surface System:** 
  - Canvas Light: `#FDFBF7` (Warm Linen)
  - Surface Light: `#FFFFFF` (Pure Warm White)
  - Muted Text Light: `#68625B` (Gentle Warm Slate)
  - Canvas Dark: `#1A1917` (Deep Peat)
  - Surface Dark: `#262421` (Warm Earth)
  - Ink Dark: `#F5F2EB` (Warm Ecru)
  - Muted Text Dark: `#A8A29A` (Sandstone)
- **Status & Utility:**
  - Warning: `#D48B18` (Warm Ochre Amber)
  - Danger: `#C93B2B` (Soft Crimson)
  - Universal Focus Ring: `#4361EE` (Accessible High-Contrast Iris, minimum 3px offset ring across all interactive components).

## Typography

Typography prioritizes senior ocular accessibility, cognitive ease, and natural legibility under variable lighting conditions. `Plus Jakarta Sans` delivers wide apertures, distinct letterforms (preventing confusion between `I`, `l`, and `1`), and friendly rounded terminals that feel reassuring rather than sterile.

- **Scale Rationale:** Standard body text defaults to `body-lg` (19px) and `body-xl` (22px) for reading threads and companion dialogues. Font sizes never fall below 14px anywhere in the system.
- **Spacious Leading:** Generous line heights (1.5x–1.7x) eliminate line jumping during reading fatigue.
- **Attribution Styling:** Labels representing companion origin (`Digital Daniel · AI`) or human family (`Family Dispatch`) leverage `label-sm` or `label-md` with emphatic letter-spacing and semibold weights to enforce distinct categorization.

## Layout & Spacing

The layout model is anchored on fixed-fluid constraints: content flows naturally but caps at generous max-widths to keep line lengths between 45–65 characters for reading comfort.

- **Breakpoints:**
  - Mobile: < 640px (Single-column layout, bottom-anchored actions, zero edge crowding).
  - Tablet / Echo Show Hub: 641px–1024px (2-column layout pairing companion status with active conversations; minimum 64px physical tap target zone).
  - Desktop / Family Portal: > 1024px (Constrained center layout, 1200px max container).
- **Physical Tap Guarantees:** Touch targets require a minimum interactive perimeter of 48×48px on mobile and 64×64px on tablet/Echo interfaces. Gaps between adjacent interactive controls must maintain a minimum of `space-sm` (12px) to prevent accidental mis-taps by tremor-affected hands.

## Elevation & Depth

Visual depth is achieved through tactile, low-stress physical layering rather than dramatic, floating cast shadows:

- **Surface Tonal Stacking:** Visual prominence builds from the Canvas (`#FDFBF7`) up to Card Surfaces (`#FFFFFF`), topped by deliberate Sub-Cards or Highlight Blocks (`#F7F4EE`).
- **Low-Contrast Tactile Outlines:** Cards and modules use a solid, structural border (`1.5px` solid `#EAE5DD`) to clearly delineate boundaries for users with diminished contrast perception.
- **Warm Ambient Shadow:** Elevated elements (such as call popovers, active dialog panels, and major alert banners) receive a soft, low-intensity shadow tinted with warm amber-slate rather than cold black:
  - Resting Card: `0 2px 4px rgba(35, 33, 30, 0.04), 0 1px 2px rgba(35, 33, 30, 0.06)`
  - Elevated / Interactive Hover: `0 8px 24px rgba(78, 59, 42, 0.08), 0 2px 6px rgba(78, 59, 42, 0.04)`
  - Dialog / Overlay: `0 16px 40px rgba(35, 33, 30, 0.12), 0 4px 12px rgba(35, 33, 30, 0.06)`
- **Zero Blurring / Glare:** Frosted glass and translucent backdrops are prohibited behind textual components to maintain high legibility.

## Shapes

The design system employs a roundedness level of `2` (`0.5rem` / `8px` baseline radius). 

- **Containers & Message Bubbles (`rounded-lg` / `1rem`):** Surfaces, conversational cards, and prompt cards utilize gentle, approachable curves that feel soft to the touch without resembling playful infant toys.
- **Buttons & Large Interaction Targets (`rounded-lg` or Full Pill):** Primary action triggers leverage pill or 1rem corners for clear affordance.
- **Badges & Provenance Tags (`rounded-sm` / `0.375rem`):** Sender tags (`Digital Daniel · AI` and `Family`) carry tighter, slightly squared radii to preserve their documentary, badge-like clarity.

## Components

### Buttons
- **Primary Companion Trigger:** `#D96B27` background, white label, 56px minimum height (64px on tablet hub). Border radius `1rem`. Active state provides subtle physical inset or warm deepening (`#C05819`).
- **Family Action Trigger:** `#1D4E89` background, white label, 56px minimum height. Dedicated to triggering family calls, replying to relatives, or viewing authentic media.
- **Secondary / Reassurance Button:** `#FFFFFF` background with `2px` solid `#EAE5DD` border and `#23211E` text. Never uses faint gray borders.
- **Focus Indicator:** All buttons render an unmistakable `3px` solid `#4361EE` outline with a `2px` white offset ring on focus-visible.

### Companion vs. Family Cards
- **AI Companion Card:** Warm surface (`#FFFFFF`) framed by a subtle top accent bar or tag featuring Terracotta Honey (`#D96B27`). Accompanied by the non-negotiable label `Digital Daniel · AI` accompanied by a calm icon.
- **Family Message Card:** Framed with Oceanic Blue (`#1D4E89`) header ribbon, authentic sender portrait/avatar with deep blue ring, timestamp, and clear audio playback bar (minimum 54px scrubber height).

### Input Fields & Controls
- **Text & Voice Inputs:** Generous input heights (56px–64px), 2px solid `#D5CFC7` borders darkening to `#23211E` on interaction. Inner placeholder text styled in `#68625B` (never low-contrast light grey).
- **Checkboxes & Radios:** Scaled to 28×28px minimum bounding box with explicit check icons (stroke width 3px) in foliage green or primary terracotta. Label text placed alongside is clickable and spaced by `16px`.

### Daily Check-in & Chips
- **Chips / Quick Answers:** High-contrast toggle chips (`#FFFFFF` background, `2px` border `#D5CFC7`, 48px height) that transition to solid `#23211E` background with `#FFFFFF` text when selected.
- **Audio Indicator:** Real-time Alexa/Voice activity indicator utilizes a rhythmic, warm terracotta wave with clear textual status indicators: "Listening...", "Daniel is speaking...", or "Connected to Sarah".