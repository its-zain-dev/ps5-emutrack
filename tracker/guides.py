"""Original, researched PS5 emulation guides rendered as static SEO pages."""

from __future__ import annotations

from typing import Any

GUIDE_DATE = "2026-11-16"

GUIDES: list[dict[str, Any]] = [
    {
        "id": "real-vs-fake-ps5-emulators",
        "title": "Real vs. Fake PS5 Emulators: How to Verify Safe Downloads",
        "navTitle": "Real vs. Fake PS5 Emulators",
        "description": (
            "How to tell legitimate open-source PS5 emulators like KytyPS5 and SharpEmu apart from fake "
            "'GTA 6 PC emulator' malware websites, survey scams, and password-locked archives."
        ),
        "updated": GUIDE_DATE,
        "priority": "0.9",
        "sections": [
            (
                "Why fake PS5 emulators spike around major launches",
                "<p>Every major console-first release—especially <strong>Grand Theft Auto VI</strong>—triggers hundreds of "
                "clone domains and social media videos claiming to run unreleased or launch-day PS5 titles on PC or Android. "
                "In reality, legitimate PlayStation 5 emulation projects are early-stage, open-source engineering efforts hosted on GitHub.</p>"
                "<p>None of the real projects require ad-heavy download mirrors, survey gates, or encrypted ZIP passwords.</p>",
            ),
            (
                "5-point checklist to verify any PS5 emulator",
                "<ul>"
                "<li><strong>Public source code on GitHub:</strong> Real projects publish readable C++, Rust, C#, or Zig code under an open-source license such as GPL-2.0 or MIT.</li>"
                "<li><strong>Official GitHub Releases only:</strong> Download builds strictly from the repository's <code>/releases</code> tab (e.g. <code>KytyPS5/KytyPS5</code>, <code>sharpemu/sharpemu</code>, <code>boykopovar/AnyPS5</code>, <code>Force67/prosperity</code>) rather than Mega, MediaFire, or random <code>.com</code> download portals.</li>"
                "<li><strong>Real commit history &amp; issue tracker:</strong> Authentic projects have public pull requests, compiler instructions, shader debugging logs, and open bug reports from real testers.</li>"
                "<li><strong>No bundled 'BIOS + ROMs' packs:</strong> Legitimate emulators legally cannot ship Sony firmware, decryption keys, or commercial game dumps. Any site offering a one-click 'GTA 6 + PS5 Emulator Repack' is malicious.</li>"
                "<li><strong>Honest compatibility claims:</strong> Check <a href=\"../../games/gta-vi/\">our GTA VI tracker</a> and <a href=\"../../#compatibility\">verified upstream reports</a>. Even on high-end GPUs, many AAA PS5 titles still stop at intro logos or crash during shader compilation.</li>"
                "</ul>",
            ),
            (
                "Official domains vs. impersonators",
                "<p>Both <a href=\"../../emulators/sharpemu/\">SharpEmu</a> (whose README warns that only <code>sharpemu.app</code> and its GitHub repository are official) "
                "and <a href=\"../../emulators/kytyps5/\">KytyPS5</a> explicitly warn users against unofficial websites and fake donation pages. "
                "When in doubt, verify the repository owner directly against the <a href=\"../../#emulators\">PS5 EmuTrack directory</a>.</p>",
            ),
        ],
    },
    {
        "id": "best-ps5-emulators-compared",
        "title": "Best PS5 Emulators Compared: KytyPS5 vs. SharpEmu vs. AnyPS5 vs. Prosperity",
        "navTitle": "Best PS5 Emulators Compared",
        "description": (
            "Technical comparison of active open-source PS5 emulators: KytyPS5 (C++20 translation), "
            "SharpEmu (C#/.NET), AnyPS5 (binary re-linking), and Prosperity (LLE)."
        ),
        "updated": GUIDE_DATE,
        "priority": "0.9",
        "sections": [
            (
                "Four different architectures solving the same problem",
                "<p>Because the PlayStation 5 uses an AMD Zen 2 x86-64 CPU and an RDNA 2 GPU, emulators do not need slow "
                "CPU instruction interpretation on x86-64 desktops. Instead, the four leading projects take markedly different approaches:</p>"
                "<div class=\"table-wrap\"><table class=\"compat\">"
                "<thead><tr><th>Project</th><th>Language</th><th>Approach</th><th>Platforms</th><th>Best for</th></tr></thead>"
                "<tbody>"
                "<tr><td><a href=\"../../emulators/kytyps5/\"><strong>KytyPS5</strong></a></td><td>C++20</td><td>HLE user-space translation + Vulkan 1.3</td><td>Windows, Linux, macOS (Rosetta 2)</td><td>Fastest-moving game boot testing &amp; nightly builds</td></tr>"
                "<tr><td><a href=\"../../emulators/sharpemu/\"><strong>SharpEmu</strong></a></td><td>C# / .NET</td><td>Managed HLE runtime + Vulkan</td><td>Windows x64, Linux x64 (macOS repo separate)</td><td>Clean C# architecture &amp; cross-gen PS4/PS5 research</td></tr>"
                "<tr><td><a href=\"../../emulators/anyps5/\"><strong>AnyPS5</strong></a></td><td>C++ / LLVM</td><td>Static binary re-linking to native host executables</td><td>Windows, Linux (relinker on macOS)</td><td>Converting PS5 ELFs directly into native host binaries</td></tr>"
                "<tr><td><a href=\"../../emulators/prosperity/\"><strong>Prosperity</strong></a></td><td>C++</td><td>Low-level emulation (LLE) sandbox w/ original modules</td><td>Linux (x86-64 / ARM64 via FEX), Android</td><td>Using real dumped system modules for accuracy</td></tr>"
                "</tbody></table></div>",
            ),
            (
                "Which one should you follow or test?",
                "<ul>"
                "<li><strong>For tracking the newest game boot milestones:</strong> <a href=\"../../emulators/kytyps5/\">KytyPS5</a> ships near-daily CI builds and has the largest public log of tested PS5 titles, with verified boots across games like <em>Astro Bot</em>, <em>Ghost of Yōtei</em>, <em>Horizon Forbidden West</em>, and <em>Demon's Souls</em>.</li>"
                "<li><strong>For managed runtime &amp; PS4 backward compatibility research:</strong> <a href=\"../../emulators/sharpemu/\">SharpEmu</a> prioritizes accuracy and clean infrastructure in C#.</li>"
                "<li><strong>For native executable porting without a traditional runtime loop:</strong> <a href=\"../../emulators/anyps5/\">AnyPS5</a> translates PS5 ELF binaries directly and compiles RDNA2 shaders to SPIR-V.</li>"
                "<li><strong>For PS4 titles today:</strong> <a href=\"../../emulators/shadps4/\">shadPS4</a> remains the benchmark for mature PlayStation 4 emulation (such as <em>Bloodborne</em>), and several PS5 layers study its shader recompiler.</li>"
                "</ul>",
            ),
        ],
    },
    {
        "id": "ps5-emulator-requirements",
        "title": "PS5 Emulator System Requirements: CPU, GPU (Vulkan), RAM & OS Guide",
        "navTitle": "System Requirements Guide",
        "description": (
            "Real hardware requirements documented by upstream PS5 emulators like KytyPS5 and Prosperity: "
            "x86-64 AVX/SSE4.2 CPUs, Vulkan 1.3/1.4 GPUs, VRAM needs, and Linux vs. Windows support."
        ),
        "updated": GUIDE_DATE,
        "priority": "0.8",
        "sections": [
            (
                "Minimum vs. realistic desktop requirements",
                "<p>Unlike console ports optimized for PC, PS5 emulators translate RDNA 2 shaders to Vulkan SPIR-V on the fly "
                "and allocate host memory directly for unified PS5 RAM pools. Based on the official upstream documentation from "
                "<a href=\"../../emulators/kytyps5/\">KytyPS5</a> and <a href=\"../../emulators/prosperity/\">Prosperity</a>, here is what you actually need:</p>"
                "<ul>"
                "<li><strong>Operating System:</strong> Windows 10 (1803+) / Windows 11 x64, or a modern 64-bit Linux distribution (Ubuntu, Arch, CachyOS, NixOS). macOS works experimentally on Apple Silicon via Rosetta 2 + MoltenVK in KytyPS5, or via dedicated macOS ports.</li>"
                "<li><strong>CPU:</strong> Modern 64-bit x86-64 processor (made in the last ~10 years) supporting <strong>AVX, SSE4.2, and BMI1</strong>. On ARM64 hosts (Apple Silicon or Android), CPU translation layers such as Rosetta 2 or FEX are required.</li>"
                "<li><strong>GPU &amp; Vulkan:</strong> A dedicated GPU with current drivers supporting <strong>Vulkan 1.3</strong> (required by KytyPS5) or <strong>Vulkan 1.4+</strong> (specified by Prosperity), plus Buffer Device Address (BDA) support.</li>"
                "<li><strong>RAM &amp; VRAM:</strong> Expect <strong>16 GB–32 GB of system RAM</strong> and at least <strong>8 GB of dedicated VRAM</strong> (the PS5 shares 16 GB GDDR6 across CPU and GPU, so 6 GB cards frequently hit allocation failures on heavy AAA dumps).</li>"
                "</ul>",
            ),
            (
                "What real compatibility logs tell us about hardware",
                "<p>In our <a href=\"../../#compatibility\">verified upstream reports</a>, testers running desktop GPUs like the RTX 3080 Ti, RTX 4070 SUPER, "
                "RX 6800 XT, and RTX 5070 Ti with 32 GB DDR4/DDR5 still encounter shader compilation crashes or descriptor assertion errors. "
                "Right now, compatibility bottlenecks are mostly unimplemented OS syscalls and RDNA 2 shader edge cases rather than raw GPU speed.</p>",
            ),
        ],
    },
    {
        "id": "ps5-emulation-explained",
        "title": "PS5 Emulation Explained: HLE Syscall Translation, Binary Re-Linking & LLE",
        "navTitle": "PS5 Emulation Explained",
        "description": (
            "How open-source PS5 emulators actually work under the hood: x86-64 host execution, Orbis/Prospero "
            "PRX library stubbing, RDNA 2 to SPIR-V shader recompilation, and why progress jumps unevenly."
        ),
        "updated": GUIDE_DATE,
        "priority": "0.8",
        "sections": [
            (
                "Why x86-64 PS5 binaries don't need full CPU emulation",
                "<p>Both the PlayStation 4 and PlayStation 5 run on custom AMD x86-64 processors. When running on a Windows or Linux x86-64 PC, "
                "an emulator can execute most guest CPU instructions directly on your host processor after patching memory layouts, thread-local storage, "
                "and calling conventions—avoiding the steep CPU slowdown seen in PS3 (Cell) or Xbox 360 (PowerPC) emulation.</p>",
            ),
            (
                "Three technical hurdles that still take years",
                "<ol>"
                "<li><strong>System libraries &amp; syscalls (HLE / PRX):</strong> PS5 games call hundreds of proprietary Sony <code>libSce*</code> libraries (networking, PlayGo streaming, audio codecs like ATRAC9, trophies, and kernel memory mapping). Every unimplemented NID function can crash a title mid-load.</li>"
                "<li><strong>RDNA 2 GPU command buffers &amp; shader recompilation:</strong> Games emit raw AMD PM4/AGC GPU packets and GCN/RDNA 2 shaders. Emulators such as KytyPS5 and AnyPS5 decode these shaders into intermediate IR and emit standard Vulkan SPIR-V shaders.</li>"
                "<li><strong>Encrypted packages &amp; dumps:</strong> Retail PS5 discs and packages are encrypted. Testing requires legal decrypted dumps from jailbroken hardware you own.</li>"
                "</ol>",
            ),
            (
                "Why one game boots fast while another crashes at a black screen",
                "<p>Because HLE and binary re-linking only implement the specific <code>libSce*</code> functions observed in tested games, "
                "smaller titles or engines using familiar subsystems can reach menus or gameplay quickly, while newer blockbusters using "
                "novel graphics features or streaming APIs halt immediately at initialization until those exact paths are reverse-engineered.</p>",
            ),
        ],
    },
    {
        "id": "ps5-emulator-android",
        "title": "PS5 Emulators on Android & Mobile: What Actually Exists vs. Fake APKs",
        "navTitle": "PS5 Emulators on Android",
        "description": (
            "Honest status of PS5 emulation on Android, iOS, and ARM64 devices: FEX/Box64 CPU overhead, "
            "Turnip Vulkan drivers, open-source mobile ports, and how to avoid malicious APK scams."
        ),
        "updated": GUIDE_DATE,
        "priority": "0.8",
        "sections": [
            (
                "Can an Android phone run PS5 games today?",
                "<p><strong>Not meaningfully for commercial AAA games.</strong> Desktop x86-64 PCs with 32 GB RAM and desktop Vulkan GPUs are still in early bring-up stages. "
                "On Android ARM64 smartphones, an emulator has to perform <em>extra</em> x86-64-to-ARM64 CPU translation (using JITs like FEXCore or Box64) "
                "on top of RDNA 2-to-Vulkan shader translation, within tight mobile thermal and memory limits (typically 12+ GB RAM and Vulkan 1.4+ drivers recommended).</p>",
            ),
            (
                "What open-source mobile projects exist?",
                "<p>You can inspect every tracked mobile port in our <a href=\"../../?cat=port#emulators\">Ports &amp; Frontends directory</a>, including "
                "<a href=\"../../emulators/kytyps5-android/\">KytyPS5-Android</a>, <a href=\"../../emulators/sharpdroid/\">SharpDroid</a>, "
                "<a href=\"../../emulators/lumen-emu/\">Lumen Emu</a>, and <a href=\"../../emulators/magnusps5/\">MagnusPS5</a> (iOS). "
                "Treat all of them as experimental research ports rather than daily gaming apps.</p>"
                "<p><strong>Security warning:</strong> Never install random 'PS5 Emulator APK' downloads promising 60 FPS AAA gameplay on mobile—always verify public source code and GitHub Releases using our <a href=\"../../guides/real-vs-fake-ps5-emulators/\">verification checklist</a>.</p>",
            ),
        ],
    },
]
