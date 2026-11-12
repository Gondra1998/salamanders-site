# Persuade: /

## Scope and mode
- Mode: Persuade. The visitor decides and acts: join the Chapter, or open a tool.
- Route `/` (`src/views/Landing.vue`): the `HeroForge` first screen, then the muster under "Muster the Chapter": four rows, one per tool.
- The navigation and the volcano behind it belong to every route and are not this brief's.

## Audience and job
- Two visitors, mostly on phones: someone not yet in the Salamanders' Discord (the page offers "Join the Chapter") and a Legion member who is (the same button reads "Open the Discord").
- Job: see in one screen that this is the clan's home and a working tool, then take the next step.

## Action or task
- Primary: the Discord button (join, or open the server for a signed-in member).
- Secondary: "Open the Perk Builder". Then the four rows of the muster, each a link into its tool: Perk Builder, Weapon Armoury, Recommended Builds, Companies & Roster. Each row has a name, a line on what the tool does, and one live fact: classes, weapons, posted builds (only when there are any), companies and sections.

## Proof and content
- The proof is the product (PRODUCT.md, Positioning): a patch-corrected perk builder, armoury and builds, and live Discord role checks. The rows name the real tools and open them.
- Copy on the page: the eyebrow "XVIII Legion · Sons of Vulkan", the wordmark "Salamanders", the tagline "Into the fires of battle, unto the anvil of war."
- No analytics or user research exist. The only counts are the live facts on the muster rows, and they are read from the bundled data files and the builds API, never typed. No other counts or quotes appear and no count may be invented. No member names, ids or secrets.

## Constraints
- Phone first: the hero fills the small viewport (svh, never a fixed 100vh), single column, 44px tap targets, safe-area padding.
- Text over the volcano is tested at 4.5:1; body copy sits on dense panels, never straight on the fire.
- Reduced motion is respected; the volcano shows a still frame.
- Signing in changes only the button's label and target (a live role check); the page works signed out.

## Direction and memorable moment
- Memorable moment: the forge itself, the volcano and the FireText title (the authored list in DESIGN.md, Motion). Warm light stays on that fire and the primary action (the Molten Core Rule).
- Refuses: a generic three-column feature grid of icon, heading and blurb as the argument for the clan. The proof is the tools; the rows are doors into them. The muster is that arrangement: four rows on one dense panel, each a name, a line and one live fact, in place of four equal cards.

## Unresolved
- the hero mark's margins (tuned for a 24px mark, now a 1px bar)
- the cold-armour material
