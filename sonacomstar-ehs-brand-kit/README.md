# Sona Comstar brand kit for the EHS application

This kit adds Sona Comstar's logo and name to the EHS application. It does **not** change the UI or UX: every token, colour, layout, spacing, radius, type size, component and interaction in `Design Reference.md` stays exactly as it is.

That works because the Sona Comstar logo is monochrome. The app's single accent, ink `#101828`, already is the brand colour, so branding only needs to:

1. put the Sona Comstar emblem in the brand tiles that hold the letter monogram today,
2. put the company name where the app names its owner (tagline, footers, browser tab, SSO hint), and
3. replace the favicon and app icons and add a logo to the inspection report header.

Open `preview.html` from this folder to see every placement drawn at the design reference's sizes.

---

## 1. Contents

```
sonacomstar-ehs-brand-kit/
├── README.md                     this guide
├── preview.html                  every placement, drawn with the design reference's tokens
├── public/brand/                 → copy to frontend/public/brand/
│   ├── logo/
│   │   ├── sona-comstar-logo-{white,ink,black}.svg              stacked logo (as supplied)
│   │   ├── sona-comstar-logo-horizontal-{white,ink,black}.svg   derived wide lockup (see §7)
│   │   ├── sona-comstar-emblem-{white,ink,black}.svg            emblem alone, for brand tiles
│   │   ├── sona-comstar-wordmark-{white,ink}.svg                "SONA COMSTAR" alone
│   │   └── png/                                                 PNG exports of all of the above, 64–1280 px wide
│   ├── icons/
│   │   ├── favicon.ico (16, 32, 48) · favicon.svg · favicon-16x16.png · favicon-32x32.png
│   │   ├── apple-touch-icon.png (180) · icon-192.png · icon-512.png · icon-maskable-512.png
│   │   └── site.webmanifest
│   └── print/
│       ├── sona-comstar-report-header.png   black on white, for the inspection report spreadsheet
│       └── sona-comstar-logo-print.png      black on white, 1200 px, for any printed document
├── src/
│   ├── brand/brand.js            → frontend/src/brand/   every name, string and asset path
│   ├── brand/BrandMark.jsx       → frontend/src/brand/   brand tile with the emblem
│   ├── brand/CompanyLogo.jsx     → frontend/src/brand/   full logo
│   └── styles/brand.css          → frontend/src/styles/  additive rules, import after global.css
├── snippets/index-head.html      favicon, manifest and title lines for frontend/index.html
└── tools/build_assets.py         regenerates everything in public/brand/ from a source logo
```

**Colour variants.** Use `white` on ink surfaces (sidebar, auth panel, workflow card) and `ink` (`#101828`) on light surfaces, so the logo matches the app's ink exactly. Use `black` only for print and Excel, where pure black reproduces best.

## 2. Install (React frontend, structure from design reference §11)

1. Copy `public/brand/` to `frontend/public/brand/`. The files are then served from `/brand/...`, which is what `brand.js`, the manifest and the head snippet expect.
2. Copy `src/brand/` to `frontend/src/brand/` and `src/styles/brand.css` to `frontend/src/styles/`.
3. In `main.jsx`, import the stylesheet **after** `global.css`:
   ```js
   import './styles/global.css';
   import './styles/brand.css';
   ```
4. In `frontend/index.html`, replace the existing `<title>` and icon lines with `snippets/index-head.html`.
5. Make the placement changes in §3 and the copy changes in §4.
6. Run the checks in §8.

## 3. Placement map

Section numbers refer to `Design Reference.md`. "Required" changes swap content inside elements that already exist and leave the layout untouched. "Optional" changes add a full logo to a slot that already holds brand or footer content.

| # | Where (ref §) | Today | Branded | Asset / component | Status |
|---|---|---|---|---|---|
| 1 | Sidebar brand block (§4) | 42 px white tile, ink 3-letter monogram | Same tile, **ink emblem** | `<BrandMark className="…existing tile class…" surface="dark" />` | Required |
| 2 | Sidebar tagline (§4) | product tagline | `Sona Comstar` | `BRAND.tagline` | Required |
| 3 | Sidebar footer (§4) | two 0.68 rem lines | first line `© 2026 Sona Comstar`; white logo above the lines at 96 px wide | `BRAND.footerLegal`, `<CompanyLogo surface="dark" className="brand-company-logo-sidebar" />` | Line required, logo optional |
| 4 | Home header (§5.1) | 48 px ink tile, white monogram | Same tile, **white emblem** | `<BrandMark className="…" surface="light" />` | Required |
| 5 | Home footer (§5.1) | two grey lines | left line `© 2026 Sona Comstar` | `BRAND.footerLegal` | Required |
| 6 | Auth info panel lockup (§5.2) | 47 px white tile, ink monogram, name, subtitle | Same tile with **ink emblem**; subtitle `Sona Comstar` | `<BrandMark surface="dark" />`, `BRAND.tagline` | Required |
| 7 | Auth info panel top (§5.2) | – | white stacked logo at 132 px wide above the lockup | `<CompanyLogo surface="dark" className="brand-company-logo-auth" />` | Optional |
| 8 | Auth footer line (§5.2) | one line in `#d0d5dd` | `© 2026 Sona Comstar` | `BRAND.footerLegal` | Required |
| 9 | SSO hint (§5.2) | centred 0.78 rem hint | `Use your Sona Comstar Microsoft account to continue.` | `BRAND.ssoHint` | Required |
| 10 | Browser tab | app favicon and title | ink-tile emblem favicon; `Page · EHS · Sona Comstar` | `snippets/index-head.html`, `BRAND.documentTitle(page)` | Required |
| 11 | Home-screen / PWA | – | ink app icons, `theme-color #101828` | `icons/*`, `site.webmanifest` | Required |
| 12 | Inspection report spreadsheet | – | logo top-left of the header rows | `print/sona-comstar-report-header.png` | Required |

**Unchanged on purpose:** the hero, the workflow card, feature cards, metric tiles, calendar, lists, forms, chips, status treatments, the "Sign in with Microsoft" button (Microsoft's mark stays as is), every breakpoint and all motion.

### Brand tile, before and after

```jsx
// before
<span className="sidebar-brand-mark" aria-hidden="true">EHS</span>

// after: same class, so size, radius and fill are untouched
<BrandMark className="sidebar-brand-mark" surface="dark" />
```

The emblem fills 74% of the tile, which is 31 px in the 42 px tile and 36 px in the 48 px tile. `surface` is the colour of the area around the tile: a white tile on the dark sidebar takes the ink emblem, and an ink tile on a light header takes the white emblem. This matches the reference's rule: "ink on white in dark areas, white on ink in light areas".

### Mobile

There are no new breakpoint rules. The sidebar footer is already hidden under 760 px, and `brand.css` hides the optional footer logo with it. The auth info panel, and so the optional logo, is already hidden under 960 px. Brand tiles keep their size at every width.

## 4. Copy changes

All strings live in `src/brand/brand.js`. Change them there, not in components.

| Key | Value | Used in |
|---|---|---|
| `companyName` | `Sona Comstar` | alt text, legal lines |
| `productName` | the app's **existing** product name (set to `EHS` as a placeholder) | sidebar, auth, home header |
| `tagline` | `Sona Comstar` | line under the product name |
| `documentTitle(page)` | `Dashboard · EHS · Sona Comstar` | `document.title` per route |
| `footerLegal` | `© {current year} Sona Comstar` | sidebar, home and auth footers |
| `ssoHint` | `Use your Sona Comstar Microsoft account to continue.` | SSO block |
| `emailPlaceholder` | `name@sonacomstar.com` | sign-up email field |

**Name style.** The logo reads "SONA COMSTAR" as two words, so running text uses **Sona Comstar**. If your company standard is "SonaComstar", change `companyName`, `tagline`, `footerLegal`, `ssoHint` and `documentTitle` in `brand.js`. Those five values cover every place the name appears. Confirm the e-mail domain before you ship the placeholder.

Eyebrows ("Auditor workflow", "EHS Officer workflow") and every other piece of copy stay as they are. The voice rules in reference §9 still apply.

## 5. Logo usage rules for this app

- **Clear space:** leave at least ¼ of the logo's height free on every side. Inside a brand tile, the tile is the clear space.
- **Minimum sizes:** stacked logo 80 px wide, horizontal lockup 120 px wide, emblem 16 px. At 16 px only the circle reads, which is acceptable for a favicon only.
- **Colour:** white on ink, ink on white and light greys, black in print. Never put the logo on a photograph, a status colour or a mid-grey where it falls below 4.5:1 contrast.
- **Do not** recolour it, add effects or shadows, stretch it, rotate it, outline it, rebuild the wordmark in a font, or put the wordmark beside the product name as one string.
- **Product name stays separate.** The EHS product name sits next to the emblem tile in the app's own type. It never becomes part of the Sona Comstar logo.
- **Alt text:** an emblem in a tile next to visible text is decorative (`alt=""`, `aria-hidden`), which `BrandMark` already does. A standalone logo uses `alt="Sona Comstar"`, which `CompanyLogo` already does.

## 6. Inspection report spreadsheet

The reference says the report is designed to survive black-and-white printing, so the header logo is pure black on white.

- File: `public/brand/print/sona-comstar-report-header.png`, 600 × 179 px, clear space built in.
- Place it top-left, anchored at `A1`, and display it at **200 × 60 px** (about 2.1 × 0.6 in). Set the header row height to about 48 pt so the logo does not overlap the title.
- Python `openpyxl` example:
  ```python
  from openpyxl.drawing.image import Image
  logo = Image('public/brand/print/sona-comstar-report-header.png')
  logo.width, logo.height = 200, 60
  ws.add_image(logo, 'A1')
  ```

## 7. Where the assets come from, and what to confirm

- All vectors were traced from the Sona Comstar logo already in the DataWizard repo (`static/images/logo.webp`, 400 × 289 px). Each PNG and icon is rendered from those vectors, so every size matches. The trace is faithful at app sizes, but it is not Sona Comstar's master artwork.
- **Ask corporate communications for the official vector logo and brand guidelines.** If their rules on clear space, minimum size or name style differ from §4 and §5, theirs win. To regenerate every asset from their file, rasterise it light-on-dark and run:
  ```bash
  python -m venv venv --system-site-packages     # pycairo comes from the system
  venv/bin/pip install numpy pillow potracer
  venv/bin/python tools/build_assets.py path/to/official-logo-light-on-dark.png
  ```
- The **horizontal lockup** was derived for this kit by placing the emblem beside the wordmark. It is used only in the report header. Confirm it with corporate communications, or switch the report to the stacked logo (`print/sona-comstar-logo-print.png`).
- The logo has no brand hue, so no colour token was added or changed. If Sona Comstar does have an official accent colour, it still should not go into this UI: the design reference keeps ink as the only emphasis colour and reserves colour for status.

## 8. Checks before release

1. Open `preview.html`. Each placement should match the screen in the running app.
2. In the app, brand tiles keep the same pixel size and radius as before. Compare a screenshot of the sidebar with one taken before the change.
3. The favicon shows in the tab, the title reads `… · EHS · Sona Comstar`, and the DevTools Application tab shows the manifest with no errors.
4. At 1050, 960, 760, 540 and 320 px wide, nothing new wraps or overflows, and the optional logos disappear along with their panels.
5. With keyboard only, logos receive no focus and nothing new appears in the tab order.
6. Print the inspection report in black and white. The logo is crisp and does not cover the header text.
