# PS5-EMUTRACK — Full SEO Audit, Keyword Strategy & Remediation Report

**Repository:** `/data/data/com.termux/files/home/work/ps5-emutrack`  
**Live Base URL:** `https://its-zain-dev.github.io/ps5-emutrack/` (GitHub Pages subpath `/ps5-emutrack/`)  
**Audit & Implementation Date:** `2026-11-17`  
**Registry Scope:** `53` emulators (`ps5`, `fork`, `port`, `ps4`), `12` games, `36` compatibility reports (`11` verified, `25` unverified legacy)

---

## 1. Executive Summary & Project Reality

**PS5 EmuTrack** is an independent, MIT-licensed, zero-dependency Python 3.11+ static pipeline (`tracker/`) paired with a progressive-enhancement HTML5/CSS3/ES-module web hub (`site/index.html`, `site/assets/styles.css`, `site/assets/js/main.js`) and JSON registries (`data/emulators.json`, `data/games.json`, `data/compatibility.json`). A GitHub Actions workflow (`.github/workflows/pages.yml`) syncs live GitHub repository and release metadata hourly into `site/data.json`, regenerates static pages via `tracker/seo.py`, deploys to GitHub Pages, and submits changed URLs via IndexNow (`tracker/seo.py:submit_indexnow`).

**Truthfulness & Non-Piracy Guardrails:**
- PS5 EmuTrack **never** hosts, bundles, or links to compiled emulator binaries outside official GitHub Releases, nor does it host games, ROMs, ISOs, Sony firmware, BIOS files, or decryption keys (`README.md`, `CONTRIBUTING.md`, `site/index.html`).
- **No PS5 emulator can run *Grand Theft Auto VI* (*GTA VI* / *GTA6*) on PC today.** Rockstar Games scheduled *GTA VI* for PS5 and Xbox Series X|S on `2026-11-19` with no official PC port announced at launch.
- ***Grand Theft Auto IV* (*GTA IV*, 2008)** is a PC/PS3/Xbox 360 title and is **not** a PS5 game. Any coverage of `gta iv` in this project is strictly for honest Roman-numeral / franchise disambiguation alongside *GTA V* and *GTA VI* — never fabricated PS5 compatibility claims.

**Baseline vs. Post-Remediation Summary:**

| Metric | Baseline (Pre-Fix) | Post-Fix (Verified) |
|---|---:|---:|
| HTML pages in `site/` | `64` (`62` in `sitemap.xml`) | `66` (`64` in `sitemap.xml`, adding `/guides/` + 6th guide) |
| Pages with `<title>` > 65 chars | `61 / 63` (up to `105` decoded chars) | **`0 / 65`** |
| Pages with `<meta name="description">` > 160 chars (`> 158` chars) | `14` `> 160` (`40` total `> 158`; up to `207` chars on `/games/gta-vi/`) | **`0 / 65`** |
| Non-terminal / truncated descriptions (`[:160]`) | `25` (`19` mid-word cuts like `d45b`, `ma`, `RTX` + `6` trailing-space cuts at char 160) | **`0 / 65`** |
| `404.html` robots / canonical / broken relative links | `index, follow` + self-canonical + `10` relative `href` attributes (`7` unique targets) | **`noindex, follow`**, no canonical, `0` relative links |
| PS4 emulators mislabeled `"PS5 Emulator"` in `<title>` | `8 / 8` (`shadPS4`, `fpPS4`, `GPCS4`, etc.) | **`0 / 8`** (labeled `PS4 Emulator`) |
| Client-side JS (`main.js`) preserving SSR internal links | Stripped `/emulators/*` & `/games/*` links on load | Preserves `./emulators/{id}/` & `./games/{id}/` links |
| Focus keywords covered (`10 / 10` seeds) | `5 / 10` missing (`gtavi emulator`, `gta6 emulator`, `gta6 pc`, `gta iv`, `emulator tracker` body) | **`10 / 10`** covered truthfully across site & guides |
| Unit tests (`python3 -m unittest discover -s tests -v`) | `12` passing | **`19` passing** |

---

## 2. Technical, On-Page & UX-SEO Audit Findings (Grounded in Baseline Files)

### Finding 1 — `site/404.html` Indexed by Search Engines with Broken Relative Links (Critical)
- **Baseline Observation:**
  - `tracker/seo.py:1085-1108` (`_render_404_page`) called `_page_shell(..., depth=0)` without overriding `robots`, `canonical`, or `og:type`, and line `1107` only rewrote `href="assets/` and `src="assets/`.
  - `site/404.html:8` emitted `<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1" />`.
  - `site/404.html:12` emitted `<link rel="canonical" href="https://its-zain-dev.github.io/ps5-emutrack/404.html" />`, and line `14` emitted `og:type="article"`.
  - `site/404.html:27, 32-35, 38, 64-67` kept `10` relative header/nav/footer `href` attributes (`""` ×3, `#emulators`, `#compatibility`, `#contribute`, `guides/real-vs-fake-ps5-emulators/` ×2, `guides/best-ps5-emulators-compared/`, `data.json`), which break on any nested 404 path (e.g., `/ps5-emutrack/games/missing/`).
- **Recommended & Implemented Change:**
  - Parameterized `_page_shell()` (`tracker/seo.py`) with `robots`, `include_canonical`, `include_og_url`, `og_type`, and `root_prefix`.
  - Updated `_render_404_page()` (`tracker/seo.py`) to emit `robots="noindex, follow"`, omit `<link rel="canonical">` and `og:url`, use `og_type="website"`, and pass `root_prefix="/ps5-emutrack/"` (`BASE_PATH`) so **every** header, nav, CTA, asset, manifest, and footer link resolves cleanly from `/ps5-emutrack/`.

### Finding 2 — Client-Side JS Hydration Stripped SSR Internal Links (`site/assets/js/main.js`) (Critical)
- **Baseline Observation:**
  - SSR output in `tracker/seo.py:331, 361, 385` rendered direct internal links to `./emulators/{id}/` (`Details & notes` button and matrix `<th>`) and `./games/{id}/` (game row titles).
  - Upon page load, `site/assets/js/main.js:908-916` (`renderEmulatorCards`), `954` (`renderEmulatorCompactTable`), `1218` (`renderCompatibility` `<th>`), and `1300` (`renderCompatibility` `.game-title`) overwrote those SSR `<a>` tags with `<button data-open-release="...">`, external GitHub `c.url` links (`line 1218`), and `<span>${escapeHtml(game.title)}</span>` (pushing the game page link inside `<tr class="detail-row" hidden>` at line `1286`).
  - Meanwhile, all `61` subpage links on `site/index.html:410-417` were collapsed inside `<details class="guides-details">`.
- **Recommended & Implemented Change:**
  - Updated `site/assets/js/main.js` so `renderEmulatorCards()`, `renderEmulatorCompactTable()`, and `renderCompatibility()` preserve internal `./emulators/{id}/` and `./games/{id}/` links (matching SSR, while keeping the release-notes modal via `.release` `[data-open-release]` and row click/keyboard expansion via the `e.target.closest('a')` guard at line `1639` and matching `keydown` guard at lines `1643-1649`).
  - Added a visible `<section id="guides">` (`Research Guides & Flagship Trackers`) and top-nav `Guides` + `GTA VI Watch` links on `site/index.html`, plus a dedicated `/guides/` index page (`site/guides/index.html` generated by `tracker/seo.py:_render_guides_index_page` with an explicit `<h2>` section heading so heading hierarchy has zero skips).

### Finding 3 — PS4 Emulators Mislabeled `"PS5 Emulator"` & `Bloodborne` Missing `shadPS4` (High)
- **Baseline Observation:**
  - `tracker/seo.py:860` hardcoded `page_title = f"{name} PS5 Emulator — Releases, History & Verified Compatibility | PS5 EmuTrack"` for all `33` emulator pages, mislabeling all `8` `category == "ps4"` projects (`data/emulators.json:489-566`), e.g., `site/emulators/shadps4/index.html:6` (`shadPS4 PS5 Emulator — ...`), `fpps4`, `gpcs4`, `orbital`, `obliteration`, `psoff`, `kyty-inorirus`, `empire-of-steel`.
  - `tracker/seo.py:683-687` generated `site/games/bloodborne/index.html:6-7` mentioning only `KytyPS5, SharpEmu, AnyPS5, and Prosperity` while omitting `shadPS4`, even though `Bloodborne` has `"platform": "PS4"` (`data/games.json:82`) and its only verified `In-Game` report is on `shadPS4` (`data/compatibility.json:172-185`).
- **Recommended & Implemented Change:**
  - Added `EMU_TITLE_CATEGORY` mapping in `tracker/seo.py` (`ps5` -> `PS5 Emulator`, `ps4` -> `PS4 Emulator`, `fork` -> `PS5 Emulator Fork`, `port` -> `PS5 Emulator Port`).
  - Updated `_render_game_page()` (`tracker/seo.py`) so `platform == "PS4"` titles (`Bloodborne`) highlight `shadPS4 (PS4 emulator)` and `PS4/PS5 Emulator Status` in `<title>`, `<meta name="description">`, and `<h1>`.

### Finding 4 — Overlong `<title>` Tags & Mid-Word Meta Description Truncation (High)
- **Baseline Observation:**
  - `61 / 63` HTML pages had `<title>` > `65` decoded chars (up to `105` chars on `site/emulators/kytyps5-linux/index.html:6`; `81` chars on `site/index.html:6`; `82` chars on `site/games/gta-vi/index.html:6`).
  - `tracker/seo.py:577, 864` sliced `page_desc` with raw `[:160]`, producing `25` descriptions of length `160` (`19` cut mid-word/mid-token such as `...d45b`, `...ma`, `...RTX`, plus `6` ending on a trailing space at char 160; e.g., `site/emulators/kytyps5/index.html:7`, `site/emulators/obliteration/index.html:7`, `site/reports/spider-man-2-kytyps5-2026-09-12/index.html:7`).
  - `14` pages (`site/index.html:9`, `site/games/gta-vi/index.html:7` at `207` chars, `games/*`, and `guides/*`) exceeded `160` chars (`40` pages total exceeded `158` chars: `14` `> 160` + `25` `== 160` + `1` `== 159`).
- **Recommended & Implemented Change:**
  - Added `truncate_words(text, limit=155)` and `_fit_title(primary, fallback, limit=65)` in `tracker/seo.py`, plus `metaTitle` support in `tracker/guides.py`.
  - Tightened `site/index.html`, game, emulator, report, and guide titles (`0 / 65` > 65 chars) and descriptions (`0 / 65` > 158 chars, `0` mid-word cuts).

### Finding 5 — Incomplete Social Metadata, Missing Icons/Manifest & Image CLS Risk (Medium)
- **Baseline Observation:**
  - `site/index.html:21-22` had stale `og:title` / `og:description` that did not match `<title>` / `<meta name="description">` (lines `6-10`).
  - `0 / 63` HTML pages emitted `og:locale`, `og:image:width`, `og:image:height`, `og:image:alt`, `twitter:title`, `twitter:description`, `twitter:image`, or `twitter:image:alt`.
  - `tracker/seo.py:448` hardcoded `og:type="article"` even on `404.html`, `emulators/*`, and `games/*`.
  - `site/og-image.png` measured `1440x900` (`144,290` bytes), and `site/` lacked PNG favicons (`192x192`, `512x512`), `apple-touch-icon.png` (`180x180`), and `manifest.webmanifest`.
  - `tracker/seo.py:338` and `site/assets/js/main.js:914, 953` used empty `alt=""` on all emulator avatars; `10` upstream/report screenshots (`tracker/seo.py:604, 923`) lacked `decoding="async"` and aspect-ratio reservation (CLS risk).
- **Recommended & Implemented Change:**
  - Synced `site/index.html` OG/Twitter tags and added complete `og:locale`, `og:image:width="1440"`, `og:image:height="900"` (matching actual `site/og-image.png` dimensions on disk), `og:image:alt`, and `twitter:*` metadata in both `site/index.html` and `tracker/seo.py:_page_shell()`. *(Follow-up design recommendation: optionally crop/export a dedicated `1200x630` Open Graph banner in the future and update `og:image:width`/`height` together.)*
  - Set `og:type="website"` on non-article pages (`404`, `emulators/*`, `games/*`, `/guides/`) and `og:type="article"` on `guides/*` and `reports/*`.
  - Generated `site/assets/icon-192.png` (`192x192`), `site/assets/icon-512.png` (`512x512`), `site/apple-touch-icon.png` (`180x180`), and `site/manifest.webmanifest`, linked in `site/index.html` and `_page_shell()`.
  - Added descriptive avatar `alt="{name} GitHub avatar"` + `decoding="async"` in `tracker/seo.py` and `site/assets/js/main.js`, plus `.shot-img` (`aspect-ratio: 16 / 9; object-fit: contain`) in `site/assets/styles.css`.

### Finding 6 — Schema.org JSON-LD, Static CTAs, Stale Dir Pruning & Thin Community Pages (Medium)
- **Baseline Observation:**
  - `site/index.html:31-54` lacked `SearchAction`, `inLanguage`, `alternateName`, `isAccessibleForFree`, `creator`, and `keywords`.
  - `tracker/seo.py:994-1005` (`SoftwareApplication`) used `GameApplication` and omitted `softwareVersion`, `dateModified`, `downloadUrl`, `license`, `screenshot`, and `isAccessibleForFree`.
  - `tracker/seo.py:1057-1074` (`TechArticle` & `BreadcrumbList`) omitted `author`, `publisher`, `image`, `datePublished`, `mainEntityOfPage`, and the `Guides` breadcrumb step.
  - `site/games/gta-vi/index.html` lacked `FAQPage` structured data; `site/index.html:286, 364, 365` used `href="#"` placeholders on `#report-link`, `#submit-link`, and `#report-link-2`; `site/index.html:434` (`#footer-updated`) and `<noscript>` (line `267`) were not SSR-aligned; `tracker/seo.py:generate()` did not prune removed subpage directories; and `46 / 53` emulators in `data/emulators.json` lacked `summary` fields.
- **Recommended & Implemented Change:**
  - Enriched `WebSite` (`SearchAction` -> `/?q={search_term_string}`, `alternateName: "EmuTrack"`, `inLanguage`), `Dataset`, `SoftwareApplication` (`UtilitiesApplication`, `softwareVersion`, `dateModified`, `downloadUrl`, `license`, `screenshot`), `TechArticle` (`author`, `publisher`, `image`, `datePublished`, `mainEntityOfPage`, 3-step `BreadcrumbList`), and added `FAQPage` on `/games/gta-vi/` + expanded `FAQPage` (`7` Q&As) on `site/index.html`.
  - Replaced all `href="#"` placeholders in `site/index.html` with direct GitHub issue template URLs, added `<!-- SSR:UPDATED -->` for `#footer-updated`, refined `<noscript>`, added `_prune_stale_dirs()` in `tracker/seo.py:generate()`, added `--from-data` (`--html-only`) in `tracker/build.py` to preserve live `site/data.json` telemetry (`stale: 0`), and enriched `14` active/notable emulators in `data/emulators.json` (synced via `python3 -m tracker readme`).

---

## 3. Keyword Audit & Refined Hype Keyword Strategy (`R3`)

### 3.1 Baseline vs. Post-Fix Focus Keyword Audit (All 10 Seed Keywords)

| # | Focus Keyword | Baseline Source / Site Hits | Post-Fix `site/` HTML Hits | Refined Hype Variations & Placement Strategy |
|---:|---|---|---:|---|
| 1 | `ps5 emulator` | `site/index.html` (`16` raw / `12` visible), `seo.py` (11), `guides.py` (16), `README.md` (6) | **490** | *Open-source PS5 emulator tracker*, *best PS5 emulators compared*, *PS5 emulator system requirements*, *PS5 emulator on PC / Android* (Home, `/guides/*`, `/emulators/*`, `README.md`) |
| 2 | `gtavi emulator` | **0** | **27** | *GTAVI emulator status & reality check*, *can a GTAVI emulator run GTA 6 on PC?*, *avoid fake GTAVI emulator scams* (`/games/gta-vi/`, `gta-vi-pc-ps5-emulator-reality-check`, `real-vs-fake-ps5-emulators`, Home FAQ, `data/games.json` aliases) |
| 3 | `gta6 emulator` | **0** | **15** | *GTA6 emulator watch & scam warning*, *fake GTA6 emulator detector* (`/games/gta-vi/`, GTA VI guide, Safety guide, Home FAQ, `data/games.json` aliases) |
| 4 | `emutrack` | `site/index.html` (19), `seo.py` (24), `README.md` (11) | **1,377** | *PS5 EmuTrack*, *EmuTrack open-source PS5 emulator tracker*, `WebSite.alternateName` (Site-wide brand, JSON-LD, `README.md`) |
| 5 | `emulator track` | `site/index.html` (`1` in `og:title` via `emulator tracker`) | **158** | *Hourly emulator track for PlayStation 5 & PS4*, *PS5 emulator track & release monitor* (Home eyebrow/FAQ, GTA VI guide, `README.md` intro, `Dataset` keywords) |
| 6 | `emulator tracker` | `site/index.html` (`1` in `og:title` only) | **153** | *Open-source PS5 emulator tracker*, *live PS5 emulator tracker for KytyPS5, SharpEmu, AnyPS5, Prosperity & shadPS4* (Home `<title>`/`og:title`/H1/meta/FAQ, guides, `README.md`, `manifest.webmanifest`) |
| 7 | `gta6` | `data/games.json` (`1` alias; `1` subpage hit) | **59** | *GTA6 / GTA 6 PC watch*, *Grand Theft Auto VI (GTA6) PS5 compatibility* (`/games/gta-vi/` H1/meta/callout, Home hero/guides/FAQ, `data/games.json`) |
| 8 | `gta 6 pc` | `guides.py` (1), `seo.py` (1) | **34** | *GTA 6 PC release vs PS5 emulator reality check*, *avoid fake GTA 6 PC repacks* (Home meta/hero/FAQ, `/games/gta-vi/`, GTA VI guide, Safety guide, `data/games.json`) |
| 9 | `gta6 pc` | **0** | **23** | *GTA6 PC status tracker*, *avoid fake GTA6 PC emulator downloads* (`/games/gta-vi/`, GTA VI guide, Safety guide, Home FAQ, `data/games.json`) |
| 10 | `gta iv` | **0** | **23** | **Truthful disambiguation only:** *GTA VI vs. GTA IV (2008 PC/PS3/X360 release — not a PS5 title)* on `/games/gta-vi/`, `gta-vi-pc-ps5-emulator-reality-check`, and Home FAQ |

### 3.2 Expanded Long-Tail Keyword Clusters Implemented
- **Core PS5 & PS4 Tech Stack:** `KytyPS5 PS5 emulator`, `SharpEmu C#/.NET PS5 emulator`, `AnyPS5 static binary re-linking`, `Prosperity LLE PS5 emulator`, `shadPS4 PS4 emulator`, `RDNA 2 to SPIR-V shader recompiler`, `Vulkan 1.3 / 1.4 requirements`, `PS5 emulator Android ARM64 FEXCore`.
- **High-Demand Titles:** `Bloodborne shadPS4 PS4/PS5 emulator status`, `Ghost of Yōtei PS5 emulator`, `Astro Bot KytyPS5 SharpEmu`, `Demon's Souls PS5 emulator`, `Marvel's Spider-Man 2`, `Horizon Forbidden West`, `Final Fantasy VII Rebirth`, `Marvel's Wolverine PS5`.
- **GTA Franchise Reality & Anti-Scam Cluster:** `GTA VI console release 2026-11-19`, `real vs fake GTA 6 PC emulator`, `KytyPS5 GTA5 Fixes`, `GTA IV vs GTA V vs GTA VI disambiguation`.

---

## 4. File-by-File Remediation Summary

| File | Changes Applied |
|---|---|
| `tracker/seo.py` | Added `BASE_PATH`, `EMU_TITLE_CATEGORY`, `truncate_words()`, `_fit_title()`, `_prune_stale_dirs()`, `_render_guides_index_page()`; fixed `_render_404_page()` (`noindex, follow`, no canonical/og:url, `/ps5-emutrack/` root-relative links); fixed PS4 emulator & `Bloodborne` titles/descriptions; added `og:locale`, `og:image:width`/`height`/`alt`, `twitter:*`, icons/manifest links, `og_type` per route; enriched `SoftwareApplication`, `TechArticle`, `BreadcrumbList` (3 steps), and `/games/gta-vi/` `FAQPage` + `GTA IV`/`GTA V`/`GTA VI` disambiguation; added avatar `alt` text, `decoding="async"`, `.shot-img` class, and `<!-- SSR:UPDATED -->` injection. |
| `tracker/guides.py` | Added `metaTitle` + tightened descriptions (`<= 155` chars) on all 5 existing guides; enriched `real-vs-fake-ps5-emulators`; added 6th guide `gta-vi-pc-ps5-emulator-reality-check`. |
| `tracker/build.py` | Added `--from-data` / `--html-only` flag to regenerate static HTML and `sitemap.xml` from existing `site/data.json` while preserving live GitHub telemetry (`stale: 0`). |
| `site/index.html` | Tightened `<title>` (`62` chars) & `<meta name="description">` (`151` chars); synced OG/Twitter tags + image dims (`1440x900`); linked PNG icons & `manifest.webmanifest`; enriched `WebSite` (`SearchAction`, `alternateName`) & `Dataset` JSON-LD; updated hero copy, nav (`Guides`, `GTA VI Watch`), visible `#guides` hub section, expanded `#faq` + `FAQPage` (`7` Q&As); replaced `href="#"` placeholders on `#report-link`/`#submit-link`/`#report-link-2`; refined `<noscript>` and `#footer-updated` SSR marker. |
| `site/assets/js/main.js` | Preserved internal `./emulators/{id}/` and `./games/{id}/` links in `renderEmulatorCards()`, `renderEmulatorCompactTable()`, and `renderCompatibility()`, added descriptive `alt` + `decoding="async"` on avatars, and added `e.target.closest('a')` guard to the `keydown` handler alongside `click` (`lines 1639, 1643-1649`). |
| `site/assets/styles.css` | Added `.guides-hub-grid`, `.guide-hub-card`, `.shot-img` (`aspect-ratio: 16 / 9`), `.prose-card h3`, and `.game-title a` link styling. |
| `data/games.json` | Expanded `gta-vi` `aliases` with `gtavi`, `gta6 pc`, `gta 6 pc`, `gtavi emulator`, `gta6 emulator` (compliant with `games.schema.json`). |
| `data/emulators.json` & `README.md` | Added factual `summary` descriptions (`10–280` chars) to `14` active/notable emulators (`prosper`, `ps5-pc-emulator`, `ps5pcem`, `ps5rs`, `rps5e`, `kytyps5-android`, `lumen-emu`, `magnusps5`, `fpps4`, `gpcs4`, `kyty-inorirus`, `obliteration`, `orbital`, `psoff`), synced tables via `python3 -m tracker readme`, and added keyword-aligned intro prose to `README.md`. |
| `site/assets/icon-192.png`, `icon-512.png`, `site/apple-touch-icon.png`, `site/manifest.webmanifest` | Generated valid PNG favicons/Apple touch icon matching `icon.svg` and added Web App Manifest. |
| `tests/test_tracker.py` | Expanded `SeoTests` from `1` to `8` tests (`19` total tests) covering 404 `noindex`/links, PS4 & `Bloodborne` metadata, word-safe descriptions, JSON-LD enrichment, stale dir pruning, OG dimensions, all `10` focus keywords, and heading hierarchy (`len(h1) == 1` and zero level skips). |
| `site/**` (generated HTML & `sitemap.xml`) | Deterministically regenerated (`66` HTML files, `64` sitemap URLs) via `python3 -m tracker build --from-data` with `site/data.json` preserved (`ok: 53, stale: 0, missing: 0`). |

---

## 5. Verification Results (Post-Edit)

All checks below executed cleanly (`exit 0`) after the final code/content edit:

1. `python3 -m tracker validate` → `OK: 53 emulators, 12 games, 36 reports`
2. `python3 -m tracker readme --check` → `README.md is up to date`
3. `python3 -m unittest discover -s tests -v` → `Ran 19 tests — OK`
4. `node --check site/assets/js/main.js && node --check site/assets/js/markdown.js` → `exit 0`
5. Programmatic HTML/JSON-LD/asset audit over all `66` files in `site/`:
   - `titles > 65`: `0`
   - `descriptions > 158`: `0`
   - `non-terminal / mid-word descriptions`: `0`
   - `h1 != 1`: `0`; `heading-level skips`: `0`
   - `broken internal links`: `0`
   - `JSON-LD parse errors`: `0`
   - `404.html`: `noindex, follow` present, no canonical, no `og:url`, `0` relative `href`/`src` attributes
   - `site/og-image.png` (`1440x900`) matches `og:image:width` / `og:image:height`; `site/manifest.webmanifest` + 3 PNG icons valid
   - `site/data.json`: `{'ok': 53, 'stale': 0, 'missing': 0}` preserved
6. Temp-directory offline pipeline check (`python3 -m tracker build --offline --previous site/data.json --output <tmp>/site/data.json`) → `exit 0` (`12 games, 33 emulators, 11 reports, 6 guides, 64 sitemap URLs`).
