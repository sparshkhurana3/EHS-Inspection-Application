# UI design reference (black and white theme)

Purpose: reproduce this application's visual design and page structure in another application. It is derived from `frontend/src/styles/global.css` (2,293 lines, one plain stylesheet, no CSS framework, no component library) and the components under `frontend/src/`. Everything here is stack-agnostic except section 11, which maps it onto React.

Source of truth if this document and the code disagree: `global.css`.

---

## 1. Design character

- **Quiet, card-based, enterprise.** White cards on a pale grey canvas, hairline borders, soft shadows, generous padding.
- **One accent: near-black ink (`#101828`).** Primary buttons, active nav, focus rings, progress bars, selected states and the brand mark are all the same ink. There is no brand colour.
- **Dark sidebar, light content.** The only large dark surfaces are the sidebar, the auth information panel and the home-page workflow card.
- **Small uppercase eyebrow + large tight heading** on every page and card.
- **Colour only means status.** In the original it appears solely in status chips, alerts, risk selectors and a few borders. Section 3 shows how to make those monochrome.

## 2. Tokens

The stylesheet hard-codes hex values; there are no CSS variables. Define these once in the new app and use them everywhere.

```css
:root {
  /* Ink and neutrals (the whole black-and-white palette) */
  --ink:            #101828;  /* primary, headings, active, focus */
  --ink-hover:      #1d2939;  /* primary hover, card titles */
  --text:           #172033;  /* body default */
  --text-strong:    #344054;  /* labels, secondary button text */
  --text-muted:     #475467;  /* descriptions */
  --text-subtle:    #667085;  /* captions, meta, eyebrow-ish grey */
  --text-faint:     #98a2b3;  /* placeholders, "of N" */
  --border-input:   #cfd6de;  /* inputs */
  --border-control: #d0d5dd;  /* buttons, chips, tiles */
  --border-card:    #dfe4e9;  /* card outline */
  --border-line:    #e4e7ec;  /* section dividers, list rows */
  --border-hair:    #eaecf0;  /* inner dividers, field tiles */
  --surface-page:   #f9fafb;  /* page canvas, field tiles, table footers */
  --surface-tint:   #f2f4f7;  /* chips, date block, table header, disabled */
  --surface-inset:  #fbfcfd;  /* nested cards inside cards */
  --surface-card:   #ffffff;
  --on-ink:         #ffffff;

  /* Elevation */
  --shadow-card:    0 6px 22px rgba(16, 24, 40, 0.05);
  --shadow-hover:   0 12px 27px rgba(16, 24, 40, 0.08);
  --shadow-button:  0 12px 28px rgba(16, 24, 40, 0.22);
  --shadow-hero:    0 26px 65px rgba(16, 24, 40, 0.22);
  --focus-ring:     0 0 0 4px rgba(16, 24, 40, 0.12);   /* inputs */
  --focus-outline:  3px solid rgba(16, 24, 40, 0.35);   /* buttons, offset 3px */

  /* Radius */
  --r-card: 15px;  --r-panel: 12px;  --r-field: 9px;  --r-button: 11px;
  --r-chip: 999px; --r-brand: 14px;  --r-hero: 24px;

  /* Type */
  --font: Inter, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
}
```

Dark-surface text tints (sidebar, auth panel, workflow card): `#cbd5df` (nav links), `#d0d5dd` (labels), `#e4e7ec` (body on dark), `#b8c2cc` (step descriptions), `#98a2b3` and `#667085` (sidebar sub-text and footer). Dividers on dark: `rgba(255,255,255,.09)` to `.1`; subtle fills: `rgba(255,255,255,.07)` to `.16`.

### Typography

| Use | Size | Weight | Notes |
|---|---|---|---|
| Page title `h1` | 2rem | 700 default | `letter-spacing: -0.035em`, margin `5px 0 7px`, colour `--ink` |
| Hero `h1` | `clamp(2.6rem, 5vw, 4.6rem)` | bold | line-height 1.04, tracking `-0.045em` |
| Auth heading `h2` | 2.3rem | bold | tracking `-0.035em` |
| Section/card title `h2` | 1.2 to 1.25rem | bold | colour `--ink-hover` |
| Item title `h3` | 0.95 to 1.25rem | bold | |
| Body | 1rem; descriptions 0.82 to 0.85rem | 400 | line-height 1.5 to 1.6, colour `--text-subtle` |
| **Eyebrow** | 0.72rem | 850 | uppercase, tracking 0.09em, `--ink` |
| Field label | 0.82 to 0.85rem | 750 | `--text-strong` |
| Field-tile label | 0.67rem | 800 | uppercase, `--text-subtle` |
| Chip / badge | 0.65 to 0.8rem | 800 | pill |
| Metric value | 1.9rem | 800 | tracking `-0.03em`, line-height 1.1 |
| Button | 1rem (small: 0.72rem) | 750 | |

Weights used: 600, 700, 750, 800, 850, 900. 750/850 need a variable font such as Inter; otherwise they round to 700/800. Body root: `font-synthesis: none; text-rendering: optimizeLegibility`.

### Spacing rhythm

Card padding `20px 22px`; grids gap `12px` (tiles), `16px` to `18px` (forms/cards); stacked cards `margin-bottom: 22px`; page content padding `28px` (18px on mobile); form field stack gap `19px`; button row gap `11px`.

### Motion

- Buttons and cards lift on hover: `transform: translateY(-2px)` (cards -2px to -3px), transitions 160 to 180ms ease.
- Spinner: 0.8s linear rotation.
- `prefers-reduced-motion: reduce` collapses all animation and transition durations to 0.01ms.

## 3. Colour: what is strictly black and white, and what is not

The core UI (everything in section 2) is already greyscale. Status colour is layered on top. For a strict black-and-white app, replace each with **shape and text, not hue**:

| Original role | Original colours | Monochrome treatment |
|---|---|---|
| Neutral/open chip | blue `#eff8ff` / `#175cd3` | `--surface-tint` fill, `--ink` text, 1px `--border-control` |
| In-progress chip | amber `#fffaeb` / `#b54708` | white fill, `--ink` text, **dashed** `--ink` border |
| Submitted/pending chip | purple `#f4f3ff` / `#5925dc` | `--surface-tint` fill, `--ink` text, 1px `--ink` border |
| Done/approved chip | green `#ecfdf3` / `#067647` | **solid `--ink` fill, white text** |
| Error/rejected/overdue | red `#fef3f2` / `#b42318` | white fill, `--ink` text, **2px solid `--ink` border**, bold, prefix "!" |
| Alert success/warning/error | green / amber / red tinted boxes | white box, 1px `--ink` border; left 4px bar: solid (error), dashed (warning), none (success); title carries the meaning |
| Risk High / Medium / Low | red / orange / green discs | **solid ink disc "H"**, **half-filled disc "M"** (ink ring + light fill), **outlined disc "L"**; the letter is already in the markup |
| Left-border on list rows | ink; red when lapsed; grey when completed | ink (default), 4px dashed ink (lapsed), `--text-subtle` (completed) |
| Reject button | red border and text | `--ink` border, bold text, "Reject" label (no red) |
| Required marker `*`, field error text | `#d92d20`, `#b42318` | `--ink`; error text prefixed with "!" |
| Calendar "has audit" day | faint green `#fcfffd` | `--surface-page` |

Always keep **text carrying the status** (the original already does this; its inspection report spreadsheet is explicitly designed to survive black-and-white printing).

Colour leaks to clean up when porting, none of which are in the ink palette: auth page background `#f8faf9` and app shell background `#f4f7f6` (green-grey) should both be `--surface-page`; home hero gradient ends in blue `#eff8ff` and its right decoration is `rgba(186,230,253,.35)` (sky) so use `--surface-tint` and `rgba(208,213,221,.45)`; the Microsoft logo on the SSO button is the only multicolour element and is a third-party brand mark.

## 4. Page shell

### Authenticated shell (`.app-shell`)

```
┌───────────┬──────────────────────────────────────────────┐
│ SIDEBAR   │ TOPBAR  (74px, white, bottom hairline)       │
│ 250px     ├──────────────────────────────────────────────┤
│ ink bg    │ PAGE CONTENT  padding 28px, canvas #f9fafb   │
│ sticky    │   └ page container max-width 1180–1280px,    │
│ 100vh     │     centred                                  │
└───────────┴──────────────────────────────────────────────┘
```

- Grid: `grid-template-columns: 250px minmax(0, 1fr)`; 210px under 1050px; stacks (block) under 760px.
- **Sidebar** (`#101828`, padding `22px 17px`, sticky, full height, flex column):
  - Brand block: 42px square white tile with ink 3-letter monogram (radius 11px, 0.72rem, weight 900), beside product name (0.92rem bold white) and a tagline (0.7rem, `#98a2b3`). Bottom hairline `rgba(255,255,255,.09)`, padding-bottom 25px.
  - Nav: grid, gap 7px, top margin 24px. Each link: min-height 45px, radius 9px, padding `9px 11px`, 0.86rem/700, colour `#cbd5df`, with a **28px rounded-square icon chip** holding a single letter (`D`, `O`, `C`, `P`; fill `rgba(255,255,255,.09)`).
    - Hover: `rgba(255,255,255,.07)` fill, white text.
    - **Active: solid white pill, ink text**, icon chip fill `rgba(16,24,40,.10)`.
  - Footer pinned with `margin-top: auto`, two lines, 0.68rem, `#667085`.
  - Mobile (<760px): becomes a static top block; nav becomes 3 equal columns, links centre; under 540px links stack icon above label at 0.7rem; footer hidden.
- **Topbar**: flex, space-between, padding `13px 28px`. Left: small uppercase label ("Authenticated workspace", 0.68rem, 700, tracking .07em, `--text-subtle`) over bold user name. Right: "Sign out" small outlined button (min-height 38px, radius 8px, 0.78rem/750, border `--border-control`; hover border `#98a2b3`, fill `#f8fafc`).
- Unauthenticated users are redirected to sign-in. Role-gated routes redirect to the dashboard.

### Page header pattern (use on every page)

```
EYEBROW (uppercase, ink)                          [ Secondary action ]
Page Title (2rem, tight)                          [ Primary action   ]
One-line description (grey, max-width ~760px)
```

Flex, `space-between`, `align-items: flex-start`, gap 20px, margin-bottom 22px. Under 650–900px it stacks and the action buttons go full width.

### Page-level states

- **Loading**: centred (`min-height: 420px`) 30px spinner (4px `--border-line` ring, `--ink` top) + 'Loading …' text in `--text-muted`.
- **Empty**: dashed card (`1px dashed #b8c2cc`, radius 13px, padding 25px, centred) with bold title + grey sentence. Inline empties in lists use a lighter dashed note (`1px dashed --border-line`, radius 10px, padding `14px 16px`).
- **Alert**: radius 10px, padding `13px 15px`, 1px border, optional bold title above 0.84rem content.

## 5. Page inventory

Routes are public (`/`, `/sign-in`, `/sign-up`, `/auth/entra/callback`) or inside the shell (`/dashboard`, `/observations`, `/closures`, `/plan`). Page state such as selected record, tab and filter lives in the **query string**, not in component state, so views are linkable and Back works.

### 5.1 Home (public landing)

- Sticky-ish header: white at 92% opacity, bottom hairline, min-height 82px; brand (48px ink tile, white monogram, radius 14px) left, small uppercase grey label right.
- **Hero**: two-column grid (`1.08fr / 0.92fr`, gap 72px, min-height 660px). Left: eyebrow, huge h1, 1.08rem paragraph (`--text-muted`, line-height 1.75), two buttons (primary "Sign in →", secondary "Sign up"), a reassurance line with a 24px round tick icon. Right: the **workflow card** (below). Two blurred circles (460px/480px) as quiet background decoration.
- **Workflow card**: ink background, radius 24px, padding 27px, `--shadow-hero`, a large translucent white circle in the top-right corner (`::before`). Header (small uppercase label + title, pill tag on the right), then a vertical numbered list: 38px rounded-square number chips, bold step title, muted description, joined by 1px × 22px vertical connector lines; footer of three equal pill-ish cells ("Auditable / Accountable / Traceable", 0.73rem, fill `rgba(255,255,255,.07)`).
- **Feature section**: white, top hairline, 82px vertical padding; centred heading block (eyebrow, h2 `clamp(1.8rem, 3vw, 2.5rem)`, paragraph, max-width 740px); 3-column grid of feature cards (radius 15px, padding 23px, border `--border-line`, number tile `01/02/03` 40px, hover lifts 3px).
- Footer: `#f8fafc`, top hairline, min-height 84px, two grey 0.78rem lines left and right.
- Responsive: under 960px hero and features collapse to one column; under 640px actions stack full width, tagline hidden.

### 5.2 Sign in / Sign up (`AuthLayout`)

- Full-height two-panel grid (`0.9fr / 1.1fr`, left min 340px, right min 500px).
- **Left information panel** (ink, padding 45px, flex column space-between, subtle radial white glow top-right): brand lockup (47px **white** tile with ink monogram, white name, light subtitle) top; middle block with uppercase label, h1 `clamp(2.2rem, 4vw, 3.7rem)` white, paragraph in `#e4e7ec`; one-line footer in `#d0d5dd`. **Hidden below 960px.**
- **Right form panel** (centred, container max 440px): "← Back to homepage" link (grey, 0.84rem/700, hover ink); h2 + grey sentence; form grid with gap 19px; full-width primary submit button (`margin-top: 4px`); error box (`.auth-form-error`, same recipe as an alert); switch line centred ("Do not have an account? **Sign up**", link in ink/800, underline on hover).
- **Optional SSO block** under the form: 22px margin, a centred "OR" divider (two 1px lines either side of uppercase grey 0.78rem text), full-width secondary button with a small logo, and a centred 0.78rem hint. The button is only drawn if the provider is configured.
- Sign-up fields: Full name, Username, Email, Password (with 0.75rem help text under it), Confirm password.

### 5.3 Dashboard

Top to bottom: page header (+ "Refresh dashboard" small outlined button) → alerts → **metric tiles** → **calendar** → **role-dependent card**.

- **Metric tiles**: section header row (h2 left, small grey "2026 to date · scope" right). Grid `repeat(auto-fit, minmax(230px, 1fr))`, gap 16px. Tile: white, 1px `--border-line`, radius 12px, padding `18px 20px`, column gap 7px: label (0.78rem/700 grey), big value (1.9rem/800) with an inline lighter "of N" (1rem, `--text-faint`), optional **6px progress bar** (track `--border-hair`, fill `--ink`, fully rounded), caption (0.73rem grey, prefixed with "NN% ·" when there is a bar).
- **Calendar card** (white, radius 15px, `--shadow-card`, overflow hidden): header row (eyebrow + month h2 left; two 38px square outlined prev/next buttons right); 7-column grid; weekday row on `#f8fafc` (0.7rem/800 uppercase); day cells min-height 118px (85px at 760px, 68px at 540px), padding 9px, right/bottom hairlines, day number top-left (0.75rem/750 grey); empty days `#fafbfc`; each audit is a **mini-row**: `--surface-tint` background, **3px ink left border**, radius 5px, bold 0.68rem title over 0.6rem subtitle, ellipsised; overflow shown as a grey "+N more".
- **Section heading** pattern: eyebrow + h2 left, tiny grey `dashboard-single-record` note right (margin-bottom 12px).
- **Upcoming audit card** (for ordinary users): three-column grid `180px / 1fr / auto`. Left: tinted date block (`--surface-tint`, right border, small label over 1.1rem bold date). Middle: small uppercase role label, h3, grey line, meta row (0.72rem grey). Right: action cell (min-width 155px, 0.78rem/800 ink, arrow). Whole card is a button; hover darkens border to `--text-strong`, lifts 2px, deepens shadow. Collapses to 2 columns <1050px (action drops to a footer strip with top hairline) and 1 column <760px.
- **Weekly summary card** (officer/management): same card shell; header grid `1fr / 130px / 155px` with eyebrow + h3 + date range, a centred big count (1.6rem/800) with a tiny label, and a right-aligned "View zone plan ↓ / Hide ↑" toggle. Expands into a **data list** (section 6). For the officer the expanded body is grouped by **unit sections** (h4 heading, hairline between sections), each a list of zone rows with inline edit (selects, Save/Cancel, an 'apply to upcoming' checkbox row) and a further expandable progress detail panel on `--surface-page`.

### 5.4 Observations

- Header (eyebrow "Auditor workflow", h1, week-range sentence; "Refresh" outlined button).
- **Tabs**: row with bottom hairline; each tab is a text button (0.82rem/750 grey), padding `10px 16px`, 2px transparent bottom border; **active = ink text and 2px ink underline**. Two tabs: This week / Past 6 months.
- Groups with plain `h2` counts ("Pending (3)", with an inline "Overdue (1)" chip, "Submitted (2)").
- **List items** (section 6) with per-row action buttons ("Add observation" primary small, "No observation" secondary small).
- History tab: filter `select` aligned right (min-height 34px) over a six-column data list.
- **Report form** (one card): header strip (eyebrow, h2, status pill) → **assignment grid** of read-only field tiles (3 columns) → repeating **observation fieldset blocks** (below) → dashed full-width "Add observation" button → footer **submit panel** (`--surface-page` background, top hairline, flex space-between, primary submit).
  - Observation block: `fieldset`, margin `0 22px 22px`, padding `18px 18px 4px`, 1px `--border-control`, radius 12px, background `--surface-inset`; heading row with bold legend "Observation 1 of 3" and a small "Remove" button; fields: Area (select), Category (select), **photograph input**, Description (textarea 6 rows, word counter "n/50 words" under it), **risk selector**.
  - **Photograph input**: empty = dashed 2px `#b8c2cc` drop button, min-height 180px, "+" icon, bold title and small helper ("JPG, JPEG, PNG or SVG. Maximum size 10 MB."), hover border ink. Filled = preview frame on ink background (`object-fit: contain`, 320px tall) with floating "Replace"/"Remove" buttons bottom-right (white 95% pills). Real file input is visually hidden.
  - **Risk selector**: `radiogroup` of 3 equal bordered buttons (11px gap), each = coloured circle with letter H/M/L, bold label, small description, trailing tick when selected. Selected state strengthens the border and tints the background. See section 3 for the monochrome version.
- **Detail view**: same card family, read-only tiles, one inset card per observation, lifecycle line.

### 5.5 Closures

- Header (eyebrow "Auditee workflow", h1, 'pending from the last N months'). Officers also get a "Closure approvals" button.
- Three list groups: **Lapsed** (only if any, listed first), **Pending**, **Completed in the last N days**.
- **Closure detail**: observation summary card(s) (read-only tiles, description block, evidence photograph on ink background `object-fit: contain`, max-height 440px) then **one inset "item card" per observation** (margin `0 22px 22px`, 1px `--border-card`, radius 13px, `--surface-inset`): section header with status chip, observation text and photo, action-plan textarea (min-height 170px, word counter), target-date input, **evidence panel**, per-item Save button, optional disabled note. Final row: "Send for approval" primary button.
- **Evidence panel**: bordered inset box (radius 11px). A 3-column grid of square thumbnails (`aspect-ratio: 1/1`, `object-fit: cover`, radius 10px; 2 columns under 650px), each with an ellipsised filename and a text-only "Remove" link. The native file input is hidden and its label is styled as a secondary button (limit message beside it).
- **Approval queue (officer)**: card with header (eyebrow, h2, count pill) and a list of selectable rows (grid `1fr auto`, radius 10px, hover darkens border, **selected = ink border + `--surface-tint` fill + 3px soft ring**). Selecting opens the **approval panel** below: header with status pill, 3-column review grid of tiles, action-plan block (bordered, `--surface-page`), previous-comments block, then a **decision panel** (top hairline, `--surface-page`): comments textarea (min-height 130px) with a counter row, inline error, right-aligned buttons "Reject" (secondary, emphasised) and "Approve" (primary).

### 5.6 Plan (officer only)

- Header (eyebrow "EHS Officer workflow", h1 "Plan audits", location name; a "Download inspection report" secondary button) + a 0.8rem grey explanatory note.
- **Roster upload panel**: card with header strip; controls row (file input styled as a bordered control with `flex: 1 1 240px`, then primary "Upload roster", secondary "Download template"); row-error table (red outline in the original, ink in monochrome; 3 columns: Row / Field / Problem); success alert + 6-tile summary grid (`.patrol-summary`: `--surface-tint` panel, `repeat(auto-fit, minmax(140px, 1fr))`, label above bold value); the current roster as a data list.
- **Single-audit form** (second header "Exception / Schedule a single audit" with Refresh and "Schedule an audit"): 2-column form grid (gap 18px) of labelled selects/inputs (Location read-only, Unit, Zone, Area list as pill chips, Date, Auditor, Auditee), footer actions right-aligned with a top hairline, close "×" 38px square button in the form header.

## 6. Reusable components (the vocabulary)

### Buttons

| Variant | Spec |
|---|---|
| `button` base | inline-flex, centre, gap 9px, min-height **50px**, padding `12px 24px`, radius 11px, weight 750, border 1px transparent |
| `button-primary` | bg `--ink`, text white, `--shadow-button`; hover bg `--ink-hover` |
| `button-secondary` | bg white, text `--text-strong`, border `--border-control`; hover border `--text-strong`, bg `--surface-page` |
| hover (all) | `translateY(-2px)` |
| disabled | opacity .65, `not-allowed`, no lift |
| focus-visible | `--focus-outline`, offset 3px |
| **Small** (in lists/rows) | min-height 32px, padding `6px 12px`, font .72rem |
| Toolbar (logout, refresh) | min-height 38px, padding `8px 13px`, radius 8px, font .78rem |
| Icon (calendar nav, close) | 38px square, radius 8 to 9px, grid-centred glyph |

Auth submit and SSO buttons are full width; button rows go column and full width under 650px.

### Cards

Standard card: `background #fff; border 1px solid --border-card; border-radius 15px; box-shadow --shadow-card; overflow hidden; margin-bottom 22px`. Section header inside: padding `20px 22px`, bottom hairline `--border-line`, eyebrow + h2 + grey sentence left, pill or button right. Form body padding 22px (16px mobile). Footer strip: `--surface-page`, top hairline, padding `18px 22px`.

Nested cards use `--surface-inset` (`#fbfcfd`), a lighter border and radius 12 to 13px, inset by `22px` side margins (12px on mobile).

### Field tile (read-only value)

`padding 13px 14px; border 1px solid --border-hair; radius 9px; bg --surface-page`; label (0.67rem/800 uppercase grey) over value (0.86rem bold `--ink-hover`, `overflow-wrap: anywhere`). Laid out in a 3-column grid (gap 12px) that goes 2 columns <900px and 1 column <650px.

### Form fields

- Label above, 0.82 to 0.85rem, 750, `--text-strong`, margin-bottom 8px; required mark `*` on the label.
- Input/select/textarea: width 100%, min-height 46 to 47px, padding `10px 12px`, border `--border-input`, radius 9 to 10px, white bg, ink text, no native outline.
- **Focus: border turns `--ink` plus `--focus-ring`.** Disabled: `--surface-tint` bg, grey text, `not-allowed`. Placeholder `--text-faint`. Textarea `resize: vertical`, line-height 1.55, min-height 110 to 180px by context.
- Help text 0.75rem grey under the field; error text 0.7rem under the field; word counters 0.7rem grey, space-between.
- Checkbox rows: flex, gap 8px, 0.76rem `--text-muted`, top hairline.

### Chips and badges

Pill (`border-radius: 999px`), padding `3px 10px` (list chips) or `5px 8px`/`7px 11px` (status labels), 0.65 to 0.8rem, weight 600 to 850, `white-space: nowrap`. Default fill `--surface-tint`, ink text. Larger **status label** on forms: min-width 145px, radius 10px, 9px dot + tiny uppercase caption.

### List rows

- **Card list item**: white, 1px `--border-line`, **4px ink left border**, radius 10px, padding `14px 16px`, flex space-between wrap. Left: bold primary line with a grey sub-line (0.9rem). Right: meta (0.85rem grey) with chips and a bold ink action hint. Hover: ink border + `0 1px 6px rgba(16,24,40,.08)`. Selected: ink border + 1px inset ink. `focus-visible`: 2px ink outline, offset 2px. Stacks under 650px.
- **Data list ("weekly list")**: bordered container (radius 12px, overflow hidden); header row `--surface-tint`, 0.68rem/800 uppercase; body rows with top hairline, 0.76rem; zone/primary column bold `--ink-hover`. Column templates are plain grids (`0.8fr 1.7fr 1.1fr 1.1fr 0.9fr 0.8fr` for the weekly plan). **Responsive trick**: below 1050px hide the header and show each cell's label via `span::before { content: attr(data-label) }` (tiny uppercase grey, 0.62rem), going 2 columns then 1 at 540px.

### Misc

- **Empty note / empty card**: dashed, see section 4.
- **Pill list** (areas): `li` with padding `4px 12px`, `--surface-tint`, 0.85rem, flex-wrap gap 8px.
- **Brand mark**: rounded square (42 to 48px, radius 11 to 14px), 2 to 3 letter monogram, weight 900, 0.72 to 0.8rem, tracking .04em. Ink on white in dark areas, white on ink in light areas.
- **Visually hidden** utility for native file inputs (keep keyboard access; style the label instead).

## 7. Layout and breakpoints

| Breakpoint | Changes |
|---|---|
| ≤ 1050px | sidebar 210px; upcoming card to 2 columns; data-list headers hidden and cells labelled via `data-label` |
| ≤ 960px | home hero and features to one column; auth info panel hidden |
| ≤ 900px | field-tile grids 3 → 2 columns; page headers stack; risk options 1 column; summary grids 4 → 2 |
| ≤ 760px | shell becomes block (sidebar on top, 3-column nav); page padding 18px; calendar cells 85px; indented inset cards reduce side margin to 12px |
| ≤ 650px | all grids 1 column; button rows column and full width; evidence grid 2 columns |
| ≤ 640px | home container margins 14px; hero h1 2.65rem |
| ≤ 540px | nav links stack icon over label; calendar cells 68px, 0.57rem weekday labels |

Max content widths: planning/observation/closure pages 1180px; dashboard 1280px; home container `min(1180px, 100% - 40px)`; auth form 440px. Root `min-width: 320px`.

## 8. Accessibility details worth keeping

- Real `<button>`, `<nav aria-label>`, `<header>`, `<main>`, `<section>` landmarks; tabs use `role="tablist"/"tab"` with `aria-selected`; risk selector is `role="radiogroup"` / `role="radio"` with `aria-checked`; expandable cards use `aria-expanded` and `aria-controls`; progress bars use `role="img"` with an `aria-label`; spinner `role="status" aria-live="polite"`; errors `role="alert"`, others `role="status"`.
- Decorative glyphs (`→`, `✓`, icon letters) are `aria-hidden`.
- Focus is always visible: 3px outline on buttons, ink border plus ring on fields, 2px outline on list rows.
- Status is never colour alone (text label always present).

## 9. Voice and copy conventions

- Eyebrow names the persona/section ("Auditor workflow", "Auditee workflow", "EHS Officer workflow", "Weekly plan", "Exception").
- Messages are full sentences ending in a full stop; the UI displays server messages verbatim.
- Counts in headings: "Pending (3)", "Submitted (2)". Singular/plural handled ("1 zone audit", "2 zone audits").
- Dates use a short locale format ("18 Oct 2026").
- Destructive or irreversible actions use a native `confirm` with a full-sentence explanation.

## 10. Porting checklist

1. Copy the section 2 token block and replace every hard-coded hex with a variable.
2. Apply section 3 so no hue remains (neutralise `#f8faf9`, `#f4f7f6`, the hero gradient/blue circle, `#fcfffd`).
3. Build the shell (sidebar + topbar + content) and the **page header pattern**; everything else is cards inside it.
4. Build the six primitives first: button, card with section header, field tile, form field, chip, list row/data list.
5. Compose pages from those; keep radii, paddings and the eyebrow/title rhythm identical.
6. Add the breakpoints in section 7 and the reduced-motion rule.
7. Verify by eye: ink is the only emphasis colour; hover lifts; focus rings visible; print or greyscale the screen and confirm every status is still readable.

## 11. If the other app is React

The original structure to mirror:

```
src/
  styles/global.css            # one stylesheet, class names as above
  layouts/AppLayout.jsx        # app-shell: <Sidebar/> + topbar + <Outlet/>
  layouts/AuthLayout.jsx       # two-panel auth page, takes title/description/children
  layouts/Sidebar.jsx          # NAVIGATION_ITEMS array + NavLink with isActive class function
  components/Button.jsx        # variant="primary|secondary", `to` renders a Link
  components/Alert.jsx         # type="error|warning|success", optional title
  components/LoadingSpinner.jsx
  app/RequireRole.jsx          # role-gated route wrapper
  features/<name>/             # page, components, use<Name>.js hook, <name>.service.js
```

Conventions: plain BEM-ish kebab-case classes (`observation-section-header`, `weekly-list-row`), state modifiers as extra classes (`-active`, `-selected`, `-overdue`), `NavLink` className function for active nav, page state in `useSearchParams`, one stylesheet imported in `main.jsx`. React Router v7, no UI library.

## 12. Known inconsistencies in the source (do not copy)

- Several class families duplicate the same recipe (`patrol-form-field`, `observation-form-field`, `closure-form-field`, `form-field`); use one.
- Later rules re-declare earlier ones (for example `.observation-list-item` and `.upcoming-audit-card` styles repeated, and `.closure-form-actions` defined twice). Define each once.
- Colours are hard-coded rather than variables; hover and focus colours differ slightly between families (`#344054` vs `#98a2b3` borders).
- The 50px default button is larger than most in-page controls, so nearly every in-list use overrides it to 32 to 38px; consider making "small" the default and "large" the exception.
