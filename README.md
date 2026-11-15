# Awesome PS5 Emulators & PS5 EmuTrack

[![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-Ready-0070D1?style=flat-square&logo=github)](https://ps5-emutrack.github.io/ps5-emutrack/)
[![Open Source](https://img.shields.io/badge/Open%20Source-MIT-10B981?style=flat-square)](LICENSE)
[![Auto Updated](https://img.shields.io/badge/Releases-Hourly%20GitHub%20Actions-22D3EE?style=flat-square&logo=githubactions)](.github/workflows/update-tracker.yml)
[![Tracked Projects](https://img.shields.io/badge/Tracked%20Emulators-24-0070D1?style=flat-square)](#curated-directory-of-tracked-ps5-emulators-24)

**PS5 EmuTrack** is a fast, dark-mode, SEO-optimized **PlayStation 5 Emulator Release & Compatibility Tracker Hub**. It monitors **24 open-source PS5 emulators, forks, and compatibility layers** via the GitHub REST API (with 30-minute `localStorage` caching and an hourly Python `data.json` fallback), links directly to official GitHub Releases, tracks compatibility for major titles including **Grand Theft Auto VI (GTA VI)**, and supports **community emulator submissions with moderator review**.

> **Live Demo Placeholder:** `https://<your-username>.github.io/ps5-emutrack/`

---

## Trending Games Compatibility Matrix

| Title | KytyPS5 | SharpEmu | Prosperity | AnyPS5 | Last Verified | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Grand Theft Auto VI (GTA VI)** | 🟡 Pending Release | 🟡 Pending Release | 🔴 Not Supported Yet | 🔴 Not Supported Yet | `2026-11-15` | Awaiting retail PS5 launch & binary analysis. |
| **Ghost of Yōtei** | 🟢 In-Game | 🔵 Boots to Menu | 🔴 Not Supported Yet | 🔵 Boots to Menu | `2026-11-14` | KytyPS5 reaches early world exploration (10–18 FPS). |
| **Astro Bot** | 🟢 In-Game | 🟢 In-Game | 🔵 Boots to Menu | 🔵 Boots to Menu | `2026-11-13` | Intro levels playable at 15–25 FPS on desktop Vulkan GPUs. |
| **Demon's Souls** | 🟢 In-Game | 🔵 Boots to Menu | 🔵 Boots to Menu | 🔴 Not Supported Yet | `2026-11-12` | KytyPS5 enters Nexus & Boletaria at early low framerates. |
| **Marvel's Spider-Man 2** | 🔵 Boots to Menu | 🔵 Boots to Menu | 🔴 Not Supported Yet | 🔴 Not Supported Yet | `2026-11-11` | Boots past title screen; asset streaming optimization ongoing. |
| **Returnal** | 🟢 In-Game | 🔵 Boots to Menu | 🔴 Not Supported Yet | 🔵 Boots to Menu | `2026-11-10` | Renders crash-site biome in KytyPS5 with audio desync. |
| **Stellar Blade** | 🔵 Boots to Menu | 🔵 Boots to Menu | 🔴 Not Supported Yet | 🔴 Not Supported Yet | `2026-11-08` | Reaches configuration menus cleanly; shader caching active. |

**Status Legend:** `🟢 In-Game` · `🔵 Boots to Menu` · `🟡 Pending Release` · `🔴 Not Supported Yet`

---

## Curated Directory of Tracked PS5 Emulators (24)

### PS5 Native & High-Level Emulators (HLE)
- **[KytyPS5](https://github.com/KytyPS5/KytyPS5)** *(Most Active)* — `C++20` · `Vulkan` · `Windows / Linux / macOS` — Near-daily updates; runs *Ghost of Yōtei*, *Astro Bot*, and *Demon's Souls* in-game at early low framerates. ([Releases](https://github.com/KytyPS5/KytyPS5/releases))
- **[SharpEmu](https://github.com/sharpemu/sharpemu)** — `C# / .NET 9` · `Vulkan` · `Windows / Linux` — Cross-platform Vulkan runtime with a large compatibility database. ([Releases](https://github.com/sharpemu/sharpemu/releases))
- **[PS5PCEM](https://github.com/iStark/PS5PCEM)** — `Zig` · `Vulkan` · `Windows / Linux` — Experimental PS5 interoperability research project focusing on native guest execution and RDNA2 shaders.
- **[PSPC5 Plus](https://github.com/gurjotsenghww/pspc5-plus)** — `Zig / C++` · `Vulkan` · `Windows` — Derivative of PS5PCEM with automated regression testing and JSON compatibility mapping.
- **[S5-Play](https://github.com/danielsem65/S5-Play)** — `C++20` · `Vulkan` · `Windows` — Open-source PS5 & PS5 Pro emulator project extending early Kyty-derived execution layouts.
- **[KytyPlus](https://github.com/Coder787-source/KytyPlus)** — `C++20` · `Vulkan` · `Windows / Linux` — Community KytyPS5 fork tuned for integrated GPU (iGPU) optimization and stability.
- **[KytyPS5-SuperMedo](https://github.com/Supermedo/KytyPS5-SuperMedo)** — `C++20` · `Vulkan` · `Windows` — Windows KytyPS5 fork featuring launcher integrations and game-specific fixes.

### Translation & Binary Re-Linking Layers
- **[AnyPS5](https://github.com/boykopovar/AnyPS5)** — `C++ / LLVM` · `Vulkan / DX12` · `Windows / Linux` — Automatic executable porting, binary re-linking, and dynamic linking of PS5 system libraries.
- **[RPS5E (RustPS5Emu)](https://github.com/keklick1337/rps5e)** — `Rust` · `Vulkan / SPIR-V` · `Linux / Windows` — Wine-style Rust PS5 compatibility layer with integrated GUI launcher.
- **[Prosper](https://github.com/mattias800/prosper)** — `C++ / C` · `Vulkan / AGC` · `Linux / Windows / macOS` — User-space Prospero compatibility layer for SELF/ELF loading and AGC-to-Vulkan translation.
- **[ProsperoEden](https://github.com/heydemoura/ProsperoEden)** — `C++` · `Vulkan` · `Linux / Windows` — Experimental Prospero compatibility layer exploring userland syscall shims.

### Low-Level Emulation (LLE), Kernels & Binary Analysis
- **Prosperity** — `C++ / Rust` · `Vulkan / AGC` · `Linux / Windows` — Low-level emulation project targeting PS4 and PS5 hardware architecture and native binaries.
- **[Obliteration](https://github.com/obhq/obliteration)** — `Rust` · `Vulkan` · `Windows / Linux / macOS` — Clean-room Rust implementation of PlayStation kernel and system services.
- **[ps5rs](https://github.com/claimore22/ps5rs)** — `Rust` · `Virtual Loader` · `Linux / Windows / macOS` — Rust SELF/ELF/PRX binary parser, NID resolver, and virtual loader framework.
- **[Orbital](https://github.com/AlexAltea/orbital)** — `C / C++` · `QEMU / Vulkan` · `Linux / Windows` — Low-level QEMU virtualization emulator booting full dumped PlayStation system software.

### Mobile & Cross-Console Ports
- **[KytyPS5-Android](https://github.com/tarek369/KytyPS5-Android)** — `C++ / Kotlin` · `Vulkan / Turnip` · `Android ARM64` — Unofficial Android port utilizing FEXCore JIT and Mesa Turnip drivers.
- **[EmuFive](https://github.com/blue0x1/EmuFive)** — `C++ / Shell` · `Vulkan` · `PS4 Linux` — Cross-console KytyPS5 wrapper targeting jailbroken PS4 Pro systems running Linux.
- **[onRps4-Android](https://github.com/dev-Ali2008/onRps4-Android)** — `C++ / Kotlin` · `Vulkan / Turnip` · `Android ARM64` — Mobile ARM64 translation environment using Box64 and Mesa Turnip.

### PS4 & Hybrid Compatibility Baselines
- **[shadPS4](https://github.com/shadps4-emu/shadPS4)** — `C++20` · `Vulkan` · `Windows / Linux / macOS` — Leading active PlayStation emulator with shader recompiler ([Releases](https://github.com/shadps4-emu/shadPS4/releases)).
- **[Kyty (Upstream)](https://github.com/InoriRus/Kyty)** — `C++` · `Vulkan` · `Windows / Linux` — Original foundational PS4 & PS5 emulator codebase by InoriRus.
- **[fpPS4](https://github.com/red-prig/fpPS4)** — `Free Pascal` · `Vulkan` · `Windows / Linux` — HLE compatibility layer reimplementing Sony system modules.
- **[psOff](https://github.com/SysRay/psOff_public)** — `C++20` · `Vulkan` · `Windows` — Public C++20 compatibility layer snapshot for Windows.
- **[GPCS4](https://github.com/Inori/GPCS4)** — `C++` · `Vulkan` · `Windows` — Pioneering research emulator exploring GCN-to-SPIR-V shader compilation.
- **Spine (Reference)** — `C++` · `Vulkan` · `Linux` — Historic HLE compatibility layer milestone.

### Auto-Approved Community Submissions

<!-- AUTO-TRACKED-EMULATORS:START -->
_No community submissions merged via automated GitHub issue approval yet — open a Pull Request or [Submit Emulator Issue](.github/ISSUE_TEMPLATE/submit-emulator.yml) on GitHub to contribute._
<!-- AUTO-TRACKED-EMULATORS:END -->

---

## Submitting a New Emulator (GitHub PR & Maintainer Automation)

All new emulator additions are handled **exclusively through GitHub** so only repository maintainers can review and merge entries:
1. Fork this repository, add your project via Pull Request, or open a structured [Submit Emulator Issue](.github/ISSUE_TEMPLATE/submit-emulator.yml) directly on GitHub.
2. When repository maintainers merge the Pull Request or apply the `approved` label on GitHub, `.github/workflows/approve-submission.yml` (`scripts/auto_approve.py`) **automatically**:
   - Fetches live GitHub repo stats, language, latest release tag/assets, and README text
   - Scans release notes & READMEs to detect supported games (including GTA VI monitoring)
   - Appends the emulator to `public/data.json`, updates `README.md`, and deploys the update to the website

---

## Quick-Start: Host on GitHub Pages & Run Hourly Sync

1. Fork this repository and update `REPO_URL` in `src/app/core/tracker-data.ts`.
2. Deploy via Angular SSR + Express (`npm run build && npm run serve:ssr:app`) or GitHub Pages.
3. Enable `.github/workflows/update-tracker.yml` and `.github/workflows/approve-submission.yml` so `scripts/update_tracker.py` and `scripts/auto_approve.py` keep `data.json`, game compatibility statuses, and `README.md` updated automatically.
