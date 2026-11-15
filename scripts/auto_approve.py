#!/usr/bin/env python3
"""
PS5 EmuTrack – Automated Approved Emulator GitHub Issue Sync
Triggered by GitHub Actions when an emulator submission issue is labeled `approved`.
Fetches repository metadata, latest release, and README compatibility signals,
then writes the enriched entry into public/data.json and README.md automatically.
"""

from __future__ import annotations

import json
import os
import re
import urllib.error
from datetime import datetime, timezone
from pathlib import Path

from update_tracker import (
    fetch_readme_text,
    format_iso_date,
    gh_get,
    pick_preferred_asset,
    scan_text_for_games,
)

ROOT = Path(__file__).resolve().parent.parent
PUBLIC_DATA = ROOT / "public" / "data.json"
README_FILE = ROOT / "README.md"


def extract_field(body: str, heading: str) -> str:
    pattern = rf"(?:###\s*{re.escape(heading)}\s*\n+|-\s*\*\*{re.escape(heading)}:\*\*\s*)([^\n]+)"
    match = re.search(pattern, body, flags=re.IGNORECASE)
    return match.group(1).strip() if match else ""


def parse_github_repo(url: str) -> tuple[str, str] | None:
    match = re.match(r"^https://github\.com/([^/]+)/([^/#?]+)", url.strip(), flags=re.IGNORECASE)
    if not match:
        return None
    owner, repo = match.group(1), match.group(2)
    if repo.lower().endswith(".git"):
        repo = repo[:-4]
    return owner, repo


def slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.strip().lower()).strip("-")
    return slug or "community-emulator"


def update_readme_auto_section(custom_emulators: list[dict]) -> None:
    if not README_FILE.exists():
        return
    start_marker = "<!-- AUTO-TRACKED-EMULATORS:START -->"
    end_marker = "<!-- AUTO-TRACKED-EMULATORS:END -->"
    content = README_FILE.read_text(encoding="utf-8")

    if not custom_emulators:
        lines = ["_No additional community-approved submissions merged into auto-registry yet._"]
    else:
        lines = []
        for emu in custom_emulators:
            langs = ", ".join(emu.get("languages") or ["C++"])
            backends = " / ".join(emu.get("graphicsBackends") or ["Vulkan"])
            platforms = ", ".join(emu.get("platforms") or ["Windows", "Linux"])
            games = emu.get("supportedGames") or []
            games_note = f" · Detected Titles: {', '.join(games)}" if games else ""
            lines.append(
                f"- **[{emu['name']}]({emu['repoUrl']})** — `{langs}` · `{backends}` · `{platforms}`  \n"
                f"  {emu['statusSummary']}{games_note} ([Releases / Docs]({emu['releasesPageUrl']}))"
            )

    block = f"{start_marker}\n" + "\n".join(lines) + f"\n{end_marker}"
    if start_marker in content and end_marker in content:
        s_idx = content.index(start_marker)
        e_idx = content.index(end_marker) + len(end_marker)
        updated = content[:s_idx] + block + content[e_idx:]
    else:
        updated = content.rstrip() + f"\n\n### Auto-Approved Community Submissions\n\n{block}\n"

    README_FILE.write_text(updated, encoding="utf-8")


def main() -> None:
    issue_title = os.environ.get("ISSUE_TITLE", "")
    issue_body = os.environ.get("ISSUE_BODY", "")

    name = extract_field(issue_body, "Emulator Name") or issue_title.replace("[Emulator Submission]", "").strip()
    repo_url = extract_field(issue_body, "GitHub Repository URL") or extract_field(issue_body, "GitHub Repository")
    releases_url = extract_field(issue_body, "Latest Releases or Documentation URL") or extract_field(
        issue_body, "Latest Releases / Docs"
    )
    category = extract_field(issue_body, "Architecture Category") or extract_field(issue_body, "Category") or "PS5 Native / HLE"
    description = extract_field(issue_body, "Brief Description") or "Open-source PS5 emulation project verified via moderator review."

    parsed = parse_github_repo(repo_url)
    if not parsed or not name:
        raise SystemExit("Missing valid Emulator Name or GitHub Repository URL in issue body.")

    owner, repo = parsed
    emu_id = slugify(name)
    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    repo_meta = {}
    raw_rel = {}
    try:
        repo_meta = gh_get(f"https://api.github.com/repos/{owner}/{repo}")
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
        pass

    try:
        raw_rel = gh_get(f"https://api.github.com/repos/{owner}/{repo}/releases/latest")
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
        pass

    readme_text = fetch_readme_text(owner, repo)
    rel_notes = str(raw_rel.get("body") or "")
    repo_desc = str(repo_meta.get("description") or "").strip()
    combined_scan = f"{name}\n{description}\n{repo_desc}\n{rel_notes}\n{readme_text}"
    discovered_games = [g["title"] for g in scan_text_for_games(combined_scan)]

    assets_raw = raw_rel.get("assets") or []
    direct_url, direct_name = pick_preferred_asset(assets_raw)
    published_at = raw_rel.get("published_at") or repo_meta.get("pushed_at") or now_iso

    release_obj = {
        "tagName": raw_rel.get("tag_name") or "community-verified",
        "releaseTitle": raw_rel.get("name") or raw_rel.get("tag_name") or f"{name} Verified Release",
        "publishedAt": published_at,
        "formattedDate": format_iso_date(published_at),
        "releaseUrl": raw_rel.get("html_url") or releases_url or repo_url,
        "directAssetUrl": direct_url or raw_rel.get("html_url") or releases_url or repo_url,
        "directAssetName": direct_name or "Releases / Documentation",
        "bodyNotes": rel_notes.strip() or f"### Auto-Approved Addition\n- {description}",
        "source": "community-approved",
        "assets": [],
    }

    lang = repo_meta.get("language") or "C++"
    stars = int(repo_meta.get("stargazers_count") or 0)
    project_obj = {
        "id": emu_id,
        "name": name,
        "category": category,
        "activityLabel": f"Community Approved · {stars} Stars" if stars > 0 else "Community Approved · Auto-Synced",
        "isMostActive": False,
        "languages": [lang],
        "graphicsBackends": ["Vulkan"],
        "platforms": ["Windows", "Linux"],
        "architectureSummary": description,
        "statusSummary": description if len(description) >= 20 else (repo_desc or description),
        "repoOwner": owner,
        "repoName": repo,
        "repoUrl": repo_url,
        "releasesPageUrl": releases_url or f"{repo_url}/releases",
        "apiLatestReleaseUrl": f"https://api.github.com/repos/{owner}/{repo}/releases/latest",
        "stars": stars if stars > 0 else None,
        "supportedGames": discovered_games,
        "lastAutoScannedAt": now_iso,
        "autoApproved": True,
        "fallbackRelease": release_obj,
    }

    payload = json.loads(PUBLIC_DATA.read_text(encoding="utf-8"))
    custom = [c for c in payload.get("customEmulators", []) if c.get("repoUrl", "").lower() != repo_url.lower()]
    custom.insert(0, project_obj)
    payload["customEmulators"] = custom
    payload.setdefault("emulators", {})[emu_id] = release_obj
    if discovered_games:
        payload.setdefault("emulatorSupportedGames", {})[emu_id] = discovered_games
    payload["generatedAt"] = now_iso

    PUBLIC_DATA.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    update_readme_auto_section(custom)
    print(f"[OK] Auto-approved {name} ({owner}/{repo}) with {len(discovered_games)} discovered games.")


if __name__ == "__main__":
    main()
