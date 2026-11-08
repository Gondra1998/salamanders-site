---
name: Salamanders
description: Cold armour, molten core — a dark, forged clan site with a volcano burning behind every page.
colors:
  obsidian: "#050a08"
  pitch: "#07110d"
  basalt: "#0b1511"
  basalt-2: "#0e1c16"
  basalt-3: "#111b18"
  ash: "#26372f"
  ash-2: "#3a5246"
  bone: "#e8efe9"
  smoke: "#96a59c"
  faint: "#7a8a81"
  drake: "#59d66c"
  drake-deep: "#173c23"
  ember: "#ff6a2b"
  magma: "#e0431d"
  gold: "#dfb85b"
  averland: "#fdb825"
  whitehot: "#f2d27a"
  cobalt: "#6cc4ef"
  violet: "#bb82e0"
  vacant: "#ff9a7a"
  dw-bg: "#060906"
  dw-surface: "#0b110c"
  dw-surface-2: "#111a12"
  dw-ink: "#e2ecdc"
  dw-muted: "#83978a"
  dw-line: "#1a2b1c"
  dw-line-2: "#2a4a2d"
  dw-accent: "#7fd35c"
  dw-accent-ink: "#041004"
  dw-silver: "#c3ccd5"
  dw-gold: "#e0b43c"
  dw-up: "#5fcf8b"
  dw-down: "#e5736a"
typography:
  display:
    fontFamily: "'Oswald Variable', Bahnschrift, 'DIN Condensed', Oswald, 'Arial Narrow', system-ui, sans-serif"
    fontSize: "clamp(2.2rem, 7vw, 3.6rem)"
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: "0.02em"
  body:
    fontFamily: "system-ui, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "'Cascadia Code', 'Cascadia Mono', ui-monospace, Consolas, monospace"
    fontSize: "0.72rem"
    fontWeight: 400
    letterSpacing: "0.32em"
  dw-title:
    fontFamily: "'Cinzel Variable', Cinzel, Georgia, serif"
    fontSize: "clamp(2rem, 8vw, 3.4rem)"
    fontWeight: 700
    lineHeight: 1.05
rounded:
  sm: "2px"
  md: "3px"
  lg: "8px"
  pill: "999px"
spacing:
  gutter: "1.25rem"
  page-x: "1.5rem"
  page-top: "4rem"
components:
  button-ember:
    backgroundColor: "{colors.ember}"
    textColor: "#1a0d06"
    typography: "{typography.display}"
    rounded: "{rounded.sm}"
    padding: "0.7rem 1.4rem"
  button-drake:
    backgroundColor: "rgba(89, 214, 108, 0.06)"
    textColor: "{colors.drake}"
    typography: "{typography.display}"
    rounded: "{rounded.sm}"
    padding: "0.7rem 1.4rem"
  panel:
    backgroundColor: "{colors.basalt-2}"
    textColor: "{colors.bone}"
    rounded: "{rounded.md}"
    padding: "1.5rem"
  field:
    backgroundColor: "{colors.basalt-2}"
    textColor: "{colors.bone}"
    rounded: "{rounded.md}"
    padding: "0.7rem 1rem"
  chip:
    backgroundColor: "{colors.obsidian}"
    textColor: "{colors.smoke}"
    rounded: "{rounded.pill}"
    padding: "0.35rem 0.7rem"
  dw-card:
    backgroundColor: "{colors.dw-surface}"
    textColor: "{colors.dw-ink}"
    typography: "{typography.dw-title}"
    rounded: "{rounded.md}"
    padding: "1rem 1.2rem"
---

# Design System: Salamanders

## Overview

**Creative North Star: "The Forge at Night"**

A cold, dark workshop with one furnace burning in it. The ground is basalt and obsidian, the armour-grey panels are
quiet, and molten light turns up only where it means something: the primary action, the lava down the volcano that
sits behind every page, an honour. The site is a tool people use on a phone between games, so the dark is for
readability first and atmosphere second: text sits on dense panels, never directly on the fire.

The system is hard-edged and condensed. Titles are forged capitals in a narrow display face; small technical
labels are spaced-out mono; corners are nearly square. Panels are glass over the volcano (a blur and a one-pixel
ash border), and controls answer a touch with a visible squeeze. Nothing is soft, rounded or pastel.

**Key Characteristics:**
- Dark only: obsidian ground, bone text, no light theme.
- One furnace: warm colour is rare, and always means something live.
- Forged capitals for titles, spaced mono for labels, plain system type for reading.
- Near-square corners (2-3px), 1px ash borders, glass panels over a fixed procedural volcano.
- Press feedback on everything pressable (`scale(0.97)`); hover only where a pointer can hover.
- Phone first: single column, 44px minimum tap targets, safe-area padding.

### The Deathwatch area (a scoped sub-theme)

**Creative North Star for this area: "The War Room"** (the War-Room Ledger). The Deathwatch's Watch Fortress
Ebonhold is the Salamanders' own, so it keeps the site's dark and its fire, but it presents itself as the original
site (the Oct 18 build, the artifact) does: a black-green command room of ledgers, standings and records. Its look
is that site's "cogitator": green phosphor on black, chamfered double-line frames drawn with a 9-slice SVG
border-image (so the corners keep their shape at any size), a grain and faint scanlines, section headings as small
glowing plaques, and a painted backdrop for each area (the hub, Event Tracker, Armouring Hall, Chronicles, Manage)
that drifts and flickers slowly under a translucent dark gradient, so the site's volcano and sparks still show
through. Text always sits on a dense framed panel, never on the painting. Its tokens are the `dw-*` colours above,
set on one wrapper (`.dw`) and never on `:root`. It is dark only too.

## Colors

A near-black green ground with grey-green armour, one living green, and a furnace: ember, magma and gold.

### Primary
- **Drake Green** (#59d66c): the "alive" colour: active links, outlines of secondary buttons, focus rings, small
  status marks. Used sparingly. (**Drake Deep**, #173c23, is in the theme but nothing uses it yet.)

### Secondary
- **Ember** (#ff6a2b) and **Magma** (#e0431d): the molten core. Ember is the primary call to action (a vertical
  ember-to-magma gradient with a glow); magma is its shadow and the lava. Never used for body text or large fills.

### Tertiary
- **Gold** (#dfb85b), **Averland** (#fdb825) and **Whitehot** (#f2d27a): honours and record. Averland is the
  Legion Archive's brass plaque; whitehot is the hot end of the rank heat ramp; gold is rules and edges.
- **Cobalt** (#6cc4ef) and **Violet** (#bb82e0): the weapon tree's two branches. **Vacant** (#ff9a7a): a post nobody holds.

### Neutral
- **Obsidian** (#050a08): the page ground. **Pitch** (#07110d): the end of the ground gradient.
- **Basalt** (#0b1511), **Basalt 2** (#0e1c16, the panel colour) and **Basalt 3** (#111b18): layered surfaces.
- **Ash** (#26372f) and **Ash 2** (#3a5246): borders and dividers.
- **Bone** (#e8efe9): text. **Smoke** (#96a59c): secondary text. **Faint** (#7a8a81): the quietest text that still
  reaches 4.5:1, for placeholders, empty states and hints.

### Deathwatch (`dw-*`)
Ground **dw-bg** (#060906), panels **dw-surface** (#0b110c) and **dw-surface-2** (#111a12), text **dw-ink**
(#e2ecdc) and **dw-muted** (#83978a), lines **dw-line** (#1a2b1c) and **dw-line-2** (#2a4a2d), accent
**dw-accent** (#7fd35c) with **dw-accent-ink** (#041004) on it, **dw-silver** (#c3ccd5) for the Deathwatch,
**dw-gold** (#e0b43c) for honours, **dw-up** (#5fcf8b) and **dw-down** (#e5736a) for movement. Every text colour
is tested at 4.5:1 on the surface.

### Named Rules
**The Molten Core Rule.** Warm light is rare and always live: the primary action, the lava, an honour. If a screen
has more than one glowing thing competing, one of them is wrong.

**The Dense Panel Rule.** Text never sits directly on the volcano. It sits on a panel dense enough to keep body
text at 4.5:1 against the brightest lava.

## Typography

**Display Font:** Oswald Variable (with Bahnschrift, DIN Condensed, Arial Narrow)
**Body Font:** the system sans (system-ui, Segoe UI, Roboto)
**Label/Mono Font:** Cascadia Code (with ui-monospace, Consolas)
**Deathwatch type** (self-hosted through fontsource, loaded only with the Deathwatch routes): Cinzel Variable for
titles, Teko Variable for plaques, buttons and the area bar's view name (tall, squared, uppercase), Barlow Condensed
for labels and the navigation (uppercase, spaced), Barlow for reading.

**Character:** a forged, condensed title face over plain reading text, with spaced-out mono for the technical
labels, like stamped plates on armour. Fonts are self-hosted: no third-party font requests.

### Hierarchy
- **Display** (700, `clamp(2.2rem, 7vw, 3.6rem)`, 1.05): page titles, uppercase, 0.02em tracking.
- **Body** (400, 1rem, 1.6): reading text; ledes stay near 52 characters wide.
- **Label** (400, 0.72rem, 0.32em, uppercase mono): eyebrows above titles and small data labels.
- **Deathwatch title** (700, `clamp(2rem, 8vw, 3.4rem)`, 1.05, Cinzel): area titles and card titles in the Deathwatch area only.

### Named Rules
**The Forged Caps Rule.** Display type is uppercase and condensed. A title in sentence case is a bug.

**The Text Floor Rule.** No text goes under `--text-floor`: 11px on a phone (0 on desktop, where the small plate
lettering keeps its size). A micro-label writes its size as `max(<size>, var(--text-floor))`.

## Layout

Mobile first, single column, with a left-aligned reading column and the volcano placed in the empty half
(each route has its own volcano profile, quieter on long pages of tables). Pages set their own width: 60rem for
Companies, 68rem for Builds, 76rem for the Armoury, the landing page and the sticky navigation (1.25rem padding);
the reading page has 1.5rem side padding. Breakpoints seen: 600px, 640px, 768px (the phone text floor and tap tokens), 860px and 900px. On a phone cards go full width, tap targets are at least 44px (the banner strips are 56px),
and the page pads the safe areas so nothing hides under a notch or the home indicator. The Deathwatch area shows
the list of views as a bottom sheet below 900px and as a sidebar from 900px.

## Elevation & Depth

A hybrid: depth is **glass layered over a fixed procedural volcano**, with glow reserved for the primary action.
Panels are translucent with a blur (6-8px) and a one-pixel ash border; the navigation is the same glass at 10px.
There are no drop shadows on content.

### Shadow Vocabulary
- **Ember glow** (`box-shadow: 0 8px 30px -8px rgba(224, 67, 29, 0.7)`): the primary button at rest.
- **Ember glow, lit** (`0 12px 40px -8px rgba(224, 67, 29, 0.85)`): the primary button on hover (pointer devices only).

### Named Rules
**The Flat Content Rule.** Content panels are flat glass. Only the primary action glows, and only the volcano burns.

## Shapes

Hard-edged. Corners are 2px on controls and 3px on panels and fields; 6-8px appears only on larger blocks; chips are
pills (999px); the Deathwatch bottom sheet rounds only its top corners (14px). Borders are one pixel, in ash.

## Components

### Buttons
- **Shape:** nearly square (2px).
- **Primary (ember):** a vertical ember-to-magma gradient with a dark label (#1a0d06) in uppercase display type, a
  one-pixel warm border, and a glow. Padding about 0.7rem 1.4rem, and at least 44px tall on a phone.
- **Secondary (drake):** a faint drake tint with a drake outline and drake uppercase label.
- **Quiet (ghost, `.btn-ghost`):** the second action beside an ember or drake one: transparent fill, a one-pixel ash
  border, a smoke label that turns bone on hover, in the same uppercase display type.
- **Small (`.btn-sm`):** the shared small size for buttons set in a row or a card, used with any of the three above
  (0.5rem 0.85rem padding, 2px corners, 0.78rem type). Its minimum height is `--tap`: its own size on desktop, 44px
  on a phone.
- **Tap targets:** every tap target is at least `--tap` (44px) on touch screens and phones.
- **Press:** `scale(0.97)` on every pressable thing, at `--dur-press` (120ms). **Hover:** only inside
  `@media (hover: hover) and (pointer: fine)`. See Motion.

### Chips
- **Style:** pill (999px), one-pixel ash border, smoke text on a dark backing (`rgba(5, 10, 8, 0.6)`) so it
  stays readable where it crosses the lava; the border turns drake on hover.

### Panels
- **Glass panel** (`.surface`): `basalt-2` at 86-90% over a blur, one-pixel ash border, 3px corners, dense enough for
  4.5:1 text. `.panel-forge` is the lighter version.

### Inputs / Fields
- **Style:** `rgba(14, 28, 22, 0.6)` fill, one-pixel ash border, 3px corners, bone text. On a touch screen every
  field is 16px so the page never zooms. **Focus:** a 2px drake outline, offset 2px.

### Navigation
- **Style:** sticky, translucent obsidian glass with a 10px blur and an ash bottom border; the brand is spaced
  uppercase display type. On a phone it collapses to a menu button.

### Deathwatch signature components
- **Area bar and bottom sheet:** the banner at the head of an area says where you are and opens the list of views
  in a native modal sheet from the foot of the screen, where a thumb reaches it. It drags and flicks away.
- **The frame (`.dw-panel`), plaque (`.dw-plaque`) and button (`.dw-btn`):** the cogitator look above. The page's
  sheet is a framed panel with a glowing strip on its top and bottom edge; every section heading is a plaque; a
  button is dark glass with glowing green Teko type and clipped corners, squeezing when pressed.
- **The area rail:** the crest, the eyebrow "Watch Fortress Ebonhold", the area's name in Cinzel, and the list of
  views with the original's icons, in its own frame (a flat dense strip on a phone, where the bar and sheet carry
  the list). The view's page sits in the framed sheet beside it.
- **View skeletons (`.dw-sk-bar`, `Sk*`):** until a view is rebuilt it is its real headings and labels over
  shimmer bars (an opacity pulse, off under reduced motion), one file per view under `pages/<area>/<tab>.vue`.
- **Hub cards:** the original's destination menu: a painted picture on top, the area's name in Cinzel, centred,
  with 12px corners (the one place this sub-theme rounds), and the card back to the Salamanders beneath.
- **Gate screen (`DeathwatchBoot.vue`):** every gate state in the cogitator's face, between the site's bar and footer:
  the crest in an auspex ring, the area's name, the answer's headline; once per visit it first plays the wake (a vox log).
- **REDACTED strip:** a black striped bar with spaced mono text, on `/companies`, the way into the area.

## Motion

The forge burns slowly and everything else answers a touch. Motion here is feedback, state and continuity; the few
things allowed to put on a show are named below, and every other duration and easing is a token.

**The Molten Motion Rule.** Spectacle is allowed exactly where the Molten Core Rule allows warm light: the forge (the
volcano canvas and the FireText title), an honour (the Archive's `brand-cool` and gate glow), and one backdrop per
sub-theme (the Deathwatch drift and flicker). Everything else is functional: feedback, state, continuity. A new
decorative animation is wrong by default.

### Durations

Four tokens, set in `src/style.css`. A component writes the token, never a literal.

| Token | Value | Use |
|---|---|---|
| `--dur-press` | 120ms | the press squeeze and the focus ring |
| `--dur-state` | 180ms | colour, background, border, chips, tabs, toggles, hover |
| `--dur-view` | 240ms | the route fade, a panel or card entering or leaving, a popover, expand and collapse |
| `--dur-sheet` | 320ms | the bottom sheet and overlays |

An exit uses the next stop down: a sheet closes at `--dur-view`, a view leaves at `--dur-state`. The Deathwatch bottom
sheet opens at `--dur-sheet` and slides out at `--dur-view`. The route fade (`view-in` in `src/App.vue`) is opacity
only, at `--dur-view`.

The canvas and the authored list below are exempt. A `transition-delay` or `animation-delay` that staggers a list may
be a literal; the duration it staggers still takes a token.

### Easing

One curve: `var(--ease-forge)`, which is `cubic-bezier(0.2, 0.8, 0.2, 1)`. `linear` is for spinners and progress.
`ease-in-out` appears only inside the authored loops below. The keywords `ease`, `ease-in` and `ease-out`, and
`cubic-bezier(` literals, do not appear outside the authored list. Nothing bounces.

### The authored list

These keep their own numbers and curves. Everything not listed here is functional and follows the tokens.

| File | What | Keeps |
|---|---|---|
| `src/components/MountDeathfire.vue`, `src/components/FireText.vue`, `src/components/FireTuner.vue` | the volcano canvas, the title fire and its dev tuner | everything; the policy test skips them |
| `src/components/MountDeathfire.vue` | the Prometheus cycle: the moon crosses the sky once every 15 minutes on a wall clock every visitor shares; at its closest pass, in live mode only, the Time of Trial: a veil that rises over 6s, holds, and falls over 40-60s, its size drawn by chance | the 15-minute shared clock; the veil eases in and out, is never darker than 0.62, and never flashes; under reduced motion the canvas is one still frame, so the moon freezes where the clock put it |
| `src/components/archive/ArchiveThread.vue` | `brand-cool`, 1.7s `cubic-bezier(0.2, 0.7, 0.3, 1)` | duration and curve |
| `src/components/archive/ArchiveGate.vue` | `gate-glow`, the unsealing: 1.6s `ease-in-out`, infinite while the gate is unsealing | duration and curve |
| `src/components/deathwatch/deathwatch.css` | `dw-drift` 40s and `dw-flicker` 5s, `ease-in-out`, `infinite alternate` and `infinite`, bounded by the Deathwatch backdrop: they run as long as it shows | as is |
| `src/components/deathwatch/deathwatch.css` | `dw-pulse` 1.8s (the skeleton shimmer), `ease-in-out`, 3 iterations then rest | as is |
| `src/components/deathwatch/DeathwatchBoot.vue` | the gate's screen: its way in (`dwb-in` 500ms) and out (`dwb-out`, `dwb-near` 400ms), and the waking cursor (`dwb-blink` 450ms, 4 times); the easing is `var(--ease-forge)` | the durations and the cursor's count |
| `src/components/roster/RosterBranch.vue`, `src/components/roster/RosterMember.vue`, `src/components/deathwatch/armour/ArmourView.vue` | the attention flashes: the one that finds a member (`rs-flash` 1.4s and `rs-ping` 1.4s, twice) and the armour card's arrival from a deep link (`ah-flash` 1.3s) | duration and iteration count; the easing is `var(--ease-forge)` |

### Loops

A loop is bounded by the life of what it shows, or by visibility. The lifetime-bounded loops are the spinner and the
Archive gate's unsealing glow (`gate-glow`), which runs only while the "Unsealing the archive…" line shows.
`infinite` is allowed only for the Deathwatch drift and flicker (`dw-drift`, `dw-flicker`), the spinner, and that
glow. The skeleton shimmer (`dw-pulse`) runs three iterations, then rests; the gate screen's cursor blinks four times. The volcano
stops drawing when the tab is hidden (it is a fixed backdrop, so it is never offscreen); the FireText title stops
drawing when it is scrolled out of view.

There is one spinner: `@keyframes spin` in `src/style.css`, unscoped. A component writes
`animation: spin 0.8s linear infinite;` and never defines its own `@keyframes spin`.

### Reduced motion

Nothing moves. Opacity and colour still change, so feedback survives.

The blanket switch sits in `src/style.css` inside `@layer base`, under `@media (prefers-reduced-motion: reduce)`.
Every animation and transition drops to 0.01ms with no delay and one iteration, and smooth scrolling is off. It is
0.01ms rather than `none` so Vue `<Transition>` hooks and `animationend` handlers still fire. The volcano shows a
still frame.

Every declaration in that block is `!important`. Under cascade-layer rules an important declaration in a layer beats
an important declaration in unlayered CSS, and Vue scoped styles are unlayered. So a component's own
`@media (prefers-reduced-motion: reduce)` block cannot restore a duration. Feedback under reduced motion comes only
two ways:

- Put `class="rm-fade"` on an element whose animation or transition is opacity or colour only.
- Add a selector to the allowlist rules in `src/style.css`.

The allowlist gives `.rm-fade`, `.btn-ember`, `.btn-drake`, `.btn-ghost` and `.btn-sm` a `--dur-state` transition
on `opacity`, `color`, `background-color`, `border-color`, `box-shadow` and `outline-color` only. A second rule,
`.rm-fade, main > *`, gives `.rm-fade` and the route fade's `main > *` a `--dur-state` animation duration. No
transform, translate or scale is ever on the allowlist. A component may still switch a transform-bearing animation
off with `animation: none` or `transition: none`; the blanket does not touch the name.

### Press and hover

**Press:** every pressable thing gets `:active { transform: scale(0.97); }` and
`transform var(--dur-press) var(--ease-forge)` merged into its one `transition:` list. Pressables are buttons
(`<button>`, `[role="button"]`, `.btn*`), chips, tabs, and tiles or cards that are links. Table rows, list rows and
text links in prose or navigation are not pressable and do not squeeze. A pressable that already scales on hover keeps
that scale and still gets the active one.

**Hover:** every `:hover` rule sits inside `@media (hover: hover) and (pointer: fine) {`, written at the top level of
the style block and never nested inside a rule. A touch screen fakes a hover on the first tap and keeps it.

### Properties

Functional motion animates `transform`, `opacity`, `visibility` (paired with opacity), `color`, `background-color`,
`border-color`, `outline-color`, `box-shadow`, `text-shadow`, `text-decoration-color` and `filter`. The one layout
exception is `grid-template-rows` from `0fr` to `1fr` for an expand or collapse, at `--dur-view`.

`transition: all` never: name the properties that change. The shorthand form is
`transition: <property> var(--dur-x) var(--ease-forge)[, ...]`; the longhands (`transition-duration`,
`animation-duration`) take the same tokens.

### Vue

A swap of one view or panel for another is a `<Transition>` with a `key` and `mode="out-in"`. A list that gains and
loses items is a `<TransitionGroup>`. `@starting-style` is used only by the Deathwatch bottom sheet and its backdrop
(`src/components/deathwatch/DeathwatchNavSheet.vue`); do not spread it until the floor for phone browsers is
established.

### Canvas budget

Draw target: under 6ms per frame at 390px with 4x CPU throttle, measured headless. Not measured that way yet; on a
desktop with no throttle the volcano and title together cost 0.22ms average and 1.6ms worst per frame (2026-11-01).

Dragons, when they land: the engine lazy-loaded, at most 25 KB gzipped.

### Enforcement

`src/motionPolicy.test.js` sweeps the `.vue` and `.css` files under `src/` (skipping the three canvas files) and
fails the build on:

- R1: `transition: all`.
- R2: a stray easing: `ease`, `ease-in` or `ease-out` anywhere; `ease-in-out` outside `deathwatch.css`,
  `DeathwatchGate.vue` and `ArchiveGate.vue`; `cubic-bezier(` outside the two Archive files.
- R3: a literal duration in a transition, or in an animation outside the authored files and the spinner.
- R4: `infinite` on a line that does not also name `dw-drift`, `dw-flicker`, `gate-glow` or `spin`. The test reads
  line by line, so `dw-pulse` and `dw-gate-pulse` are caught.
- R5: a `:hover` outside the `(hover: hover) and (pointer: fine)` block.
- R6: a second `@keyframes spin`.

## Do's and Don'ts

### Do:
- **Do** keep warm colour for the primary action, the lava and honours (the Molten Core Rule).
- **Do** put text on dense panels and keep it at 4.5:1 over the brightest lava.
- **Do** make every pressable thing squeeze on press, and gate every hover behind `(hover: hover) and (pointer: fine)`.
- **Do** keep tap targets at 44px or more on a phone, and pad the safe areas.
- **Do** take every duration and easing from the Motion section's tokens; see Motion for what may be authored.
- **Do** self-host fonts and keep the Deathwatch area dark only.

### Don't:
- **Don't** add a light theme or a pastel.
- **Don't** put body text straight onto the volcano.
- **Don't** round corners softly: nothing here is a bubble.
- **Don't** use a fixed `100vh`; use `dvh` or `svh`.
- **Don't** request third-party fonts or put real names, ids or secrets in a screenshot, fixture or doc.
