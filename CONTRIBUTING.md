# Contributing to PS5 EmuTrack

PS5 EmuTrack tracks open-source PlayStation 5 emulators and sourced game compatibility reports.

## Submitting via GitHub Issues (recommended)

- **New emulator, fork, or port:** open the [Submit an Emulator](https://github.com/its-zain-dev/ps5-emutrack/issues/new?template=submit-emulator.yml) form.
- **Game compatibility report:** open the [Report Game Compatibility](https://github.com/its-zain-dev/ps5-emutrack/issues/new?template=compatibility-report.yml) form.

Automated triage checks run as soon as you open or edit the issue. Once a maintainer reviews and applies the `approved` label, the change is automatically committed to `data/` and published to GitHub Pages.

## Submitting via Pull Request

You can also edit the JSON files directly:

1. Add or update entries in:
   - `data/emulators.json`
   - `data/games.json`
   - `data/compatibility.json`
2. If you changed `data/emulators.json`, regenerate the table in `README.md`:
   ```bash
   python -m tracker readme
   ```
3. Verify everything passes locally before opening a PR:
   ```bash
   python -m tracker validate
   python -m tracker readme --check
   python -m unittest discover -s tests -v
   ```

## Guidelines

- **Public, open-source GitHub repositories only.** Closed-source binary drops and file-host mirrors are rejected.
- **Compatibility reports need evidence.** Every new report requires `verified: true`, a `source` link, and an `evidence` URL (video, screenshot, or log).
- **No piracy.** Do not link to commercial ROMs/ISOs, dumped firmware, BIOS files, or decryption keys.
