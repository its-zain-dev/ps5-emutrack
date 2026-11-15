# Contributing to PS5 EmuTrack

PS5 EmuTrack operates like curated GitHub **Awesome Lists**. All new emulator additions go through moderator review before appearing on the main tracker to ensure authenticity and protect users from look-alike malware repositories.

## How to Submit a New PS5 Emulator

### Option 1: Push a Pull Request (Preferred for Big Lists)
1. Fork this repository and create a branch (e.g. `add-my-emulator`).
2. Add your emulator metadata to `src/app/core/tracker-data.ts` (`TRACKED_EMULATORS`) and `public/data.json`, or use the **Submit Emulator** form on the live web app to generate your ready-to-paste JSON and Markdown snippets.
3. Add a matching entry under the appropriate category in `README.md`.
4. Ensure all fields are included:
   - **Emulator Name**
   - **Official GitHub Repository URL** (`https://github.com/<owner>/<repo>`)
   - **Brief Description** (architecture, language/graphics backend, current scope)
   - **Latest Releases or Documentation Link**
5. Open a Pull Request for moderator review.

### Option 2: Submit via Web Form or GitHub Issue
- Use the **Submit Emulator** tab in the web app (`#submit`) to queue an entry into the **Moderator Review Queue** (`POST /api/submissions`) and generate a pre-filled GitHub Issue link.
- Or open a [New Emulator Submission Issue](.github/ISSUE_TEMPLATE/submit-emulator.yml) directly on GitHub.

## Moderator Verification Checklist
- Repository is publicly accessible open-source code (no closed binary-only mega/drive drops).
- Maintainer organization matches authentic developer history (no typo-squatted look-alikes).
- Releases/documentation URL points to official GitHub Releases or repository docs.
