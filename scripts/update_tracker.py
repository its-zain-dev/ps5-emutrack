#!/usr/bin/env python3
"""
PS5 EmuTrack – Automated GitHub Release & Game Compatibility Sync
1. Fetches latest release, repo metadata, and README text from tracked PS5 emulators
   (including customEmulators approved into public/data.json).
2. Automatically scans release notes & READMEs for supported/mentioned PS5 titles
   (including Grand Theft Auto VI / GTA VI monitoring) and updates matrix statuses.
3. Updates public/data.json and gh-pages/data.json cleanly.
"""

from __future__ import annotations

import base64
import json
import os
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_FILES = [
    ROOT / "public" / "data.json",
    ROOT / "gh-pages" / "data.json",
]

CORE_REPOS = {
    "kytyps5": ("KytyPS5", "KytyPS5"),
    "sharpemu": ("sharpemu", "sharpemu"),
    "shadps4": ("shadps4-emu", "shadPS4"),
}

GAME_DISCOVERY_RULES = [
    {
        "id": "gta-vi",
        "title": "Grand Theft Auto VI (GTA VI)",
        "shortNote": "Rockstar Games · PS5 Flagship Release",
        "keywords": ["gta vi", "gta 6", "gta6", "grand theft auto vi", "grand theft auto 6"],
        "unreleased": True,
        "releaseTargetIso": "2026-11-19T00:00:00Z",
    },
    {
        "id": "ghost-of-yotei",
        "title": "Ghost of Yōtei",
        "shortNote": "Sucker Punch · Open-World Action",
        "keywords": ["ghost of yotei", "ghost of yōtei", "yotei"],
    },
    {
        "id": "astro-bot",
        "title": "Astro Bot",
        "shortNote": "Team Asobi · 3D Platformer",
        "keywords": ["astro bot", "astrobot"],
    },
    {
        "id": "demons-souls",
        "title": "Demon's Souls",
        "shortNote": "Bluepoint Games · Action RPG",
        "keywords": ["demon's souls", "demons souls"],
    },
    {
        "id": "spider-man-2",
        "title": "Marvel's Spider-Man 2",
        "shortNote": "Insomniac Games · Action-Adventure",
        "keywords": ["spider-man 2", "spiderman 2"],
    },
    {
        "id": "returnal",
        "title": "Returnal",
        "shortNote": "Housemarque · Sci-Fi Roguelike",
        "keywords": ["returnal"],
    },
    {
        "id": "stellar-blade",
        "title": "Stellar Blade",
        "shortNote": "Shift Up · Action RPG",
        "keywords": ["stellar blade"],
    },
    {
        "id": "bloodborne",
        "title": "Bloodborne (60 FPS Patch / PS4-PS5)",
        "shortNote": "FromSoftware · Action RPG",
        "keywords": ["bloodborne"],
    },
    {
        "id": "god-of-war-ragnarok",
        "title": "God of War Ragnarök",
        "shortNote": "Santa Monica Studio · Action-Adventure",
        "keywords": ["god of war ragnarok", "god of war ragnarök"],
    },
    {
        "id": "ff7-rebirth",
        "title": "Final Fantasy VII Rebirth",
        "shortNote": "Square Enix · Action RPG",
        "keywords": ["final fantasy vii rebirth", "ff7 rebirth"],
    },
    {
        "id": "horizon-forbidden-west",
        "title": "Horizon Forbidden West",
        "shortNote": "Guerrilla Games · Open-World RPG",
        "keywords": ["horizon forbidden west"],
    },
]

PREFERRED_EXTENSIONS = (".zip", ".7z", ".tar.gz", ".appimage", ".exe", ".msi")
STATUS_RANK = {
    "Not Supported Yet": 0,
    "Pending Release": 1,
    "Boots to Menu": 2,
    "In-Game": 3,
}


def format_iso_date(iso_str: str | None) -> str:
    if not iso_str:
        return "Unknown date"
    try:
        dt = datetime.fromisoformat(iso_str.replace("Z", "+00:00"))
        return dt.strftime("%b %d, %Y")
    except ValueError:
        return iso_str


def pick_preferred_asset(assets: list[dict]) -> tuple[str | None, str | None]:
    for ext in PREFERRED_EXTENSIONS:
        for asset in assets:
            name = str(asset.get("name", ""))
            url = str(asset.get("browser_download_url", ""))
            if name.lower().endswith(ext) and url.startswith("https://"):
                return url, name
    if assets:
        first = assets[0]
        url = str(first.get("browser_download_url", ""))
        name = str(first.get("name", ""))
        if url.startswith("https://"):
            return url, name
    return None, None


def gh_get(url: str) -> dict:
    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "ps5-emutrack-automation-bot",
    }
    token = os.environ.get("GITHUB_TOKEN")
    if token:
        headers["Authorization"] = f"Bearer {token}"

    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=20) as resp:
        return json.loads(resp.read().decode("utf-8"))


def fetch_readme_text(owner: str, repo: str) -> str:
    try:
        payload = gh_get(f"https://api.github.com/repos/{owner}/{repo}/readme")
        if payload.get("encoding") == "base64" and payload.get("content"):
            return base64.b64decode(payload["content"]).decode("utf-8", errors="ignore")
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, ValueError):
        pass
    return ""


def infer_status(text_lower: str, match_idx: int, rule: dict) -> str:
    if rule.get("unreleased"):
        return "Pending Release"
    snippet = text_lower[max(0, match_idx - 45) : min(len(text_lower), match_idx + 90)]
    if any(k in snippet for k in ("in-game", "ingame", "playable", "60fps", "60 fps", "30fps")):
        return "In-Game"
    if any(k in snippet for k in ("boots", "booting", "menu", "intro", "title screen")):
        return "Boots to Menu"
    return "Boots to Menu"


def scan_text_for_games(text: str) -> list[dict]:
    lower = text.lower()
    hits = []
    for rule in GAME_DISCOVERY_RULES:
        for kw in rule["keywords"]:
            idx = lower.find(kw)
            if idx != -1:
                hits.append(
                    {
                        "id": rule["id"],
                        "title": rule["title"],
                        "status": infer_status(lower, idx, rule),
                    }
                )
                break
    return hits


def update_file(path: Path, fetched: dict[str, dict], scan_texts: dict[str, str], generated_at: str) -> None:
    if not path.exists():
        return
    payload = json.loads(path.read_text(encoding="utf-8"))
    emulators = payload.setdefault("emulators", {})
    supported_map = payload.setdefault("emulatorSupportedGames", {})
    date_only = generated_at[:10]

    for key, rel in fetched.items():
        current = emulators.setdefault(key, {})
        assets_raw = rel.get("assets") or []
        direct_url, direct_name = pick_preferred_asset(assets_raw)
        published_at = rel.get("published_at") or current.get("publishedAt")

        current.update(
            {
                "tagName": rel.get("tag_name") or current.get("tagName"),
                "releaseTitle": rel.get("name") or rel.get("tag_name") or current.get("releaseTitle"),
                "publishedAt": published_at,
                "formattedDate": format_iso_date(published_at),
                "releaseUrl": rel.get("html_url") or current.get("releaseUrl"),
                "directAssetUrl": direct_url or rel.get("html_url") or current.get("directAssetUrl"),
                "directAssetName": direct_name or current.get("directAssetName"),
                "bodyNotes": (rel.get("body") or current.get("bodyNotes") or "").strip(),
                "source": "static-fallback",
                "assets": [
                    {
                        "name": a.get("name", ""),
                        "downloadUrl": a.get("browser_download_url", ""),
                        "sizeBytes": int(a.get("size", 0) or 0),
                    }
                    for a in assets_raw
                    if a.get("browser_download_url")
                ],
            }
        )

    games_list = payload.get("games") or []
    games_by_id = {g["id"]: g for g in games_list if isinstance(g, dict) and "id" in g}

    for emu_id, combined_text in scan_texts.items():
        hits = scan_text_for_games(combined_text)
        if not hits:
            continue
        supported_map[emu_id] = [h["title"] for h in hits]
        for hit in hits:
            game_entry = games_by_id.get(hit["id"])
            if game_entry and emu_id in ("kytyps5", "sharpemu", "prosperity", "anyps5"):
                cur_status = game_entry.get("statuses", {}).get(emu_id, "Not Supported Yet")
                if STATUS_RANK.get(hit["status"], 0) > STATUS_RANK.get(cur_status, 0):
                    game_entry.setdefault("statuses", {})[emu_id] = hit["status"]
                    game_entry["lastVerifiedDate"] = date_only

    if games_by_id:
        payload["games"] = list(games_by_id.values())

    payload["generatedAt"] = generated_at
    payload["lastCompatibilityScan"] = generated_at
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    fetched: dict[str, dict] = {}
    scan_texts: dict[str, str] = {}

    repo_targets = dict(CORE_REPOS)
    public_data = ROOT / "public" / "data.json"
    if public_data.exists():
        try:
            payload = json.loads(public_data.read_text(encoding="utf-8"))
            for custom in payload.get("customEmulators", []):
                cid = custom.get("id")
                owner = custom.get("repoOwner")
                repo = custom.get("repoName")
                if cid and owner and repo:
                    repo_targets[cid] = (owner, repo)
        except json.JSONDecodeError:
            pass

    for key, (owner, repo) in repo_targets.items():
        chunks = []
        try:
            rel = gh_get(f"https://api.github.com/repos/{owner}/{repo}/releases/latest")
            fetched[key] = rel
            chunks.append(str(rel.get("name") or ""))
            chunks.append(str(rel.get("body") or ""))
            print(f"[OK] Fetched latest release for {key}: {rel.get('tag_name')}")
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
            print(f"[WARN] Could not fetch release for {key} ({exc}); keeping snapshot.")

        readme_text = fetch_readme_text(owner, repo)
        if readme_text:
            chunks.append(readme_text)
        if chunks:
            scan_texts[key] = "\n".join(chunks)

    generated_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    for data_file in DATA_FILES:
        update_file(data_file, fetched, scan_texts, generated_at)


if __name__ == "__main__":
    main()
